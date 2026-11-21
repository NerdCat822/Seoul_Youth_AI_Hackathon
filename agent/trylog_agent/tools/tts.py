"""글을 음성으로 읽는다 (OpenAI 음성 합성 API).

대화창에서 말로 물어본 사장님께 에이전트의 답을 소리로 들려준다. 키와 글은 기록에 남기지 않는다.
"""
from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass

import httpx

from ..settings import get_settings

API_URL = "https://api.openai.com/v1/audio/speech"
TEXT_MAX = 1000
INSTRUCTIONS = (
    "한국어로 말한다. 작은 가게 사장님을 돕는 친절한 비서처럼 밝고 차분하게, "
    "숫자와 날짜는 또박또박 알아듣기 쉬운 속도로 읽는다."
)


class TtsError(Exception):
    """합성 실패. `status`와 `code`, 사장님께 보일 `message`를 담는다."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass(frozen=True)
class Speech:
    audio: bytes
    media_type: str
    elapsed_ms: int


def api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def is_ready() -> bool:
    return bool(api_key())


def clean(text: str | None) -> str:
    """읽을 글을 정리한다. 공백을 줄이고 화면용 기호를 덜어 낸다."""
    text = re.sub(r"[‘’“”\"'`*#>]", "", text or "")
    return re.sub(r"\s+", " ", text).strip()


_client: httpx.Client | None = None


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(timeout=get_settings().tts_timeout)
    return _client


def set_client(client: httpx.Client | None) -> None:
    """테스트에서 가짜 OpenAI로 바꿔 끼운다."""
    global _client
    _client = client


def synthesize(text: str | None) -> Speech:
    settings = get_settings()
    if not is_ready():
        raise TtsError(503, "TTS_UNAVAILABLE", "답을 소리로 읽을 수 없어요. 화면의 글로 확인해 주세요.")
    spoken = clean(text)
    if not spoken:
        raise TtsError(400, "VALIDATION_ERROR", "읽을 내용이 없어요.")
    if len(spoken) > TEXT_MAX:
        raise TtsError(400, "VALIDATION_ERROR", f"읽을 내용은 {TEXT_MAX}자 이내여야 해요.")
    body = {"model": settings.tts_model, "voice": settings.tts_voice, "input": spoken, "response_format": "mp3"}
    if settings.tts_model.startswith("gpt-"):
        body["instructions"] = INSTRUCTIONS     # 말투 지시는 gpt 계열 모델만 받는다
    started = time.monotonic()
    try:
        response = _http().post(API_URL, headers={"Authorization": f"Bearer {api_key()}"}, json=body)
    except httpx.HTTPError:
        raise TtsError(502, "UPSTREAM_ERROR", "답을 소리로 바꾸지 못했어요. 화면의 글로 확인해 주세요.") from None
    if response.status_code == 429:
        raise TtsError(503, "TTS_BUSY", "음성 요청이 많아요. 잠시 뒤 다시 시도해 주세요.")
    if response.status_code >= 300 or not response.content:
        raise TtsError(502, "UPSTREAM_ERROR", "답을 소리로 바꾸지 못했어요. 화면의 글로 확인해 주세요.")
    return Speech(audio=response.content, media_type="audio/mpeg",
                  elapsed_ms=round((time.monotonic() - started) * 1000))
