"""음성을 글로 바꾼다 (OpenAI 음성 전사 API).

화면의 마이크로 녹음한 짧은 말을 받아 한국어 글로 돌려준다. 가게 메뉴 이름을 힌트로 함께 보내
'쌀떡볶이', '치즈돈까스' 같은 말을 더 정확히 알아듣게 한다. 키와 음성 파일은 기록에 남기지 않는다.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass

import httpx

from ..settings import get_settings

API_URL = "https://api.openai.com/v1/audio/transcriptions"
PROMPT_MAX = 600   # 힌트 글자 수. 길면 모델이 힌트를 그대로 받아 적는 일이 생긴다.

# 브라우저가 녹음하는 형식과 OpenAI가 받는 형식. 파일 이름의 확장자로 형식을 알린다.
AUDIO_TYPES = {
    "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/m4a": "m4a",
    "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
    "audio/x-wav": "wav", "audio/wave": "wav",
}


class SttError(Exception):
    """전사 실패. `status`와 `code`, 사장님께 보일 `message`를 담는다."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass(frozen=True)
class Transcript:
    text: str
    model: str
    elapsed_ms: int


def api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def is_ready() -> bool:
    return bool(api_key())


def audio_extension(content_type: str | None) -> str | None:
    """`audio/webm;codecs=opus` 같은 값에서 확장자를 고른다. 모르는 형식이면 None."""
    return AUDIO_TYPES.get((content_type or "").split(";", 1)[0].strip().lower())


def menu_prompt(names: list[str]) -> str | None:
    """메뉴 이름을 전사 힌트로 만든다. 없으면 None."""
    hint, used = "가게 메뉴: ", []
    for name in dict.fromkeys(n.strip() for n in names if n and n.strip()):
        if len(hint) + len(", ".join([*used, name])) > PROMPT_MAX:
            break
        used.append(name)
    return hint + ", ".join(used) if used else None


_client: httpx.Client | None = None


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=get_settings().stt_timeout)
    return _client


def set_client(client: httpx.Client | None) -> None:
    """테스트에서 가짜 OpenAI로 바꿔 끼운다."""
    global _client
    _client = client


def transcribe(audio: bytes, content_type: str | None, prompt: str | None = None) -> Transcript:
    settings = get_settings()
    if not is_ready():
        raise SttError(503, "STT_UNAVAILABLE", "음성 입력을 쓸 수 없어요. 글로 입력해 주세요.")
    ext = audio_extension(content_type)
    if ext is None:
        raise SttError(400, "VALIDATION_ERROR", "지원하지 않는 녹음 형식이에요.")
    if not audio:
        raise SttError(400, "VALIDATION_ERROR", "녹음된 소리가 없어요. 다시 말씀해 주세요.")
    if len(audio) > settings.stt_max_bytes:
        raise SttError(413, "VALIDATION_ERROR", "녹음이 너무 길어요. 1분 안으로 말씀해 주세요.")
    data = {"model": settings.stt_model, "language": "ko", "response_format": "json"}
    if prompt:
        data["prompt"] = prompt
    started = time.monotonic()
    try:
        response = _http().post(
            API_URL, headers={"Authorization": f"Bearer {api_key()}"}, data=data,
            files={"file": (f"voice.{ext}", audio, (content_type or "").split(";", 1)[0])},
        )
    except httpx.HTTPError:
        raise SttError(502, "UPSTREAM_ERROR", "음성을 글로 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.") from None
    if response.status_code == 429:
        raise SttError(503, "STT_BUSY", "음성 입력 요청이 많아요. 잠시 뒤 다시 시도해 주세요.")
    if response.status_code == 400:
        raise SttError(400, "VALIDATION_ERROR", "녹음을 알아듣지 못했어요. 다시 말씀해 주세요.")
    if response.status_code >= 300:
        raise SttError(502, "UPSTREAM_ERROR", "음성을 글로 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.")
    try:
        text = str(response.json().get("text") or "").strip()
    except ValueError:
        raise SttError(502, "UPSTREAM_ERROR", "음성을 글로 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.") from None
    return Transcript(text=text, model=settings.stt_model, elapsed_ms=round((time.monotonic() - started) * 1000))
