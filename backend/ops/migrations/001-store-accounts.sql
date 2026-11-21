-- Manual migration. Review and verify in an isolated PostgreSQL copy before deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE seoul_youth_ai_hackathon.stores IN ACCESS EXCLUSIVE MODE;

ALTER TABLE seoul_youth_ai_hackathon.stores
    ADD COLUMN login_id varchar(40),
    ADD COLUMN password_hash varchar(255),
    ADD COLUMN postal_code varchar(5),
    ADD COLUMN address varchar(300),
    ADD COLUMN address_detail varchar(150),
    ADD CONSTRAINT stores_login_id_unique UNIQUE (login_id),
    ADD CONSTRAINT stores_credentials_pair CHECK ((login_id IS NULL) = (password_hash IS NULL)),
    ADD CONSTRAINT stores_login_id_format CHECK (login_id ~ '^[a-z0-9._-]{4,40}$'),
    ADD CONSTRAINT stores_postal_code_format CHECK (postal_code ~ '^[0-9]{5}$');

-- Explicit seed IDs can be ahead of the serial sequence. Never rewind a sequence.
DO $$
DECLARE
    id_sequence regclass := pg_get_serial_sequence('seoul_youth_ai_hackathon.stores', 'store_id')::regclass;
    max_id bigint;
BEGIN
    IF id_sequence IS NULL THEN
        RAISE EXCEPTION 'stores.store_id needs an owned serial or identity sequence';
    END IF;
    SELECT max(store_id) INTO max_id FROM seoul_youth_ai_hackathon.stores;
    IF max_id IS NOT NULL AND max_id >= coalesce(pg_sequence_last_value(id_sequence), 0) THEN
        PERFORM setval(id_sequence, max_id, true);
    END IF;
END;
$$;
COMMIT;
