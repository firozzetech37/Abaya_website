-- Sequence behind human order numbers "AB-2026-000123" (apps/api orders module).
-- A sequence never hands out the same number twice, even under concurrent checkouts.
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" AS BIGINT START WITH 1 INCREMENT BY 1;
