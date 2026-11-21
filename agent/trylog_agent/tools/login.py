"""요청마다 달라지는 로그인 정보.

Spring은 로그인한 가게의 자료만 내준다. 화면이 보낸 세션 쿠키와 CSRF 토큰을 이 요청 동안만 들고 있다가
Spring을 부를 때 그대로 넘긴다. 값은 저장하지도, 기록에 남기지도 않는다.
"""
from __future__ import annotations

from contextvars import ContextVar

from ..settings import get_settings

_headers: ContextVar[dict[str, str]] = ContextVar("trylog_forward_headers", default={})
_store_id: ContextVar[int | None] = ContextVar("trylog_store_id", default=None)


def forward(headers: dict[str, str]) -> None:
    """이 요청에서 Spring에 함께 보낼 머리글을 정한다."""
    _headers.set(dict(headers))


def forwarded_headers() -> dict[str, str]:
    return dict(_headers.get())


def set_store(store_id: int | None) -> None:
    _store_id.set(store_id)


def logged_in_store() -> int | None:
    """Spring이 확인해 준 로그인 가게 번호. 로그인 기능이 없는 Spring이면 None."""
    return _store_id.get()


def current_store_id() -> int:
    """로그인한 가게 번호. 없으면 설정값(TRYLOG_STORE_ID)."""
    store_id = _store_id.get()
    return get_settings().store_id if store_id is None else store_id
