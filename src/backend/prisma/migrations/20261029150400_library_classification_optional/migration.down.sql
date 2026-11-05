-- Reverts 20261029150400_library_classification_optional. Run it BEFORE the
-- downs of the earlier library migrations. It ABORTS if any product has a NULL
-- brandId or categoryId: restoring NOT NULL would otherwise need an invented
-- brand/category (silent data loss). Classify or delete those drafts first.
-- The statements are atomic: either everything is reverted or nothing is.

BEGIN;

-- Blocks concurrent writers between the guard and the SET NOT NULL.
LOCK TABLE "products" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM "products" WHERE "brandId" IS NULL OR "categoryId" IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'Cannot revert 20261029150400_library_classification_optional: % product(s) have a NULL brandId or categoryId. Assign a real brand and category (or delete those drafts) first.', n;
    END IF;
END
$$;

ALTER TABLE "products" ALTER COLUMN "brandId" SET NOT NULL,
ALTER COLUMN "categoryId" SET NOT NULL;

COMMIT;
