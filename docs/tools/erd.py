"""트라이로그 ERD 그림(SVG)을 만든다. 사용: python3 docs/tools/erd.py docs/diagrams/erd.svg

테이블과 컬럼은 '데이터베이스 스키마 명세서'를 그대로 옮긴 것이다.
명세서가 바뀌면 아래 TABLES와 관계 선을 고친 뒤 다시 실행한다.
"""
import sys
import html

out = sys.argv[1]
SANS = "NanumSquare, NanumBarunGothic, NanumGothic, sans-serif"
MONO = "NanumGothicCoding, monospace"
INK, SUB, LINE = '#1A2333', '#4B5565', '#394150'
GROUP = {'master': '#4A5568', 'tx': '#B86E00', 'exp': '#1F5FBF'}
GROUP_NAME = {'master': '마스터 데이터', 'tx': '트랜잭션 및 재고 관리', 'exp': '실험 및 머신러닝 예측'}
RH, HH, GAP = 18, 28, 40
TW, PL, PR, G, M = 314, 22, 14, 40, 14
LW = TW + PL + PR
TOP, HEAD = 14, 58
e = html.escape
s = []
add = s.append

# (키, 컬럼, 타입, 설명)
TABLES = {
    'stores': ('가게 정보 마스터', 'master', [
        ('PK', 'store_id', 'SERIAL', '가게 식별자'), ('', 'store_name', 'VARCHAR(100)', '가게명'),
        ('', 'mega_cd', 'VARCHAR(10)', '광역시도 코드'), ('', 'mega_nm', 'VARCHAR(30)', '광역시도명'),
        ('', 'cty_cd', 'VARCHAR(10)', '시군구 코드'), ('', 'cty_nm', 'VARCHAR(30)', '시군구명'),
        ('', 'upjong', 'VARCHAR(50)', '업종'), ('', 'open_time', 'TIME', '오픈 시간'),
        ('', 'close_time', 'TIME', '마감 시간'), ('', 'opened_date', 'DATE', '개업일'),
        ('', 'closed_weekdays', 'VARCHAR(20)', '정기 휴무 요일')]),
    'menus': ('메뉴 마스터', 'master', [
        ('PK', 'menu2_cd', 'VARCHAR(20)', '2단계 메뉴 코드'), ('FK', 'store_id', 'INT', '가게 식별자'),
        ('', 'menu1_cd', 'VARCHAR(10)', '1단계 카테고리 코드'), ('', 'menu1_nm', 'VARCHAR(50)', '1단계 카테고리명'),
        ('', 'menu2_nm', 'VARCHAR(100)', '상세 메뉴명'), ('', 'unit_price', 'INT', '단가 (원)')]),
    'ingredients': ('식자재 마스터', 'master', [
        ('PK', 'ingre_cd', 'VARCHAR(20)', '식자재 코드'), ('', 'ingre_nm', 'VARCHAR(100)', '식자재명'),
        ('', 'unit', 'VARCHAR(10)', '기본 단위'), ('', 'pack_size', 'INT', '발주 포장 용량'),
        ('', 'pack_unit_nm', 'VARCHAR(20)', '발주 포장 단위명')]),
    'pos_orders': ('POS 주문 원천 데이터', 'tx', [
        ('PK', 'order_line_id', 'SERIAL', '주문 라인 식별자'), ('', 'base_date', 'DATE', '영업 기준일자'),
        ('', 'receipt_id', 'VARCHAR(32)', '영수증 묶음 식별자'), ('FK', 'store_id', 'INT', '가게 식별자'),
        ('', 'order_datetime', 'TIMESTAMP', '주문 발생 일시'), ('FK', 'menu2_cd', 'VARCHAR(20)', '주문 메뉴 코드'),
        ('', 'price', 'INT', '주문 당시 단가'), ('', 'quantity', 'INT', '주문 수량'),
        ('', 'is_refunded', 'BOOLEAN', '환불 여부')]),
    'store_inventory': ('가게별 재고 현황', 'tx', [
        ('PK FK', 'store_id', 'INT', '가게 식별자'), ('PK FK', 'ingre_cd', 'VARCHAR(20)', '식자재 코드'),
        ('', 'current_stock', 'FLOAT', '현재 보유 재고량'), ('', 'incoming_stock', 'FLOAT', '입고 예정 재고량')]),
    'menu_recipes': ('메뉴별 소요량 레시피', 'tx', [
        ('PK FK', 'menu2_cd', 'VARCHAR(20)', '메뉴 코드'), ('PK FK', 'ingre_cd', 'VARCHAR(20)', '식자재 코드'),
        ('', 'required_qty', 'FLOAT', '1회 제조 소요량')]),
    'experiments': ('사장님 시도 기록', 'exp', [
        ('PK', 'id', 'VARCHAR(36)', '실험 UUID'), ('FK', 'store_id', 'INT', '가게 식별자'),
        ('', 'title', 'VARCHAR(80)', '실험명'), ('', 'expm_category', 'VARCHAR(20)', '대분류'),
        ('', 'action_type', 'VARCHAR(30)', '소분류 액션 타입'), ('FK', 'target_menu2_cd', 'VARCHAR(20)', '타겟 메뉴 코드 (선택)'),
        ('', 'start_date', 'DATE', '실험 시작일'), ('', 'end_date', 'DATE', '실험 종료일')]),
    'ml_predictions': ('ML 매출 예측 메타', 'exp', [
        ('PK', 'prediction_id', 'SERIAL', '예측 기록 식별자'), ('FK', 'experiment_id', 'VARCHAR(36)', '관련 실험 UUID'),
        ('', 'target_date', 'DATE', '예측 대상 일자'), ('', 'expected_sales', 'INT', '예상 매출액'),
        ('', 'expected_lower', 'INT', '매출액 하한선'), ('', 'expected_upper', 'INT', '매출액 상한선'),
        ('', 'model_version', 'VARCHAR(40)', '사용된 모델 버전'), ('', 'val_mae', 'INT', '검증 지표 (MAE)'),
        ('', 'val_wape', 'FLOAT', '검증 지표 (WAPE)')]),
    'external_daily_features': ('외부 달력·날씨 데이터', 'exp', [
        ('PK', 'feature_date', 'DATE', '기준 일자'), ('', 'day_of_week', 'INT', '요일 (0:월 ~ 6:일)'),
        ('', 'is_weekend', 'BOOLEAN', '주말 여부'), ('', 'is_holiday', 'BOOLEAN', '공휴일 여부'),
        ('', 'avg_temp', 'FLOAT', '평균 기온'), ('', 'precipitation', 'FLOAT', '강수량'),
        ('', 'is_forecast', 'BOOLEAN', '예보 데이터 여부')]),
}
LANES = [
    ('시도와 예측', '사장님 시도, 매출 예측, 달력 · 날씨', ['experiments', 'ml_predictions', 'external_daily_features']),
    ('가게와 메뉴', '모든 기록이 가리키는 기준 정보', ['stores', 'menus']),
    ('주문 · 재고 · 레시피', '주문 원본과 식자재 사용 · 보유량', ['store_inventory', 'pos_orders', 'menu_recipes']),
    ('식자재', '재고와 레시피가 가리키는 기준 정보', ['ingredients']),
]
T = {n: dict(title=t, group=g, rows=r) for n, (t, g, r) in TABLES.items()}


def lane_x(i):
    return M + i * (LW + G)


ends = {}
for i, (_, _, names) in enumerate(LANES):
    y = TOP + HEAD
    for n in names:
        T[n]['x'] = lane_x(i) + PL
        T[n]['y'] = y
        T[n]['h'] = HH + RH * len(T[n]['rows'])
        y += T[n]['h'] + GAP
    ends[i] = y
LANE_BOTTOM = max(t['y'] + t['h'] for t in T.values()) + 16
WIDTH, HEIGHT = lane_x(len(LANES) - 1) + LW + M, LANE_BOTTOM + 14


def Lx(n): return T[n]['x']
def Rx(n): return T[n]['x'] + TW
def Ty(n): return T[n]['y']
def By(n): return T[n]['y'] + T[n]['h']
def Cx(n): return T[n]['x'] + TW / 2


def rowy(n, col):
    idx = [r[1] for r in T[n]['rows']].index(col)
    return T[n]['y'] + HH + RH * idx + RH / 2


def tw(t, size):
    return sum(size if ord(c) > 0x2E7F else size * 0.55 for c in t)


add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" font-family="{SANS}">')
add(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#FFFFFF"/>')
for i, (name, sub, _) in enumerate(LANES):
    lx = lane_x(i)
    add(f'<rect x="{lx}" y="{TOP}" width="{LW}" height="{LANE_BOTTOM - TOP}" rx="14" fill="#F8FAFC" stroke="#D3DAE6"/>')
    add(f'<text x="{lx + PL}" y="{TOP + 27}" font-size="16" font-weight="800" fill="{INK}">{e(name)}</text>')
    add(f'<text x="{lx + PL}" y="{TOP + 44}" font-size="11.5" fill="{SUB}">{e(sub)}</text>')

labels = []


def rel(pts):
    d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
    add(f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="1.5" stroke-linejoin="round"/>')


def card(x, y, t, anchor='start'):
    labels.append((x, y, t, anchor))


def vert(a, b, ca, cb):
    x = Cx(a)
    rel([(x, By(a)), (x, Ty(b))])
    card(x + 6, By(a) + 13, ca)
    card(x + 6, Ty(b) - 6, cb)


def side(parent, pcol, child, ccol, track, parent_on_right, cp, cc, child_label_below=False):
    """부모 PK 행에서 자식 FK 행으로 가는 꺾은선. parent_on_right: 부모가 자식의 오른쪽 레인에 있는가."""
    y1, y2 = rowy(parent, pcol), rowy(child, ccol)
    if parent_on_right:
        rel([(Lx(parent), y1), (track, y1), (track, y2), (Rx(child), y2)])
        card(Lx(parent) - 4, y1 - 4, cp, 'end')
        card(Rx(child) + 4, y2 + 12 if child_label_below else y2 - 4, cc)
    else:
        rel([(Rx(parent), y1), (track, y1), (track, y2), (Lx(child), y2)])
        card(Rx(parent) + 4, y1 - 4, cp)
        card(Lx(child) - 4, y2 + 12 if child_label_below else y2 - 4, cc, 'end')


g01 = lane_x(0) + LW + G / 2
g12 = lane_x(1) + LW + G / 2
g23 = lane_x(2) + LW + G / 2
vert('stores', 'menus', '1', 'N')
vert('experiments', 'ml_predictions', '0..1', 'N')
side('stores', 'store_id', 'experiments', 'store_id', g01, True, '1', 'N')
side('menus', 'menu2_cd', 'experiments', 'target_menu2_cd', g01, True, '0..1', 'N')
side('stores', 'store_id', 'store_inventory', 'store_id', g12, False, '1', 'N')
side('stores', 'store_id', 'pos_orders', 'store_id', g12, False, '', 'N')
side('menus', 'menu2_cd', 'pos_orders', 'menu2_cd', g12, False, '1', 'N', child_label_below=True)
side('menus', 'menu2_cd', 'menu_recipes', 'menu2_cd', g12, False, '', 'N')
side('ingredients', 'ingre_cd', 'store_inventory', 'ingre_cd', g23, True, '1', 'N', child_label_below=True)
side('ingredients', 'ingre_cd', 'menu_recipes', 'ingre_cd', g23, True, '', 'N')

for name, t in T.items():
    x, y, h, acc = t['x'], t['y'], t['h'], GROUP[t['group']]
    add(f'<rect x="{x}" y="{y}" width="{TW}" height="{h}" rx="7" fill="#FFFFFF" stroke="{acc}" stroke-width="1.4"/>')
    add(f'<path d="M{x},{y + HH} L{x},{y + 7} Q{x},{y} {x + 7},{y} L{x + TW - 7},{y} Q{x + TW},{y} {x + TW},{y + 7} L{x + TW},{y + HH} Z" fill="{acc}"/>')
    add(f'<text x="{x + 10}" y="{y + 18.5}" font-size="12.5" font-weight="800" fill="#FFFFFF" letter-spacing="0.2">{e(name)}</text>')
    add(f'<text x="{x + TW - 10}" y="{y + 18.5}" font-size="10.5" fill="#FFFFFF" fill-opacity="0.9" text-anchor="end">{e(t["title"])}</text>')
    for i, (key, col, typ, desc) in enumerate(t['rows']):
        y0 = y + HH + RH * i
        if i % 2 == 1:
            last = i == len(t['rows']) - 1
            add(f'<rect x="{x + 0.7}" y="{y0}" width="{TW - 1.4}" height="{RH - (1 if last else 0)}" fill="#F3F6FA"/>')
        bx = x + 6
        for k in key.split():
            if k == 'PK':
                add(f'<rect x="{bx}" y="{y0 + 3}" width="18" height="12" rx="3" fill="{acc}"/>')
                add(f'<text x="{bx + 9}" y="{y0 + 12.3}" font-size="8" font-weight="800" fill="#FFFFFF" text-anchor="middle">PK</text>')
            else:
                add(f'<rect x="{bx + 0.5}" y="{y0 + 3.5}" width="17" height="11" rx="3" fill="#FFFFFF" stroke="{acc}"/>')
                add(f'<text x="{bx + 9}" y="{y0 + 12.3}" font-size="8" font-weight="800" fill="{acc}" text-anchor="middle">FK</text>')
            bx += 20
        w = '700' if key else '400'
        add(f'<text x="{x + 50}" y="{y0 + 13}" font-family="{MONO}" font-size="11" font-weight="{w}" fill="{INK}">{e(col)}</text>')
        add(f'<text x="{x + 142}" y="{y0 + 13}" font-family="{MONO}" font-size="9.5" fill="#6B7686">{e(typ)}</text>')
        add(f'<text x="{x + 206}" y="{y0 + 13}" font-size="10" fill="{SUB}">{e(desc)}</text>')

for x, y, t, anchor in labels:
    if not t:
        continue
    w = tw(t, 10.5) + 6
    rx = x - 3 if anchor == 'start' else x - w + 3
    add(f'<rect x="{rx}" y="{y - 9.7}" width="{w}" height="13.6" rx="3" fill="#F8FAFC"/>')
    add(f'<text x="{x}" y="{y}" font-size="10.5" font-weight="800" fill="{INK}" text-anchor="{anchor}">{e(t)}</text>')


def note(x, y, title, lines):
    h = 34 + 16 * len(lines) + 8
    add(f'<rect x="{x}" y="{y}" width="{TW}" height="{h}" rx="8" fill="#FFFFFF" stroke="#D3DAE6"/>')
    add(f'<text x="{x + 12}" y="{y + 22}" font-size="12.5" font-weight="800" fill="{INK}">{e(title)}</text>')
    for i, ln in enumerate(lines):
        add(f'<text x="{x + 12}" y="{y + 42 + 16 * i}" font-size="11" fill="{SUB}">{e(ln)}</text>')
    return y + h


note(lane_x(1) + PL, ends[1], '읽는 법', [
    'PK는 이 테이블의 기본 키, FK는 다른 테이블을',
    '가리키는 키입니다. PK와 FK가 함께 붙은 두 컬럼은',
    '둘을 묶어 기본 키로 씁니다.',
    '선 끝의 1, N, 0..1은 서로 연결되는 행의 수입니다.',
    '예: 가게 1곳에 메뉴 N개.'])
ny = note(lane_x(3) + PL, ends[3], '일별 매출 집계 뷰', [
    'v_daily_sales_mart는 pos_orders를 영업',
    '기준일자로 묶어 주문 수, 판매 수량, 매출(단가 ×',
    '수량)을 계산합니다. 환불 주문은 빼고, 요일 · 공휴일',
    '· 날씨를 external_daily_features에서 붙입니다.'])
ly = ny + 14
add(f'<rect x="{lane_x(3) + PL}" y="{ly}" width="{TW}" height="{34 + 20 * 3 + 6}" rx="8" fill="#FFFFFF" stroke="#D3DAE6"/>')
add(f'<text x="{lane_x(3) + PL + 12}" y="{ly + 22}" font-size="12.5" font-weight="800" fill="{INK}">색 구분 (명세서의 세 구분)</text>')
for i, g in enumerate(['master', 'tx', 'exp']):
    yy = ly + 34 + 20 * i
    add(f'<rect x="{lane_x(3) + PL + 12}" y="{yy}" width="22" height="12" rx="3" fill="{GROUP[g]}"/>')
    add(f'<text x="{lane_x(3) + PL + 42}" y="{yy + 10.5}" font-size="11" fill="{SUB}">{e(GROUP_NAME[g])}</text>')
add('</svg>')
open(out, 'w', encoding='utf-8').write('\n'.join(s))
print('erd svg', WIDTH, HEIGHT)
