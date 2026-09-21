import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../modules/audit/audit.service';
import { ExcelAdapter } from './sources/excel-adapter';
import { HeaderDetectorService } from './pipeline/header-detector.service';
import { ColumnMapperService } from './pipeline/column-mapper.service';
import { RowValidatorService } from './pipeline/row-validator.service';
import { RowNormalizerService } from './pipeline/row-normalizer.service';
import { BatchExecutorService } from './pipeline/batch-executor.service';
import {
  ImportContext,
  NormalizedRow,
  ValidatedRow,
  IvaMode,
} from './interfaces/import-context';
import { RawRow } from './interfaces/import-source.adapter';
import {
  ImportPreviewResult,
  ImportExecutionResult,
  ImportExecutionAck,
  ImportProgressResult,
  CurrentPriceResult,
  ValidationRowError,
} from './interfaces/import-result';
import {
  ColumnMapping,
  MappingPreset,
  SystemField,
} from './interfaces/column-mapping';
import { ColumnMappingDto, SectionDecisionDto } from './dto/preview-import.dto';
import { generateSlug } from './helpers/text-normalizer';

/**
 * Servicio orquestador del pipeline de importación.
 *
 * Coordina todas las etapas del pipeline:
 * Parse → Header Detection → Column Mapping → Validation → Normalization → Execution
 *
 * Expone dos modos de uso:
 * - Preview (dry-run): analiza el archivo sin modificar la BD
 * - Execute (commit): ejecuta la importación real con transacciones
 *
 * También gestiona presets de mapping y progreso de importación.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private excelAdapter: ExcelAdapter,
    private headerDetector: HeaderDetectorService,
    private columnMapper: ColumnMapperService,
    private rowValidator: RowValidatorService,
    private rowNormalizer: RowNormalizerService,
    private batchExecutor: BatchExecutorService,
  ) {}

  /**
   * FASE 1: Preview — Analiza el archivo y retorna lo que se importaría.
   * No modifica la base de datos.
   */
  async preview(
    file: Buffer,
    fileName: string,
    userId: string,
    dto?: {
      headerRowIndex?: number;
      columnMappings?: ColumnMappingDto[];
      presetId?: string;
      listaId?: string;
    },
  ): Promise<ImportPreviewResult> {
    const importId = randomUUID();

    // 1. Parsear archivo
    const parseResult = this.excelAdapter.parse(file, fileName);

    // 2. Detectar headers
    const headerRowIndex = dto?.headerRowIndex ?? 0;
    const detection = this.headerDetector.detect(
      parseResult.headers,
      parseResult.rows.slice(0, 5),
      { headerRowIndex },
    );

    // 3. Determinar mapping
    let columnMapping: ColumnMapping;

    if (dto?.columnMappings && dto.columnMappings.length > 0) {
      // Mapping manual del usuario
      columnMapping = this.columnMapper.confirmMapping(
        this.columnMapper.createFromDetection(detection),
        dto.columnMappings.map((m) => ({
          sourceColumn: m.sourceColumn,
          targetField: m.targetField as SystemField,
        })),
      );
    } else if (dto?.presetId) {
      // Aplicar preset guardado
      const preset = await this.getPreset(dto.presetId);
      if (!preset) {
        throw new BadRequestException('Preset de mapping no encontrado');
      }
      const presetMapping = this.columnMapper.applyPreset(
        preset,
        parseResult.headers,
      );
      if (!presetMapping) {
        throw new BadRequestException(
          'El preset no es compatible con este archivo. Las columnas del preset no se encuentran en el archivo.',
        );
      }
      columnMapping = presetMapping;
    } else {
      // Auto-mapping
      columnMapping = this.columnMapper.createFromDetection(detection);
    }

    // 4. El mapping puede estar incompleto aquí — el frontend muestra
    //    el paso de mapping para que el usuario ajuste antes de execute.
    //    La validación completa se hace en execute().

    // 5. Validar filas (solo si el mapping tiene los campos básicos)
    const validatedRows = parseResult.rows.map((raw, index) => ({
      rowIndex: index,
      rawData: raw,
      isValid: true,
      errors: [],
      warnings: [],
    }));

    const ctx: ImportContext = {
      importId,
      userId,
      fileName,
      fileSize: parseResult.fileSize,
      rawRows: parseResult.rows,
      headers: parseResult.headers,
      columnMapping,
      ivaMode: (dto?.columnMappings ? 'mixed' : 'with_iva') as IvaMode,
      listaId: dto?.listaId,
      validatedRows,
      normalizedRows: [],
      pipelineErrors: [],
      startedAt: new Date(),
      currentStage: 'validation',
    };

    const validated = this.rowValidator.validateAll(ctx);
    ctx.validatedRows = validated;

    // 6. Normalizar (para detectar updates vs creates)
    const normalized = this.rowNormalizer.normalizeAll(ctx);
    ctx.normalizedRows = normalized;

    // 6b. Resolver existencia de SKUs en DB para preview correcto
    await this.resolveExistingProductFlags(normalized);

    // Guardar contexto para la fase de ejecución. Se persiste en BD (no en un
    // Map en memoria del proceso): si Hostinger enruta el próximo `execute` a
    // otra instancia, o el proceso se reinicia entre medio, el contexto debe
    // seguir disponible — antes se perdía y el usuario recibía "Importación
    // no encontrada" sin causa visible ni relación con sus datos.
    await this.saveContext(ctx);

    // 7. Construir resultado de preview
    const toCreate = normalized.filter((n) => !n.isUpdate).length;
    const toUpdate = normalized.filter((n) => n.isUpdate).length;
    const skipped = validated.filter((r) => !r.isValid).length;

    const validationErrors: ValidationRowError[] = validated
      .filter((r) => !r.isValid)
      .map((r) => ({
        rowIndex: r.rowIndex,
        excelRow: r.rowIndex + 2,
        sku: this.extractSku(r, columnMapping),
        errors: r.errors.map((e) => ({
          field: e.field,
          code: e.code,
          message: e.message,
        })),
      }));

    return {
      importId,
      totalRows: parseResult.totalRows,
      validRows: normalized.length,
      invalidRows: skipped,
      breakdown: { toCreate, toUpdate, skipped },
      validationErrors,
      warnings: [],
      columnMapping: Object.fromEntries(
        columnMapping.entries.map((e) => [e.sourceColumn, e.targetField]),
      ),
      detectedHeaders: detection.headers,
      distinctValuesByColumn: this.computeDistinctValues(parseResult.rows, parseResult.headers),
      completedStage: 'validation',
    };
  }

  /**
   * FASE 2: Execute — Valida y arranca la importación real en segundo plano.
   * Modifica la base de datos dentro de transacciones.
   *
   * SEC-IMPORT-002: no espera a que el batch termine. Antes, esta llamada
   * mantenía la petición HTTP abierta hasta procesar TODAS las filas — con
   * archivos de varias listas de precio por producto (más idas y vueltas por
   * fila a la BD remota), el total podía superar el límite de una sola
   * petición HTTP y la conexión se cerraba a la fuerza a medio proceso,
   * perdiendo el resultado aunque el archivo fuera válido (confirmado con
   * LISTA HIKVISION TURBO GRUPO.xlsx: preview 211/211 válidas, execute
   * síncrono cortado por conexión reiniciada). Ahora valida y re-normaliza
   * (rápido, en memoria) y devuelve de inmediato; el batch corre aparte y el
   * cliente sondea `getProgress` hasta ver el resultado final.
   */
  async execute(
    importId: string,
    dto: {
      columnMappings: ColumnMappingDto[];
      ivaMode?: IvaMode;
      headerRowIndex?: number;
      presetName?: string;
      listaId?: string;
      sections?: SectionDecisionDto[];
      fixedValues?: Partial<Record<SystemField, string>>;
    },
    userId: string,
  ): Promise<ImportExecutionAck> {
    const ctx = await this.loadContext(importId);
    if (!ctx) {
      throw new BadRequestException(
        'Importación no encontrada. Ejecute primero el endpoint de preview.',
      );
    }

    // Actualizar IVA mode si se especificó
    if (dto.ivaMode) {
      ctx.ivaMode = dto.ivaMode;
    }

    // Lista destino: si se envía en execute, reemplaza la del preview;
    // si no se envía, se conserva la del preview (o cae a LISTA-GENERAL en batch).
    if (dto.listaId !== undefined) {
      ctx.listaId = dto.listaId;
    }

    // Valores fijos por campo: se aplican a todas las filas durante la
    // re-normalización (columna mapeada no vacía > fixedValue > inferencia).
    if (dto.fixedValues !== undefined) {
      ctx.fixedValues = dto.fixedValues;
    }

    // Decisiones de secciones del wizard: mapear sourceValue normalizado → decisión.
    // La clave se normaliza con generateSlug para comparar de forma consistente
    // con resolveCategory en batch execution.
    if (dto.sections && dto.sections.length > 0) {
      const decisions: NonNullable<ImportContext['sectionDecisions']> = {};
      for (const section of dto.sections) {
        const key = generateSlug(section.sourceValue);
        if (key) {
          decisions[key] = { targetName: section.targetName, action: section.action };
        }
      }
      ctx.sectionDecisions = decisions;
    }

    // Actualizar mapping si se proporcionó uno nuevo
    if (dto.columnMappings && dto.columnMappings.length > 0) {
      ctx.columnMapping = this.columnMapper.confirmMapping(
        ctx.columnMapping,
        dto.columnMappings.map((m) => ({
          sourceColumn: m.sourceColumn,
          targetField: m.targetField as SystemField,
        })),
      );
    }

    // Validar que el mapping tenga los campos requeridos ANTES de ejecutar
    const missingFields = this.columnMapper.validateMapping(ctx.columnMapping);
    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Mapping incompleto. Campos requeridos faltantes: ${missingFields.join(', ')}. ` +
        `Use el endpoint de preview para ver los headers disponibles y ajuste el mapeo.`,
      );
    }

    // Re-validar filas con el mapping confirmado
    const validatedRows = ctx.rawRows.map((raw, index) => ({
      rowIndex: index,
      rawData: raw,
      isValid: true,
      errors: [],
      warnings: [],
    }));
    ctx.validatedRows = validatedRows;
    const revalidated = this.rowValidator.validateAll(ctx);
    ctx.validatedRows = revalidated;

    // Re-normalizar con el mapping actualizado
    const renormalized = this.rowNormalizer.normalizeAll(ctx);
    ctx.normalizedRows = renormalized;

    // Resolver existencia de SKUs en DB
    await this.resolveExistingProductFlags(renormalized);

    ctx.currentStage = 'batch_execution';
    ctx.userId = userId;
    // Refleja la etapa en BD para que getProgress() sea preciso si se consulta
    // mientras el batch corre (execute puede tardar varios minutos en archivos
    // grandes con muchas listas de precio por fila).
    await this.saveContext(ctx);

    // Arranca el batch sin esperarlo: la petición HTTP ya no lo necesita, y
    // seguirá corriendo aunque el cliente se desconecte (el proceso de Node
    // sigue vivo). Cualquier fallo se captura dentro — nunca debe salir como
    // una promesa rechazada sin manejar.
    void this.runBatchInBackground(importId, ctx, dto.presetName, userId);

    return {
      importId,
      status: 'processing',
      message: `Importación iniciada (${ctx.normalizedRows.length} filas). Consulte el progreso con importId.`,
    };
  }

  /**
   * Ejecuta el batch y persiste el resultado (éxito o fallo) para que
   * `getProgress` lo entregue en el siguiente sondeo. No se llama con
   * `await` desde `execute` — corre en segundo plano.
   */
  private async runBatchInBackground(
    importId: string,
    ctx: ImportContext,
    presetName: string | undefined,
    userId: string,
  ): Promise<void> {
    try {
      const result = await this.batchExecutor.execute(ctx.normalizedRows, ctx);

      ctx.executionResult = result;
      ctx.completedAt = new Date().toISOString();

      if (presetName) {
        await this.savePreset(ctx.columnMapping, presetName, userId);
      }

      await this.saveContext(ctx);
    } catch (error) {
      // Excepción no controlada del batch (no un error por fila — esos ya
      // vienen dentro de `result.errors` y no llegan aquí). Se persiste como
      // fallo en vez de dejar la importación sondeando para siempre.
      this.logger.error(`Batch de importación ${importId} falló: ${error?.message}`, error?.stack);
      ctx.executionError = error?.message || 'Error desconocido durante la importación';
      ctx.completedAt = new Date().toISOString();
      await this.saveContext(ctx).catch((saveError) =>
        this.logger.error(`No se pudo persistir el fallo de ${importId}: ${saveError?.message}`),
      );
    }
  }

  /**
   * Obtiene el progreso de una importación activa, o el resultado final si
   * el batch en segundo plano ya terminó (`executionResult`/`executionError`
   * en el contexto — ver `runBatchInBackground`). El contexto NO se borra al
   * completarse: si se borrara en el primer sondeo que lo ve, un segundo
   * sondeo (o una recarga de pantalla) perdería el resultado detallado.
   */
  async getProgress(importId: string): Promise<ImportProgressResult> {
    const ctx = await this.loadContext(importId);

    if (!ctx) {
      return {
        importId,
        status: 'completed',
        progress: 100,
        currentStage: 'batch_execution',
        message: 'Importación completada',
      };
    }

    if (ctx.executionResult) {
      const result = ctx.executionResult;
      return {
        importId,
        status: 'completed',
        progress: 100,
        currentStage: 'batch_execution',
        message: 'Importación completada',
        result: {
          importId,
          summary: {
            total: result.total,
            created: result.created,
            updated: result.updated,
            skipped: result.skipped,
            errors: result.errors.length,
            defaultsByMissingInference: result.defaultsByMissingInference ?? { category: 0, brand: 0 },
          },
          executionErrors: result.errors,
          durationMs: result.durationMs,
          completedAt: ctx.completedAt ?? new Date().toISOString(),
        },
      };
    }

    if (ctx.executionError) {
      return {
        importId,
        status: 'failed',
        progress: 100,
        currentStage: 'batch_execution',
        message: ctx.executionError,
      };
    }

    const progress = this.calculateProgress(ctx);

    return {
      importId,
      status: 'processing',
      progress,
      currentStage: ctx.currentStage,
      message: this.getStageMessage(ctx.currentStage),
    };
  }

  // === Presets de Mapping ===

  /**
   * Precio vigente por SKU para el wizard de importación.
   *
   * 1. Busca el producto por SKU exacto (case-insensitive) dentro de la lista
   *    destino (listaId opcional; si no viene, toma el primero que encuentre).
   * 2. Si no existe producto → `{ data: null }`.
   * 3. Si existe producto → precio vigente con el mismo criterio de vigencia que
   *    prices.service (`validFrom <= hoy <= validUntil`, límites abiertos con
   *    null); si hay múltiples, el más reciente (orderBy updatedAt desc).
   * 4. Sin precio vigente → `{ data: { ...producto, exists: false } }`.
   */
  async getCurrentPriceBySku(
    sku: string,
    listaId?: string,
  ): Promise<{ data: CurrentPriceResult | null }> {
    const skuTrimmed = sku?.trim();
    if (!skuTrimmed) return { data: null };

    const products = await this.prisma.product.findMany({
      where: {
        sku: { equals: skuTrimmed, mode: 'insensitive' },
        ...(listaId ? { listaId } : {}),
      },
      select: { id: true, sku: true, name: true },
      take: 1,
    });

    const product = products[0];
    if (!product) return { data: null };

    // Precios del producto: primero filtrados por la lista destino (listaId).
    // Los precios importados viven con `listaId: null` y se vinculan vía
    // `priceListId` (PriceList no tiene relación FK con Lista, así que no es
    // trazable a una lista concreta sin migración). Si no hay ningún precio con
    // el listaId de la lista, se hace fallback al precio vigente global del
    // producto (sin filtro de listaId) para que el wizard compare "precio
    // actual" aunque el precio se importó sin listaId.
    let prices = await this.prisma.price.findMany({
      where: {
        productId: product.id,
        ...(listaId ? { listaId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (listaId && prices.length === 0) {
      prices = await this.prisma.price.findMany({
        where: { productId: product.id },
        orderBy: { updatedAt: 'desc' },
      });
    }

    const now = new Date();
    const vigentes = prices.filter(
      (p) =>
        (!p.validFrom || p.validFrom <= now) &&
        (!p.validUntil || p.validUntil >= now),
    );
    // "Más reciente": el vigente con updatedAt más nuevo (determinista).
    const vigente = vigentes.reduce<typeof prices[number] | null>(
      (best, p) =>
        !best || (p.updatedAt?.getTime() ?? 0) >= (best.updatedAt?.getTime() ?? 0)
          ? p
          : best,
      null,
    );

    if (!vigente) {
      return {
        data: {
          sku: product.sku,
          productId: product.id,
          name: product.name,
          price: null,
          currency: null,
          validUntil: null,
          exists: false,
        },
      };
    }

    return {
      data: {
        sku: product.sku,
        productId: product.id,
        name: product.name,
        price: Number(vigente.value),
        currency: vigente.currency,
        validUntil: vigente.validUntil ?? null,
        exists: true,
      },
    };
  }

  /**
   * Versión agrupada de `getCurrentPriceBySku`: resuelve N SKUs en 2 queries
   * (productos + precios) en vez de N round-trips. El wizard de importación
   * (paso de comparación de precios) llamaba al endpoint individual una vez
   * por SKU vía Promise.all — con listas de más de ~20 filas (el límite del
   * throttler global) esto disparaba 429 en cascada y tumbaba el paso
   * siguiente (execute) por agotar la cuota de rate-limit de la sesión.
   * Devuelve un array alineado 1:1 con el array de `skus` de entrada
   * (mismo orden, `null` en la posición de cualquier SKU sin producto).
   */
  async getCurrentPricesBySkus(
    skus: string[],
    listaId?: string,
  ): Promise<{ data: (CurrentPriceResult | null)[] }> {
    const trimmedSkus = skus.map((s) => s?.trim()).filter((s): s is string => !!s);
    if (trimmedSkus.length === 0) return { data: [] };

    const products = await this.prisma.product.findMany({
      where: {
        OR: trimmedSkus.map((sku) => ({ sku: { equals: sku, mode: 'insensitive' as const } })),
        ...(listaId ? { listaId } : {}),
      },
      select: { id: true, sku: true, name: true },
    });

    const productBySkuUpper = new Map(products.map((p) => [p.sku.toUpperCase(), p]));
    const productIds = products.map((p) => p.id);

    const allPrices = productIds.length
      ? await this.prisma.price.findMany({
          where: { productId: { in: productIds } },
          orderBy: { updatedAt: 'desc' },
        })
      : [];

    const pricesByProductId = new Map<string, typeof allPrices>();
    for (const price of allPrices) {
      const list = pricesByProductId.get(price.productId) ?? [];
      list.push(price);
      pricesByProductId.set(price.productId, list);
    }

    const now = new Date();
    const resolveVigente = (product: {
      id: string;
      sku: string;
      name: string;
    }): CurrentPriceResult => {
      // Mismo fallback que la versión individual: si no hay precios con
      // listaId, usar el precio vigente global del producto.
      let prices = pricesByProductId.get(product.id) ?? [];
      if (listaId) {
        const scoped = prices.filter((p) => p.listaId === listaId);
        if (scoped.length > 0) prices = scoped;
      }

      const vigentes = prices.filter(
        (p) =>
          (!p.validFrom || p.validFrom <= now) &&
          (!p.validUntil || p.validUntil >= now),
      );
      const vigente = vigentes.reduce<(typeof prices)[number] | null>(
        (best, p) =>
          !best || (p.updatedAt?.getTime() ?? 0) >= (best.updatedAt?.getTime() ?? 0)
            ? p
            : best,
        null,
      );

      if (!vigente) {
        return {
          sku: product.sku,
          productId: product.id,
          name: product.name,
          price: null,
          currency: null,
          validUntil: null,
          exists: false,
        };
      }

      return {
        sku: product.sku,
        productId: product.id,
        name: product.name,
        price: Number(vigente.value),
        currency: vigente.currency,
        validUntil: vigente.validUntil ?? null,
        exists: true,
      };
    };

    const data = trimmedSkus.map((sku) => {
      const product = productBySkuUpper.get(sku.toUpperCase());
      return product ? resolveVigente(product) : null;
    });

    return { data };
  }

  /**
   * Lista todos los presets del usuario.
   */
  async listPresets(userId: string): Promise<MappingPreset[]> {
    const presets = await this.prisma.importMapping.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return presets.map((p) => ({
      id: p.id,
      name: p.name,
      mappings: p.mappings as Array<{ sourceColumn: string; targetField: SystemField }>,
      userId: p.userId,
      createdAt: p.createdAt.toISOString(),
      isDefault: p.isDefault,
    }));
  }

  /**
   * Obtiene un preset por ID.
   */
  async getPreset(presetId: string): Promise<MappingPreset | null> {
    const preset = await this.prisma.importMapping.findUnique({
      where: { id: presetId },
    });

    if (!preset) return null;

    return {
      id: preset.id,
      name: preset.name,
      mappings: preset.mappings as Array<{ sourceColumn: string; targetField: SystemField }>,
      userId: preset.userId,
      createdAt: preset.createdAt.toISOString(),
      isDefault: preset.isDefault,
    };
  }

  /**
   * Guarda un nuevo preset de mapping.
   *
   * Normaliza la entrada antes de persistir:
   * - Array plano `[{ sourceColumn, targetField }]` (lo que envía la UI:
   *   MappingPresetManager, ImportStepConfirm, ListaDetailPage) → se convierte
   *   al formato interno `{ entries: [...], confirmed: true }`.
   * - Formato interno `{ entries, confirmed }` (lo que usa execute() al guardar
   *   el mapping del contexto) → se conserva tal cual.
   * El formato de LECTURA no cambia: GET devuelve `mappings: [{sourceColumn, targetField}]`
   * (el contrato que el frontend ya parsea al cargar presets).
   */
  async savePreset(
    mapping: ColumnMapping | Array<{ sourceColumn: string; targetField: SystemField }>,
    name: string,
    userId: string,
    isDefault = false,
  ): Promise<MappingPreset> {
    const presetData = this.columnMapper.toPreset(
      this.normalizeMappingForPreset(mapping),
      name,
      userId,
      isDefault,
    );

    const preset = await this.prisma.importMapping.create({
      data: {
        name: presetData.name,
        mappings: presetData.mappings as any,
        userId: presetData.userId,
        isDefault: presetData.isDefault,
      },
    });

    return {
      id: preset.id,
      name: preset.name,
      mappings: preset.mappings as Array<{ sourceColumn: string; targetField: SystemField }>,
      userId: preset.userId,
      createdAt: preset.createdAt.toISOString(),
      isDefault: preset.isDefault,
    };
  }

  /**
   * Elimina un preset.
   */
  async deletePreset(presetId: string, userId: string): Promise<void> {
    const preset = await this.prisma.importMapping.findUnique({
      where: { id: presetId },
    });

    if (!preset || preset.userId !== userId) {
      throw new BadRequestException('Preset no encontrado');
    }

    await this.prisma.importMapping.delete({ where: { id: presetId } });
  }

  // === Helpers privados ===

  /**
   * Persiste el ImportContext en `import_sessions` (upsert por importId).
   * `startedAt` se serializa a ISO string explícitamente porque `Json` de
   * Prisma no reconstruye instancias de `Date` — `loadContext` la revierte.
   */
  private async saveContext(ctx: ImportContext): Promise<void> {
    const serializable = {
      ...ctx,
      startedAt: ctx.startedAt.toISOString(),
    };

    await this.prisma.importSession.upsert({
      where: { id: ctx.importId },
      update: { data: serializable as unknown as Prisma.InputJsonValue },
      create: {
        id: ctx.importId,
        userId: ctx.userId,
        data: serializable as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Recupera un ImportContext previamente guardado con `saveContext`.
   * Retorna `null` si no existe (importId inválido, ya ejecutado, o expirado).
   */
  private async loadContext(importId: string): Promise<ImportContext | null> {
    const session = await this.prisma.importSession.findUnique({
      where: { id: importId },
    });
    if (!session) return null;

    const data = session.data as unknown as ImportContext & { startedAt: string };
    return { ...data, startedAt: new Date(data.startedAt) };
  }

  /**
   * Elimina el contexto persistido tras completar `execute()`.
   */
  private async deleteContext(importId: string): Promise<void> {
    await this.prisma.importSession.deleteMany({ where: { id: importId } });
  }

  /**
   * Normaliza un mapping recibido al formato interno `ColumnMapping`.
   * Soporta el array plano `[{ sourceColumn, targetField }]` que envía la UI
   * y el formato interno `{ entries, confirmed }` que usa el pipeline.
   */
  private normalizeMappingForPreset(
    mapping: ColumnMapping | Array<{ sourceColumn: string; targetField: SystemField }>,
  ): ColumnMapping {
    if (Array.isArray(mapping)) {
      return {
        entries: mapping.map((m) => ({
          sourceColumn: m.sourceColumn,
          targetField: m.targetField,
          isRequired: ['sku', 'name'].includes(m.targetField),
          confidence: 1.0,
        })),
        confirmed: true,
      };
    }
    return mapping;
  }

  /**
   * Resuelve isUpdate y existingProductId en filas normalizadas
   * consultando la DB por SKUs existentes.
   */
  private async resolveExistingProductFlags(rows: NormalizedRow[]): Promise<void> {
    const skus = rows.map((r) => r.sku);
    if (skus.length === 0) return;

    const existingProducts = await this.prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true },
    });

    const skuToId = new Map(existingProducts.map((p) => [p.sku, p.id]));

    for (const row of rows) {
      const existingId = skuToId.get(row.sku);
      if (existingId) {
        row.isUpdate = true;
        row.existingProductId = existingId;
      }
    }
  }

  private extractSku(validatedRow: ValidatedRow, mapping: ColumnMapping): string {
    const skuEntry = mapping.entries.find((e) => e.targetField === 'sku');
    if (!skuEntry) return 'N/A';
    const val = validatedRow.rawData[skuEntry.sourceColumn];
    return val ? String(val).trim() : 'N/A';
  }

  /**
   * Valores únicos por columna (top 50 por frecuencia desc) para que el wizard
   * detecte las secciones/categorías que trae el archivo. Excluye celdas vacías.
   */
  private computeDistinctValues(
    rows: RawRow[],
    headers: string[],
  ): Record<string, Array<{ value: string; count: number }>> {
    const out: Record<string, Array<{ value: string; count: number }>> = {};

    for (const header of headers) {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const raw = row[header];
        if (raw === null || raw === undefined) continue;
        const value = String(raw).trim();
        if (!value) continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      out[header] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, 50);
    }

    return out;
  }

  private calculateProgress(ctx: ImportContext): number {
    const stageWeights: Record<string, number> = {
      parse: 10,
      header_detection: 20,
      column_mapping: 30,
      validation: 50,
      normalization: 70,
      batch_execution: 90,
    };

    return stageWeights[ctx.currentStage] ?? 0;
  }

  private getStageMessage(stage: string): string {
    const messages: Record<string, string> = {
      parse: 'Parseando archivo...',
      header_detection: 'Detectando columnas...',
      column_mapping: 'Mapeando columnas...',
      validation: 'Validando datos...',
      normalization: 'Normalizando datos...',
      batch_execution: 'Ejecutando importación...',
    };

    return messages[stage] ?? 'Procesando...';
  }
}
