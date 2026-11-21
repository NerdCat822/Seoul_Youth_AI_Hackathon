-- Run with psql -X -v ON_ERROR_STOP=1 -f ops/inspect-schema.sql on the DB server.
-- Output contains schema metadata and per-store aggregates only.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = seoul_youth_ai_hackathon, pg_catalog;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

SELECT current_database() AS database_name, current_schema() AS schema_name,
       current_user AS role_name, current_setting('server_version') AS server_version,
       current_setting('transaction_read_only') AS read_only,
       has_schema_privilege(current_user, n.oid, 'USAGE') AS can_use_schema
FROM (SELECT to_regnamespace('seoul_youth_ai_hackathon') AS oid) n;

SELECT c.relname AS object_name, c.relkind AS object_kind,
       has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
       has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'seoul_youth_ai_hackathon' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY c.relname;

SELECT c.relname AS object_name, a.attnum AS ordinal, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS column_type, a.attnotnull AS required,
       pg_get_expr(d.adbin, d.adrelid) AS column_default
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'seoul_youth_ai_hackathon' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;

SELECT c.relname AS table_name, k.conname, pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'seoul_youth_ai_hackathon' ORDER BY c.relname, k.conname;

SELECT c.relname AS view_name, pg_get_viewdef(c.oid, true) AS definition
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'seoul_youth_ai_hackathon' AND c.relkind IN ('v', 'm')
ORDER BY c.relname;

-- Fully qualify the service relations so an unexpected search_path cannot select a namesake.
WITH menus_per_store AS (
    SELECT store_id, count(*) AS menus FROM seoul_youth_ai_hackathon.menus GROUP BY store_id
), experiments_per_store AS (
    SELECT store_id, count(*) AS experiments FROM seoul_youth_ai_hackathon.experiments GROUP BY store_id
), pos_per_store AS (
    SELECT store_id, min(base_date) AS first_order_date, max(base_date) AS last_order_date,
           count(*) AS lines, count(*) FILTER (WHERE is_refunded IS TRUE) AS refunded,
           count(*) FILTER (WHERE is_refunded IS NULL) AS unknown_refund_status
    FROM seoul_youth_ai_hackathon.pos_orders GROUP BY store_id
), observed AS (
    SELECT store_id, min(sales_date) AS first_observed, max(sales_date) AS last_observed,
           count(*) AS observed_days FROM seoul_youth_ai_hackathon.v_daily_sales_mart
    WHERE is_forecast IS FALSE AND is_missing_or_closed IS FALSE GROUP BY store_id
), predictions AS (
    SELECT e.store_id, count(*) AS predictions FROM seoul_youth_ai_hackathon.ml_predictions p
    JOIN seoul_youth_ai_hackathon.experiments e ON e.id = p.experiment_id GROUP BY e.store_id
)
SELECT s.store_id, s.store_name, coalesce(m.menus, 0) AS menus, coalesce(e.experiments, 0) AS experiments,
       p.first_order_date, p.last_order_date, coalesce(p.lines, 0) AS order_lines,
       coalesce(p.refunded, 0) AS refund_lines, coalesce(p.unknown_refund_status, 0) AS unknown_refund_status,
       o.first_observed, o.last_observed, coalesce(o.observed_days, 0) AS observed_days,
       coalesce(f.predictions, 0) AS linked_predictions
FROM seoul_youth_ai_hackathon.stores s
LEFT JOIN menus_per_store m USING (store_id) LEFT JOIN experiments_per_store e USING (store_id)
LEFT JOIN pos_per_store p USING (store_id) LEFT JOIN observed o USING (store_id)
LEFT JOIN predictions f USING (store_id)
ORDER BY s.store_id;
ROLLBACK;
