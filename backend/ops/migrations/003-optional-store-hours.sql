-- Manual migration for optional operating hours and opening date at signup.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE seoul_youth_ai_hackathon.stores
    ALTER COLUMN open_time DROP NOT NULL,
    ALTER COLUMN close_time DROP NOT NULL,
    ALTER COLUMN opened_date DROP NOT NULL;

COMMIT;
