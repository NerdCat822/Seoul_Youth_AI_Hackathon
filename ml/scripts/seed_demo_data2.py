import os, random
from datetime import date, datetime, time, timedelta
import pandas as pd

OUT_DIR = r"C:\Users\NICE\Downloads\test"
BASE_TODAY = date(2026, 11, 21)

STORES = [
    (1, "지니네김밥", "11", "서울특별시", "11440", "마포구", "분식", time(9, 0), time(21, 30), date(2023, 3, 15)),
    (2, "지니버거", "11", "서울특별시", "11200", "성동구", "버거·패스트푸드", time(10, 30), time(22, 30), date(2024, 1, 10)),
    (3, "지니임실치즈피자", "11", "서울특별시", "11620", "관악구", "피자", time(11, 0), time(23, 0), date(2022, 8, 20)),
]

RAW_MENUS = {
    (2, "A001", "세트"): [("킹더버거(수제버거)세트",11500),("ㅊㅊㅊ치킨버거 세트",10500),("킹새우비프버거 세트",11900),("아메리칸 치즈버거 세트",9900),("꾸덕 더블 치즈 베이컨버거 세트",12500),("스크램블 에그 폭탄 지못미버거 세트",11800),("BIG 비프 새우카츠버거 세트",12200),("더블 불고기버거 세트",10200)],
    (2, "A002", "라지메뉴"): [("킹더버거(수제버거) 라지세트",12700),("ㅊㅊㅊ치킨버거 라지세트",11700),("직화 통새우버거 라지세트",12900),("스크램블 에그 폭탄 지못미버거 라지세트",13000),("BIG 비프 새우카츠버거 라지세트",13400),("더블 불고기버거 라지세트",11400)],
    (2, "A003", "단품"): [("킹더버거(수제버거)",8900),("ㅊㅊㅊ치킨버거",7900),("킹새우비프버거",9300),("아메리칸 치즈버거",7300),("꾸덕 더블 치즈 베이컨버거",9900),("BIG 비프 새우카츠버거",9600),("더블 불고기버거",7600)],
    (2, "A004", "치킨박스"): [("왓더봉 2개",4500),("오리지널 치킨박스",8500),("고추마요 치킨박스",9200),("(저당)트러플 치킨박스",9500)],
    (2, "A005", "감자튀김프라이"): [("갈릭 감자튀김",4500),("왓더 감자튀김",4200),("감자튀김 미디엄",2800),("감자튀김 라지",3500)],
    (2, "A006", "새우박스"): [("스리마요 새우 감튀 박스",8900),("와사마요 새우 감튀 박스",8900),("(저당)트러플 새우 감튀 박스",9200)],
    (2, "A007", "사이드"): [("코울슬로",2500),("치킨너겟 4개",3000),("해쉬브라운 2개",2800),("쉐킷쉐킷 시즈닝",800)],
    (2, "A008", "음료"): [("코카콜라 245ml",2000),("켈리500ml(캔)",4500),("크러쉬500ml(캔)",4500),("테라500ml(캔)",4500)],
    (1, "A009", "김밥류"): [("꼬마김밥",4500),("지니네 김밥",4800),("샐러드김밥",5500),("참치김밥",5800),("와사비크래미김밥",6000),("돈까스롤",6500),("통새우롤",6800)],
    (1, "A010", "밥류"): [("마파두부덮밥",8500),("치킨마늘쫑덮밥",8800),("함박정식",9500),("뚝배기불고기",9500),("어린이돈까스",7500),("야채비빔밥",8000),("치킨마요덮밥",8200),("커리덮밥(돈까스)",9200)],
    (1, "A011", "분식류"): [("철판마파두부면",8800),("치킨온면",8500),("쌀떡볶이",6000),("라볶이",7000),("라면",5000),("잔치국수",6500),("쫄면",7500),("철판치즈불닭쫄면",8900),("치즈돈까스",9500)],
    (3, "A012", "피자"): [("씨푸드콤보",24900),("핫맥시칸피자",22900),("하와이언",20900),("퍼펙트골드",25900),("치즈폭탄",23900),("치왕피자",24900),("불고기피자",21900),("버팔로피자",22900),("밤호박",21900),("슈퍼슈프림",21900)],
    (3, "A013", "사이드메뉴"): [("짬뽕토마토스파게티",8500),("명란마요스파게티",8500),("치즈오븐스파게티",7900),("미트스파게티",7900)],
    (3, "A014", "신제품"): [("포테크",23900)],
}

EXPERIMENTS = [
    ("11111111-1111-1111-1111-111111111111", 1, "쌀떡볶이에 사장님 추천 표시 붙이기", "MENU", "MENU_BADGE", "A011003", date(2026,11,7), date(2026,11,20), "메뉴판 쌀떡볶이 옆 추천 스티커 부착 (11/21 확인)"),
    ("11111111-1111-1111-1111-111111111112", 1, "지니네 김밥 세트 묶음 구성", "MENU", "SET_BUNDLE", "A009002", date(2026,11,14), date(2026,11,27), "지니네 김밥+분식 묶음 구성 (겹치는 시도)"),
    ("11111111-1111-1111-1111-111111111113", 1, "치즈돈까스 500원 인상", "MENU", "PRICE_CHANGE", "A011009", date(2026,11,18), date(2026,12,1), "9,500원 -> 10,000원 가격 인상"),
    ("11111111-1111-1111-1111-111111111114", 1, "가게 앞 입간판 설치", "OPERATION", "STORE_SIGNAGE", None, date(2026,9,26), date(2026,10,9), "점심 특선 입간판 매장 앞 배치"),
    ("11111111-1111-1111-1111-111111111115", 1, "당근마켓 동네소식 홍보", "MARKETING", "LOCAL_PROMO", None, date(2026,10,10), date(2026,10,23), "마포구 동네소식 신규 홍보글 게시"),
    ("11111111-1111-1111-1111-111111111116", 1, "마감 1시간 연장", "OPERATION", "HOURS_OPERATION", None, date(2026,8,15), date(2026,8,28), "마감 21:30 -> 22:30 시범 연장"),
    ("22222222-2222-2222-2222-222222222221", 2, "킹더버거 세트 대표 사진 변경", "MARKETING", "MENU_COPY_PHOTO", "A001001", date(2026,10,12), date(2026,10,25), "쿠팡이츠 대표 메뉴 사진 교체"),
    ("22222222-2222-2222-2222-222222222222", 2, "배달 2천원 쿠폰 발행", "MARKETING", "DISCOUNT_COUPON", None, date(2026,9,15), date(2026,9,28), "배달 주문 2,000원 할인 쿠폰 적용"),
    ("22222222-2222-2222-2222-222222222223", 2, "사이드 메뉴 추천 스티커", "MENU", "MENU_BADGE", "A007001", date(2026,11,1), date(2026,11,14), "코울슬로 메뉴판 추천 표시 부착"),
    ("22222222-2222-2222-2222-222222222224", 2, "갈릭 감자튀김 500원 인상", "MENU", "PRICE_CHANGE", "A005001", date(2026,11,15), date(2026,11,28), "4,500원 -> 5,000원 가격 인상"),
    ("22222222-2222-2222-2222-222222222225", 2, "매장 입구 조명 교체", "OPERATION", "STORE_SIGNAGE", None, date(2026,8,20), date(2026,9,2), "저녁 시간대 매장 입구 간판 조명 보강"),
    ("33333333-3333-3333-3333-333333333331", 3, "치즈폭탄 피자 점심 1인 세트 구성", "MENU", "SET_BUNDLE", "A012005", date(2026,10,19), date(2026,11,1), "평일 점심 1인 세트 메뉴 구성"),
    ("33333333-3333-3333-3333-333333333332", 3, "SNS 이벤트 홍보", "MARKETING", "LOCAL_PROMO", None, date(2026,9,5), date(2026,9,18), "인스타그램 지역 타겟 이벤트 진행"),
    ("33333333-3333-3333-3333-333333333333", 3, "하와이언 피자 사진 변경", "MARKETING", "MENU_COPY_PHOTO", "A012003", date(2026,11,10), date(2026,11,23), "하와이언 피자 실물 사진 교체"),
    ("33333333-3333-3333-3333-333333333334", 3, "포장 주문 10% 할인", "MARKETING", "DISCOUNT_COUPON", None, date(2026,11,15), date(2026,11,28), "방문 포장 고객 10% 할인 프로모션"),
]

PRICE_HIKES = {"A011009": (date(2026, 11, 18), 9500, 10000), "A005001": (date(2026, 11, 15), 4500, 5000)}
MENUS = [(f"{m1c}{i:03d}", sid, m1c, m1n, m2n, PRICE_HIKES[f"{m1c}{i:03d}"][2] if f"{m1c}{i:03d}" in PRICE_HIKES else pr)
         for (sid, m1c, m1n), items in RAW_MENUS.items() for i, (m2n, pr) in enumerate(items, 1)]

INGREDIENTS = [("ING001","떡볶이용 쌀떡","g",2000,"봉"),("ING002","김밥용 조미김","매",100,"속"),("ING003","등심 돈까스 패티","g",1500,"팩"),("ING004","수제 소고기 패티","g",2000,"팩"),("ING005","냉동 감자튀김","g",2000,"봉"),("ING006","임실 자연 모짜렐라 치즈","g",2500,"봉")]
RECIPES = [("A011003","ING001",250.0),("A011004","ING001",200.0),("A009002","ING002",1.0),("A009004","ING002",1.0),("A011009","ING003",180.0),("A001001","ING004",150.0),("A001001","ING005",130.0),("A012005","ING006",220.0)]
INVENTORY = [(1,"ING001",3000.0,2000.0),(1,"ING002",150.0,100.0),(1,"ING003",2400.0,1500.0),(2,"ING004",4000.0,2000.0),(2,"ING005",5000.0,4000.0),(3,"ING006",6000.0,5000.0)]

def weighted_sample(pop, weights, k):
    p, w, res = list(pop), list(weights), []
    for _ in range(min(k, len(p))):
        r, acc = random.uniform(0, sum(w)), 0.0
        for idx, wt in enumerate(w):
            acc += wt
            if acc >= r:
                res.append(p.pop(idx)); w.pop(idx); break
    return res

def rand_dt(d, ot, ct):
    m = random.randint(ot.hour * 60 + ot.minute, ct.hour * 60 + ct.minute - 1)
    return datetime(d.year, d.month, d.day, m // 60, m % 60, random.randint(0, 59))

def build_all_tables():
    random.seed(42)
    start_all, end_fcst = date(2026, 8, 1), BASE_TODAY + timedelta(days=30)
    holidays = {date(2026, 9, 24), date(2026, 9, 25), date(2026, 9, 26), date(2026, 10, 3), date(2026, 10, 9)}
    weather_rows, weather_map, cur = [], {}, start_all
    while cur <= end_fcst:
        temp = round(max(0.5, 26.0 - ((cur - start_all).days * 0.18) + random.uniform(-1.5, 1.5)), 1)
        precip = 6.5 if cur.day in (11, 24) else 0.0
        weather_rows.append((cur, cur.weekday(), cur.weekday() >= 5, cur in holidays, temp, precip, cur >= BASE_TODAY))
        weather_map[cur] = (cur.weekday() >= 5, cur in holidays, precip > 0)
        cur += timedelta(days=1)

    menus_by_store = {sid: [m for m in MENUS if m[1] == sid] for sid in (1, 2, 3)}
    store_info = {st[0]: st for st in STORES}
    pos_rows, cur, rcp_seq = [], start_all, 1

    while cur <= date(2026, 11, 20):
        is_wknd, is_hol, is_rain = weather_map[cur]
        for sid in (1, 2, 3):
            st = store_info[sid]
            is_ext = (sid == 1 and date(2026, 8, 15) <= cur <= date(2026, 8, 28))
            open_t, close_t = st[7], (time(22, 30) if is_ext else st[8])
            active = [e for e in EXPERIMENTS if e[1] == sid and e[6] <= cur <= e[7]]

            mult = (1.28 if is_wknd else 1.0) * (1.18 if is_hol else 1.0) * ((1.08 if sid in (2, 3) else 0.94) if is_rain else 1.0)
            for e in active:
                if e[4] in ("STORE_SIGNAGE", "LOCAL_PROMO", "DISCOUNT_COUPON"): mult *= 1.15
                elif e[4] == "HOURS_OPERATION": mult *= 1.14
                elif e[0] == "11111111-1111-1111-1111-111111111111": mult *= 1.15

            n_rcp = int({1: 42, 2: 36, 3: 25}[sid] * mult) + random.randint(-2, 3)
            pool = menus_by_store[sid]
            weights = [
                3.2 if any(e[5] == m[0] and e[4] in ("MENU_BADGE", "MENU_COPY_PHOTO", "SET_BUNDLE") for e in active)
                else (0.85 if any(e[5] == m[0] and e[4] == "PRICE_CHANGE" for e in active) else 1.0)
                for m in pool
            ]
            has_bundle = any(e[4] == "SET_BUNDLE" for e in active)
            has_cpn2000 = any(e[0] == "22222222-2222-2222-2222-222222222222" for e in active)
            has_disc10 = any(e[0] == "33333333-3333-3333-3333-333333333334" for e in active)

            for _ in range(n_rcp):
                rid = f"RCP-{cur.strftime('%Y%m%d')}-{sid}-{rcp_seq:06d}"
                rcp_seq += 1
                odt = rand_dt(cur, time(21, 30), time(22, 30)) if (is_ext and random.random() < 0.15) else rand_dt(cur, open_t, close_t)
                picked = weighted_sample(pool, weights, random.choices([1, 2, 3], weights=[0.48, 0.38, 0.14] if has_bundle else [0.60, 0.30, 0.10])[0])
                if any(m[0] == "A012005" for m in picked) and date(2026, 10, 19) <= cur <= date(2026, 11, 1) and random.random() < 0.65:
                    odt = rand_dt(cur, time(11, 0), time(14, 30))

                is_refund = random.random() < 0.015
                is_to_disc = has_disc10 and (random.random() < 0.40)
                for idx_i, m in enumerate(picked):
                    m2c = m[0]
                    unit_p = (PRICE_HIKES[m2c][2] if cur >= PRICE_HIKES[m2c][0] else PRICE_HIKES[m2c][1]) if m2c in PRICE_HIKES else m[5]
                    if has_cpn2000 and idx_i == 0 and random.random() < 0.50: unit_p = max(1000, unit_p - 2000)
                    elif is_to_disc: unit_p = int(round(unit_p * 0.9, -2))
                    pos_rows.append((cur, rid, sid, odt, m2c, unit_p, random.choices([1, 2, 3], weights=[0.85, 0.10, 0.05])[0], is_refund))
        cur += timedelta(days=1)

    return {
        "1_stores": pd.DataFrame(STORES, columns=["store_id","store_name","mega_cd","mega_nm","cty_cd","cty_nm","upjong","open_time","close_time","opened_date"]),
        "2_menus": pd.DataFrame(MENUS, columns=["menu2_cd","store_id","menu1_cd","menu1_nm","menu2_nm","unit_price"]),
        "3_experiments": pd.DataFrame(EXPERIMENTS, columns=["id","store_id","title","expm_category","action_type","target_menu2_cd","start_date","end_date","notes"]),
        "4_pos_orders": pd.DataFrame(pos_rows, columns=["base_date","receipt_id","store_id","order_datetime","menu2_cd","price","quantity","is_refunded"]),
        "5_external_weather": pd.DataFrame(weather_rows, columns=["feature_date","day_of_week","is_weekend","is_holiday","avg_temp","precipitation","is_forecast"]),
        "6_ingredients": pd.DataFrame(INGREDIENTS, columns=["ingre_cd","ingre_nm","unit","pack_size","pack_unit_nm"]),
        "7_menu_recipes": pd.DataFrame(RECIPES, columns=["menu2_cd","ingre_cd","required_qty"]),
        "8_store_inventory": pd.DataFrame(INVENTORY, columns=["store_id","ingre_cd","current_stock","incoming_stock"]),
    }

if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, df in build_all_tables().items():
        path = os.path.join(OUT_DIR, f"{name}.csv")
        df.to_csv(path, index=False, encoding="utf-8-sig")
        print(f"[저장 완료] {path} -> {len(df):,}행")