"""설명문의 숫자 대조.

LLM이 쓴 글에서 숫자를 모두 꺼내, 코드가 계산해 넘겨준 숫자 목록에 있는지 본다.
목록에 없는 숫자가 하나라도 있으면 그 글은 쓰지 않는다.
"""
from __future__ import annotations

import re
from typing import Iterable

_NUMBER_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _canonical(token: str) -> str:
    value = token.replace(",", "").rstrip(".")
    if "." in value:
        value = value.rstrip("0").rstrip(".")
    value = value.lstrip("0") or "0"
    return "0" + value if value.startswith(".") else value


def numbers_in(text: str) -> list[str]:
    """글에 나온 숫자를 쉼표 없는 표기로 돌려준다. '9,329,700' → '9329700'."""
    return [_canonical(tok) for tok in _NUMBER_RE.findall(text or "")]


def allowed_numbers(values: Iterable[object]) -> set[str]:
    """허용할 숫자 집합을 만든다. 숫자는 그대로, 글은 그 안의 숫자를 꺼내 넣는다."""
    allowed: set[str] = set()
    for value in values:
        if value is None or isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            allowed.add(_canonical(f"{value:.2f}" if isinstance(value, float) else str(value)))
            allowed.add(_canonical(str(abs(value))))
        else:
            allowed.update(numbers_in(str(value)))
    return allowed


def unknown_numbers(text: str, allowed: set[str]) -> list[str]:
    """입력에 없는 숫자 목록. 비어 있으면 통과다."""
    return sorted({n for n in numbers_in(text) if n not in allowed})
