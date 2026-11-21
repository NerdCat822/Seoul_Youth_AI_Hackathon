"""한국어 날짜 표현을 날짜로 바꾼다.

날짜 계산은 모두 이 파일의 코드가 한다. LLM은 표현만 뽑는다.
주는 월요일에 시작해 일요일에 끝나는 것으로 본다.
"""
from __future__ import annotations

import calendar
import re
from dataclasses import dataclass, field
from datetime import date, timedelta

DEFAULT_DAYS = 14
NOTICE_DEFAULT_PERIOD = "기간을 말하지 않아 2주로 제안했어요."
MSG_END_BEFORE_START = "종료일은 시작일과 같거나 이후여야 해요."
MSG_DATE_RANGE = "날짜는 2000-01-01부터 2100-12-31 사이여야 해요."
MIN_DATE, MAX_DATE = date(2000, 1, 1), date(2100, 12, 31)

_WEEKDAYS = "월화수목금토일"
_COUNT = {"한": 1, "두": 2, "세": 3, "네": 4, "일": 1, "이": 2, "삼": 3, "사": 4}
_DAY_WORDS = {"하루": 1, "이틀": 2, "사흘": 3, "나흘": 4, "닷새": 5, "엿새": 6, "이레": 7, "열흘": 10, "보름": 15}
_REL_DAYS = {"그저께": -2, "엊그제": -2, "그제": -2, "어제": -1, "오늘": 0, "내일": 1, "모레": 2}
_UNIT_DAYS = {"일": 1, "주": 7, "주일": 7, "달": 30, "개월": 30}

_N = r"(?:\d+|한|두|세|네|일|이|삼|사)"
_DAY_WORD = "|".join(_DAY_WORDS)

# 지난 14일간, 최근 2주, 지난 일주일 동안
_PAST_RE = re.compile(rf"(?:지난|최근)\s*(?P<n>{_N})\s*(?P<u>주일|주|일|달|개월)\s*(?:간|동안)?")
# 3일 전부터, 일주일 전에, 열흘 전부터 / 3일 뒤부터
_AGO_RE = re.compile(
    rf"(?:(?<![가-힣\d])(?P<n>{_N})\s*(?P<u>주일|주|일|달|개월)|(?P<w>{_DAY_WORD}))\s*(?P<dir>전|후|뒤)(?:부터|에|에는)?"
)
# 일주일 더, 3일 연장, 2주 줄여
_EXT_RE = re.compile(
    rf"(?:(?<![가-힣\d])(?P<n>{_N})\s*(?P<u>주일|주|일|달|개월)|(?P<w>{_DAY_WORD}))\s*(?:만|정도|쯤)?\s*"
    r"(?P<op>더|연장|늘려|늘리|늘릴|추가|줄여|줄이|줄일|단축|짧게|덜)"
)
# 2주 동안, 2주 해볼게, 일주일간, 한 달만
_WEEKS_RE = re.compile(
    rf"(?<![가-힣\d])(?P<n>{_N})\s*(?P<u>주일|주|달|개월)(?=\s|$|[.,!?~]|간|동안|만|정도|쯤|로|은|을|이나)(?!\s*(?:전|후|뒤|차|째))"
)
# 14일 동안, 3일 해볼게, 10일로
_DAYS_RE = re.compile(r"(?<![\d월/.\-])(?P<n>\d+)\s*일(?=\s*(?:간|동안|만|정도|쯤|로(?![가-힣])|해|할|진행|씩|[.,!?]|$))")
_DAY_WORD_RE = re.compile(rf"(?P<w>이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)|하루(?=\s*(?:만|간|동안))")
_BARE_DURATION_RE = re.compile(rf"^\s*(?:(?P<n>{_N})\s*(?P<u>주일|주|일|달|개월)|(?P<w>{_DAY_WORD}))\s*(?:간|동안)?\s*$")

_DATE_RE = re.compile(
    r"(?P<iso>(?P<iy>\d{4})[-./](?P<im>\d{1,2})[-./](?P<id>\d{1,2}))"
    r"|(?P<ymd>(?:(?P<y>\d{4})년\s*)?(?P<m>\d{1,2})월\s*(?P<d>\d{1,2})일)"
    r"|(?P<slash>(?<![\d/])(?P<sm>\d{1,2})/(?P<sd>\d{1,2})(?![\d/]))"
    r"|(?P<monthend>(?:(?P<mem>\d{1,2})월|이번\s*달|이달)\s*말일?|월말)"
    r"|(?P<rel>그저께|엊그제|그제|어제|오늘|내일|모레)"
    r"|(?P<wk>(?P<wkwhich>이번|다음|지난|저번)\s*주(?:\s*(?P<wkday>[월화수목금토일])요일)?)"
    r"|(?P<wkend>(?:이번\s*)?주말)"
    r"|(?P<mon>(?P<monwhich>이번|다음)\s*달)"
    r"|(?P<dow>(?P<dowday>[월화수목금토일])요일)"
    r"|(?P<dayonly>(?<![\d월/.\-])(?P<dd>\d{1,2})일)"
)
_START_AFTER = re.compile(r"^\s*(?:부터|부로|에\s*시작)")
_END_AFTER = re.compile(r"^\s*(?:까지|까진|에\s*(?:끝|종료|마감))")
_RANGE_AFTER = re.compile(r"^\s*(?:부터)?\s*[~∼–\-]\s*$")
_START_BEFORE = re.compile(r"(?:시작일|시작\s*날짜|시작)(?:을|은|이|를|는|도)?\s*$")
_END_BEFORE = re.compile(r"(?:종료일|마감일|끝나는\s*날|종료\s*날짜|종료|끝)(?:을|은|이|를|는|도)?\s*$")


def fmt_md(d: date) -> str:
    return f"{d.month}월 {d.day}일"


def fmt_md_w(d: date) -> str:
    return f"{d.month}월 {d.day}일({_WEEKDAYS[d.weekday()]})"


def parse_iso(value: object) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def object_particle(word: str) -> str:
    """받침이 있으면 '을', 없으면 '를'."""
    last = word.rstrip("’'\" ")[-1:] if word else ""
    if "가" <= last <= "힣":
        return "을" if (ord(last) - ord("가")) % 28 else "를"
    return "을"


def _num(token: str) -> int:
    return int(token) if token.isdigit() else _COUNT[token]


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def _add_months(d: date, months: int) -> date:
    index = d.year * 12 + d.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


@dataclass
class PeriodParts:
    """문장에서 읽어낸 기간 조각. 없는 조각은 None이다."""

    start: date | None = None
    end: date | None = None
    duration_days: int | None = None
    extend_days: int | None = None
    start_expr: str | None = None   # 알림에 쓸 상대 표현 (예: "다음 주부터")
    end_expr: str | None = None     # 예: "다음 주까지"
    past_expr: str | None = None    # 예: "지난 14일간"
    end_without_year: bool = False

    @property
    def empty(self) -> bool:
        return self.start is None and self.end is None and self.duration_days is None and self.extend_days is None


@dataclass
class _Mention:
    pos: int
    stop: int
    kind: str
    first: date | None
    last: date | None
    role: str | None = None
    text: str = ""
    relative: bool = False
    has_year: bool = True
    day_only: int | None = None


def _mention(m: re.Match, today: date) -> _Mention | None:
    kind = None
    for name in ("iso", "ymd", "slash", "monthend", "rel", "wk", "wkend", "mon", "dow", "dayonly"):
        if m.group(name):
            kind = name
            break
    if kind is None:
        return None
    base = dict(pos=m.start(), stop=m.end(), kind=kind, text=m.group(0))
    if kind == "iso":
        d = _safe_date(int(m.group("iy")), int(m.group("im")), int(m.group("id")))
        return _Mention(first=d, last=d, **base) if d else None
    if kind == "ymd":
        year = int(m.group("y")) if m.group("y") else today.year
        d = _safe_date(year, int(m.group("m")), int(m.group("d")))
        return _Mention(first=d, last=d, has_year=bool(m.group("y")), **base) if d else None
    if kind == "slash":
        d = _safe_date(today.year, int(m.group("sm")), int(m.group("sd")))
        return _Mention(first=d, last=d, has_year=False, **base) if d else None
    if kind == "monthend":
        month = int(m.group("mem")) if m.group("mem") else today.month
        if not 1 <= month <= 12:
            return None
        d = _month_end(today.year, month)
        return _Mention(first=d, last=d, relative=True, has_year=False, **base)
    if kind == "rel":
        d = today + timedelta(days=_REL_DAYS[m.group("rel")])
        return _Mention(first=d, last=d, **base)
    monday = today - timedelta(days=today.weekday())
    if kind == "wk":
        shift = {"이번": 0, "다음": 7, "지난": -7, "저번": -7}[m.group("wkwhich")]
        week_start = monday + timedelta(days=shift)
        if m.group("wkday"):
            d = week_start + timedelta(days=_WEEKDAYS.index(m.group("wkday")))
            return _Mention(first=d, last=d, relative=True, **base)
        return _Mention(first=week_start, last=week_start + timedelta(days=6), relative=True, **base)
    if kind == "wkend":
        return _Mention(first=monday + timedelta(days=5), last=monday + timedelta(days=6), relative=True, **base)
    if kind == "mon":
        first = _add_months(today, 0 if m.group("monwhich") == "이번" else 1)
        return _Mention(first=first, last=_month_end(first.year, first.month), relative=True, **base)
    if kind == "dow":
        d = today + timedelta(days=(_WEEKDAYS.index(m.group("dowday")) - today.weekday()) % 7)
        return _Mention(first=d, last=d, relative=True, **base)
    day = int(m.group("dd"))
    if not 1 <= day <= 31:
        return None
    return _Mention(first=None, last=None, has_year=False, day_only=day, **base)


def _blank(text: str, start: int, stop: int) -> str:
    return text[:start] + " " * (stop - start) + text[stop:]


def _duration_from(m: re.Match) -> int:
    if m.groupdict().get("w"):
        return _DAY_WORDS[m.group("w")]
    return _num(m.group("n")) * _UNIT_DAYS[m.group("u")]


def parse_duration(text: str) -> int | None:
    """'2주', '10일', '열흘' 같은 길이 표현만 있는 글을 일수로 바꾼다."""
    if not text:
        return None
    m = _BARE_DURATION_RE.match(text)
    if m:
        return _duration_from(m)
    found = _find_duration(text)
    return found[0] if found else None


def _find_duration(text: str) -> tuple[int, int, int] | None:
    best: tuple[int, int, int] | None = None
    for regex in (_WEEKS_RE, _DAYS_RE, _DAY_WORD_RE):
        m = regex.search(text)
        if not m:
            continue
        if regex is _DAY_WORD_RE:
            days = _DAY_WORDS[m.group("w")] if m.group("w") else 1
        elif regex is _DAYS_RE:
            days = int(m.group("n"))
        else:
            days = _num(m.group("n")) * _UNIT_DAYS[m.group("u")]
        if days > 0 and (best is None or m.start() < best[1]):
            best = (days, m.start(), m.end())
    return best


def parse_period(text: str, today: date, *, month_ref: date | None = None, default_role: str | None = None) -> PeriodParts:
    """문장에서 시작일, 종료일, 길이, 늘리거나 줄일 일수를 읽는다."""
    parts = PeriodParts()
    work = re.sub(r"\s+", " ", text or "")

    m = _EXT_RE.search(work)
    if m:
        sign = -1 if m.group("op") in {"줄여", "줄이", "줄일", "단축", "짧게", "덜"} else 1
        parts.extend_days = sign * _duration_from(m)
        work = _blank(work, m.start(), m.end())

    m = _PAST_RE.search(work)
    if m:
        days = _num(m.group("n")) * _UNIT_DAYS[m.group("u")]
        parts.start, parts.end = today - timedelta(days=days), today - timedelta(days=1)
        parts.past_expr = m.group(0).strip()
        work = _blank(work, m.start(), m.end())

    m = _AGO_RE.search(work)
    if m and parts.start is None:
        sign = -1 if m.group("dir") == "전" else 1
        parts.start = today + timedelta(days=sign * _duration_from(m))
        parts.start_expr = m.group(0).strip()
        work = _blank(work, m.start(), m.end())

    mentions = [x for x in (_mention(m, today) for m in _DATE_RE.finditer(work)) if x]
    for i, item in enumerate(mentions):
        after, before = work[item.stop:], work[:item.pos]
        if _START_AFTER.match(after):
            item.role = "start"
        elif _END_AFTER.match(after):
            item.role = "end"
        elif i + 1 < len(mentions) and _RANGE_AFTER.match(work[item.stop:mentions[i + 1].pos]):
            item.role, mentions[i + 1].role = "start", "end"
        elif item.role is None and _END_BEFORE.search(before):
            item.role = "end"
        elif item.role is None and _START_BEFORE.search(before):
            item.role = "start"
        elif item.role is None and default_role:
            item.role = default_role

    for item in mentions:
        if item.role is None:
            # 역할 표시가 없으면 '오늘', '11월 7일' 같은 하루짜리 날짜만 시작일로 본다.
            if item.kind in {"iso", "ymd", "slash", "rel"} and parts.start is None and not any(
                x.role == "start" for x in mentions
            ):
                item.role = "start"
            else:
                continue
        if item.day_only is not None:
            continue
        if item.role == "start" and parts.start is None:
            parts.start = item.first
            if item.relative:
                parts.start_expr = (item.text + "부터").strip()
        elif item.role == "end" and parts.end is None:
            parts.end = item.last
            parts.end_without_year = not item.has_year
            if item.relative:
                parts.end_expr = (item.text + "까지").strip()

    # '20일까지'처럼 달이 없는 날짜는 앞에 나온 날짜의 달을 따른다.
    for item in mentions:
        if item.day_only is None or item.role is None:
            continue
        ref = (parts.start if item.role == "end" else None) or month_ref or today
        d = _safe_date(ref.year, ref.month, item.day_only)
        if d is None:
            continue
        if item.role == "end" and parts.end is None:
            if parts.start and d < parts.start:
                nxt = _add_months(d, 1)
                d = _safe_date(nxt.year, nxt.month, item.day_only) or d
            parts.end = d
        elif item.role == "start" and parts.start is None:
            parts.start = d

    for item in mentions:
        if item.role:
            work = _blank(work, item.pos, item.stop)

    found = _find_duration(work)
    if found:
        parts.duration_days = found[0]

    if parts.start and parts.end and parts.end < parts.start and parts.end_without_year:
        rolled = _safe_date(parts.end.year + 1, parts.end.month, parts.end.day)
        if rolled:
            parts.end = rolled
    return parts


def parse_point(text: str | None, today: date, role: str) -> date | None:
    """날짜 표현 하나를 날짜로 바꾼다. role은 'start' 또는 'end'."""
    if not text:
        return None
    parts = parse_period(text, today, default_role=role)
    return parts.start if role == "start" else parts.end


@dataclass
class ResolvedPeriod:
    start: date
    end: date
    notices: list[str] = field(default_factory=list)
    defaulted: bool = False


def resolve_new_period(parts: PeriodParts, today: date) -> ResolvedPeriod:
    """새 초안의 기간을 정한다. 기간 말이 없으면 오늘부터 2주를 제안한다."""
    notices: list[str] = []
    defaulted = False
    start, end = parts.start, parts.end
    length = parts.duration_days

    if start is None and end is not None and end < today:
        if length is None:
            length, defaulted = DEFAULT_DAYS, True
        start = end - timedelta(days=length - 1)
    if start is None:
        start = today
    if end is None:
        if length is None:
            length, defaulted = DEFAULT_DAYS, True
        end = start + timedelta(days=length - 1)

    if parts.past_expr:
        expr = f"‘{parts.past_expr}’"
        notices.append(f"{expr}{object_particle(parts.past_expr)} {fmt_md(start)}부터 {fmt_md(end)}까지로 잡았어요.")
    if parts.start_expr:
        notices.append(f"‘{parts.start_expr}’{object_particle(parts.start_expr)} {fmt_md_w(start)}부터로 잡았어요.")
    if parts.end_expr:
        notices.append(f"‘{parts.end_expr}’{object_particle(parts.end_expr)} {fmt_md_w(end)}까지로 잡았어요.")
    if defaulted:
        notices.append(NOTICE_DEFAULT_PERIOD)
    return ResolvedPeriod(start=start, end=end, notices=notices, defaulted=defaulted)


def apply_period_change(parts: PeriodParts, start: date, end: date, *, end_defaulted: bool = False) -> tuple[date, date]:
    """수정 문장에서 읽은 조각을 기존 기간에 반영한다. 말한 항목만 바꾼다."""
    new_start, new_end = start, end
    if parts.start is not None and parts.end is not None:
        new_start, new_end = parts.start, parts.end
    elif parts.start is not None:
        new_start = parts.start
        if parts.duration_days:
            new_end = new_start + timedelta(days=parts.duration_days - 1)
        elif end_defaulted:
            # 종료일이 2주 제안값이었으면 길이를 그대로 옮긴다.
            new_end = new_start + (end - start)
    elif parts.end is not None:
        new_end = parts.end
    elif parts.duration_days:
        new_end = new_start + timedelta(days=parts.duration_days - 1)
    if parts.extend_days:
        new_end = new_end + timedelta(days=parts.extend_days)
    return new_start, new_end


def validate_period(start: date | None, end: date | None) -> dict[str, str]:
    """Spring과 같은 규칙으로 기간을 검사한다."""
    errors: dict[str, str] = {}
    if start is None:
        errors["startDate"] = "시작일을 입력해주세요."
    elif not MIN_DATE <= start <= MAX_DATE:
        errors["startDate"] = MSG_DATE_RANGE
    if end is None:
        errors["endDate"] = "종료일을 입력해주세요."
    elif not MIN_DATE <= end <= MAX_DATE:
        errors["endDate"] = MSG_DATE_RANGE
    if start and end and "endDate" not in errors and end < start:
        errors["endDate"] = MSG_END_BEFORE_START
    return errors
