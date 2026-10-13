-- Items in the old "ASSIGNED" stage (tailor picked, not yet cut) continue at the pattern
-- station. A separate migration: new enum values can only be used after they are committed.
INSERT INTO "OrderStageEvent" ("id", "orderItemId", "fromStage", "toStage", "note", "createdAt")
SELECT gen_random_uuid(), "id", 'ASSIGNED', 'PATTERN', 'Moved to the new workshop flow', CURRENT_TIMESTAMP
FROM "OrderItem" WHERE "stage" = 'ASSIGNED';

UPDATE "OrderItem" SET "stage" = 'PATTERN', "updatedAt" = CURRENT_TIMESTAMP WHERE "stage" = 'ASSIGNED';
