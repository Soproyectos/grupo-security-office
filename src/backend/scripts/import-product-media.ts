#!/usr/bin/env node
/**
 * Official product media importer.
 *
 * Reads the output directory of tools/enrich_hikvision_catalog.py, matches the
 * `matched` SKUs to products (normalized SKU), copies the official images and
 * datasheets under the uploads dir and registers them in the database.
 *
 * Usage (from src/backend):
 *   npm run db:import-product-media -- --input <enrichment-dir> --dry-run
 *   npm run db:import-product-media -- --input <enrichment-dir> [--uploads-dir <dir>]
 *
 * Idempotent and additive: it never deletes or modifies existing product_images
 * rows, and it appends to Product.documents. One transaction per product.
 * Back up the database before the first real run.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import { UPLOADS_DIR } from '../src/common/uploads-path';
import {
  ExistingProduct,
  ProductMediaPlan,
  applyProductPlan,
  buildProductLookup,
  buildProductMediaPlan,
  buildReport,
  loadEnrichment,
  normalizeSku,
} from '../src/scripts/import-product-media.logic';

interface CliOptions {
  input: string | null;
  uploadsDir: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { input: null, uploadsDir: UPLOADS_DIR, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--input') options.input = argv[++i] ?? null;
    else if (arg.startsWith('--input=')) options.input = arg.slice('--input='.length);
    else if (arg === '--uploads-dir') options.uploadsDir = path.resolve(argv[++i] ?? '');
    else if (arg.startsWith('--uploads-dir=')) {
      options.uploadsDir = path.resolve(arg.slice('--uploads-dir='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.input) {
    console.error('Usage: db:import-product-media -- --input <enrichment-dir> [--uploads-dir <dir>] [--dry-run]');
    process.exit(1);
  }

  const { sources, skippedNotMatched, duplicates } = loadEnrichment(path.resolve(options.input));
  console.log(
    `[import-product-media] ${sources.length} matched SKUs to import ` +
      `(${skippedNotMatched} entries not matched are ignored)` +
      (duplicates.length ? `, ${duplicates.length} duplicated entries ignored` : ''),
  );
  console.log(`[import-product-media] uploads dir: ${options.uploadsDir}`);
  console.log(`[import-product-media] mode: ${options.dryRun ? 'DRY-RUN (no files, no DB writes)' : 'APPLY'}`);

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        documents: true,
        images: { select: { url: true, isPrimary: true, sortOrder: true } },
      },
    });
    const products: ExistingProduct[] = rows;
    const lookup = buildProductLookup(products);

    const plans: ProductMediaPlan[] = [];
    const documentsById = new Map<string, unknown>();
    const unmatchedSkus: string[] = [];
    const ambiguousSkus: string[] = [];

    for (const source of sources) {
      const key = normalizeSku(source.sku);
      if (lookup.ambiguous.has(key)) {
        ambiguousSkus.push(source.sku);
        continue;
      }
      const product = lookup.bySku.get(key);
      if (!product) {
        unmatchedSkus.push(source.sku);
        continue;
      }
      plans.push(buildProductMediaPlan(product, source));
      documentsById.set(product.id, product.documents);
    }

    const failedSkus: string[] = [];
    if (!options.dryRun) {
      for (const plan of plans) {
        try {
          await applyProductPlan(
            prisma as never,
            plan,
            documentsById.get(plan.productId),
            options.uploadsDir,
          );
        } catch (error) {
          failedSkus.push(plan.sku);
          console.error(`[import-product-media] FAILED ${plan.sku}: ${(error as Error).message}`);
        }
      }
    }

    const report = buildReport({
      enrichedMatched: sources.length,
      plans,
      unmatchedSkus,
      ambiguousSkus,
      failedSkus,
    });

    const verb = options.dryRun ? 'would create' : 'created';
    console.log('\n=== PRODUCT MEDIA IMPORT REPORT ===');
    console.log(`Matched in enrichment:            ${report.enrichedMatched}`);
    console.log(`Products found in DB:             ${report.productsFound}`);
    console.log(`Images ${verb}:            ${report.imagesCreated}`);
    console.log(`Documents ${options.dryRun ? 'to add' : 'added'}:               ${report.docsAdded}`);
    console.log('Products by official images (/uploads/products) after import:');
    console.log(`  3 or more:                      ${report.productsWith3OrMore}`);
    console.log(`  1-2:                            ${report.productsWith1To2}`);
    console.log(`  0:                              ${report.productsWith0}`);
    if (report.ambiguousSkus.length) {
      console.log(`Ambiguous SKUs in DB (skipped):   ${report.ambiguousSkus.join(', ')}`);
    }
    if (report.failedProducts.length) {
      console.log(`Failed products:                  ${report.failedProducts.join(', ')}`);
    }
    console.log(`Unmatched SKUs (${report.unmatchedSkus.length}):`);
    for (const sku of report.unmatchedSkus) console.log(`  - ${sku}`);

    if (report.failedProducts.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[import-product-media] fatal:', error);
  process.exit(1);
});
