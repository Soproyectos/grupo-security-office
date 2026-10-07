-- =============================================================================
-- dedup-products-by-sku-report.sql   (READ ONLY dry run)
--
-- Shows what dedup-products-by-sku.sql WOULD do. It only contains SELECTs.
-- Decision rules are identical to the merge script (keep them in sync).
--
-- Run the two queries separately (Supabase SQL Editor shows the last result):
--   QUERY 1: summary totals.
--   QUERY 2: one row per pair (status MERGE) and one row per group that does
--            not match the expected shape (status SKIP, never merged).
--
-- Column guide (QUERY 2)
--   name_winner         loser (curado) | survivor (already curated) | survivor (loser not curated)
--   category_change     "survivor category -> loser category" when the loser identity wins and
--                       carry_category_brand is true (see merge script), else "kept"
--   publish_from_loser  true when the survivor takes the loser's lifecycle/publish block
--   prices_to_move      loser prices without a survivor price in the same price list
--   prices_conflicts    loser prices dropped because the survivor already has one (survivor kept)
--   prices_value_differs  subset of conflicts whose value/currency differ (the survivor's value stays)
--   stock_action        move | drop_loser_keep_survivor | none
--   members             SKIP rows only: id|sku|lista for every product of the group
-- =============================================================================

-- ------------------------------ QUERY 1: summary ------------------------------
WITH norm AS (
  SELECT id, upper(regexp_replace(sku, '\s', '', 'g')) AS k, ("listaId" IS NOT NULL) AS has_lista
  FROM products
), grp AS (
  SELECT k, count(*) AS c, count(*) FILTER (WHERE has_lista) AS with_lista
  FROM norm GROUP BY k HAVING count(*) > 1
)
SELECT
  (SELECT count(*) FROM products)                                              AS products_total,
  (SELECT count(*) FROM grp)                                                   AS duplicate_groups,
  (SELECT count(*) FROM grp WHERE c = 2 AND with_lista = 1)                    AS pairs_to_merge,
  (SELECT count(*) FROM grp WHERE NOT (c = 2 AND with_lista = 1))              AS groups_skipped,
  (SELECT count(*) FROM products) - (SELECT count(*) FROM grp WHERE c = 2 AND with_lista = 1)
                                                                               AS products_after_merge;

-- ------------------------------ QUERY 2: detail -------------------------------
WITH norm AS (
  SELECT id, upper(regexp_replace(sku, '\s', '', 'g')) AS k, ("listaId" IS NOT NULL) AS has_lista
  FROM products
), grp AS (
  SELECT k, count(*) AS c, count(*) FILTER (WHERE has_lista) AS with_lista
  FROM norm GROUP BY k HAVING count(*) > 1
), pairs AS (
  SELECT g.k, s.id AS survivor_id, l.id AS loser_id
  FROM grp g
  JOIN norm s ON s.k = g.k AND s.has_lista
  JOIN norm l ON l.k = g.k AND NOT l.has_lista
  WHERE g.c = 2 AND g.with_lista = 1
), cfg AS (
  SELECT true AS carry_category_brand            -- keep equal to the merge script
), merge_rows AS (
  SELECT
    p.k                                                   AS normalized_sku,
    'MERGE'::text                                         AS status,
    s.id AS survivor_id, s.sku AS survivor_sku, s.name AS survivor_name,
    l.id AS loser_id,    l.sku AS loser_sku,    l.name AS loser_name,
    CASE
      WHEN (l."nameLockedAt" IS NOT NULL OR l."nameSource" = 'curado')
           AND NOT (s."nameLockedAt" IS NOT NULL OR s."nameSource" = 'curado') THEN 'loser (curado)'
      WHEN (s."nameLockedAt" IS NOT NULL OR s."nameSource" = 'curado') THEN 'survivor (already curated)'
      ELSE 'survivor (loser not curated)'
    END                                                   AS name_winner,
    CASE
      WHEN (l."nameLockedAt" IS NOT NULL OR l."nameSource" = 'curado')
           AND NOT (s."nameLockedAt" IS NOT NULL OR s."nameSource" = 'curado')
           AND (SELECT carry_category_brand FROM cfg)
           AND (s."categoryId" <> l."categoryId" OR s."brandId" <> l."brandId")
        THEN (SELECT name FROM categories WHERE id = s."categoryId") || ' -> ' ||
             (SELECT name FROM categories WHERE id = l."categoryId")
      ELSE 'kept'
    END                                                   AS category_change,
    (s."isVisible" OR l."isVisible")                      AS visible_after,
    ((l."lifecycleStatus" = 'PUBLISHED' OR l."publishStatus" = 'publicado')
       AND NOT (s."lifecycleStatus" = 'PUBLISHED' OR s."publishStatus" = 'publicado')) AS publish_from_loser,
    (SELECT count(*) FROM prices lp
       WHERE lp."productId" = l.id
         AND NOT EXISTS (SELECT 1 FROM prices sp WHERE sp."productId" = s.id AND sp."priceListId" = lp."priceListId")) AS prices_to_move,
    (SELECT count(*) FROM prices lp
       WHERE lp."productId" = l.id
         AND EXISTS (SELECT 1 FROM prices sp WHERE sp."productId" = s.id AND sp."priceListId" = lp."priceListId")) AS prices_conflicts,
    (SELECT count(*) FROM prices lp JOIN prices sp ON sp."productId" = s.id AND sp."priceListId" = lp."priceListId"
       WHERE lp."productId" = l.id AND (lp.value <> sp.value OR lp.currency <> sp.currency)) AS prices_value_differs,
    (SELECT count(*) FROM quote_items q WHERE q."productId" = l.id)                         AS quote_items_to_repoint,
    (SELECT count(*) FROM product_images i WHERE i."productId" = l.id)                      AS images_to_move,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM stocks x WHERE x."productId" = l.id) THEN 'none'
      WHEN EXISTS (SELECT 1 FROM stocks x WHERE x."productId" = s.id) THEN 'drop_loser_keep_survivor'
      ELSE 'move'
    END                                                   AS stock_action,
    (SELECT count(*) FROM audit_logs a WHERE a."productId" = l.id)                          AS audit_logs_to_move,
    (SELECT count(*) FROM product_catalog_spec_groups g WHERE g."productId" = l.id
       AND NOT EXISTS (SELECT 1 FROM product_catalog_spec_groups g2 WHERE g2."productId" = s.id)) AS spec_groups_to_move,
    (SELECT count(*) FROM product_catalog_spec_groups g WHERE g."productId" = l.id
       AND EXISTS (SELECT 1 FROM product_catalog_spec_groups g2 WHERE g2."productId" = s.id))     AS spec_groups_discarded,
    (SELECT count(*) FROM product_catalog_resources r WHERE r."productId" = l.id
       AND NOT EXISTS (SELECT 1 FROM product_catalog_resources r2 WHERE r2."productId" = s.id))   AS resources_to_move,
    (SELECT count(*) FROM product_catalog_resources r WHERE r."productId" = l.id
       AND EXISTS (SELECT 1 FROM product_catalog_resources r2 WHERE r2."productId" = s.id))       AS resources_discarded,
    (l."catalogSlug" IS NOT NULL OR l."catalogName" IS NOT NULL OR l."catalogPublished"
       OR COALESCE(cardinality(l."catalogHighlights"), 0) > 0 OR l."catalogFeatures" <> '[]'::jsonb) AS loser_has_catalog_cols,
    (s."catalogSlug" IS NOT NULL OR s."catalogName" IS NOT NULL OR s."catalogPublished"
       OR COALESCE(cardinality(s."catalogHighlights"), 0) > 0 OR s."catalogFeatures" <> '[]'::jsonb) AS survivor_has_catalog_cols,
    NULL::text AS members
  FROM pairs p
  JOIN products s ON s.id = p.survivor_id
  JOIN products l ON l.id = p.loser_id
), skip_rows AS (
  SELECT
    g.k AS normalized_sku,
    ('SKIP: ' || g.c || ' rows, ' || g.with_lista || ' with Lista (expected 2 rows, exactly 1 with Lista)')::text AS status,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::boolean, NULL::boolean,
    NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint,
    NULL::text, NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint, NULL::bigint,
    NULL::boolean, NULL::boolean,
    (SELECT string_agg(p.id || '|' || p.sku || '|' || CASE WHEN p."listaId" IS NULL THEN 'no-lista' ELSE 'lista' END, ' ; ')
       FROM products p WHERE upper(regexp_replace(p.sku, '\s', '', 'g')) = g.k) AS members
  FROM grp g
  WHERE NOT (g.c = 2 AND g.with_lista = 1)
)
SELECT * FROM merge_rows
UNION ALL
SELECT * FROM skip_rows
ORDER BY status DESC, normalized_sku;
