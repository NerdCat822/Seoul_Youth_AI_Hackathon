"""Spring 서버 호출.

오늘 날짜, 가상 사례, 시도 저장·조회, 보고서, 고정 매출 전망을 HTTP로 부른다.
Spring의 `/api/v1` 계약은 바꾸지 않는다.
"""
from __future__ import annotations

import httpx

from ..settings import get_settings
from . import login

API_PREFIX = "/api/v1"


class SpringError(Exception):
    """Spring 호출 실패의 공통 부모."""


class SpringUnavailable(SpringError):
    """연결할 수 없거나 5xx로 답했다."""


class SpringNotFound(SpringError):
    """대상이 없다(404)."""

    def __init__(self, payload: dict | None = None):
        super().__init__("not found")
        self.payload = payload or {}


class SpringRejected(SpringError):
    """입력을 거절했다(400 등). Spring이 준 `message`와 `fieldErrors`를 담는다."""

    def __init__(self, status: int, payload: dict | None = None):
        super().__init__(f"rejected {status}")
        self.status = status
        self.payload = payload or {}

    @property
    def message(self) -> str:
        return str(self.payload.get("message") or "입력 내용을 확인해주세요.")

    @property
    def field_errors(self) -> dict:
        errors = self.payload.get("fieldErrors")
        return errors if isinstance(errors, dict) else {}


class SpringClient:
    def __init__(self, base_url: str, timeout: float = 3.0, client: httpx.Client | None = None):
        self._client = client or httpx.Client(base_url=base_url, timeout=timeout)

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        # 화면이 보낸 로그인 쿠키와 CSRF 토큰을 그대로 넘긴다. Spring이 그 가게의 요청으로 처리한다.
        forwarded = login.forwarded_headers()
        if forwarded:
            kwargs["headers"] = {**forwarded, **(kwargs.get("headers") or {})}
        try:
            response = self._client.request(method, API_PREFIX + path, **kwargs)
        except httpx.HTTPError as exc:
            raise SpringUnavailable(type(exc).__name__) from exc
        if response.status_code >= 500:
            raise SpringUnavailable(f"HTTP {response.status_code}")
        if response.status_code == 404:
            raise SpringNotFound(_json(response))
        if response.status_code >= 400:
            raise SpringRejected(response.status_code, _json(response))
        return response

    def session(self) -> dict:
        """로그인 상태. `{authenticated, storeId, storeName, ...}`. 로그인 기능이 없는 Spring은 404다."""
        return _json(self._request("GET", "/auth/session"))

    def menus(self) -> list[dict]:
        data = self._request("GET", "/menus").json()
        return data if isinstance(data, list) else []

    def overview(self) -> dict:
        return _json(self._request("GET", "/overview"))

    def cases(self) -> list[dict]:
        data = self._request("GET", "/cases").json()
        return data if isinstance(data, list) else []

    def create_experiment(self, body: dict) -> dict:
        return _json(self._request("POST", "/experiments", json=body))

    def list_experiments(self) -> list[dict]:
        data = self._request("GET", "/experiments").json()
        return data if isinstance(data, list) else []

    def get_experiment(self, experiment_id: str) -> dict:
        return _json(self._request("GET", f"/experiments/{experiment_id}"))

    def get_report(self, experiment_id: str) -> dict:
        return _json(self._request("GET", f"/experiments/{experiment_id}/report"))

    def get_report_preview(self, experiment_id: str) -> dict:
        return _json(self._request("GET", f"/experiments/{experiment_id}/report/preview"))

    def demo_forecast(self) -> dict:
        return _json(self._request("GET", "/demo/forecast"))


def _json(response: httpx.Response) -> dict:
    try:
        data = response.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


_client: SpringClient | None = None


def get_spring() -> SpringClient:
    global _client
    if _client is None:
        settings = get_settings()
        _client = SpringClient(settings.spring_url, settings.spring_timeout)
    return _client


def set_spring(client: SpringClient | None) -> None:
    """테스트에서 가짜 Spring으로 바꿔 끼운다."""
    global _client
    _client = client
