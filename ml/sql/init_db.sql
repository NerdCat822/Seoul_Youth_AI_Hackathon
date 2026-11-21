-- 1. 가게 정보 마스터
CREATE TABLE IF NOT EXISTS stores (
    store_id SERIAL PRIMARY KEY,
    store_name VARCHAR(100) NOT NULL,
    mega_cd VARCHAR(10) NOT NULL,          -- 광역시도 코드 (예: '11')
    mega_nm VARCHAR(30) NOT NULL,          -- 광역시도명 (예: '서울특별시')
    cty_cd VARCHAR(10) NOT NULL,           -- 시군구 코드 (예: '11440')
    cty_nm VARCHAR(30) NOT NULL,           -- 시군구명 (예: '마포구')
    upjong VARCHAR(50) NOT NULL,           -- 업종 (예: '분식', '버거·패스트푸드', '피자')
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    opened_date DATE NOT NULL,
    closed_weekdays VARCHAR(20) DEFAULT '' -- 정기 휴무 요일 (0:월 ~ 6:일)
);

-- 2. 메뉴 마스터 (2단계 코드 체계)
CREATE TABLE IF NOT EXISTS menus (
    menu2_cd VARCHAR(20) PRIMARY KEY,      -- 예: 'A001001'
    store_id INT NOT NULL REFERENCES stores(store_id),
    menu1_cd VARCHAR(10) NOT NULL,         -- 예: 'A001'
    menu1_nm VARCHAR(50) NOT NULL,         -- 예: '세트', '김밥류', '피자'
    menu2_nm VARCHAR(100) NOT NULL,        -- 예: '킹더버거(수제버거)세트'
    unit_price INT NOT NULL
);

-- 3. 사장님 시도 기록 (백엔드 Experiment.java 호환 + 2단계 카테고리)
CREATE TABLE IF NOT EXISTS experiments (
    id VARCHAR(36) PRIMARY KEY,            -- UUID
    store_id INT NOT NULL REFERENCES stores(store_id),
    title VARCHAR(80) NOT NULL,
    expm_category VARCHAR(20) NOT NULL,    -- 대분류: 'MENU', 'OPERATION', 'MARKETING'
    action_type VARCHAR(30) NOT NULL,      -- 소분류: 'MENU_BADGE', 'PRICE_CHANGE' 등
    target_menu2_cd VARCHAR(20) REFERENCES menus(menu2_cd),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    notes VARCHAR(500) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. POS 주문 원천 데이터 (보조키 base_date + 영수증 receipt_id + 단가 price)
CREATE TABLE IF NOT EXISTS pos_orders (
    order_line_id SERIAL PRIMARY KEY,
    base_date DATE NOT NULL,               -- 보조키: 영업 기준일자 (YYYY-MM-DD)
    receipt_id VARCHAR(32) NOT NULL,       -- 영수증 묶음 식별자
    store_id INT NOT NULL REFERENCES stores(store_id),
    order_datetime TIMESTAMP NOT NULL,
    menu2_cd VARCHAR(20) NOT NULL REFERENCES menus(menu2_cd),
    price INT NOT NULL,                    -- 주문 당시 메뉴 1개 단가 (원)
    quantity INT NOT NULL DEFAULT 1,
    is_refunded BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_pos_orders_store_base_date ON pos_orders (store_id, base_date);
CREATE INDEX IF NOT EXISTS idx_pos_orders_base_date_menu ON pos_orders (base_date, menu2_cd);

-- 5. 외부 달력·날씨 데이터 (과거 실측 + 향후 1개월 예보)
CREATE TABLE IF NOT EXISTS external_daily_features (
    feature_date DATE PRIMARY KEY,
    day_of_week INT NOT NULL,              -- 0(월) ~ 6(일)
    is_weekend BOOLEAN NOT NULL,
    is_holiday BOOLEAN DEFAULT FALSE,
    avg_temp FLOAT NOT NULL,
    precipitation FLOAT DEFAULT 0.0,
    is_forecast BOOLEAN DEFAULT FALSE      -- FALSE: 과거 실측, TRUE: 예보 데이터
);

-- 6. ML 매출 예측 및 검증 메타 테이블
CREATE TABLE IF NOT EXISTS ml_predictions (
    prediction_id SERIAL PRIMARY KEY,
    experiment_id VARCHAR(36) REFERENCES experiments(id),
    target_date DATE NOT NULL,
    expected_sales INT NOT NULL,
    expected_lower INT NOT NULL,
    expected_upper INT NOT NULL,
    model_version VARCHAR(40) NOT NULL,
    val_mae INT NOT NULL,
    val_wape FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. 식자재 마스터
CREATE TABLE IF NOT EXISTS ingredients (
    ingre_cd VARCHAR(20) PRIMARY KEY,      -- 예: 'ING001'
    ingre_nm VARCHAR(100) NOT NULL,        -- 예: '떡볶이용 쌀떡'
    unit VARCHAR(10) NOT NULL,             -- 예: 'g', 'ml', '개'
    pack_size INT NOT NULL,                -- 발주 포장 단위 용량 (예: 2000)
    pack_unit_nm VARCHAR(20) NOT NULL      -- 발주 포장 단위명 (예: '봉', '팩')
);

-- 8. 메뉴별 소요량(레시피) 테이블
CREATE TABLE IF NOT EXISTS menu_recipes (
    menu2_cd VARCHAR(20) NOT NULL REFERENCES menus(menu2_cd),
    ingre_cd VARCHAR(20) NOT NULL REFERENCES ingredients(ingre_cd),
    required_qty FLOAT NOT NULL,
    PRIMARY KEY (menu2_cd, ingre_cd)
);

-- 9. 가게별 현재 재고 및 입고 예정 테이블
CREATE TABLE IF NOT EXISTS store_inventory (
    store_id INT NOT NULL REFERENCES stores(store_id),
    ingre_cd VARCHAR(20) NOT NULL REFERENCES ingredients(ingre_cd),
    current_stock FLOAT NOT NULL DEFAULT 0,
    incoming_stock FLOAT NOT NULL DEFAULT 0,
    PRIMARY KEY (store_id, ingre_cd)
);

-- 10. [파이프라인 뷰] base_date 기준 일별 매출(price * quantity)·주문 집계 피처 마트
CREATE OR REPLACE VIEW v_daily_sales_mart AS
WITH daily_agg AS (
    SELECT
        p.store_id,
        p.base_date AS sales_date,
        COUNT(DISTINCT p.receipt_id) AS total_orders,
        SUM(p.quantity) AS total_items_sold,
        SUM(p.price * p.quantity) AS daily_sales
    FROM pos_orders p
    WHERE p.is_refunded = FALSE
    GROUP BY p.store_id, p.base_date
)
SELECT
    s.store_id,
    e.feature_date AS sales_date,
    e.day_of_week,
    e.is_weekend,
    e.is_holiday,
    e.avg_temp,
    CASE WHEN e.precipitation > 0 THEN 1 ELSE 0 END AS is_rain,
    e.is_forecast,
    COALESCE(d.total_orders, 0) AS total_orders,
    COALESCE(d.total_items_sold, 0) AS total_items_sold,
    COALESCE(d.daily_sales, 0) AS daily_sales,
    (d.daily_sales IS NULL AND e.is_forecast = FALSE) AS is_missing_or_closed
FROM stores s
CROSS JOIN external_daily_features e
LEFT JOIN daily_agg d
    ON s.store_id = d.store_id
    AND e.feature_date = d.sales_date;