-- Run as the schema/table owner on the service database. This file is sufficient for
-- both the original stores DDL and installations that have run migrations 001–003.
-- Old postal codes are intentionally discarded. Back up before applying in production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog;
-- If the application uses a separate DB role, uncomment and replace the example name,
-- or set trylog.service_role in this connection before running the file.
-- SET LOCAL trylog.service_role = 'your_service_role';

LOCK TABLE seoul_youth_ai_hackathon.stores IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE trylog_signup_industries (
    store_id integer PRIMARY KEY,
    code varchar(50) UNIQUE NOT NULL,
    name varchar(50) NOT NULL,
    aliases text[] NOT NULL
) ON COMMIT DROP;
INSERT INTO pg_temp.trylog_signup_industries VALUES
    (1, 'Q0001', '분식', ARRAY['Q0001', '분식']),
    (2, 'Q0002', '버거-패스트푸드', ARRAY['Q0002', '버거-패스트푸드', '버거·패스트푸드']),
    (3, 'Q0003', '피자', ARRAY['Q0003', '피자']);

DO $$
DECLARE
    bad_id integer;
BEGIN
    SELECT i.store_id INTO bad_id
    FROM pg_temp.trylog_signup_industries i
    LEFT JOIN seoul_youth_ai_hackathon.stores s ON s.store_id = i.store_id
    WHERE s.store_id IS NULL OR NOT (btrim(s.upjong) = ANY (i.aliases))
    ORDER BY i.store_id LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Missing store or unexpected industry at store_id %. Check the three master stores before retrying.', bad_id;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS seoul_youth_ai_hackathon.upjongs (
    upjong_cd varchar(50) PRIMARY KEY,
    upjong_nm varchar(50) NOT NULL UNIQUE,
    display_order integer NOT NULL UNIQUE CHECK (display_order > 0)
);
LOCK TABLE seoul_youth_ai_hackathon.upjongs IN ACCESS EXCLUSIVE MODE;
ALTER TABLE seoul_youth_ai_hackathon.upjongs
    ADD COLUMN IF NOT EXISTS store_id integer UNIQUE REFERENCES seoul_youth_ai_hackathon.stores(store_id);

-- Previous versions may have store rows in one of the five retired categories.
-- Preserve their human-readable industry, IDs and dependent sales/experiments.
ALTER TABLE seoul_youth_ai_hackathon.stores DROP CONSTRAINT IF EXISTS stores_upjong_fk;
UPDATE seoul_youth_ai_hackathon.stores s
SET upjong = u.upjong_nm
FROM seoul_youth_ai_hackathon.upjongs u
WHERE s.upjong = u.upjong_cd AND u.upjong_cd NOT IN (SELECT code FROM pg_temp.trylog_signup_industries);
UPDATE seoul_youth_ai_hackathon.stores s
SET upjong = i.code
FROM pg_temp.trylog_signup_industries i
WHERE btrim(s.upjong) = ANY (i.aliases) AND s.upjong <> i.code;

DELETE FROM seoul_youth_ai_hackathon.upjongs WHERE upjong_cd NOT IN (SELECT code FROM pg_temp.trylog_signup_industries);
INSERT INTO seoul_youth_ai_hackathon.upjongs AS u (upjong_cd, upjong_nm, display_order, store_id)
SELECT code, name, store_id, store_id FROM pg_temp.trylog_signup_industries
ON CONFLICT (upjong_cd) DO UPDATE
SET upjong_nm = excluded.upjong_nm, display_order = excluded.display_order, store_id = excluded.store_id
WHERE (u.upjong_nm, u.display_order, u.store_id) IS DISTINCT FROM (excluded.upjong_nm, excluded.display_order, excluded.store_id);
ALTER TABLE seoul_youth_ai_hackathon.upjongs ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE seoul_youth_ai_hackathon.upjongs DROP CONSTRAINT IF EXISTS upjongs_signup_mapping;
ALTER TABLE seoul_youth_ai_hackathon.upjongs ADD CONSTRAINT upjongs_signup_mapping CHECK (
    (upjong_cd, store_id, upjong_nm) IN (('Q0001', 1, '분식'), ('Q0002', 2, '버거-패스트푸드'), ('Q0003', 3, '피자'))
);
ALTER TABLE seoul_youth_ai_hackathon.stores ADD CONSTRAINT stores_upjong_fk
    FOREIGN KEY (upjong) REFERENCES seoul_youth_ai_hackathon.upjongs(upjong_cd) NOT VALID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM seoul_youth_ai_hackathon.stores s
        WHERE NOT EXISTS (SELECT 1 FROM seoul_youth_ai_hackathon.upjongs u WHERE u.upjong_cd = s.upjong)
    ) THEN
        ALTER TABLE seoul_youth_ai_hackathon.stores VALIDATE CONSTRAINT stores_upjong_fk;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS seoul_youth_ai_hackathon.store_accounts (
    login_id varchar(40) PRIMARY KEY CHECK (login_id ~ '^[a-z0-9._-]{4,40}$'),
    password_hash varchar(255) NOT NULL CHECK (password_hash <> ''),
    store_id integer NOT NULL REFERENCES seoul_youth_ai_hackathon.stores(store_id)
        CHECK (store_id IN (1, 2, 3)),
    store_name varchar(100) NOT NULL,
    mega_cd varchar(10) NOT NULL,
    mega_nm varchar(30) NOT NULL,
    cty_cd varchar(10) NOT NULL,
    cty_nm varchar(30) NOT NULL,
    address varchar(300),
    address_detail varchar(150),
    open_time time,
    close_time time,
    opened_date date,
    closed_weekdays varchar(20) DEFAULT ''
);

DO $$
DECLARE
    credential_columns integer;
    bad_id integer;
BEGIN
    SELECT count(*) INTO credential_columns FROM pg_attribute
    WHERE attrelid = 'seoul_youth_ai_hackathon.stores'::regclass AND NOT attisdropped
      AND attname IN ('login_id', 'password_hash');
    IF credential_columns = 0 THEN RETURN; END IF;
    IF credential_columns <> 2 THEN
        RAISE EXCEPTION 'Incomplete legacy credential columns in stores. Reconcile login_id and password_hash before retrying.';
    END IF;
    SELECT s.store_id INTO bad_id FROM seoul_youth_ai_hackathon.stores s
    WHERE (s.login_id IS NULL) <> (s.password_hash IS NULL)
       OR (s.login_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM seoul_youth_ai_hackathon.upjongs u WHERE u.upjong_cd = s.upjong
       ))
    ORDER BY s.store_id LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Cannot migrate credentials from store_id %. Check the credential pair and resolve its industry to one of the three supported categories before retrying.', bad_id;
    END IF;

    -- A duplicate login or invalid hash aborts the transaction; no credential is overwritten.
    INSERT INTO seoul_youth_ai_hackathon.store_accounts
        (login_id, password_hash, store_id, store_name, mega_cd, mega_nm, cty_cd, cty_nm,
         address, address_detail, open_time, close_time, opened_date, closed_weekdays)
    SELECT lower(btrim(s.login_id)), s.password_hash, u.store_id, s.store_name, s.mega_cd, s.mega_nm,
           s.cty_cd, s.cty_nm, s.address, s.address_detail, s.open_time, s.close_time,
           s.opened_date, s.closed_weekdays
    FROM seoul_youth_ai_hackathon.stores s
    JOIN seoul_youth_ai_hackathon.upjongs u ON u.upjong_cd = s.upjong
    WHERE s.login_id IS NOT NULL;
END $$;

ALTER TABLE seoul_youth_ai_hackathon.stores
    DROP COLUMN IF EXISTS login_id,
    DROP COLUMN IF EXISTS password_hash,
    DROP COLUMN IF EXISTS postal_code;

-- Reading stores alone must not grant access to password hashes. Do not copy its ACL.
REVOKE ALL ON seoul_youth_ai_hackathon.store_accounts FROM PUBLIC;
DO $$
DECLARE
    service_role text := nullif(current_setting('trylog.service_role', true), '');
BEGIN
    IF service_role IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = service_role) THEN
            RAISE EXCEPTION 'Unknown service role %. Set trylog.service_role to the database role used by the application.', service_role;
        END IF;
        EXECUTE format('GRANT SELECT, INSERT ON seoul_youth_ai_hackathon.store_accounts TO %I', service_role);
        EXECUTE format('GRANT SELECT ON seoul_youth_ai_hackathon.upjongs TO %I', service_role);
    END IF;
END $$;
COMMIT;
