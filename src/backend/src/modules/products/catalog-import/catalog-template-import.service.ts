/**
 * Template-based catalog import: preview -> (optional) mapping decisions -> confirmed apply -> progress / history / results.
 *
 * The heavy lifting is elsewhere: parsing and planning live in ./template (pure), writing lives in
 * CatalogTemplateApplyService (one product per transaction). This service orchestrates and persists in `ImportSession`
 * (no schema change): preview state, one durable record per batch, and the per-product results in small chunks.
 */
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { LibraryAuditService } from '../../library-audit/library-audit.service';
import {
  buildCatalogPlan, buildCatalogTemplate, buildExample, CatalogPlan, CatalogSnapshot, collectSnapshotSkus, isPlanCurrent, LIMITS, ParsedCatalog, parseCatalogTemplate,
  PlanRow, PrismaCatalogSnapshotReader, stableJson, TEMPLATE_VERSION, TemplateDictionary, normalizeSku, textKey,
} from './template';
import { ApplyInput, ApplyOutcome, CatalogTemplateApplyService } from './catalog-template-apply.service';
import { buildResultsFile } from './catalog-template-results';
import {
  APPLY_BATCH_SIZE, APPLY_MAX_RETRIES, BATCH_NAMESPACE, BatchCounts, BatchRecord, BatchResultRow, emptyCounts, MappingIncident, MappingKind, MappingResolution,
  PREVIEW_NAMESPACE, PREVIEW_TTL_MS, PreviewState, RESULT_NAMESPACE, ResultChunk, ResultIssue, ResultStatus,
} from './catalog-template-import.types';

export interface TemplateActor { id: string; name?: string | null; roles?: string[] }
interface Job { input: ApplyInput }

const RESULT_CHUNK = 50;
/** A PROCESSING batch nobody has touched for this long is reported as interrupted (its runner died with the process). */
const INTERRUPTED_AFTER_MS = 10 * 60 * 1000;
const MAPPING_COLUMN: Record<string, { kind: MappingKind; field: 'brand' | 'category' | 'subcategory' }> = {
  MAPPING_BRAND_UNKNOWN: { kind: 'brand', field: 'brand' },
  MAPPING_CATEGORY_UNKNOWN: { kind: 'category', field: 'category' },
  MAPPING_SUBCATEGORY_UNKNOWN: { kind: 'subcategory', field: 'subcategory' },
  MAPPING_SUBCATEGORY_AMBIGUOUS: { kind: 'subcategory', field: 'subcategory' },
};

export function rowDigest(row: PlanRow): string {
  return createHash('sha1').update(stableJson({ a: row.action, c: row.code, id: row.productId ?? null, u: row.productUpdatedAt ?? null, ch: row.changes, pr: row.proposals, pb: row.protectedBy, d: row.desired })).digest('hex');
}

/** Replaces, in a COPY of the parsed file, the texts the person mapped to an existing master by that master's exact name. */
export function applyMappings(parsed: ParsedCatalog, mappings: MappingResolution[], dictionary: TemplateDictionary): ParsedCatalog {
  const chosen = new Map(mappings.filter((m) => m.targetId).map((m) => [`${m.kind}:${textKey(m.sourceText)}`, m.targetId as string]));
  if (!chosen.size) return parsed;
  return {
    ...parsed,
    products: parsed.products.map((p) => {
      const next = { ...p };
      const brand = dictionary.brands.find((b) => b.id === chosen.get(`brand:${textKey(p.brand)}`));
      if (brand) next.brand = brand.name;
      const category = dictionary.categories.find((c) => c.id === chosen.get(`category:${textKey(p.category)}`));
      if (category) next.category = category.name;
      const subcategory = dictionary.subcategories.find((s) => s.id === chosen.get(`subcategory:${textKey(p.subcategory)}`));
      if (subcategory) {
        next.subcategory = subcategory.name;
        // A subcategory the person chose names its own category; a different category written in the file stays and is a conflict.
        if (!next.category) next.category = subcategory.category;
      }
      return next;
    }),
  };
}

const issueOf = (i: { severity: 'error' | 'warning'; code: string; message: string; sheet?: string; row?: number }): ResultIssue => ({ severity: i.severity, code: i.code, message: i.message, sheet: i.sheet, row: i.row });
const unresolvedOf = (row: PlanRow) => row.issues.some((i) => i.code.startsWith('MAPPING_'));

@Injectable()
export class CatalogTemplateImportService {
  private readonly logger = new Logger(CatalogTemplateImportService.name);
  /** Batches being applied by THIS process. */
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly library: BibliotecaPrismaService,
    private readonly applier: CatalogTemplateApplyService,
    private readonly audit: LibraryAuditService,
  ) {}

  private get db(): any { return this.library.client as any; }

  // ------------------------------------------------------------------ template

  async template(): Promise<{ buffer: Buffer; fileName: string }> {
    const dictionary = await new PrismaCatalogSnapshotReader(this.db).readDictionary();
    return { buffer: buildCatalogTemplate(dictionary), fileName: `plantilla-catalogo-${TEMPLATE_VERSION}.xlsx` };
  }

  example(): { buffer: Buffer; fileName: string } {
    return { buffer: buildExample(), fileName: `ejemplo-plantilla-catalogo-${TEMPLATE_VERSION}.xlsx` };
  }

  // ------------------------------------------------------------------ preview

  async preview(file: Buffer | undefined, fileName: string, actor: TemplateActor) {
    if (!file?.length) throw new BadRequestException({ code: 'CATALOG_TEMPLATE_FILE_REQUIRED', message: 'Adjunte el archivo de la plantilla.' });
    if (file.length > LIMITS.maxFileBytes) throw new BadRequestException({ code: 'CATALOG_TEMPLATE_FILE_TOO_LARGE', message: `El archivo supera ${LIMITS.maxFileBytes / (1024 * 1024)} MB.` });
    const parsed = parseCatalogTemplate(file);
    if (parsed.ok === false) {
      throw new BadRequestException({ code: 'CATALOG_TEMPLATE_INVALID', message: 'El archivo no cumple la plantilla. Descargue la plantilla vigente y vuelva a intentar.', feedback: parsed.fatal.map((i) => `${i.code}: ${i.message}`), fatal: parsed.fatal });
    }
    const state: PreviewState = {
      namespace: PREVIEW_NAMESPACE, userId: actor.id, expiresAt: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(), fileName: String(fileName ?? 'plantilla.xlsx').slice(0, 200),
      templateVersion: parsed.catalog.version, parsed: parsed.catalog, mappings: [], planHash: '', rowDigests: {},
    };
    const computed = await this.replan(state);
    this.assertStorable(state);
    const previewId = randomUUID();
    await this.db.importSession.create({ data: { id: previewId, userId: actor.id, data: state as never } });
    return this.view(previewId, state, computed.plan, computed.dictionary);
  }

  async resolveMapping(previewId: string, resolutions: Array<{ kind: MappingKind; sourceText: string; targetId: string | null }>, actor: TemplateActor) {
    const { state } = await this.loadPreview(previewId, actor);
    if (state.batchId) throw new ConflictException({ code: 'CATALOG_TEMPLATE_ALREADY_EXECUTED', message: 'Esta vista previa ya se aplicó; no admite más decisiones.' });
    const dictionary = await new PrismaCatalogSnapshotReader(this.db).readDictionary();
    const exists = (kind: MappingKind, id: string) => (kind === 'brand' ? dictionary.brands.some((b) => b.id === id)
      : kind === 'category' ? dictionary.categories.some((c) => c.id === id) : dictionary.subcategories.some((s) => s.id === id));
    const merged = new Map(state.mappings.map((m) => [`${m.kind}:${textKey(m.sourceText)}`, m]));
    for (const item of resolutions) {
      const key = `${item.kind}:${textKey(item.sourceText)}`;
      if (!textKey(item.sourceText)) throw new BadRequestException({ code: 'MAPPING_SOURCE_REQUIRED', message: 'Indique el texto del archivo que desea asociar.' });
      if (item.targetId === null || item.targetId === undefined) { merged.delete(key); continue; }
      // A mapping only points to an EXISTING master: this import never creates one.
      if (!exists(item.kind, item.targetId)) throw new BadRequestException({ code: 'MAPPING_TARGET_UNKNOWN', message: 'La opción elegida ya no existe en el catálogo. Actualice la lista e intente de nuevo.' });
      merged.set(key, { kind: item.kind, sourceText: item.sourceText.trim(), targetId: item.targetId });
    }
    state.mappings = [...merged.values()];
    state.expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
    const computed = await this.replan(state);
    await this.db.importSession.update({ where: { id: previewId }, data: { data: state as never } });
    return this.view(previewId, state, computed.plan, computed.dictionary);
  }

  /** Dictionary + current products, plan over the file with the mapping decisions applied. Updates plan hash/digests in `state`. */
  private async replan(state: PreviewState): Promise<{ plan: CatalogPlan; dictionary: TemplateDictionary; effective: ParsedCatalog; snapshot: CatalogSnapshot }> {
    const reader = new PrismaCatalogSnapshotReader(this.db);
    const dictionary = await reader.readDictionary();
    const effective = applyMappings(state.parsed, state.mappings, dictionary);
    const found = await reader.readProducts(collectSnapshotSkus(effective));
    const snapshot: CatalogSnapshot = { dictionary, products: found.products, ambiguousSkus: found.ambiguous };
    const plan = buildCatalogPlan(effective, snapshot);
    state.planHash = plan.hash;
    state.rowDigests = Object.fromEntries(plan.rows.map((r) => [r.sku, rowDigest(r)]));
    return { plan, dictionary, effective, snapshot };
  }

  private assertStorable(state: unknown) {
    if (JSON.stringify(state).includes('\\u0000')) throw new BadRequestException({ code: 'CATALOG_TEMPLATE_NULL_CHARACTER', message: 'El archivo contiene un carácter nulo y no se puede procesar. Revise los datos e intente de nuevo.' });
  }

  private view(previewId: string, state: PreviewState, plan: CatalogPlan, dictionary: TemplateDictionary) {
    const item = (r: PlanRow) => ({
      row: r.row, reference: r.reference, sku: r.sku, name: r.name, code: r.code, productId: r.productId ?? null, changes: r.changes, proposals: r.proposals,
      pending: r.pending, protectedBy: r.protectedBy, issues: r.issues, needsConfirmation: r.action === 'create' && unresolvedOf(r),
    });
    const by = (action: PlanRow['action']) => plan.rows.filter((r) => r.action === action).map(item);
    return {
      previewId, fileName: state.fileName, templateVersion: plan.templateVersion, expiresAt: state.expiresAt, planHash: plan.hash,
      summary: { ...plan.summary, needsConfirmation: plan.rows.filter((r) => r.action === 'create' && unresolvedOf(r)).length },
      mastersToCreate: plan.mastersToCreate,
      creates: by('create'), updates: by('update'), proposals: by('proposed'), skipped: by('unchanged'), errors: by('invalid'),
      unassigned: plan.unassigned,
      mappingIncidents: this.incidents(state, plan),
      resolutions: state.mappings,
      options: {
        brands: dictionary.brands,
        categories: dictionary.categories,
        subcategories: dictionary.subcategories.map((s) => ({ id: s.id, name: s.name, categoryId: s.categoryId, category: s.category })),
      },
    };
  }

  private incidents(state: PreviewState, plan: CatalogPlan): MappingIncident[] {
    const source = new Map(state.parsed.products.map((p) => [p.sku, p]));
    const groups = new Map<string, MappingIncident>();
    for (const row of plan.rows) {
      for (const issue of row.issues) {
        const meta = MAPPING_COLUMN[issue.code];
        const product = source.get(row.sku);
        if (!meta || !product) continue;
        const text = product[meta.field];
        const key = `${meta.kind}:${issue.code}:${textKey(text)}`;
        const group = groups.get(key) ?? { kind: meta.kind, code: issue.code, sourceText: text, skus: [] };
        group.skus.push(row.sku);
        groups.set(key, group);
      }
    }
    return [...groups.values()];
  }

  private async loadPreview(previewId: string, actor: TemplateActor, opts: { allowExpired?: boolean } = {}): Promise<{ state: PreviewState }> {
    if (!previewId) throw new BadRequestException({ code: 'CATALOG_TEMPLATE_PREVIEW_REQUIRED', message: 'Falta el identificador de la vista previa.' });
    const session = await this.db.importSession.findUnique({ where: { id: previewId } });
    const state = session?.data as PreviewState | undefined;
    if (!session || state?.namespace !== PREVIEW_NAMESPACE || session.userId !== actor.id) {
      throw new NotFoundException({ code: 'CATALOG_TEMPLATE_PREVIEW_NOT_FOUND', message: 'La vista previa no existe o no pertenece a esta sesión.' });
    }
    if (!opts.allowExpired && new Date(state.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException({ code: 'CATALOG_TEMPLATE_PREVIEW_EXPIRED', message: 'La vista previa venció. Cargue el archivo de nuevo.' });
    }
    return { state };
  }

  // ------------------------------------------------------------------ execute

  /** Confirms a preview: decides every row, records the batch and starts applying it in the background (poll `progress`). */
  async execute(previewId: string, confirmUnresolved: string[] | undefined, actor: TemplateActor) {
    const { state } = await this.loadPreview(previewId, actor, { allowExpired: true });
    if (state.batchId) return this.progress(state.batchId); // idempotent: the same preview is applied once
    if (new Date(state.expiresAt).getTime() < Date.now()) throw new BadRequestException({ code: 'CATALOG_TEMPLATE_PREVIEW_EXPIRED', message: 'La vista previa venció. Cargue el archivo de nuevo.' });

    const { plan, dictionary, effective, snapshot } = await this.replan({ ...state });
    const planIsCurrent = isPlanCurrent(state.planHash, effective, snapshot);
    const confirm = new Set((confirmUnresolved ?? []).map((sku) => normalizeSku(sku)));
    const batchId = randomUUID();
    const sources = new Map(effective.products.map((p) => [p.sku, p]));
    const skuDisplay = new Map<string, string>();
    for (const [sku, product] of snapshot.products) skuDisplay.set(sku, product.sku);
    for (const p of effective.products) if (!skuDisplay.has(p.sku)) skuDisplay.set(p.sku, p.reference.trim());

    const decided: BatchResultRow[] = [];
    const jobs: Job[] = [];
    const base = (r: PlanRow) => ({ row: r.row, reference: r.reference, sku: r.sku, name: r.name, productId: r.productId, applied: [], proposals: r.proposals, pending: r.pending, issues: r.issues.map(issueOf) });
    for (const row of plan.rows) {
      if (row.action === 'invalid') decided.push({ ...base(row), status: 'INVALID', code: row.code });
      else if (row.action === 'unchanged') decided.push({ ...base(row), status: 'UNCHANGED', code: row.code });
      else if (row.action === 'proposed') decided.push({ ...base(row), status: 'PROPOSED', code: row.code });
      else if (!planIsCurrent && state.rowDigests[row.sku] !== rowDigest(row)) {
        decided.push({ ...base(row), status: 'STALE', code: 'PLAN_CHANGED', error: 'El producto cambió después de la vista previa; se omitió. Genere una nueva vista previa.' });
      } else if (row.action === 'create' && unresolvedOf(row) && !confirm.has(row.sku)) {
        decided.push({ ...base(row), status: 'NEEDS_CONFIRMATION', code: 'UNRESOLVED_MAPPING', error: 'La marca o clasificación no existe en el catálogo; confirme la creación sin ella o asócielas antes de aplicar.' });
      } else {
        jobs.push({ input: { batchId, actor: { id: actor.id, name: actor.name ?? null }, row, source: sources.get(row.sku), dictionary, skuDisplay } });
      }
    }

    const counts = emptyCounts();
    for (const r of decided) counts[r.status]++;
    const record: BatchRecord = {
      namespace: BATCH_NAMESPACE, batchId, userId: actor.id, userName: actor.name ?? null, fileName: state.fileName, templateVersion: state.templateVersion, previewId,
      planHash: state.planHash, createdAt: new Date().toISOString(), finishedAt: null, state: 'PROCESSING', total: plan.rows.length, processed: decided.length, counts,
      chunks: 0, confirmUnresolved: [...confirm], unassignedIssues: plan.unassigned.map(issueOf),
    };
    const chunks = Math.ceil(decided.length / RESULT_CHUNK);
    record.chunks = chunks;

    const existing = await this.library.writeTransaction(async (tx) => {
      const db = tx as any;
      await db.$queryRaw`SELECT id FROM import_sessions WHERE id=${previewId} FOR UPDATE`;
      const locked = await db.importSession.findUnique({ where: { id: previewId } });
      const lockedState = locked.data as PreviewState;
      if (lockedState.batchId) return lockedState.batchId;
      await db.importSession.create({ data: { id: batchId, userId: actor.id, data: record as never } });
      for (let i = 0; i < chunks; i++) {
        const chunk: ResultChunk = { namespace: RESULT_NAMESPACE, batchId, index: i, rows: decided.slice(i * RESULT_CHUNK, (i + 1) * RESULT_CHUNK) };
        await db.importSession.create({ data: { id: `${batchId}:r:${i}`, userId: actor.id, data: chunk as never } });
      }
      await db.importSession.update({ where: { id: previewId }, data: { data: { ...lockedState, batchId } as never } });
      await this.audit.append(tx as never, { actor: { id: actor.id, name: actor.name }, action: 'CATALOG_IMPORT_STARTED', entityType: 'CatalogImportBatch', entityId: batchId, summary: { fileName: record.fileName, templateVersion: record.templateVersion, total: record.total, toApply: jobs.length } });
      return null;
    }, { timeout: 60_000 } as never);
    if (existing) return this.progress(existing);

    const runner = this.run(batchId, jobs, chunks, actor).catch((error) => this.logger.error(`Lote ${batchId} falló: ${error?.message}`)).finally(() => this.running.delete(batchId));
    this.running.set(batchId, runner);
    return this.progress(batchId);
  }

  /** Waits for a batch started by this process (used by tests and by shutdown hooks). */
  async waitForBatch(batchId: string): Promise<void> { await this.running.get(batchId); }

  private async run(batchId: string, jobs: Job[], firstChunk: number, actor: TemplateActor): Promise<void> {
    let index = firstChunk;
    try {
      for (let i = 0; i < jobs.length; i += APPLY_BATCH_SIZE) {
        const rows: BatchResultRow[] = [];
        for (const job of jobs.slice(i, i + APPLY_BATCH_SIZE)) rows.push(this.resultOf(job.input.row, await this.applier.applyRow(job.input)));
        await this.persistChunk(batchId, index++, rows, actor);
      }
      await this.finish(batchId, null, actor);
    } catch (error) {
      await this.finish(batchId, (error as Error)?.message ?? 'Error desconocido durante la importación', actor).catch((e) => this.logger.error(`No se pudo cerrar el lote ${batchId}: ${e?.message}`));
    }
  }

  private resultOf(row: PlanRow, outcome: ApplyOutcome): BatchResultRow {
    return {
      row: row.row, reference: row.reference, sku: row.sku, name: row.name, status: outcome.status as ResultStatus, code: outcome.code, productId: outcome.productId ?? row.productId,
      applied: outcome.applied, proposals: row.proposals, pending: row.pending, issues: [...row.issues.map(issueOf), ...outcome.issues], error: outcome.error, attempts: outcome.attempts,
    };
  }

  /** Chunk + counters in ONE transaction, retried: a retry cannot double-count and the chunk id is deterministic. */
  private async persistChunk(batchId: string, index: number, rows: BatchResultRow[], actor: TemplateActor): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.library.writeTransaction(async (tx) => {
          const db = tx as any;
          const id = `${batchId}:r:${index}`;
          const chunk: ResultChunk = { namespace: RESULT_NAMESPACE, batchId, index, rows };
          if (await db.importSession.findUnique({ where: { id }, select: { id: true } })) return; // already persisted by a previous attempt
          await db.importSession.create({ data: { id, userId: actor.id, data: chunk as never } });
          const batch = (await db.importSession.findUnique({ where: { id: batchId } })).data as BatchRecord;
          const counts: BatchCounts = { ...batch.counts };
          for (const r of rows) counts[r.status]++;
          await db.importSession.update({ where: { id: batchId }, data: { data: { ...batch, counts, processed: batch.processed + rows.length, chunks: Math.max(batch.chunks, index + 1) } as never } });
        }, { timeout: 30_000 } as never);
        return;
      } catch (error) {
        if (attempt > APPLY_MAX_RETRIES) throw error;
      }
    }
  }

  private async finish(batchId: string, error: string | null, actor: TemplateActor): Promise<void> {
    await this.library.writeTransaction(async (tx) => {
      const db = tx as any;
      const batch = (await db.importSession.findUnique({ where: { id: batchId } })).data as BatchRecord;
      const bad = batch.counts.FAILED + batch.counts.STALE + batch.counts.INVALID + batch.counts.NEEDS_CONFIRMATION;
      const next: BatchRecord = { ...batch, finishedAt: new Date().toISOString(), state: error ? 'FAILED' : bad > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED', ...(error ? { error } : {}) };
      await db.importSession.update({ where: { id: batchId }, data: { data: next as never } });
      await this.audit.append(tx as never, { actor: { id: actor.id, name: actor.name }, action: 'CATALOG_IMPORT_FINISHED', entityType: 'CatalogImportBatch', entityId: batchId, summary: { state: next.state, counts: next.counts as never } });
    });
  }

  // ------------------------------------------------------------------ progress / history / results

  private async loadBatch(batchId: string): Promise<{ record: BatchRecord; updatedAt: Date }> {
    const session = await this.db.importSession.findUnique({ where: { id: batchId } });
    const record = session?.data as BatchRecord | undefined;
    if (!session || record?.namespace !== BATCH_NAMESPACE) throw new NotFoundException({ code: 'CATALOG_TEMPLATE_BATCH_NOT_FOUND', message: 'No se encontró esta importación.' });
    return { record, updatedAt: session.updatedAt };
  }

  private summaryOf(record: BatchRecord) {
    return {
      batchId: record.batchId, state: record.state, fileName: record.fileName, templateVersion: record.templateVersion, userId: record.userId, userName: record.userName,
      createdAt: record.createdAt, finishedAt: record.finishedAt, total: record.total, processed: record.processed,
      percent: record.total ? Math.min(100, Math.round((record.processed / record.total) * 100)) : 100, counts: record.counts, ...(record.error ? { error: record.error } : {}),
    };
  }

  async progress(batchId: string) {
    let { record, updatedAt } = await this.loadBatch(batchId);
    if (record.state === 'PROCESSING' && !this.running.has(batchId) && updatedAt && Date.now() - new Date(updatedAt).getTime() > INTERRUPTED_AFTER_MS) {
      record = { ...record, state: 'FAILED', finishedAt: new Date().toISOString(), error: 'La importación se interrumpió. Cargue el mismo archivo de nuevo: lo ya aplicado queda sin cambios y se completa el resto.' };
      await this.db.importSession.update({ where: { id: batchId }, data: { data: record as never } });
    }
    return this.summaryOf(record);
  }

  async listBatches(page = 1, pageSize = 20) {
    const take = Math.min(100, Math.max(1, Math.floor(Number(pageSize)) || 20));
    const current = Math.max(1, Math.floor(Number(page)) || 1);
    const where = { data: { path: ['namespace'], equals: BATCH_NAMESPACE } };
    const [rows, total] = await Promise.all([
      this.db.importSession.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (current - 1) * take, take }),
      this.db.importSession.count({ where }),
    ]);
    return { page: current, pageSize: take, total, items: rows.map((r: any) => this.summaryOf(r.data as BatchRecord)) };
  }

  async results(batchId: string): Promise<{ batch: BatchRecord; rows: BatchResultRow[] }> {
    const { record } = await this.loadBatch(batchId);
    const chunks = await this.db.importSession.findMany({ where: { id: { startsWith: `${batchId}:r:` } } });
    const rows = (chunks as any[]).map((c) => c.data as ResultChunk).sort((a, b) => a.index - b.index).flatMap((c) => c.rows).sort((a, b) => a.row - b.row);
    return { batch: record, rows };
  }

  async resultsView(batchId: string) {
    const { batch, rows } = await this.results(batchId);
    return { batch: this.summaryOf(batch), unassigned: batch.unassignedIssues, rows };
  }

  async resultsFile(batchId: string, format: 'xlsx' | 'csv') {
    const { batch, rows } = await this.results(batchId);
    return buildResultsFile(batch, rows, format);
  }
}

