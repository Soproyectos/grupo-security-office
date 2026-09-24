/**
 * Importador de la biblioteca de vitrina (ADR-002, tarea T5).
 *
 * Siembra la capa de identidad de los 764 productos curados por el agente
 * bibliotecario: nombre de vitrina (<=70), descripción, categoría, marca,
 * `nameSource="curado"` y bloqueo `nameLockedAt`, más el bloque
 * `extraAttributes.biblioteca` con la documentación de origen de cada ficha.
 * NUNCA toca filas de Price — la biblioteca es solo identidad (ADR-002).
 *
 * Uso (ts-node, estilo prisma/seed.ts):
 *   npm run db:import-biblioteca                      → DRY-RUN (cero escrituras en BD)
 *   npm run db:import-biblioteca -- --apply --confirm=IMPORTAR-BIBLIOTECA-2026
 *
 * La corrida real exige el token exacto: sin --apply o sin el token correcto
 * el script no escribe nada en la base de datos (regla 2 de AGENTS.md).
 *
 * Toda la lógica pura vive en src/scripts/import-biblioteca.logic.ts
 * (probada por import-biblioteca.logic.spec.ts); aquí solo el cableado con
 * PrismaClient y el reporte de corrida.
 */
import { PrismaClient, Prisma, ProductImageType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import {
  BibliotecaFicha,
  ExistingNamedEntity,
  NameResolution,
  buildCreateData,
  buildImageRows,
  buildReport,
  buildUpdateData,
  formatTimestamp,
  isIdempotentSkip,
  loadFichas,
  matchProducts,
  normalizeNameForMatch,
  resolveBrands,
  resolveCategories,
  resolveEntityId,
  toBrandCreate,
  toCategoryCreate,
} from '../src/scripts/import-biblioteca.logic';

const prisma = new PrismaClient();

const CONFIRM_TOKEN = 'IMPORTAR-BIBLIOTECA-2026';

/** biblioteca/ vive en la raíz del repo: src/backend/prisma → 3 niveles arriba. */
const FICHAS_DIR = path.resolve(__dirname, '..', '..', '..', 'biblioteca');

interface RowOutcome {
  ficha: BibliotecaFicha;
  action: 'update' | 'create' | 'skip' | 'error';
}

function parseArgs(argv: string[]): { apply: boolean; confirm: string | null } {
  const apply = argv.includes('--apply');
  const confirmArg = argv.find((a) => a.startsWith('--confirm='));
  const confirm = confirmArg ? confirmArg.slice('--confirm='.length) : null;
  return { apply, confirm };
}

function writeJsonArtifact(dir: string, name: string, payload: unknown): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

/** Crea las categorías faltantes y devuelve nombre-normalizado → id. */
async function createMissingCategories(
  tx: Prisma.TransactionClient,
  resolution: NameResolution,
): Promise<Map<string, string>> {
  const createdIds = new Map<string, string>();
  for (const name of resolution.toCreate) {
    const created = await tx.category.create({ data: toCategoryCreate(name) });
    createdIds.set(normalizeNameForMatch(name), created.id);
  }
  return createdIds;
}

/** Crea las marcas faltantes y devuelve nombre-normalizado → id. */
async function createMissingBrands(
  tx: Prisma.TransactionClient,
  resolution: NameResolution,
): Promise<Map<string, string>> {
  const createdIds = new Map<string, string>();
  for (const name of resolution.toCreate) {
    const created = await tx.brand.create({ data: toBrandCreate(name) });
    createdIds.set(normalizeNameForMatch(name), created.id);
  }
  return createdIds;
}

async function main(): Promise<void> {
  const { apply, confirm } = parseArgs(process.argv.slice(2));
  const now = new Date();
  const ts = formatTimestamp(now);

  if (apply && confirm !== CONFIRM_TOKEN) {
    console.error(
      '[import-biblioteca] --apply requiere --confirm=IMPORTAR-BIBLIOTECA-2026. ' +
        'Corre primero el dry-run, revisa el reporte y usa el token exacto.',
    );
    process.exit(1);
  }

  console.log(`[import-biblioteca] leyendo fichas de ${FICHAS_DIR}`);
  const { valid: fichas, invalid } = loadFichas(FICHAS_DIR);
  console.log(
    `[import-biblioteca] fichas: ${fichas.length} válidas, ${invalid.length} inválidas`,
  );

  // Estado actual de la BD (lectura mínima por campo).
  const [categories, brands, products, existingImageProductIds] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.brand.findMany({ select: { id: true, name: true } }),
    prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        categoryId: true,
        brandId: true,
        extraAttributes: true,
        nameLockedAt: true,
      },
    }),
    prisma.productImage.findMany({
      select: { productId: true },
      distinct: ['productId'],
    }),
  ]);

  const catRes = resolveCategories(fichas, categories as ExistingNamedEntity[]);
  const brandRes = resolveBrands(fichas, brands as ExistingNamedEntity[]);
  const { updates, creates } = matchProducts(
    fichas,
    products.map((p) => p.sku),
  );
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const productsWithImages = new Set(existingImageProductIds.map((i) => i.productId));

  console.log(
    `[import-biblioteca] cruce con BD: ${updates.length} updates, ${creates.length} creates ` +
      `| categorías por crear: ${catRes.toCreate.length} | marcas por crear: ${brandRes.toCreate.length}`,
  );

  // ---- DRY-RUN: plan completo, cero escrituras en la BD ----
  if (!apply) {
    const outcomes: RowOutcome[] = [];
    for (const { ficha, sku } of updates) {
      const existing = productBySku.get(sku);
      if (existing && isIdempotentSkip(existing, ficha)) {
        outcomes.push({ ficha, action: 'skip' });
      } else {
        outcomes.push({ ficha, action: 'update' });
      }
    }
    for (const ficha of creates) outcomes.push({ ficha, action: 'create' });

    const report = buildReport({
      mode: 'dry-run',
      now,
      entries: outcomes,
      invalid,
      categoriesToCreate: catRes.toCreate,
      brandsToCreate: brandRes.toCreate,
      images: fichas.filter((f) => buildImageRows(f).length > 0).length,
      namesTruncated: fichas.filter(
        (f) => (f.nombre_vitrina?.valor ?? '').trim().length > 70,
      ).length,
    });
    const artifact = writeJsonArtifact(
      FICHAS_DIR,
      `import-dry-run-${ts}.json`,
      report,
    );
    printSummary(report, artifact, false);
    return;
  }

  // ---- APPLY: con token confirmado, transacción con savepoints por fila ----
  // (patrón de batch-executor: un fallo real en UNA fila no revienta el lote).
  console.log('[import-biblioteca] APPLY confirmado: respaldando identidad previa…');
  const backupRows = updates
    .map(({ sku }) => productBySku.get(sku))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      brandId: p.brandId,
      extraAttributes: p.extraAttributes,
    }));
  const backupPath = writeJsonArtifact(
    FICHAS_DIR,
    `backup-identidad-${ts}.json`,
    { generatedAt: now.toISOString(), products: backupRows },
  );
  console.log(`[import-biblioteca] backup: ${backupPath} (${backupRows.length} productos)`);

  const outcomes: RowOutcome[] = [];
  const rowErrors: { sku: string; error: string }[] = [];
  let imagesCreated = 0;
  let categoriesCreated = 0;
  let brandsCreated = 0;

  const TX_CHUNK = 50;
  const TX_OPTS = { timeout: 180_000, maxWait: 30_000 } as const;

  // 1) Categorías/marcas faltantes en una transacción corta propia.
  const { createdCatIds, createdBrandIds } = await prisma.$transaction(
    async (tx) => {
      const createdCatIds = await createMissingCategories(tx, catRes);
      const createdBrandIds = await createMissingBrands(tx, brandRes);
      return { createdCatIds, createdBrandIds };
    },
    TX_OPTS,
  );
  categoriesCreated = createdCatIds.size;
  brandsCreated = createdBrandIds.size;
  console.log(
    `[import-biblioteca] categorías creadas: ${categoriesCreated} | marcas creadas: ${brandsCreated}`,
  );

  /** UPDATE de un producto (dentro de la transacción que pase el llamador). */
  const applyUpdateRow = async (tx: Prisma.TransactionClient, ficha: BibliotecaFicha, sku: string) => {
    const existing = productBySku.get(sku);
    if (!existing) {
      rowErrors.push({ sku, error: 'producto desapareció entre plan y ejecución' });
      outcomes.push({ ficha, action: 'error' });
      return;
    }
    if (isIdempotentSkip(existing, ficha)) {
      outcomes.push({ ficha, action: 'skip' });
      return;
    }
    const categoryId = resolveEntityId(ficha.categoria?.valor, catRes, createdCatIds);
    const brandId = resolveEntityId(ficha.marca?.valor, brandRes, createdBrandIds);
    if (!categoryId || !brandId) {
      rowErrors.push({ sku, error: 'categoría/marca por resolver y sin default disponible' });
      outcomes.push({ ficha, action: 'error' });
      return;
    }
    await tx.$executeRawUnsafe('SAVEPOINT row_sp');
    try {
      const data = buildUpdateData(ficha, categoryId, brandId, now, existing.extraAttributes);
      await tx.product.update({
        where: { id: existing.id },
        data: data as unknown as Prisma.ProductUncheckedUpdateInput,
      });
      // Imagen principal solo si el producto aún no tiene ninguna.
      const imgs = buildImageRows(ficha);
      if (imgs.length > 0 && !productsWithImages.has(existing.id)) {
        await tx.productImage.create({
          data: {
            productId: existing.id,
            url: imgs[0].url,
            type: ProductImageType.PRINCIPAL,
            isPrimary: true,
            alt: imgs[0].alt,
          },
        });
        imagesCreated++;
      }
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT row_sp');
      outcomes.push({ ficha, action: 'update' });
    } catch (e) {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT row_sp');
      rowErrors.push({ sku, error: (e as Error).message });
      outcomes.push({ ficha, action: 'error' });
    }
  };

  /** CREATE de una referencia nueva (DRAFT invisible, sin precios, sin listaId). */
  const applyCreateRow = async (tx: Prisma.TransactionClient, ficha: BibliotecaFicha) => {
    const categoryId = resolveEntityId(ficha.categoria?.valor, catRes, createdCatIds);
    const brandId = resolveEntityId(ficha.marca?.valor, brandRes, createdBrandIds);
    if (!categoryId || !brandId) {
      rowErrors.push({ sku: ficha.referencia, error: 'categoría/marca por resolver y sin default disponible' });
      outcomes.push({ ficha, action: 'error' });
      return;
    }
    await tx.$executeRawUnsafe('SAVEPOINT row_sp');
    try {
      const data = buildCreateData(ficha, categoryId, brandId, now);
      const created = await tx.product.create({
        data: data as unknown as Prisma.ProductUncheckedCreateInput,
      });
      const imgs = buildImageRows(ficha);
      if (imgs.length > 0) {
        await tx.productImage.create({
          data: {
            productId: created.id,
            url: imgs[0].url,
            type: ProductImageType.PRINCIPAL,
            isPrimary: true,
            alt: imgs[0].alt,
          },
        });
        imagesCreated++;
      }
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT row_sp');
      outcomes.push({ ficha, action: 'create' });
    } catch (e) {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT row_sp');
      rowErrors.push({ sku: ficha.referencia, error: (e as Error).message });
      outcomes.push({ ficha, action: 'error' });
    }
  };

  /**
   * Procesa una lista de filas en chunks transaccionales. Si un chunk muere
   * (timeout de transacción interactiva, red, etc.) se descartan los outcomes
   * que ese chunk hubiera registrado y se reintenta fila por fila — cada fila
   * con su propia transacción corta. La idempotencia permite re-corridas
   * completas sin duplicar nada.
   */
  const runChunked = async (
    rows: { ficha: BibliotecaFicha; sku?: string }[],
    applyRow: (tx: Prisma.TransactionClient, ficha: BibliotecaFicha, sku?: string) => Promise<void>,
    label: string,
  ): Promise<void> => {
    for (let i = 0; i < rows.length; i += TX_CHUNK) {
      const chunk = rows.slice(i, i + TX_CHUNK);
      const outcomesMark = outcomes.length;
      const errorsMark = rowErrors.length;
      const imagesMark = imagesCreated;
      try {
        await prisma.$transaction(async (tx) => {
          for (const row of chunk) await applyRow(tx, row.ficha, row.sku);
        }, TX_OPTS);
      } catch (e) {
        // El chunk entero se revirtió: descartar sus outcomes y reintentar 1 a 1.
        outcomes.length = outcomesMark;
        rowErrors.length = errorsMark;
        imagesCreated = imagesMark;
        console.warn(
          `[import-biblioteca] chunk ${label}[${i}..${i + chunk.length}) falló ` +
            `(${(e as Error).message}); reintentando fila por fila…`,
        );
        for (const row of chunk) {
          try {
            await prisma.$transaction(async (tx) => {
              await applyRow(tx, row.ficha, row.sku);
            }, TX_OPTS);
          } catch (e2) {
            rowErrors.push({
              sku: row.sku ?? row.ficha.referencia,
              error: `fila irrecuperable: ${(e2 as Error).message}`,
            });
            outcomes.push({ ficha: row.ficha, action: 'error' });
          }
        }
      }
    }
  };

  // 2) Updates de identidad (sku matcheado).
  await runChunked(
    updates.map(({ ficha, sku }) => ({ ficha, sku })),
    (tx, ficha, sku) => applyUpdateRow(tx, ficha, sku as string),
    'updates',
  );

  // 3) Creates (referencias nuevas).
  await runChunked(
    creates.map((ficha) => ({ ficha })),
    (tx, ficha) => applyCreateRow(tx, ficha),
    'creates',
  );

  const report = buildReport({
    mode: 'apply',
    now,
    entries: outcomes,
    invalid,
    categoriesToCreate: catRes.toCreate,
    brandsToCreate: brandRes.toCreate,
    images: imagesCreated,
    namesTruncated: fichas.filter((f) => (f.nombre_vitrina?.valor ?? '').trim().length > 70).length,
    categoriesCreated,
    brandsCreated,
    rowErrors,
  });
  const artifact = writeJsonArtifact(FICHAS_DIR, `import-report-${ts}.json`, report);
  printSummary(report, artifact, true);
}

function printSummary(
  report: ReturnType<typeof buildReport>,
  artifact: string,
  applied: boolean,
): void {
  const t = report.totals;
  console.log('\n===== RESUMEN IMPORT BIBLIOTECA VITRINA =====');
  console.log(`modo:            ${applied ? 'APPLY' : 'DRY-RUN'} (reporte: ${artifact})`);
  console.log(`fichas:          ${t.fichasFiles} archivos | ${t.valid} válidas | ${t.invalid} inválidas`);
  console.log(`updates:         ${t.updates}`);
  console.log(`creates:         ${t.creates}`);
  console.log(`skipped:         ${t.skipped} (idempotentes)`);
  console.log(`errors:         ${t.errors}`);
  console.log(`imágenes:        ${t.images}`);
  console.log(`nombres>70:      ${t.namesTruncated} (recortados a 70)`);
  for (const [estado, c] of Object.entries(report.perEstado)) {
    console.log(
      `  ${estado.padEnd(14)} total=${c.total} update=${c.updates} create=${c.creates} skip=${c.skipped} error=${c.errors}`,
    );
  }
  if (applied) {
    console.log(`categorías creadas: ${report.categoriesCreated} | marcas creadas: ${report.brandsCreated}`);
  } else {
    console.log(`categorías por crear: ${report.categoriesToCreate.length} | marcas por crear: ${report.brandsToCreate.length}`);
  }
  if (report.rowErrors.length > 0) {
    console.log(`\nERRORES POR FILA (${report.rowErrors.length}):`);
    for (const re of report.rowErrors.slice(0, 20)) console.log(`  ${re.sku}: ${re.error}`);
  }
  console.log('=============================================\n');
}

main()
  .catch((e) => {
    console.error('[import-biblioteca] FALLO:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
