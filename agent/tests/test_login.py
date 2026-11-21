"""로그인이 있는 Spring과의 연동: 세션을 넘겨받아 그 가게로 부르고, 로그인하지 않은 요청은 막는다."""
from __future__ import annotations

import dataclasses

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from trylog_agent import routes
from trylog_agent.main import app
from trylog_agent.settings import get_settings
from trylog_agent.tools import spring as spring_tools

COOKIE = "JSESSIONID=owner-session"


def login_spring() -> FastAPI:
    """로그인한 요청에만 가게 자료를 주는 가짜 Spring. 받은 머리글을 `seen`에 남긴다."""
    fake = FastAPI()
    fake.state.seen = []

    def signed_in(request: Request) -> bool:
        return request.headers.get("cookie") == COOKIE

    def refuse() -> JSONResponse:
        return JSONResponse(status_code=401, content={"code": "UNAUTHENTICATED", "message": "로그인이 필요해요.", "fieldErrors": {}})

    @fake.get("/api/v1/auth/session")
    def session(request: Request):
        ok = signed_in(request)
        return {"authenticated": ok, "storeId": 7 if ok else None, "storeName": "새 가게" if ok else None,
                "signupEnabled": True, "csrfToken": "token"}

    @fake.get("/api/v1/overview")
    def overview(request: Request):
        return {"storeId": 7, "storeName": "새 가게", "today": "2026-11-21"} if signed_in(request) else refuse()

    @fake.get("/api/v1/menus")
    def menus(request: Request):
        return [{"menuCode": "N001", "menuName": "매운국수", "unitPrice": 7000}] if signed_in(request) else refuse()

    @fake.get("/api/v1/cases")
    def cases(request: Request):
        return [] if signed_in(request) else refuse()

    @fake.post("/api/v1/experiments")
    async def create(request: Request):
        if not signed_in(request):
            return refuse()
        body = await request.json()
        fake.state.seen.append({"csrf": request.headers.get("x-csrf-token"), "body": body})
        return JSONResponse(status_code=201, content={**body, "id": "saved-1", "storeId": 7, "checkDate": "2026-12-05",
                                                      "status": "IN_PROGRESS"})

    return fake


def connect(fake: FastAPI) -> TestClient:
    spring_tools.set_spring(spring_tools.SpringClient("http://login-spring", client=TestClient(fake)))
    return TestClient(app)


def test_llm_and_store_routes_need_a_login():
    client = connect(login_spring())
    for method, path, body in (("post", "/api/v1/agent/draft", {"text": "오늘부터 매운국수에 추천 표시를 붙였어"}),
                               ("post", "/api/v1/agent/chat", {"message": "오늘부터 매운국수에 추천 표시를 붙였어"}),
                               ("post", "/api/v1/agent/experiments/e1/explain", None),
                               ("get", "/api/v1/agent/experiments/e1/forecast", None)):
        response = client.request(method.upper(), path, json=body)
        assert response.status_code == 401, path
        assert response.json()["code"] == "UNAUTHENTICATED"
    # 상태 확인은 로그인 없이도 답한다. Spring 날짜만 비어 있다.
    health = client.get("/api/v1/agent/health")
    assert health.status_code == 200 and health.json()["springToday"] is None


def test_chat_uses_the_signed_in_stores_menus_and_saves_with_the_owners_session():
    fake = login_spring()
    client = connect(fake)
    headers = {"Cookie": COOKIE, "X-CSRF-TOKEN": "token"}
    assert client.get("/api/v1/agent/health", headers=headers).json()["springToday"] == "2026-11-21"

    first = client.post("/api/v1/agent/chat", headers=headers,
                        json={"message": "오늘부터 2주 동안 매운국수에 추천 표시를 붙였어"}).json()
    assert first["status"] == "AWAITING_CONFIRM"
    assert first["extra"]["targetMenuCode"] == "N001"      # 표본 CSV가 아니라 로그인한 가게의 메뉴

    saved = client.post("/api/v1/agent/chat", headers=headers,
                        json={"threadId": first["threadId"], "message": "저장"}).json()
    assert saved["status"] == "SAVED" and saved["experiment"]["id"] == "saved-1"
    assert fake.state.seen[0]["csrf"] == "token"            # Spring 저장에 화면의 CSRF 토큰이 따라갔다


def test_a_conversation_cannot_be_continued_without_its_owners_login():
    fake = login_spring()
    client = connect(fake)
    first = client.post("/api/v1/agent/chat", headers={"Cookie": COOKIE},
                        json={"message": "오늘부터 2주 동안 매운국수에 추천 표시를 붙였어"}).json()
    again = client.post("/api/v1/agent/chat", headers={"Cookie": "JSESSIONID=someone-else"},
                        json={"threadId": first["threadId"], "message": "저장"})
    assert again.status_code == 401
    assert fake.state.seen == []


def test_public_deployments_refuse_when_the_login_cannot_be_checked(monkeypatch):
    strict = dataclasses.replace(get_settings(), require_login=True)
    monkeypatch.setattr(routes, "get_settings", lambda: strict)
    transport = httpx.MockTransport(lambda request: (_ for _ in ()).throw(httpx.ConnectError("down")))
    spring_tools.set_spring(spring_tools.SpringClient(
        "http://down", client=httpx.Client(transport=transport, base_url="http://down")))
    response = TestClient(app).post("/api/v1/agent/draft", json={"text": "오늘부터 매운국수에 추천 표시를 붙였어"})
    assert response.status_code == 502 and response.json()["code"] == "UPSTREAM_ERROR"
