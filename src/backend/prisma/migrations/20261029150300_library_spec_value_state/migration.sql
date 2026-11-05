/*
  Library block 1, step 4: a product's key-data value can be stored as "not
  applicable" or "explicitly unknown", distinct from zero, false and "no row".

  Needs 20261029150100_library_spec_dictionary ("product_spec_values").

  Purely additive: the new column defaults to 'KNOWN', so every existing row
  stays valid and keeps its meaning. The shape CHECK is replaced by one that
  applies the previous rules unchanged when state = 'KNOWN' and requires the
  three value columns to be empty otherwise.

  OPTIONS UNDER A NON-KNOWN VALUE ARE IMPOSSIBLE IN THE DATABASE: each option
  row carries a copy of its value's state, CHECKed to 'KNOWN', and its foreign
  key to product_spec_values is the 4-column (productId, specDefinitionId,
  stage, state) key. A value cannot leave KNOWN while options reference it
  (ON UPDATE NO ACTION), and an option cannot be inserted under a non-KNOWN
  value. The FK is DEFERRABLE INITIALLY DEFERRED so the service can upsert the
  value to a non-KNOWN state and delete its options in the same transaction;
  the check happens at COMMIT. Prisma cannot model DEFERRABLE: schema.prisma
  declares the same 4-column relation (onUpdate: NoAction) and "prisma migrate
  diff" does not compare deferrability, so it reports no drift.

  NO FOREIGN KEY to users, customers or operational tables.
*/

-- CreateEnum
CREATE TYPE "SpecValueState" AS ENUM ('KNOWN', 'NOT_APPLICABLE', 'UNKNOWN');

-- AlterTable
ALTER TABLE "product_spec_values" ADD COLUMN "state" "SpecValueState" NOT NULL DEFAULT 'KNOWN';

-- Replace the shape check (same rules for KNOWN; empty value columns otherwise).
ALTER TABLE "product_spec_values" DROP CONSTRAINT "product_spec_values_shape_check";
ALTER TABLE "product_spec_values" ADD CONSTRAINT "product_spec_values_shape_check" CHECK (
    CASE
        WHEN "state" <> 'KNOWN' THEN
            "valueText" IS NULL AND "valueNumber" IS NULL AND "valueBoolean" IS NULL
        ELSE
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
    END
);

-- Options: carry the value's state; only KNOWN is allowed.
ALTER TABLE "product_spec_value_options" ADD COLUMN "state" "SpecValueState" NOT NULL DEFAULT 'KNOWN';
ALTER TABLE "product_spec_value_options" ADD CONSTRAINT "product_spec_value_options_state_check" CHECK ("state" = 'KNOWN');

-- Target of the 4-column foreign key (the primary key does not include "state").
CREATE UNIQUE INDEX "product_spec_values_productId_specDefinitionId_stage_state_key"
    ON "product_spec_values"("productId", "specDefinitionId", "stage", "state");

-- Replace option -> value FK by the 4-column one (deferred, see the header).
ALTER TABLE "product_spec_value_options" DROP CONSTRAINT "product_spec_value_options_value_fkey";
ALTER TABLE "product_spec_value_options" ADD CONSTRAINT "product_spec_value_options_value_fkey"
    FOREIGN KEY ("productId", "specDefinitionId", "stage", "state")
    REFERENCES "product_spec_values"("productId", "specDefinitionId", "stage", "state")
    ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
