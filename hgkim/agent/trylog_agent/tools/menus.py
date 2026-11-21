"""메뉴 이름을 메뉴 코드로 바꾼다.

가게의 메뉴 목록에서 이름이 포함되는 것을 찾는다.
하나면 그 메뉴, 여러 개면 사장님께 묻고, 없으면 대상 메뉴 없이 진행한다.
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_ALIASES = {"돈가스": "돈까스", "떡복이": "떡볶이", "떡뽁이": "떡볶이", "라뽁이": "라볶이", "떡볶기": "떡볶이"}
_NO_MENU_WORDS = ("전체", "전부", "모두", "상관없", "없어", "없음", "아무", "메뉴 아니", "해당 없")
_TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣]+")


@dataclass(frozen=True)
class Menu:
    code: str
    name: str
    group: str = ""
    price: int | None = None

    def as_dict(self) -> dict:
        return {"code": self.code, "name": self.name, "price": self.price}


@dataclass
class MenuMatch:
    status: str            # ONE, MANY, NONE
    menus: list[Menu]
    keyword: str | None = None


@lru_cache(maxsize=4)
def load_menus_csv(csv_dir: str, store_id: int) -> tuple[Menu, ...]:
    """`2_menus.csv`에서 한 가게의 메뉴를 읽는다."""
    path = Path(csv_dir) / "2_menus.csv"
    if not path.is_file():
        return ()
    menus = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if str(row.get("store_id", "")).strip() != str(store_id):
                continue
            price = row.get("unit_price", "")
            menus.append(Menu(row["menu2_cd"].strip(), row["menu2_nm"].strip(), row.get("menu1_nm", "").strip(),
                              int(price) if str(price).strip().isdigit() else None))
    return tuple(menus)


def menus_from_spring(rows: list[dict]) -> tuple[Menu, ...]:
    """Spring `/menus`의 `[{menuCode, menuName, unitPrice}]`를 같은 모양으로 바꾼다."""
    menus = []
    for row in rows or []:
        code, name = row.get("menuCode"), row.get("menuName")
        if code and name:
            price = row.get("unitPrice")
            menus.append(Menu(str(code), str(name), "", int(price) if isinstance(price, (int, float)) else None))
    return tuple(menus)


def _fix(text: str) -> str:
    for wrong, right in _ALIASES.items():
        text = text.replace(wrong, right)
    return text


def _tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall(_fix(text or ""))


def _key(name: str) -> str:
    return "".join(_tokens(name))


def _names(menu: Menu) -> list[str]:
    """비교에 쓸 이름. '커리덮밥(돈까스)'는 괄호 앞 이름으로도 찾는다."""
    keys = [_key(menu.name)]
    base = _key(re.sub(r"\(.*?\)", "", menu.name))
    if base and base not in keys:
        keys.append(base)
    return keys


def _full_matches(text: str, menus: list[Menu] | tuple[Menu, ...]) -> list[Menu]:
    """낱말이 시작하는 자리에서 메뉴 이름 전체가 이어지는 메뉴를 찾는다."""
    tokens = _tokens(text)
    tails = ["".join(tokens[i:]) for i in range(len(tokens))]
    found = [m for m in menus if any(tail.startswith(name) for tail in tails for name in _names(m))]
    # 다른 후보 이름 안에 들어가는 짧은 이름은 버린다. (쫄면 ⊂ 철판치즈불닭쫄면)
    return [m for m in found if not any(o is not m and _key(m.name) in _key(o.name) and _key(m.name) != _key(o.name) for o in found)]


def _partial_matches(text: str, menus: list[Menu] | tuple[Menu, ...]) -> tuple[str | None, list[Menu]]:
    """문장 낱말의 앞부분(2자 이상)이 이름에 들어 있는 메뉴를 찾는다. 가장 긴 낱말을 쓴다."""
    best: tuple[int, str, list[Menu]] | None = None
    for token in _tokens(text):
        for size in range(len(token), 1, -1):
            keyword = token[:size]
            if keyword.isdigit():
                break
            cands = [m for m in menus if keyword in _key(m.name)]
            if cands:
                if best is None or size > best[0]:
                    best = (size, keyword, cands)
                break
    return (best[1], best[2]) if best else (None, [])


def find_menus(text: str, menus: list[Menu] | tuple[Menu, ...], *, partial: bool = True) -> MenuMatch:
    full = _full_matches(text, menus)
    if len(full) == 1:
        return MenuMatch("ONE", full)
    if len(full) > 1:
        return MenuMatch("MANY", full)
    if partial:
        keyword, cands = _partial_matches(text, menus)
        if len(cands) == 1:
            return MenuMatch("ONE", cands, keyword)
        if len(cands) > 1:
            return MenuMatch("MANY", cands, keyword)
    return MenuMatch("NONE", [])


def resolve_choice(answer: str, candidates: list[Menu]) -> Menu | str | None:
    """후보 중 하나를 고른 답을 읽는다. 메뉴, 'NONE'(대상 메뉴 없음), None(못 알아들음) 중 하나."""
    text = (answer or "").strip()
    if not text or not candidates:
        return None
    m = re.search(r"(\d{1,2})\s*번?", text)
    if m and 1 <= int(m.group(1)) <= len(candidates) and not re.search(r"\d{3,}|\d\s*(?:원|일|주|월)", text):
        return candidates[int(m.group(1)) - 1]
    ordinal = {"첫": 1, "두": 2, "세": 3, "네": 4, "다섯": 5}
    m = re.search(r"(첫|두|세|네|다섯)\s*번째", text)
    if m and ordinal[m.group(1)] <= len(candidates):
        return candidates[ordinal[m.group(1)] - 1]
    match = find_menus(text, candidates)
    if match.status == "ONE":
        return match.menus[0]
    if any(word in text for word in _NO_MENU_WORDS):
        return "NONE"
    return None


def find_by_code(code: str | None, menus: list[Menu] | tuple[Menu, ...]) -> Menu | None:
    return next((m for m in menus if m.code == code), None) if code else None
