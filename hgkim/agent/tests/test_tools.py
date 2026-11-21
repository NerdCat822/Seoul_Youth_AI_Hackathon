"""날짜 규칙, 메뉴 규칙, 숫자 대조. 오늘은 2026-11-21(토)로 고정한다."""
from datetime import date

import pytest

from trylog_agent.settings import get_settings
from trylog_agent.tools import rules
from trylog_agent.tools.dates import (
    NOTICE_DEFAULT_PERIOD, apply_period_change, parse_duration, parse_period, parse_point, resolve_new_period,
    validate_period,
)
from trylog_agent.tools.guard import allowed_numbers, numbers_in, unknown_numbers
from trylog_agent.tools.menus import find_menus, load_menus_csv, resolve_choice

TODAY = date(2026, 11, 21)


def period(text: str):
    resolved = resolve_new_period(parse_period(text, TODAY), TODAY)
    return resolved.start.isoformat(), resolved.end.isoformat(), resolved


@pytest.mark.parametrize("text,start,end", [
    ("지난 14일간 쌀떡볶이에 추천 표시 붙였어", "2026-11-07", "2026-11-20"),
    ("11월 7일부터 20일까지 쌀떡볶이 추천 표시", "2026-11-07", "2026-11-20"),
    ("오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게", "2026-11-21", "2026-12-04"),
    ("내일부터 2주 동안 가게 앞에 입간판 세워둘 거야", "2026-11-22", "2026-12-05"),
    ("어제부터 당근마켓에 홍보글 올렸어. 다음 주까지", "2026-11-20", "2026-11-29"),
    ("쌀떡볶이 옆에 추천 스티커 붙였어", "2026-11-21", "2026-12-04"),
    ("2026-11-07 ~ 2026-11-20 추천 표시", "2026-11-07", "2026-11-20"),
    ("11/7~11/20 추천 표시", "2026-11-07", "2026-11-20"),
    ("지난 2주 동안 세트 메뉴 팔았어", "2026-11-07", "2026-11-20"),
    ("오늘부터 일주일간 쿠폰 줄게", "2026-11-21", "2026-11-27"),
    ("모레부터 열흘 동안 이벤트 할 거야", "2026-11-23", "2026-12-02"),
    ("3일 전부터 사진 바꿨어. 10일 동안 볼게", "2026-11-18", "2026-11-27"),
    ("이번 달 말까지 할인할게", "2026-11-21", "2026-11-30"),
    ("12월 20일부터 1월 5일까지 겨울 메뉴 팔 거야", "2026-12-20", "2027-01-05"),
    ("25일부터 5일까지 해볼게", "2026-11-25", "2026-12-05"),
])
def test_period(text, start, end):
    got_start, got_end, _ = period(text)
    assert (got_start, got_end) == (start, end)


def test_default_period_notice():
    _, _, resolved = period("쌀떡볶이 옆에 추천 스티커 붙였어")
    assert resolved.defaulted and NOTICE_DEFAULT_PERIOD in resolved.notices
    _, _, stated = period("오늘부터 2주 동안 추천 표시 붙였어")
    assert not stated.defaulted and NOTICE_DEFAULT_PERIOD not in stated.notices


def test_relative_expression_notices():
    _, _, past = period("지난 14일간 쌀떡볶이에 추천 표시 붙였어")
    assert past.notices == ["‘지난 14일간’을 11월 7일부터 11월 20일까지로 잡았어요."]
    _, _, until = period("어제부터 홍보글 올렸어. 다음 주까지")
    assert until.notices == ["‘다음 주까지’를 11월 29일(일)까지로 잡았어요."]


@pytest.mark.parametrize("text", ["매일 주문이 많아", "이 주문은 포장이야", "500원 올렸어", "하루 매출이 줄었어", "화요일 점심이 한산해"])
def test_no_false_period(text):
    assert parse_period(text, TODAY).empty


def test_revision_changes():
    start, end = date(2026, 11, 21), date(2026, 12, 4)
    assert apply_period_change(parse_period("일주일 더 할게", TODAY), start, end) == (start, date(2026, 12, 11))
    assert apply_period_change(parse_period("3일 줄여줘", TODAY), start, end) == (start, date(2026, 12, 1))
    assert apply_period_change(parse_period("종료일을 12월 10일로 해줘", TODAY), start, end) == (start, date(2026, 12, 10))
    assert apply_period_change(parse_period("3주 동안으로 바꿔줘", TODAY), start, end) == (start, date(2026, 12, 11))
    # 종료일이 2주 제안값이었으면 시작일을 옮길 때 길이를 유지한다.
    moved = apply_period_change(parse_period("내일부터 할게", TODAY), start, end, end_defaulted=True)
    assert moved == (date(2026, 11, 22), date(2026, 12, 5))
    bad = apply_period_change(parse_period("종료일을 11월 5일로 해줘", TODAY), date(2026, 11, 7), date(2026, 11, 20))
    assert validate_period(*bad) == {"endDate": "종료일은 시작일과 같거나 이후여야 해요."}


def test_point_and_duration_from_llm_expressions():
    assert parse_point("다음 주 월요일", TODAY, "start") == date(2026, 11, 23)
    assert parse_point("12월 25일", TODAY, "end") == date(2026, 12, 25)
    assert parse_point("다음 주", TODAY, "end") == date(2026, 11, 29)
    assert parse_duration("2주") == 14 and parse_duration("10일") == 10 and parse_duration("열흘") == 10
    assert parse_duration("") is None


@pytest.fixture(scope="module")
def menus():
    settings = get_settings()
    return load_menus_csv(str(settings.csv_dir), 1)


def test_menu_rules(menus):
    assert len(menus) == 24
    assert find_menus("지난 14일간 쌀떡볶이에 추천 표시 붙였어", menus).menus[0].code == "A011003"
    assert find_menus("오늘부터 치즈돈까스 500원 올렸어", menus).menus[0].code == "A011009"
    kimbap = find_menus("김밥에 추천 스티커 붙였어", menus)
    assert kimbap.status == "MANY" and len(kimbap.menus) == 5
    assert find_menus("가게 앞에 입간판 세워둘 거야", menus).status == "NONE"
    assert find_menus("지니네김밥 세트 만들었어", menus).menus[0].name == "지니네 김밥"
    # 긴 이름이 맞으면 그 안에 든 짧은 이름은 후보에서 뺀다.
    assert [m.name for m in find_menus("철판치즈불닭쫄면 사진 바꿨어", menus).menus] == ["철판치즈불닭쫄면"]
    # 낱말 중간에 걸친 글자는 메뉴로 보지 않는다.
    assert find_menus("할인 이벤트라면 좋겠어", menus, partial=False).status == "NONE"


def test_menu_choice(menus):
    candidates = find_menus("김밥", menus).menus
    assert resolve_choice("참치김밥", candidates).name == "참치김밥"
    assert resolve_choice("2번", candidates).name == "지니네 김밥"
    assert resolve_choice("김밥 전체야", candidates) == "NONE"
    assert resolve_choice("글쎄", candidates) is None


def test_guard():
    allowed = allowed_numbers([42, 137, 6.83, 19.19, 12.36, "8,162,800원", "2026-11-07 ~ 2026-11-20"])
    assert numbers_in("주문이 42건에서 137건으로, 8,162,800원") == ["42", "137", "8162800"]
    assert unknown_numbers("42건에서 137건으로 늘었고 비중은 6.83%에서 19.19%로 12.36%p 올랐어요.", allowed) == []
    assert unknown_numbers("주문이 3배 넘게 늘어 140건이 됐어요.", allowed) == ["140", "3"]


def test_confirm_words_and_rule_understanding():
    assert rules.classify_confirm("저장") == "SAVE" and rules.classify_confirm("네 저장해줘") == "SAVE"
    assert rules.classify_confirm("취소") == "CANCEL" and rules.classify_confirm("저장하지 마") == "CANCEL"
    assert rules.classify_confirm("일주일 더 할게") == "REVISE"
    assert rules.make_title("지난 14일간 쌀떡볶이에 추천 표시 붙였어") == "쌀떡볶이에 추천 표시 붙이기"
    assert rules.make_title("오늘부터 치즈돈까스 500원 올렸어. 2주 해볼게") == "치즈돈까스 500원 올리기"
    assert rules.make_title("내일부터 2주 동안 가게 앞에 입간판 세워둘 거야") == "가게 앞에 입간판 세워두기"
    assert rules.guess_intent("요즘 화요일 점심이 한산해. 할인 말고 뭐 해볼까?", False) == "WORRY"
    assert rules.guess_intent("오늘 날씨 어때?", False) == "OTHER"
