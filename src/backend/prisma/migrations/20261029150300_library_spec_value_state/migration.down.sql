-- Reverts 20261029150300_library_spec_value_state. Run it BEFORE the downs of
-- 20261029150100_library_spec_dictionary. It ABORTS if any value is stored as
-- NOT_APPLICABLE or UNKNOWN: dropping the column would silently turn those
-- answers into "no row" or violate the original check. Remove or re-enter
-- those rows first. The statements are atomic: either everything is reverted
-- or nothing is.

BEGIN;

-- Blocks concurrent writers between the guard and the DROP COLUMN.
LOCK TABLE "product_spec_values" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM "product_spec_values" WHERE "state" <> 'KNOWN';
    IF n > 0 THEN
        RAISE EXCEPTION 'Cannot revert 20261029150300_library_spec_value_state: % product_spec_values row(s) are NOT_APPLICABLE or UNKNOWN and would lose their meaning. Delete or re-enter them first.', n;
    END IF;
END
$$;

-- Restore the 3-column option -> value FK and remove the option state.
ALTER TABLE "product_spec_value_options" DROP CONSTRAINT "product_spec_value_options_value_fkey";
ALTER TABLE "product_spec_value_options" ADD CONSTRAINT "product_spec_value_options_value_fkey" FOREIGN KEY ("productId", "specDefinitionId", "stage") REFERENCES "product_spec_values"("productId", "specDefinitionId", "stage") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_spec_value_options" DROP CONSTRAINT "product_spec_value_options_state_check";
ALTER TABLE "product_spec_value_options" DROP COLUMN "state";
DROP INDEX "product_spec_values_productId_specDefinitionId_stage_state_key";

ALTER TABLE "product_spec_values" DROP CONSTRAINT "product_spec_values_shape_check";
ALTER TABLE "product_spec_values" ADD CONSTRAINT "product_spec_values_shape_check" CHECK (
    CASE "dataType"
        WHEN 'TEXT' THEN
            "valueText" IS NOT NULL AND btrim("valueText") <> ''
            AND "valueNumber" IS NULL AND "valueBoolean" IS NULL
        WHEN 'NUMBER' THEN
            "valueNumber" IS NOT NULL AND "valueNumber" <> 'NaN'::numeric
            AND "valueText" IS NULL AND "valueBoolean" IS NULL
        WHEN 'BOOLEAN' THEN
            "valueBoolean" IS NOT NULL
            AND "valueText" IS NULL AND "valueNumber" IS NULL
        ELSE
            "valueText" IS NULL AND "valueNumber" IS NULL AND "valueBoolean" IS NULL
    END
);
ALTER TABLE "product_spec_values" DROP COLUMN "state";

DROP TYPE "SpecValueState";

COMMIT;
