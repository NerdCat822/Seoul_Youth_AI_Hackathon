"""부록 A의 예시 문장을 떠 있는 서버에 보내 기대 결과와 비교한다.

실제 LLM을 부르므로 요금이 든다. 서버가 먼저 떠 있어야 한다.
  python scripts/eval_appendix_a.py                       # http://127.0.0.1:7500
  python scripts/eval_appendix_a.py --base http://127.0.0.1:5173   # Vite 프록시를 거쳐 확인
"""
from __future__ import annotations

import argparse
import json
import sys
import time

import httpx

DEMO_ID = "11111111-1111-4111-8111-111111111111"
rows: list[tuple] = []


def call(client: httpx.Client, method: str, path: str, body: dict | None = None) -> tuple[int, dict, float]:
    started = time.perf_counter()
    response = client.request(method, path, json=body)
    elapsed = time.perf_counter() - started
    try:
        data = response.json()
    except ValueError:
        data = {}
    return response.status_code, data, elapsed


def record(number: str, sentence: str, expected: str, actual: str, ok: bool, elapsed: float, source: str = "") -> None:
    rows.append((number, sentence, expected, actual, "통과" if ok else "불일치", f"{elapsed:.2f}s", source))


def draft_case(client, number, text, category, code, start, end, notice=None):
    status, body, elapsed = call(client, "POST", "/api/v1/agent/draft", {"text": text})
    d, extra = body.get("draft") or {}, body.get("extra") or {}
    actual = f"{body.get('intent')}, {d.get('category')}, {extra.get('targetMenuCode')}, {d.get('startDate')}~{d.get('endDate')}"
    ok = (status == 200 and body.get("intent") == "RECORD" and d.get("category") == category
          and extra.get("targetMenuCode") == code and d.get("startDate") == start and d.get("endDate") == end
          and (notice is None or notice in (body.get("notices") or [])))
    record(number, text, f"RECORD, {category}, {code}, {start}~{end}" + (" + 2주 알림" if notice else ""),
           actual + (f" | 제목: {d.get('title')}" if d else ""), ok, elapsed, body.get("source", ""))


def chat(client, message, thread_id=None):
    status, body, elapsed = call(client, "POST", "/api/v1/agent/chat", {"threadId": thread_id, "message": message})
    return status, body, elapsed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:7500")
    parser.add_argument("--json", action="store_true", help="응답 샘플을 JSON으로 함께 출력")
    args = parser.parse_args()
    samples: dict = {}
    with httpx.Client(base_url=args.base, timeout=30.0) as client:
        status, health, _ = call(client, "GET", "/api/v1/agent/health")
        print("health:", json.dumps(health, ensure_ascii=False))
        if status != 200:
            print("서버가 응답하지 않습니다."); return 2

        notice = "기간을 말하지 않아 2주로 제안했어요."
        draft_case(client, "1", "지난 14일간 쌀떡볶이에 추천 표시 붙였어", "MENU", "A011003", "2026-11-07", "2026-11-20")
        draft_case(client, "2", "11월 7일부터 20일까지 쌀떡볶이 추천 표시", "MENU", "A011003", "2026-11-07", "2026-11-20")
        draft_case(client, "3", "오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게", "MENU", "A011009", "2026-11-21", "2026-12-04")
        draft_case(client, "4", "내일부터 2주 동안 가게 앞에 입간판 세워둘 거야", "OPERATION", None, "2026-11-22", "2026-12-05")
        draft_case(client, "5", "어제부터 당근마켓에 홍보글 올렸어. 다음 주까지", "MARKETING", None, "2026-11-20", "2026-11-29")
        draft_case(client, "6", "쌀떡볶이 옆에 추천 스티커 붙였어", "MENU", "A011003", "2026-11-21", "2026-12-04", notice)

        _, b7, t7 = chat(client, "김밥에 추천 스티커 붙였어")
        record("7", "김밥에 추천 스티커 붙였어", "ASKING (김밥 메뉴 5개)", f"{b7.get('status')} | {b7.get('reply', '')[:60]}",
               b7.get("status") == "ASKING" and "참치김밥" in b7.get("reply", ""), t7, b7.get("source", ""))

        _, b3, t3 = chat(client, "오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게")
        tid = b3.get("threadId")
        samples["chat_first"] = b3
        _, b8, t8 = chat(client, "일주일 더 할게", tid)
        record("8", "(3번 뒤) 일주일 더 할게", "종료일 2026-12-11", f"{b8.get('status')}, 종료일 {(b8.get('draft') or {}).get('endDate')}",
               (b8.get("draft") or {}).get("endDate") == "2026-12-11", t8, b8.get("source", ""))
        _, before, _ = call(client, "GET", "/api/v1/agent/health")
        _, b9, t9 = chat(client, "저장", tid)
        exp = b9.get("experiment") or {}
        samples["chat_saved"] = b9
        record("9", "(8번 뒤) 저장", "SAVED, IN_PROGRESS, 확인일 2026-12-12",
               f"{b9.get('status')}, {exp.get('status')}, 확인일 {exp.get('checkDate')}",
               b9.get("status") == "SAVED" and exp.get("status") == "IN_PROGRESS" and exp.get("checkDate") == "2026-12-12", t9)
        _, b10, t10 = chat(client, "저장", tid)
        record("10", "(9번 뒤) 저장", "다시 저장하지 않음(같은 시도 ID)", f"{b10.get('status')} | {b10.get('reply')}",
               b10.get("status") == "SAVED" and (b10.get("experiment") or {}).get("id") == exp.get("id"), t10)

        _, b1, _ = chat(client, "지난 14일간 쌀떡볶이에 추천 표시 붙였어")
        _, b11, t11 = chat(client, "종료일을 11월 5일로 해줘", b1.get("threadId"))
        record("11", "(1번 뒤) 종료일을 11월 5일로 해줘", "저장 안 함 + 종료일 오류 문구",
               f"{b11.get('status')} | {' '.join(b11.get('notices') or [])}",
               b11.get("status") == "AWAITING_CONFIRM" and "종료일은 시작일과 같거나 이후여야 해요." in (b11.get("notices") or []), t11,
               b11.get("source", ""))

        _, b12, t12 = chat(client, "요즘 화요일 점심이 한산해. 할인 말고 뭐 해볼까?")
        samples["chat_ideas"] = b12
        record("12", "요즘 화요일 점심이 한산해. 할인 말고 뭐 해볼까?", "IDEAS, 가상 사례 최대 2개",
               f"{b12.get('status')} | " + " / ".join(str(i.get('title')) for i in b12.get("ideas") or []),
               b12.get("status") == "IDEAS" and 1 <= len(b12.get("ideas") or []) <= 2, t12, b12.get("source", ""))
        _, b13, t13 = chat(client, "오늘 날씨 어때?")
        record("13", "오늘 날씨 어때?", "GUIDE", f"{b13.get('status')}", b13.get("status") == "GUIDE", t13, b13.get("source", ""))

        _, d1, _ = call(client, "POST", "/api/v1/agent/draft", {"text": "지난 14일간 쌀떡볶이에 추천 표시 붙였어"})
        samples["draft"] = d1
        status, ex, tex = call(client, "POST", f"/api/v1/agent/experiments/{DEMO_ID}/explain")
        samples["explain"] = ex
        text = ex.get("explanation", "")
        record("설명", f"explain {DEMO_ID[:8]}…", "42건 → 137건, 12.36%p, 겹친 시도 안내",
               f"HTTP {status}, fallbackUsed={ex.get('fallbackUsed')} | {text[:150]}",
               status == 200 and all(p in text for p in ("42", "137", "12.36")) and not ex.get("fallbackUsed"), tex, ex.get("source", ""))

    width = max(len(r[1]) for r in rows)
    for r in rows:
        print(f"[{r[4]}] {r[0]:>3} | {r[5]:>6} | {r[6]:<5} | {r[1]}\n        기대: {r[2]}\n        실제: {r[3]}")
    failed = [r for r in rows if r[4] != "통과"]
    print(f"\n합계: {len(rows) - len(failed)}/{len(rows)} 통과")
    if args.json:
        print(json.dumps(samples, ensure_ascii=False, indent=1))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
