import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import {
  NormalizedRow,
  PriceEntry,
  BatchExecutionResult,
  BatchError,
  ImportContext,
} from '../interfaces/import-context';
import { generateSlug } from '../helpers/text-normalizer';

/**
 * Configuración de batch execution.
 */
interface BatchConfig {
  /** Tamaño de cada batch (filas por transacción) */
  batchSize: number;
  /** Máximo de reintentos por batch */
  maxRetries: number;
  /** Delay entre batches en ms (para no saturar la DB) */
  delayBetweenBatches: number;
}

/**
 * `batchSize` en 50 con archivos de varias listas de precio por fila
 * (SEC-IMPORT-002): cada precio de una fila cuesta 2 idas y vueltas a la BD
 * (`price.findUnique` + create/update) más una tercera si la lista de precios
 * es nueva — un archivo con ~10 columnas de precio son ~20-30 consultas
 * secuenciales por fila. Con 50 filas por transacción eso supera el `timeout`
 * de abajo antes de terminar el lote: Prisma cierra la transacción en el
 * servidor y toda fila procesada después revienta con "Transaction not
 * found", aunque sus datos fueran válidos (confirmado con
 * LISTA HIKVISION TURBO GRUPO.xlsx: preview 211/211 válidas, execute con
 * batchSize 50 → 200 de 211 en error por timeout de transacción).
 */
const DEFAULT_BATCH_CONFIG: BatchConfig = {
  batchSize: 15,
  maxRetries: 2,
  delayBetweenBatches: 100,
};

/** Decisión de sección del wizard, normalizada por sourceValue (slug). */
type SectionDecisionMap = NonNullable<ImportContext['sectionDecisions']>;

/**
 * Servicio de ejecución en batch.
 *
 * Ejecuta la inserción/actualización de productos en la BD
 * usando transacciones Prisma de a 50 filas.
 *
 * Responsabilidades:
 * - Resolver categorías y marcas (find or create)
 * - Detectar SKUs existentes (create vs update)
 * - Ejecutar en batches con $transaction
 * - Crear/actualizar listas de precios y precios
 * - Registrar auditoría
 * - Reintentar batches fallidos
 */
@Injectable()
export class BatchExecutorService {
  private readonly logger = new Logger(BatchExecutorService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Ejecuta la importación completa de filas normalizadas.
   */
  async execute(
    normalizedRows: NormalizedRow[],
    ctx: ImportContext,
    config?: Partial<BatchConfig>,
  ): Promise<BatchExecutionResult> {
    const batchConfig = { ...DEFAULT_BATCH_CONFIG, ...config };
    const startTime = Date.now();

    const result: BatchExecutionResult = {
      total: normalizedRows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      productIds: [],
      durationMs: 0,
      defaultsByMissingInference: { category: 0, brand: 0 },
      identityChangesDetected: 0,
    };

    // Pre-cargar categorías y marcas existentes + Lista destino
    const [existingCategories, existingBrands, existingPriceLists, targetLista] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, name: true, slug: true } }),
      this.prisma.brand.findMany({ select: { id: true, name: true, slug: true } }),
      this.prisma.priceList.findMany({ select: { id: true, code: true, name: true } }),
      this.resolveLista(ctx),
    ]);

    const targetListaId = targetLista.id;
    const defaultVisibility = targetLista.defaultVisibility;

    const categoryMap = new Map<string, { id: string; name: string; slug: string }>(
      existingCategories.map((c) => [c.name.toLowerCase(), c]),
    );
    const brandMap = new Map<string, { id: string; name: string; slug: string }>(
      existingBrands.map((b) => [b.name.toLowerCase(), b]),
    );
    const priceListMap = new Map<string, { id: string; code: string; name: string }>(
      existingPriceLists.map((pl) => [pl.code, pl]),
    );

    // Procesar en batches
    const batches = this.chunk(normalizedRows, batchConfig.batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      try {
        const batchResult = await this.executeBatch(
          batch,
          categoryMap,
          brandMap,
          priceListMap,
          targetListaId,
          defaultVisibility,
          ctx,
        );

        result.created += batchResult.created;
        result.updated += batchResult.updated;
        result.skipped += batchResult.skipped;
        result.productIds.push(...batchResult.productIds);
        result.errors.push(...batchResult.errors);
        result.identityChangesDetected += batchResult.identityChangesDetected;
        result.defaultsByMissingInference.category += batchResult.defaults.category;
        result.defaultsByMissingInference.brand += batchResult.defaults.brand;

        this.logger.log(
          `Batch ${batchIndex + 1}/${batches.length} completado: ` +
          `+${batchResult.created} ~${batchResult.updated} ⏭${batchResult.skipped}`,
        );
      } catch (error) {
        this.logger.error(
          `Error en batch ${batchIndex + 1}/${batches.length}: ${error.message}`,
        );

        // Marcar todo el batch como errores
        for (const row of batch) {
          result.errors.push({
            rowIndex: row.rowIndex,
            sku: row.sku,
            error: `Error en batch: ${error.message}`,
          });
          result.skipped++;
        }
      }

      // Delay entre batches (excepto el último)
      if (batchIndex < batches.length - 1) {
        await this.delay(batchConfig.delayBetweenBatches);
      }
    }

    result.durationMs = Date.now() - startTime;

    // Registrar auditoría
    await this.auditImport(ctx, result);

    return result;
  }

  /**
   * Ejecuta un batch individual dentro de una transacción Prisma.
   */
  private async executeBatch(
    batch: NormalizedRow[],
    categoryMap: Map<string, { id: string; name: string; slug: string }>,
    brandMap: Map<string, { id: string; name: string; slug: string }>,
    priceListMap: Map<string, { id: string; code: string; name: string }>,
    listaId: string,
    defaultVisibility: boolean,
    ctx: ImportContext,
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    productIds: string[];
    errors: BatchError[];
    defaults: { category: number; brand: number };
    identityChangesDetected: number;
  }> {
    return this.prisma.$transaction(
      async (tx) => {
        const batchResult = {
          created: 0,
          updated: 0,
          skipped: 0,
          productIds: [] as string[],
          errors: [] as BatchError[],
          defaults: { category: 0, brand: 0 },
          identityChangesDetected: 0,
        };

        // Pre-cargar SKUs existentes en este batch. Además del id, se traen los
        // campos de identidad (name/description/categoryId/brandId) y el
        // marcador nameLockedAt: el guard de identidad bloqueada (ADR-002)
        // los necesita para decidir qué sobrescribir y para detectar diffs
        // entre la fila y la identidad curada almacenada.
        const skus = batch.map((r) => r.sku);
        const existingProducts = await tx.product.findMany({
          where: { sku: { in: skus } },
          select: {
            id: true,
            sku: true,
            name: true,
            description: true,
            categoryId: true,
            brandId: true,
            nameLockedAt: true,
          },
        });
        const existingSkuMap = new Map<string, {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          categoryId: string;
          brandId: string;
          nameLockedAt: Date | null;
        }>(existingProducts.map((p) => [p.sku, p]));

        for (const row of batch) {
          // Aislamiento por fila con SAVEPOINT: sin esto, un error real de Postgres
          // en UNA fila (ej. una violación de restricción única) deja la transacción
          // completa del lote "abortada" — Postgres rechaza TODAS las consultas
          // siguientes con 25P02 "current transaction is aborted", así que el resto
          // de filas del lote fallan en cascada aunque sus datos sean válidos, y al
          // intentar hacer commit del callback (que no relanzó ninguna excepción),
          // Postgres descarta el lote entero — incluidas filas que ya se habían
          // insertado y se contaban como exitosas. Con SAVEPOINT por fila, un error
          // real solo revierte esa fila; el resto del lote sigue intacto.
          const categoryMapKeysBefore = new Set(categoryMap.keys());
          const brandMapKeysBefore = new Set(brandMap.keys());
          const priceListMapKeysBefore = new Set(priceListMap.keys());

          await tx.$executeRawUnsafe('SAVEPOINT row_sp');

          try {
            // Resolver categoría (siempre retorna un ID — default "Sin categoría" si vacío)
            const categoryResult = await this.resolveCategory(
              tx,
              row.categoryName,
              row.categoryInferredSlug,
              categoryMap,
              batchResult.defaults,
              ctx.sectionDecisions,
            );

            // Resolver marca (siempre retorna un ID — default "Sin marca" si vacío)
            const brandResult = await this.resolveBrand(
              tx,
              row.brandName,
              row.brandInferredSlug,
              brandMap,
              batchResult.defaults,
            );

            const existingProduct = existingSkuMap.get(row.sku);

            if (existingProduct) {
              // UPDATE: producto ya existe.
              // Guard de identidad bloqueada (ADR-002): si el producto tiene
              // nameLockedAt, su identidad fue curada (biblioteca biblioteca /
              // curación manual) y un cargue mensual NO debe sobrescribirla —
              // solo se refrescan los precios y lastSeenAt. Si la fila trae
              // valores de identidad distintos a los almacenados, se cuenta en
              // identityChangesDetected para revisión humana (nunca falla el import).
              const isIdentityLocked = Boolean(existingProduct.nameLockedAt);

              if (isIdentityLocked) {
                // Diff de identidad: comparación exacta (case-sensitive) de
                // name/description e ids resueltos de categoría/marca contra
                // los valores almacenados. El nombre fallback (SKU de relleno)
                // no propone nombre, así que no cuenta como diff; una fila sin
                // descripción tampoco propone cambio de descripción.
                const identityDiff =
                  (!row.nameIsFallback && row.name !== existingProduct.name) ||
                  (row.description !== undefined &&
                    row.description !== existingProduct.description) ||
                  categoryResult.id !== existingProduct.categoryId ||
                  brandResult.id !== existingProduct.brandId;
                if (identityDiff) {
                  batchResult.identityChangesDetected++;
                }

                await tx.product.update({
                  where: { id: existingProduct.id },
                  data: { lastSeenAt: new Date() },
                });
              } else {
                // Producto sin bloqueo: comportamiento previo. `name` solo se
                // sobrescribe si esta fila trae un nombre real (columna nombre
                // o descripción). Si `nameIsFallback` es true (la fila solo
                // traía SKU y precio), se conserva el nombre que el producto
                // ya tenía en catálogo — de lo contrario un cargue mensual sin
                // nombre borraría el nombre real ya guardado.
                await tx.product.update({
                  where: { id: existingProduct.id },
                  data: {
                    ...(row.nameIsFallback ? {} : { name: row.name }),
                    description: row.description ?? undefined,
                    categoryId: categoryResult.id,
                    brandId: brandResult.id,
                    technicalSpecs: (row.technicalSpecs as Prisma.InputJsonValue) ?? Prisma.JsonNull,
                    extraAttributes: (row.extraAttributes as Prisma.InputJsonValue) ?? Prisma.JsonNull,
                    lastSeenAt: new Date(),
                  },
                });
              }

              // Actualizar precios
              if (row.prices.length > 0) {
                await this.upsertPrices(tx, existingProduct.id, row.prices, priceListMap);
              }

              await tx.$executeRawUnsafe('RELEASE SAVEPOINT row_sp');
              batchResult.updated++;
              batchResult.productIds.push(existingProduct.id);
            } else {
              // CREATE: producto nuevo
              const newProduct = await tx.product.create({
                data: {
                  sku: row.sku,
                  name: row.name,
                  description: row.description ?? undefined,
                  categoryId: categoryResult.id,
                  brandId: brandResult.id,
                  listaId,
                  technicalSpecs: (row.technicalSpecs as Prisma.InputJsonValue) ?? Prisma.JsonNull,
                  extraAttributes: (row.extraAttributes as Prisma.InputJsonValue) ?? Prisma.JsonNull,
                  isActive: true,
                  isVisible: defaultVisibility,
                },
              });

              // Crear precios
              if (row.prices.length > 0) {
                await this.upsertPrices(tx, newProduct.id, row.prices, priceListMap);
              }

              await tx.$executeRawUnsafe('RELEASE SAVEPOINT row_sp');
              batchResult.created++;
              batchResult.productIds.push(newProduct.id);
              // Defensa adicional: si una fila posterior del mismo lote resuelve al
              // mismo SKU normalizado (no debería pasar tras el fix de validación,
              // pero evita un segundo choque de restricción única si ocurre), la
              // trata como UPDATE en vez de repetir el CREATE.
              existingSkuMap.set(row.sku, newProduct);
            }
          } catch (error) {
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT row_sp');

            // Revertir entradas de caché añadidas DURANTE esta fila: sus filas en BD
            // se revirtieron con el SAVEPOINT, así que dejar la referencia en memoria
            // causaría un error de llave foránea en una fila posterior que la reuse.
            // Las entradas que ya existían antes de esta fila (de la BD o de una fila
            // anterior ya liberada con RELEASE SAVEPOINT) no se tocan.
            for (const key of categoryMap.keys()) {
              if (!categoryMapKeysBefore.has(key)) categoryMap.delete(key);
            }
            for (const key of brandMap.keys()) {
              if (!brandMapKeysBefore.has(key)) brandMap.delete(key);
            }
            for (const key of priceListMap.keys()) {
              if (!priceListMapKeysBefore.has(key)) priceListMap.delete(key);
            }

            batchResult.errors.push({
              rowIndex: row.rowIndex,
              sku: row.sku,
              error: error.message || 'Error desconocido',
            });
            batchResult.skipped++;
          }
        }

        return batchResult;
      },
      // Margen de seguridad además del batchSize reducido: un lote con filas
      // especialmente pesadas en columnas de precio no debe fallar por unos
      // segundos de más.
      { timeout: 90000 },
    );
  }

  /**
   * Resuelve la Lista destino de la importación.
   * Si viene ctx.listaId, valida su existencia (404 si no existe);
   * si no viene, usa la Lista LISTA-GENERAL (fallback documentado).
   * También expone defaultVisibility para propagarla al producto creado.
   */
  private async resolveLista(
    ctx: ImportContext,
  ): Promise<{ id: string; defaultVisibility: boolean }> {
    if (ctx.listaId) {
      const lista = await this.prisma.lista.findUnique({
        where: { id: ctx.listaId },
        select: { id: true, defaultVisibility: true },
      });
      if (!lista) {
        throw new NotFoundException('Lista no encontrada');
      }
      return lista;
    }

    const defaultLista = await this.prisma.lista.findUnique({
      where: { code: 'LISTA-GENERAL' },
      select: { id: true, defaultVisibility: true },
    });
    if (!defaultLista) {
      throw new NotFoundException('Lista por defecto (LISTA-GENERAL) no encontrada');
    }
    return defaultLista;
  }

  /**
   * Resuelve una categoría por nombre: busca existente o crea nueva.
   * Si el nombre está vacío, retorna la categoría default "Sin categoría".
   *
   * Si viene un slug inferido, solo se usa la categoría EXISTENTE por slug;
   * si no existe, se cae al default y se cuenta como "default por falta de inferencia".
   *
   * Si el contexto trae decisiones de secciones del wizard (sectionDecisions) y el
   * valor fuente de la fila está mapeado:
   * - skip → default "Sin categoría"
   * - create/reuse → find-or-create por targetName (nunca duplica)
   * El valor fuente NO mapeado conserva el comportamiento original.
   */
  private async resolveCategory(
    tx: any,
    name: string,
    inferredSlug: string | undefined,
    categoryMap: Map<string, { id: string; name: string; slug: string }>,
    defaults: { category: number; brand: number },
    sectionDecisions?: SectionDecisionMap,
  ): Promise<{ id: string }> {
    const normalizedName = name?.toLowerCase().trim() ?? '';

    // WIZARD: aplicar decisión de sección si el valor fuente está mapeado.
    // La clave del mapping se normalizó con generateSlug al construir
    // sectionDecisions (import.service) — aquí se compara con la misma normalización.
    if (sectionDecisions && normalizedName) {
      const sourceSlug = generateSlug(name);
      const decision = sourceSlug ? sectionDecisions[sourceSlug] : undefined;

      if (decision) {
        if (decision.action === 'skip') {
          defaults.category++;
          return this.resolveDefaultCategory(tx, categoryMap);
        }
        // create/reuse: find-or-create por targetName (nunca duplicar en BD)
        return this.findOrCreateCategory(tx, decision.targetName ?? name, categoryMap);
      }
    }

    // Inferencia: solo usar categoría existente por slug
    if (inferredSlug) {
      const found = await tx.category.findFirst({ where: { slug: inferredSlug } });
      if (found) return found;
      defaults.category++;
      return this.resolveDefaultCategory(tx, categoryMap);
    }

    // Si no hay nombre, usar default "Sin categoría"
    if (!normalizedName) {
      defaults.category++;
      return this.resolveDefaultCategory(tx, categoryMap);
    }

    const existing = categoryMap.get(normalizedName);
    if (existing) return existing;

    // Crear nueva categoría
    const slug = normalizedName
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const newCategory = await tx.category.create({
      data: {
        name: name.trim(),
        slug,
        isActive: true,
      },
    });

    categoryMap.set(normalizedName, newCategory);
    return newCategory;
  }

  /**
   * Find-or-create de categoría por targetName (decisión del wizard).
   * Busca por nombre (case-insensitive) en el mapa precargado; si no está,
   * cae a búsqueda por slug en BD (cubre variantes de acentos/caso) y solo
   * crea si no existe. La diferencia create/reuse es semántica para el frontend.
   */
  private async findOrCreateCategory(
    tx: any,
    targetName: string,
    categoryMap: Map<string, { id: string; name: string; slug: string }>,
  ): Promise<{ id: string }> {
    const trimmed = targetName?.trim();
    if (!trimmed) {
      return this.resolveDefaultCategory(tx, categoryMap);
    }

    const key = trimmed.toLowerCase();
    const existing = categoryMap.get(key);
    if (existing) return existing;

    const slug = generateSlug(trimmed);
    const foundBySlug = await tx.category.findFirst({ where: { slug } });
    if (foundBySlug) {
      categoryMap.set(foundBySlug.name.toLowerCase(), foundBySlug);
      return foundBySlug;
    }

    const created = await tx.category.create({
      data: { name: trimmed, slug, isActive: true },
    });
    categoryMap.set(key, created);
    return created;
  }

  /**
   * Retorna (creando si hace falta) la categoría default "Sin categoría".
   */
  private async resolveDefaultCategory(
    tx: any,
    categoryMap: Map<string, { id: string; name: string; slug: string }>,
  ): Promise<{ id: string }> {
    const defaultSlug = 'sin-categoria';
    const existing = categoryMap.get('sin categoría');
    if (existing) return existing;

    const found = await tx.category.findFirst({ where: { slug: defaultSlug } });
    if (found) {
      categoryMap.set('sin categoría', found);
      return found;
    }

    const created = await tx.category.create({
      data: { name: 'Sin categoría', slug: defaultSlug, isActive: true },
    });
    categoryMap.set('sin categoría', created);
    return created;
  }

  /**
   * Resuelve una marca por nombre: busca existente o crea nueva.
   * Si el nombre está vacío, retorna la marca default "Sin marca".
   *
   * Si viene un slug inferido, solo se usa la marca EXISTENTE por slug;
   * si no existe, se cae al default y se cuenta como "default por falta de inferencia".
   */
  private async resolveBrand(
    tx: any,
    name: string,
    inferredSlug: string | undefined,
    brandMap: Map<string, { id: string; name: string; slug: string }>,
    defaults: { category: number; brand: number },
  ): Promise<{ id: string }> {
    const normalizedName = name?.toLowerCase().trim() ?? '';

    // Inferencia: solo usar marca existente por slug
    if (inferredSlug) {
      const found = await tx.brand.findFirst({ where: { slug: inferredSlug } });
      if (found) return found;
      defaults.brand++;
      return this.resolveDefaultBrand(tx, brandMap);
    }

    // Si no hay nombre, usar default "Sin marca"
    if (!normalizedName) {
      defaults.brand++;
      return this.resolveDefaultBrand(tx, brandMap);
    }

    const existing = brandMap.get(normalizedName);
    if (existing) return existing;

    const slug = normalizedName
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const newBrand = await tx.brand.create({
      data: {
        name: name.trim(),
        slug,
        isActive: true,
      },
    });

    brandMap.set(normalizedName, newBrand);
    return newBrand;
  }

  /**
   * Retorna (creando si hace falta) la marca default "Sin marca".
   */
  private async resolveDefaultBrand(
    tx: any,
    brandMap: Map<string, { id: string; name: string; slug: string }>,
  ): Promise<{ id: string }> {
    const defaultSlug = 'sin-marca';
    const existing = brandMap.get('sin marca');
    if (existing) return existing;

    const found = await tx.brand.findFirst({ where: { slug: defaultSlug } });
    if (found) {
      brandMap.set('sin marca', found);
      return found;
    }

    const created = await tx.brand.create({
      data: { name: 'Sin marca', slug: defaultSlug, isActive: true },
    });
    brandMap.set('sin marca', created);
    return created;
  }

  /**
   * Upsert de precios para un producto.
   * Crea o actualiza precios en las listas correspondientes.
   */
  private async upsertPrices(
    tx: any,
    productId: string,
    prices: PriceEntry[],
    priceListMap: Map<string, { id: string; code: string; name: string }>,
  ): Promise<void> {
    for (const price of prices) {
      let priceList = priceListMap.get(price.priceListCode);

      // Crear lista de precios si no existe
      if (!priceList) {
        const newPriceList = await tx.priceList.create({
          data: {
            name: price.priceListName,
            code: price.priceListCode,
            currency: price.currency,
            isActive: true,
          },
        });
        priceList = newPriceList;
        priceListMap.set(price.priceListCode, newPriceList);
      }

      // Upsert del precio
      const existingPrice = await tx.price.findUnique({
        where: {
          productId_priceListId: {
            productId,
            priceListId: priceList.id,
          },
        },
      });

      if (existingPrice) {
        await tx.price.update({
          where: { id: existingPrice.id },
          data: { value: price.value },
        });
      } else {
        await tx.price.create({
          data: {
            productId,
            priceListId: priceList.id,
            value: price.value,
            currency: price.currency,
          },
        });
      }
    }
  }

  /**
   * Registra auditoría de la importación completa.
   */
  private async auditImport(
    ctx: ImportContext,
    result: BatchExecutionResult,
  ): Promise<void> {
    try {
      // NUEVO: extraer columnas mapeadas vs skipped vs extra
      const columnsMapped: string[] = [];
      const columnsExtra: string[] = [];
      const columnsSkipped: string[] = [];

      for (const entry of ctx.columnMapping.entries) {
        if (entry.targetField === '__skip') {
          columnsSkipped.push(entry.sourceColumn);
        } else if (entry.targetField === '__extra') {
          columnsExtra.push(entry.sourceColumn);
        } else {
          columnsMapped.push(`${entry.sourceColumn}→${entry.targetField}`);
        }
      }

      await this.auditService.log({
        userId: ctx.userId,
        action: 'IMPORT_PRODUCTS',
        entity: 'Product',
        entityId: ctx.importId,
        newValues: {
          fileName: ctx.fileName,
          totalRows: result.total,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors.length,
          durationMs: result.durationMs,
          defaultsByMissingInference: result.defaultsByMissingInference,
          identityChangesDetected: result.identityChangesDetected,
          columnsMapped,
          columnsExtra,
          columnsSkipped,
        },
      });
    } catch (error) {
      this.logger.warn(`Error al registrar auditoría: ${error.message}`);
    }
  }

  /**
   * Divide un array en chunks del tamaño especificado.
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Delay asíncrono.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
