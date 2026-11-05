/*
  Library block 1, step 2 (docs/biblioteca-dominio/estructura-biblioteca.md, 2.1, 6.1 and 6.3 "M3"):
  the key-data dictionary, the per-subcategory templates ("moldes") and the
  per-product values. Every table is created EMPTY: templates are loaded only
  after they are approved, and values only by the library flows.

  Needs 20261029150000_library_subcategories ("subcategories").

  WHAT THE DATABASE GUARANTEES (the rest is domain code, src/modules/products/key-specs)
    - Type: product_spec_values copies "dataType" and a composite FK to
      spec_definitions ("id", "dataType") keeps it equal to the definition's;
      a CHECK lets only the column of that type be filled.
    - Unit: it lives only in spec_definitions. The number is stored in that unit.
    - Allowed values: every chosen option is a row of product_spec_value_options
      with a composite FK to spec_options ("specDefinitionId", "key"), so an
      option that is not in the dictionary, or belongs to another datum, cannot
      be stored. That an OPTION datum has exactly ONE option is not a constraint:
      the domain enforces it (issue "option_cardinality").
    - Approval (F6): a required template row needs a written reason, and an
      APPROVED one needs who approved it and when. Only APPROVED rows count.
    - Unique: (subcategory, datum) for templates, (product, datum, stage) for
      values, "key" for definitions.

  NO FOREIGN KEY to users, customers or operational tables, on purpose:
  "approvedById" and "updatedById" are plain text so these tables can later move
  to a dedicated library database that has no users table.

  PRISMA: tables, enums, indexes and foreign keys are what `prisma migrate diff`
  expects for these models. Prisma does not model the CHECK constraints, and
  introspection ignores them, so they do not appear in a diff.
*/

-- CreateEnum
CREATE TYPE "SpecDataType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'OPTION', 'MULTI_OPTION');

-- CreateEnum
CREATE TYPE "SubcategorySpecStatus" AS ENUM ('PROPOSED', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "SpecValueStage" AS ENUM ('WORKING', 'PUBLISHED');

-- CreateTable
CREATE TABLE "spec_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" "SpecDataType" NOT NULL,
    "unit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spec_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spec_options" (
    "specDefinitionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "spec_options_pkey" PRIMARY KEY ("specDefinitionId","key")
);

-- CreateTable
CREATE TABLE "subcategory_specs" (
    "subcategoryId" TEXT NOT NULL,
    "specDefinitionId" TEXT NOT NULL,
    "status" "SubcategorySpecStatus" NOT NULL DEFAULT 'PROPOSED',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "requiredReason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcategory_specs_pkey" PRIMARY KEY ("subcategoryId","specDefinitionId"),
    -- A required datum records its written justification (F6). `IS NOT NULL` first,
    -- because a NULL comparison alone would let the check pass.
    CONSTRAINT "subcategory_specs_required_reason_check" CHECK (
        NOT "isRequired" OR ("requiredReason" IS NOT NULL AND btrim("requiredReason") <> '')
    ),
    -- An approved row records who approved it and when (F6); a blank approver does not count.
    CONSTRAINT "subcategory_specs_approval_check" CHECK (
        "status" <> 'APPROVED'
        OR ("approvedById" IS NOT NULL AND btrim("approvedById") <> '' AND "approvedAt" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "product_spec_values" (
    "productId" TEXT NOT NULL,
    "specDefinitionId" TEXT NOT NULL,
    "stage" "SpecValueStage" NOT NULL,
    "dataType" "SpecDataType" NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(18,6),
    "valueBoolean" BOOLEAN,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_spec_values_pkey" PRIMARY KEY ("productId","specDefinitionId","stage"),
    -- Only the column of the type is filled. OPTION and MULTI_OPTION keep all three empty:
    -- their choices are rows of product_spec_value_options. NaN is a valid numeric but never a value.
    CONSTRAINT "product_spec_values_shape_check" CHECK (
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
    )
);

-- CreateTable
CREATE TABLE "product_spec_value_options" (
    "productId" TEXT NOT NULL,
    "specDefinitionId" TEXT NOT NULL,
    "stage" "SpecValueStage" NOT NULL,
    "optionKey" TEXT NOT NULL,

    CONSTRAINT "product_spec_value_options_pkey" PRIMARY KEY ("productId","specDefinitionId","stage","optionKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "spec_definitions_key_key" ON "spec_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "spec_definitions_id_dataType_key" ON "spec_definitions"("id", "dataType");

-- CreateIndex
CREATE INDEX "subcategory_specs_specDefinitionId_idx" ON "subcategory_specs"("specDefinitionId");

-- CreateIndex
CREATE INDEX "product_spec_values_specDefinitionId_stage_valueNumber_idx" ON "product_spec_values"("specDefinitionId", "stage", "valueNumber");

-- CreateIndex
CREATE INDEX "product_spec_values_specDefinitionId_stage_valueText_idx" ON "product_spec_values"("specDefinitionId", "stage", "valueText");

-- CreateIndex
CREATE INDEX "product_spec_value_options_specDefinitionId_optionKey_stage_idx" ON "product_spec_value_options"("specDefinitionId", "optionKey", "stage");

-- AddForeignKey
ALTER TABLE "spec_options" ADD CONSTRAINT "spec_options_specDefinitionId_fkey" FOREIGN KEY ("specDefinitionId") REFERENCES "spec_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcategory_specs" ADD CONSTRAINT "subcategory_specs_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcategory_specs" ADD CONSTRAINT "subcategory_specs_specDefinitionId_fkey" FOREIGN KEY ("specDefinitionId") REFERENCES "spec_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_spec_values" ADD CONSTRAINT "product_spec_values_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_spec_values" ADD CONSTRAINT "product_spec_values_specDefinitionId_dataType_fkey" FOREIGN KEY ("specDefinitionId", "dataType") REFERENCES "spec_definitions"("id", "dataType") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (named explicitly: the default name would be 64 characters, over PostgreSQL's 63)
ALTER TABLE "product_spec_value_options" ADD CONSTRAINT "product_spec_value_options_value_fkey" FOREIGN KEY ("productId", "specDefinitionId", "stage") REFERENCES "product_spec_values"("productId", "specDefinitionId", "stage") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_spec_value_options" ADD CONSTRAINT "product_spec_value_options_specDefinitionId_optionKey_fkey" FOREIGN KEY ("specDefinitionId", "optionKey") REFERENCES "spec_options"("specDefinitionId", "key") ON DELETE RESTRICT ON UPDATE CASCADE;
