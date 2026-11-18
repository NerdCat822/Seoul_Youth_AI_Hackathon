"""트라이로그 데이터 처리 파이프라인 그림(SVG)을 만든다. 사용: python3 docs/tools/pipeline.py docs/diagrams/pipeline.svg

저장소(원통) 이름은 docs/erd.md의 테이블 · 뷰 이름과 맞춘다.
"""
import sys
import html

out = sys.argv[1]
FONT = "NanumSquare, NanumBarunGothic, NanumGothic, 'Noto Sans KR', sans-serif"
CAT = {
    'user': ('#FFF3DC', '#B86E00'),
    'llm': ('#EEE8FC', '#5B3FB8'),
    'code': ('#E5EFFD', '#1F5FBF'),
    'ml': ('#E2F4EA', '#1E7A52'),
    'db': ('#F1F3F6', '#4A5568'),
}
INK, SUB, LINE, NAVY = '#1A2333', '#4B5565', '#394150', '#0F2A5F'
W1, W2, W3, G, LM = 270, 360, 270, 46, 26
L1, L2, L3 = LM, LM + W1 + G, LM + W1 + G + W2 + G
WIDTH = L3 + W3 + 20
TOP, HEAD, H, P = 16, 68, 70, 104
ROWS = 6


def ry(r):
    return TOP + HEAD + r * P


LANE_BOTTOM = ry(ROWS - 1) + H + 16
HEIGHT = LANE_BOTTOM + 96
PAD = 14
e = html.escape
s = []
add = s.append

nodes = {}


def node(id, lane_x, lane_w, row, cat, tag, title, subs, x=None, w=None):
    bx = lane_x + PAD if x is None else x
    bw = lane_w - 2 * PAD if w is None else w
    nodes[id] = dict(x=bx, y=ry(row), w=bw, h=H, cat=cat, tag=tag, title=title, subs=subs)


# 1. 기록
node('A1', L1, W1, 0, 'user', '사장님', '한마디 입력', ['평소 말투의 글 또는 말'])
node('A2', L1, W1, 1, 'llm', 'LLM', '항목 추출', ['해볼 일 · 대상 메뉴', '기간 · 볼 숫자'])
node('A3', L1, W1, 2, 'code', '코드', '규칙 검증', ['날짜 범위 · 기간 순서'])
node('A4', L1, W1, 3, 'user', '사장님', '내용 확인', ['틀린 곳은 말로 고치기'])
node('A5', L1, W1, 4, 'db', '저장', '시도 저장', ['experiments'])
node('A6', L1, W1, 5, 'user', '화면', '홈 · 달력 · 장사 기록', ['확인일 = 종료일 다음 날'])
# 2. 결과
IW = W2 - 2 * PAD
node('B1', L2, W2, 0, 'user', '사장님', '판매 자료 올리기', ['주문 엑셀 양식 1종'])
node('B2', L2, W2, 1, 'code', '코드', '자료 검증', ['양식 · 기간 · 누락', '휴무 · 환불'], x=L2 + PAD, w=176)
node('B3', L2, W2, 1, 'user', '화면', '자료 부족 안내', ['필요한 자료 표시'], x=L2 + PAD + 176 + 40, w=IW - 176 - 40)
node('B4', L2, W2, 2, 'db', '저장', '주문 원본 저장', ['pos_orders', '일별 집계는 뷰 v_daily_sales_mart'])
HW = (IW - 16) // 2
node('B5', L2, W2, 3, 'code', '코드', '전후 비교 계산', ['같은 요일 · 전후 14일', '주문 수 · 비중'], x=L2 + PAD, w=HW)
node('B6', L2, W2, 3, 'code', '코드', '실제와 예상 비교', ['예상 범위', '검증 오차 함께 표시'], x=L2 + PAD + HW + 16, w=HW)
node('B7', L2, W2, 4, 'llm', 'LLM', '결과 설명', ['계산된 숫자만 사용'])
node('B9', L2, W2, 5, 'user', '화면', '결과 화면', ['글 · 읽어주기 · 다음에 해볼 일'])
# 3. ML
node('C1', L3, W3, 0, 'db', '저장', '과거 일별 매출 자료', ['v_daily_sales_mart'])
node('C2', L3, W3, 1, 'ml', 'ML', '특성 생성', ['요일 · 공휴일 · 과거 매출'])
node('C3', L3, W3, 2, 'ml', 'ML', '모델 학습', ['LightGBM 또는 XGBoost'])
node('C4', L3, W3, 3, 'ml', 'ML', '시간 순서 검증', ['MAE · WAPE', '직전 주 같은 요일과 비교'])
node('C6', L3, W3, 4, 'ml', 'ML', '추론', ['날짜별 예상 매출 · 범위'])
node('C7', L3, W3, 5, 'db', '저장', '예측 저장', ['ml_predictions', '매출 · 범위 · 모델 버전 · 검증 지표'])

add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" font-family="{FONT}">')
add('<defs>'
    f'<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{LINE}"/></marker>'
    f'<marker id="arrx" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{NAVY}"/></marker>'
    '</defs>')
add(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#FFFFFF"/>')

for lx, lw, num, name, sub in [(L1, W1, '1', '기록', '한마디에서 저장까지'),
                               (L2, W2, '2', '결과', '확인일에 자료에서 결과까지'),
                               (L3, W3, '3', 'ML', '사전 학습과 추론')]:
    add(f'<rect x="{lx}" y="{TOP}" width="{lw}" height="{LANE_BOTTOM - TOP}" rx="14" fill="#F8FAFC" stroke="#D3DAE6"/>')
    add(f'<text x="{lx + 18}" y="{TOP + 28}" font-size="17" font-weight="800" fill="{INK}">{num}. {e(name)} 파이프라인</text>')
    add(f'<text x="{lx + 18}" y="{TOP + 46}" font-size="12.5" fill="{SUB}">{e(sub)}</text>')


def line(pts, cross=False, dash=False):
    d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
    col, mk, sw = (NAVY, 'arrx', 2.2) if cross else (LINE, 'arr', 1.6)
    da = ' stroke-dasharray="6 4"' if dash else ''
    add(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linejoin="round"{da} marker-end="url(#{mk})"/>')


def cx(n): return nodes[n]['x'] + nodes[n]['w'] / 2
def bottom(n): return nodes[n]['y'] + H
def top(n): return nodes[n]['y']
def mid(n): return nodes[n]['y'] + H / 2
def left(n): return nodes[n]['x']
def right(n): return nodes[n]['x'] + nodes[n]['w']


def down(a, b, x=None):
    xx = cx(a) if x is None else x
    line([(xx, bottom(a)), (xx, top(b) - 1)])


def tw(t, size):
    return sum(size if ord(c) > 0x2E7F else size * 0.55 for c in t)


def label(x, y, t, rot=None, size=12, color=INK, weight=700, anchor='middle'):
    bg = '#FFFFFF' if rot is not None or y > LANE_BOTTOM else '#F8FAFC'
    w = tw(t, size) + 6
    rx = x - w / 2 if anchor == 'middle' else (x - 3 if anchor == 'start' else x - w + 3)
    tr = f' transform="rotate({rot} {x} {y})"' if rot is not None else ''
    add(f'<g{tr}><rect x="{rx}" y="{y - size * 0.92}" width="{w}" height="{size * 1.3}" rx="3" fill="{bg}"/>'
        f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{e(t)}</text></g>')


for a, b in [('A1', 'A2'), ('A2', 'A3'), ('A3', 'A4'), ('A4', 'A5'), ('A5', 'A6'),
             ('B7', 'B9'),
             ('C1', 'C2'), ('C2', 'C3'), ('C3', 'C4'), ('C4', 'C6'), ('C6', 'C7')]:
    down(a, b)
down('B1', 'B2', x=cx('B2'))
line([(right('B2'), mid('B2')), (left('B3') - 1, mid('B3'))])
label((right('B2') + left('B3')) / 2, mid('B2') - 7, '부족', size=11.5, color=SUB)
down('B2', 'B4', x=cx('B2'))
label(cx('B2') + 22, bottom('B2') + 21, '통과', size=11.5, color=SUB)
down('B4', 'B5', x=cx('B5'))
down('B4', 'B6', x=cx('B6'))
down('B5', 'B7', x=cx('B5'))
down('B6', 'B7', x=cx('B6'))

# 갈래를 넘는 연결
g12 = L1 + W1 + G / 2
line([(right('A6'), mid('A6')), (g12, mid('A6')), (g12, mid('B1')), (left('B1') - 1, mid('B1'))], cross=True)
label(g12 + 4, (mid('A6') + mid('B1')) / 2, '확인일이 되면', rot=-90, color=NAVY)
g23 = L2 + W2 + G / 2
line([(left('C7'), mid('C7')), (g23, mid('C7')), (g23, mid('B6')), (right('B6') + 1, mid('B6'))], cross=True)
label(g23 + 4, (mid('C7') + mid('B6')) / 2, '날짜별 예상 매출', rot=-90, color=NAVY)
yb = LANE_BOTTOM + 26
xs = left('B9') + 70
line([(xs, bottom('B9')), (xs, yb), (12, yb), (12, mid('A4')), (left('A4') - 1, mid('A4'))], cross=True, dash=True)
label(L1 + W1 / 2, yb - 7, '다음 시도를 저장하면', color=NAVY)

for id, n in nodes.items():
    fill, acc = CAT[n['cat']]
    x, y, w, h = n['x'], n['y'], n['w'], n['h']
    if n['cat'] == 'db':
        r = 7
        add(f'<path d="M{x},{y + r} A{w / 2},{r} 0 0 1 {x + w},{y + r} L{x + w},{y + h - r} A{w / 2},{r} 0 0 1 {x},{y + h - r} Z" fill="{fill}" stroke="{acc}" stroke-width="1.4"/>')
        add(f'<path d="M{x},{y + r} A{w / 2},{r} 0 0 0 {x + w},{y + r}" fill="none" stroke="{acc}" stroke-width="1.4"/>')
        shift = 5
    else:
        add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fill}" stroke="{acc}" stroke-width="1.4"/>')
        shift = 0
    subs = n['subs']
    total = 18 + 16 * len(subs)
    ty = y + (h - total) / 2 + 14 + shift
    add(f'<text x="{x + w / 2}" y="{ty}" font-size="15" font-weight="800" fill="{INK}" text-anchor="middle">{e(n["title"])}</text>')
    for i, t in enumerate(subs):
        mono = t.isascii()
        fs = 11 if mono else 12.5
        ls = ' letter-spacing="0.2"' if mono else ''
        add(f'<text x="{x + w / 2}" y="{ty + 18 + 16 * i}" font-size="{fs}" fill="{SUB}" text-anchor="middle"{ls}>{e(t)}</text>')
    if n['cat'] != 'db':
        tag = n['tag']
        tgw = sum(11 if ord(c) > 0x2E7F else 7.2 for c in tag) + 14
        add(f'<rect x="{x + 10}" y="{y - 9}" width="{tgw}" height="17" rx="8.5" fill="{acc}"/>')
        add(f'<text x="{x + 10 + tgw / 2}" y="{y + 3.5}" font-size="10.5" font-weight="800" fill="#FFFFFF" text-anchor="middle">{e(tag)}</text>')

# 범례
ly = LANE_BOTTOM + 52
lx = LM
for cat, text in [('user', '사장님 입력 · 화면'), ('llm', 'LLM · 말 이해와 설명'), ('code', '코드 · 검증과 계산'),
                  ('ml', 'ML · 매출 예측'), ('db', '저장소 · 테이블과 뷰')]:
    fill, acc = CAT[cat]
    add(f'<rect x="{lx}" y="{ly}" width="16" height="16" rx="4" fill="{fill}" stroke="{acc}" stroke-width="1.4"/>')
    add(f'<text x="{lx + 23}" y="{ly + 12.5}" font-size="12.5" fill="{INK}">{e(text)}</text>')
    lx += 40 + sum(12.5 if ord(c) > 0x2E7F else 6 for c in text) + 22
add(f'<text x="{LM}" y="{ly + 38}" font-size="12.5" fill="{SUB}">숫자는 코드가 계산하고, LLM은 사장님의 말을 이해하고 결과를 설명하는 일만 맡습니다. 점선은 다음 시도로 이어지는 경로입니다.</text>')
add('</svg>')
open(out, 'w', encoding='utf-8').write('\n'.join(s))
print('pipeline svg', WIDTH, HEIGHT)
