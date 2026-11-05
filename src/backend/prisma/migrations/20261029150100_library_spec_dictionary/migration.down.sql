-- Reverts 20261029150100_library_spec_dictionary. Run it BEFORE the downs of
-- 20261029150000_library_subcategories. Every row of these tables is lost
-- (definitions, options, templates, values), so take a dump first if any was
-- loaded. Dropping a table drops its indexes, constraints and foreign keys.

DROP TABLE IF EXISTS "product_spec_value_options";
DROP TABLE IF EXISTS "product_spec_values";
DROP TABLE IF EXISTS "subcategory_specs";
DROP TABLE IF EXISTS "spec_options";
DROP TABLE IF EXISTS "spec_definitions";

DROP TYPE IF EXISTS "SpecValueStage";
DROP TYPE IF EXISTS "SubcategorySpecStatus";
DROP TYPE IF EXISTS "SpecDataType";
