"""테스트용 가짜 Spring 서버 (실제 Spring이 아니다).

박병민의 Spring 서버를 대신해 에이전트가 부르는 경로만 흉내 낸다.
`AGENT_API_PLAN.md`가 적은 `/api/v1` 계약을 따르며, 저장소는 메모리다.
실제 Spring과의 연동을 보증하지 않는다. 연동은 실제 서버로 따로 확인해야 한다.

혼자 띄울 때: uvicorn tests.fake_spring:app --host 127.0.0.1 --port 7000
"""
from __future__ import annotations

import csv
import os
import uuid
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

DEMO_ID = "11111111-1111-4111-8111-111111111111"
DATA_DIR = Path(os.getenv("CSV_DIR") or Path(__file__).resolve().parents[3] / "jaewon" / "data")
CATEGORIES = {"MENU", "OPERATION", "MARKETING"}
BASE_FIELDS = {"title", "category", "startDate", "endDate", "notes"}

# 가상 사례 6건. 수치는 모두 지어낸 시연용 값이다.
CASES = [
    {"id": "case-badge", "title": "점심 세트에 추천 표시 붙이기", "category": "MENU", "difficulty": "EASY", "cost": 0,
     "durationDays": 14, "summary": "메뉴판에서 점심 세트 옆에 추천 표시를 붙여 고르기 쉽게 했어요.",
     "tip": "한 메뉴에만 붙여야 차이를 보기 쉬워요.", "sampleSize": 12, "improved": 7, "unchanged": 3, "declined": 2, "demo": True},
    {"id": "case-set-copy", "title": "세트 구성 설명 한 줄 넣기", "category": "MENU", "difficulty": "EASY", "cost": 0,
     "durationDays": 14, "summary": "세트에 무엇이 들어 있는지 메뉴판에 한 줄로 적었어요.",
     "tip": "구성과 양을 숫자로 적어 보세요.", "sampleSize": 10, "improved": 5, "unchanged": 4, "declined": 1, "demo": True},
    {"id": "case-photo", "title": "대표 메뉴 사진 바꾸기", "category": "MARKETING", "difficulty": "PREPARE", "cost": 30000,
     "durationDays": 14, "summary": "대표 메뉴 사진을 밝은 곳에서 다시 찍어 메뉴판에 넣었어요.",
     "tip": "사진은 한 번에 한 메뉴만 바꿔 보세요.", "sampleSize": 9, "improved": 4, "unchanged": 4, "declined": 1, "demo": True},
    {"id": "case-takeout", "title": "포장 안내 문구 붙이기", "category": "OPERATION", "difficulty": "EASY", "cost": 0,
     "durationDays": 14, "summary": "계산대 앞에 포장이 된다는 안내를 붙였어요.",
     "tip": "포장 시간도 함께 적어 보세요.", "sampleSize": 11, "improved": 5, "unchanged": 5, "declined": 1, "demo": True},
    {"id": "case-quiet-hour", "title": "한산한 시간에 준비 순서 바꾸기", "category": "OPERATION", "difficulty": "PREPARE", "cost": 0,
     "durationDays": 14, "summary": "손님이 적은 시간에 재료 준비를 몰아서 해 바쁜 시간의 대기를 줄였어요.",
     "tip": "한산한 요일과 시간을 먼저 적어 보세요.", "sampleSize": 8, "improved": 4, "unchanged": 3, "declined": 1, "demo": True},
    {"id": "case-intro", "title": "가게 소개 글 올리기", "category": "MARKETING", "difficulty": "EASY", "cost": 0,
     "durationDays": 14, "summary": "동네 게시판에 가게 소개와 대표 메뉴를 올렸어요.",
     "tip": "사진 한 장과 영업시간을 함께 올려 보세요.", "sampleSize": 10, "improved": 4, "unchanged": 5, "declined": 1, "demo": True},
]


def _error(status: int, code: str, message: str, field_errors: dict | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"code": code, "message": message, "fieldErrors": field_errors or {}})


def _parse_date(value) -> date | None:
    try:
        return date.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        return None


def compute_report(start: date, end: date, menu_code: str, store_id: int = 1, data_dir: Path = DATA_DIR) -> dict:
    """표본 주문 CSV로 전후 비교를 계산한다. 변경 전은 정확히 14일 앞의 같은 길이다."""
    days = min((end - start).days + 1, 14)
    after = (start, start + timedelta(days=days - 1))
    before = (start - timedelta(days=14), start - timedelta(days=14) + timedelta(days=days - 1))
    stats = {"before": {"all": set(), "target": set(), "sales": 0}, "after": {"all": set(), "target": set(), "sales": 0}}
    refunds = 0
    with (data_dir / "4_pos_orders.csv").open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["store_id"] != str(store_id):
                continue
            day = date.fromisoformat(row["base_date"])
            side = "before" if before[0] <= day <= before[1] else "after" if after[0] <= day <= after[1] else None
            if side is None:
                continue
            if row["is_refunded"].strip().lower() == "true":
                refunds += 1
                continue
            key = (row["base_date"], row["receipt_id"])
            stats[side]["all"].add(key)
            stats[side]["sales"] += int(row["price"]) * int(row["quantity"])
            if row["menu2_cd"] == menu_code:
                stats[side]["target"].add(key)

    def side(name: str, period: tuple[date, date]) -> dict:
        total, target = len(stats[name]["all"]), len(stats[name]["target"])
        return {"startDate": period[0].isoformat(), "endDate": period[1].isoformat(), "targetOrders": target,
                "totalOrders": total, "sharePct": round(target / total * 100, 2) if total else None,
                "sales": stats[name]["sales"]}

    b, a = side("before", before), side("after", after)
    delta = None
    if b["totalOrders"] and a["totalOrders"]:
        delta = round((a["targetOrders"] / a["totalOrders"] - b["targetOrders"] / b["totalOrders"]) * 100, 2)
    trend = "늘었어요" if a["targetOrders"] > b["targetOrders"] else "줄었어요" if a["targetOrders"] < b["targetOrders"] else "그대로예요"
    return {"targetMenuCode": menu_code, "before": b, "after": a, "shareDeltaPp": delta, "excludedRefundLines": refunds,
            "summary": f"대상 메뉴가 들어간 주문은 {b['targetOrders']}건에서 {a['targetOrders']}건으로 {trend}. "
                       "같은 기간의 다른 변화도 함께 살펴보세요."}


def create_fake_spring(today: str = "2026-11-21", seed_demo: bool = True, fields: int = 5) -> FastAPI:
    app = FastAPI(title="가짜 Spring (테스트용)")
    app.state.today = today
    app.state.experiments = {}
    app.state.reports = {}
    app.state.posts = []          # 저장 요청 본문 기록 (테스트에서 확인)
    allowed = BASE_FIELDS | ({"actionType", "targetMenuCode"} if fields == 7 else set())

    def view(exp: dict) -> dict:
        now = date.fromisoformat(app.state.today)
        start, end = date.fromisoformat(exp["startDate"]), date.fromisoformat(exp["endDate"])
        if exp["id"] in app.state.reports:
            status = "COMPLETED"
        elif now < start:
            status = "PLANNED"
        elif now <= end:
            status = "IN_PROGRESS"
        else:
            status = "READY"
        return {**exp, "checkDate": (end + timedelta(days=1)).isoformat(), "status": status}

    if seed_demo:
        app.state.experiments[DEMO_ID] = {
            "id": DEMO_ID, "title": "쌀떡볶이에 추천 표시 붙이기", "category": "MENU",
            "startDate": "2026-11-07", "endDate": "2026-11-20", "notes": "메뉴판 추천 스티커 / 메뉴 코드 A011003",
        }

    @app.get("/api/v1/health")
    def health():
        return {"status": "UP"}

    @app.get("/api/v1/overview")
    def overview():
        return {"storeName": "우리동네 분식", "today": app.state.today, "storageMode": "MEMORY", "demo": True}

    @app.get("/api/v1/cases")
    def cases():
        return CASES

    @app.get("/api/v1/experiments")
    def list_experiments():
        return [view(e) for e in reversed(list(app.state.experiments.values()))]

    @app.post("/api/v1/experiments")
    async def create_experiment(request: Request):
        try:
            body = await request.json()
        except Exception:
            return _error(400, "VALIDATION_ERROR", "입력 내용을 확인해주세요.")
        app.state.posts.append(body)
        if not isinstance(body, dict):
            return _error(400, "VALIDATION_ERROR", "입력 내용을 확인해주세요.")
        errors: dict[str, str] = {}
        for key in body:
            if key not in allowed:
                errors[key] = "알 수 없는 항목이에요."
        title = body.get("title")
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 80:
            errors["title"] = "제목은 1~80자로 입력해주세요."
        if body.get("category") not in CATEGORIES:
            errors["category"] = "분류를 선택해주세요."
        notes = body.get("notes") or ""
        if not isinstance(notes, str) or len(notes) > 500:
            errors["notes"] = "메모는 500자 이내로 입력해주세요."
        start, end = _parse_date(body.get("startDate")), _parse_date(body.get("endDate"))
        low, high = date(2000, 1, 1), date(2100, 12, 31)
        if start is None or not low <= start <= high:
            errors["startDate"] = "시작일을 확인해주세요."
        if end is None or not low <= end <= high:
            errors["endDate"] = "종료일을 확인해주세요."
        elif start and end < start:
            errors["endDate"] = "종료일은 시작일과 같거나 이후여야 해요."
        if fields == 7 and not str(body.get("actionType") or "").strip():
            errors["actionType"] = "행동 유형을 입력해주세요."
        if errors:
            return _error(400, "VALIDATION_ERROR", "입력 내용을 확인해주세요.", errors)
        exp = {"id": str(uuid.uuid4()), **{k: body.get(k) for k in body}, "title": title.strip(), "notes": notes}
        app.state.experiments[exp["id"]] = exp
        return JSONResponse(status_code=201, content=view(exp))

    @app.get("/api/v1/experiments/{experiment_id}")
    def get_experiment(experiment_id: str):
        exp = app.state.experiments.get(experiment_id)
        return view(exp) if exp else _error(404, "NOT_FOUND", "시도를 찾을 수 없어요.")

    @app.get("/api/v1/experiments/{experiment_id}/report")
    def get_report(experiment_id: str):
        report = app.state.reports.get(experiment_id)
        return report if report else _error(404, "NOT_FOUND", "아직 보고서가 없어요.")

    @app.post("/api/v1/experiments/{experiment_id}/report")
    def make_report(experiment_id: str):
        """가짜 서버 전용 지름길: 파일 업로드 대신 표본 CSV로 보고서를 만든다."""
        exp = app.state.experiments.get(experiment_id)
        if not exp:
            return _error(404, "NOT_FOUND", "시도를 찾을 수 없어요.")
        code = exp.get("targetMenuCode")
        if not code and "메뉴 코드" in (exp.get("notes") or ""):
            code = exp["notes"].split("메뉴 코드")[-1].strip().split()[0]
        if not code:
            return _error(400, "VALIDATION_ERROR", "대상 메뉴를 알 수 없어요.")
        report = compute_report(date.fromisoformat(exp["startDate"]), date.fromisoformat(exp["endDate"]), code)
        app.state.reports[experiment_id] = report
        return report

    @app.get("/api/v1/demo/forecast")
    def demo_forecast():
        return {"historical": {"startDate": "2026-11-07", "endDate": "2026-11-20", "actual": 9329700,
                               "expected": 9032900, "difference": 296800}}

    return app


app = create_fake_spring(today=os.getenv("TRYLOG_DEMO_DATE", "2026-11-21"), fields=7 if os.getenv("FAKE_SPRING_FIELDS") == "7" else 5)
