"""규칙 기반 이해.

LLM을 쓸 수 없을 때(키 없음, 시간 초과, 거절) 문장에서 분류와 제목을 뽑는다.
확인 단계의 답("저장", "취소")도 여기서 먼저 가린다.
"""
from __future__ import annotations

import re

CATEGORIES = ("MENU", "OPERATION", "MARKETING")
CATEGORY_LABEL = {"MENU": "메뉴", "OPERATION": "운영", "MARKETING": "홍보"}
ACTION_CATEGORY = {
    "MENU_BADGE": "MENU", "SET_BUNDLE": "MENU", "PRICE_CHANGE": "MENU",
    "STORE_SIGNAGE": "OPERATION", "HOURS_OPERATION": "OPERATION",
    "LOCAL_PROMO": "MARKETING", "DISCOUNT_COUPON": "MARKETING", "MENU_COPY_PHOTO": "MARKETING",
}
METRIC_MENU = "대상 메뉴가 들어간 주문 수와 비중"
METRIC_STORE = "하루 매출과 주문 수"

_ACTION_RULES = [
    ("DISCOUNT_COUPON", r"할인|쿠폰|적립|포인트|1\+1|덤"),
    ("LOCAL_PROMO", r"홍보|광고|당근|인스타|블로그|전단|현수막 광고|리뷰\s*이벤트|이벤트|SNS|배달\s*앱"),
    ("STORE_SIGNAGE", r"입간판|간판|배너|현수막|엑스배너|안내판"),
    ("HOURS_OPERATION", r"영업\s*시간|마감|오픈\s*시간|문\s*여는|문\s*닫는|휴무|브레이크"),
    ("SET_BUNDLE", r"세트|묶음|콤보"),
    ("PRICE_CHANGE", r"\d[\d,]*\s*원|가격|인상|인하|값을|값\s*올|값\s*내"),
    ("MENU_BADGE", r"추천|표시|스티커|뱃지|배지|인기\s*메뉴|베스트"),
    ("MENU_COPY_PHOTO", r"사진|문구|설명|메뉴\s*이름|메뉴판\s*디자인"),
]
_OPERATION_RE = re.compile(r"좌석|테이블|포장|동선|키오스크|직원|알바|인테리어|청소|대기|줄\s*서")
_WORRY_RE = re.compile(
    r"뭐\s*해|뭘\s*해|무엇을\s*해|어떡|어떻게\s*(?:해|하)|고민|걱정|한산|안\s*팔|안\s*나가|줄었|떨어졌|떨어져|"
    r"없을까|좋을까|될까|방법|손님이\s*(?:없|적|줄)|매출이\s*(?:안|줄|떨)|장사가\s*안"
)

_PAST = r"(?:어요?|다|습니다|음|었어요?)"
_FUTURE = r"\s*(?:게요?|거야|거예요|거에요|예정이야|예정이에요|생각이야|려고\s*해요?|려고)"
_ENDINGS = [
    (rf"붙였{_PAST}$|붙일{_FUTURE}$", "붙이기"),
    (rf"올렸{_PAST}$|올릴{_FUTURE}$", "올리기"),
    (rf"내렸{_PAST}$|내릴{_FUTURE}$", "내리기"),
    (rf"바꿨{_PAST}$|바꿀{_FUTURE}$", "바꾸기"),
    (rf"세워\s*(?:뒀|두었){_PAST}$|세워\s*둘{_FUTURE}$", "세워두기"),
    (rf"세웠{_PAST}$|세울{_FUTURE}$", "세우기"),
    (rf"넣었{_PAST}$|넣을{_FUTURE}$", "넣기"),
    (rf"만들었{_PAST}$|만들{_FUTURE}$", "만들기"),
    (rf"늘렸{_PAST}$|늘릴{_FUTURE}$", "늘리기"),
    (rf"줄였{_PAST}$|줄일{_FUTURE}$", "줄이기"),
    (rf"뺐{_PAST}$|뺄{_FUTURE}$", "빼기"),
    (rf"열었{_PAST}$|열{_FUTURE}$", "열기"),
    (rf"해\s*봤{_PAST}$|해\s*볼{_FUTURE}$", "해보기"),
    (rf"했{_PAST}$|할{_FUTURE}$|하려고(?:\s*해요?)?$|합니다$|하는\s*중(?:이야|이에요)?$", "하기"),
]
_ENDINGS = [(re.compile(pattern), repl) for pattern, repl in _ENDINGS]
_ACTION_VERB_RE = re.compile("|".join(p.pattern.replace("$", "") for p, _ in _ENDINGS))

_PERIOD_PIECES = re.compile(
    r"(?:지난|최근)\s*(?:\d+|한|두|세|네|일|이|삼|사)\s*(?:주일|주|일|달|개월)\s*(?:간|동안)?"
    r"|\d{4}[-./]\d{1,2}[-./]\d{1,2}\s*(?:부터|까지)?"
    r"|(?:\d{4}년\s*)?\d{1,2}월\s*\d{1,2}일\s*(?:부터|까지)?"
    r"|\d{1,2}일\s*(?:부터|까지)"
    r"|(?:그저께|엊그제|그제|어제|오늘|내일|모레)\s*(?:부터|까지)?"
    r"|(?:이번|다음|지난)\s*주(?:\s*[월화수목금토일]요일)?\s*(?:부터|까지)"
    r"|(?:이번|다음)\s*달\s*(?:부터|까지)|월말\s*까지|주말\s*까지|[월화수목금토일]요일\s*(?:부터|까지)"
    r"|(?:\d+|한|두|세|네|일|이|삼|사)\s*(?:주일|주|달|개월)\s*(?:간|동안)"
    r"|\d+\s*일\s*(?:간|동안)|(?:이틀|사흘|나흘|닷새|엿새|이레|열흘|보름)\s*(?:간|동안)?"
)
_ONLY_PERIOD_TALK = re.compile(r"^[\s~\-]*(?:(?:\d+|한|두|세|네|일|이|삼|사)\s*(?:주일|주|일|달|개월)\s*)?(?:해\s*볼게요?|할게요?|할\s*거야|동안|간)?[\s.]*$")

_SAVE_RE = re.compile(
    r"^(?:네|넵|넹|예|응|웅|어|그래|그래요|좋아|좋아요|좋습니다|맞아|맞아요|맞습니다|오케이|오키|ㅇㅋ|ㅇㅇ|ok|okay|yes|확인)?"
    r"(?:이대로|그대로|이걸로|그걸로)?(?:저장|등록)?(?:해|해줘|해줘요|해주세요|할게|할게요|해요|하자|부탁해|부탁해요|해도돼|해도돼요)?$",
    re.IGNORECASE,
)
_CANCEL_RE = re.compile(
    r"^(?:아니|아니야|아니요)?(?:취소|그만|관둘래|안할래|안해|됐어|됐어요|저장하지마|저장안해|등록하지마|하지마)(?:해|해줘|해주세요|할게|할게요|할래)?$"
)


def _compact(text: str) -> str:
    return re.sub(r"[\s.,!?~‘’'\"“”]+", "", text or "")


def is_save_word(text: str) -> bool:
    compact = _compact(text)
    return bool(compact) and len(compact) <= 14 and bool(_SAVE_RE.match(compact)) and not _CANCEL_RE.match(compact)


def is_cancel_word(text: str) -> bool:
    compact = _compact(text)
    return bool(compact) and len(compact) <= 14 and bool(_CANCEL_RE.match(compact))


def classify_confirm(text: str) -> str:
    """확인 단계의 답을 SAVE, CANCEL, REVISE로 가린다."""
    if is_cancel_word(text):
        return "CANCEL"
    if is_save_word(text):
        return "SAVE"
    return "REVISE"


def guess_action(text: str) -> str | None:
    for action, pattern in _ACTION_RULES:
        if re.search(pattern, text):
            return action
    return None


def guess_category(text: str, has_menu: bool, action: str | None = None) -> str:
    if action in ACTION_CATEGORY and action != "MENU_COPY_PHOTO":
        return ACTION_CATEGORY[action]
    if _OPERATION_RE.search(text):
        return "OPERATION"
    if has_menu or action == "MENU_COPY_PHOTO" or re.search(r"메뉴", text):
        return "MENU"
    return "OPERATION"


def guess_intent(text: str, has_menu: bool) -> str:
    if _WORRY_RE.search(text):
        return "WORRY"
    if has_menu or _ACTION_VERB_RE.search(text) or guess_action(text) or _OPERATION_RE.search(text):
        return "RECORD"
    return "OTHER"


def make_title(text: str) -> str:
    """문장에서 기간 표현을 빼고 '~하기' 꼴의 제목으로 바꾼다."""
    sentences = [s.strip() for s in re.split(r"[.!?\n]+", text or "") if s.strip()]
    kept = []
    for sentence in sentences:
        body = re.sub(r"\s+", " ", _PERIOD_PIECES.sub(" ", sentence)).strip(" ,~-")
        if body and not _ONLY_PERIOD_TALK.match(body):
            kept.append(body)
    title = kept[0] if kept else ""
    for pattern, repl in _ENDINGS:
        new_title, count = pattern.subn(repl, title)
        if count:
            title = new_title
            break
    return title.strip()[:80]


def understand(text: str, has_menu: bool) -> dict:
    """`llm.Understanding`과 같은 모양의 결과를 규칙으로 만든다."""
    intent = guess_intent(text, has_menu)
    if intent != "RECORD":
        return {"intent": intent, "title": None, "category": None, "actionType": None, "targetMenuText": None,
                "metric": None, "startText": None, "endText": None, "durationText": None}
    action = guess_action(text)
    return {
        "intent": intent,
        "title": make_title(text) or None,
        "category": guess_category(text, has_menu, action),
        "actionType": action or "OTHER",
        "targetMenuText": None,
        "metric": METRIC_MENU if has_menu else METRIC_STORE,
        "startText": None, "endText": None, "durationText": None,
    }
