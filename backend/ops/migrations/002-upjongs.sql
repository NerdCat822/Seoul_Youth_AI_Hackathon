-- One-time migration. The rows and their order come from upjong.csv (CP949).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE seoul_youth_ai_hackathon.upjongs (
    upjong_cd varchar(50) PRIMARY KEY,
    upjong_nm varchar(50) NOT NULL UNIQUE,
    display_order integer NOT NULL UNIQUE CHECK (display_order > 0)
);

INSERT INTO seoul_youth_ai_hackathon.upjongs (upjong_cd, upjong_nm, display_order)
VALUES
    ('Q0001', '분식', 1),
    ('Q0002', '버거·패스트푸드', 2),
    ('Q0003', '피자', 3),
    ('Q0004', '돈까스', 4),
    ('Q0005', '돼지고기구이', 5),
    ('Q0006', '족발·보쌈', 6),
    ('Q0007', '카페', 7),
    ('Q0008', '치킨', 8);

-- Enforce the catalog for new stores while preserving unmatched historical values.
ALTER TABLE seoul_youth_ai_hackathon.stores
    ADD CONSTRAINT stores_upjong_fk FOREIGN KEY (upjong)
    REFERENCES seoul_youth_ai_hackathon.upjongs (upjong_cd) NOT VALID;

UPDATE seoul_youth_ai_hackathon.stores AS s
SET upjong = u.upjong_cd
FROM seoul_youth_ai_hackathon.upjongs AS u
WHERE btrim(s.upjong) IN (u.upjong_nm, u.upjong_cd) AND s.upjong <> u.upjong_cd;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM seoul_youth_ai_hackathon.stores AS s
        WHERE NOT EXISTS (
            SELECT 1 FROM seoul_youth_ai_hackathon.upjongs AS u WHERE u.upjong_cd = s.upjong
        )
    ) THEN
        RAISE NOTICE 'Unmapped historical store industries were preserved. Review before validating stores_upjong_fk.';
    ELSE
        ALTER TABLE seoul_youth_ai_hackathon.stores VALIDATE CONSTRAINT stores_upjong_fk;
    END IF;
END;
$$;
COMMIT;
