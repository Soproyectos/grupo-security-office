/**
 * Lógica pura del importador de la biblioteca de vitrina (ADR-002).
 *
 * Toda la lógica de validación/resolución/construcción vive aquí — sin
 * PrismaClient y sin efectos sobre la BD — para que jest (rootDir: src)
 * la pruebe directamente. El CLI operativo es prisma/import-biblioteca.ts.
 *
 * Entrada (read-only): las 764 fichas de biblioteca/*.json con la forma
 * {referencia, nombre_vitrina{valor,origen,razon?}, categoria?{valor},
 * marca?{valor}, descripcion{valor}, imagen?{valor}, estado,
 * fuentes_consultadas}.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  generateSlug,
  truncateProductName,
} from '../modules/products/import/helpers/text-normalizer';

// ---------- Forma de la ficha ----------

export type FichaEstado = 'verificado' | 'parcial' | 'no_encontrado';

const ESTADOS_VALIDOS: FichaEstado[] = ['verificado', 'parcial', 'no_encontrado'];

export interface FichaValorBlock {
  valor?: string;
  origen?: string;
  razon?: string;
}

export interface BibliotecaFicha {
  referencia: string;
  nombre?: FichaValorBlock;
  nombre_vitrina: FichaValorBlock;
  categoria?: FichaValorBlock;
  marca?: FichaValorBlock;
  descripcion?: FichaValorBlock;
  imagen?: FichaValorBlock;
  estado: FichaEstado;
  fuentes_consultadas?: string[];
}

export interface InvalidFicha {
  file: string;
  referencia?: string;
  reason: string;
}

export interface LoadFichasResult {
  valid: BibliotecaFicha[];
  invalid: InvalidFicha[];
}

/** Valida una ficha cruda (JSON ya parseado). Devuelve el motivo si es inválida. */
export function validateFicha(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return 'no es un objeto JSON';
  const f = raw as Record<string, unknown>;
  if (typeof f.referencia !== 'string' || !f.referencia.trim()) {
    return 'falta "referencia" (string no vacío)';
  }
  const vitrina = f.nombre_vitrina as Record<string, unknown> | undefined;
  if (
    !vitrina ||
    typeof vitrina !== 'object' ||
    typeof vitrina.valor !== 'string' ||
    !String(vitrina.valor).trim()
  ) {
    return 'falta "nombre_vitrina.valor" (string no vacío)';
  }
  if (typeof f.estado !== 'string' || !ESTADOS_VALIDOS.includes(f.estado as FichaEstado)) {
    return `"estado" ausente o inválido (debe ser uno de ${ESTADOS_VALIDOS.join('/')})`;
  }
  return null;
}

/** Carga y valida todas las fichas *.json de un directorio (entrada read-only). */
export function loadFichas(dir: string): LoadFichasResult {
  const valid: BibliotecaFicha[] = [];
  const invalid: InvalidFicha[] = [];
  // Los artefactos que este propio flujo escribe en biblioteca/ (reportes,
  // dry-runs, backups) no son fichas: se excluyen para que una re-corrida no
  // los lea como productos inválidos.
  const ARTIFACT_PREFIXES = ['import-dry-run-', 'import-report-', 'backup-identidad-'];
  const files = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.toLowerCase().endsWith('.json') &&
        !ARTIFACT_PREFIXES.some((p) => f.startsWith(p)),
    )
    .sort();
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const reason = validateFicha(raw);
      if (reason) {
        invalid.push({
          file,
          referencia:
            typeof (raw as any)?.referencia === 'string' ? (raw as any).referencia : undefined,
          reason,
        });
      } else {
        valid.push(raw as BibliotecaFicha);
      }
    } catch (e) {
      invalid.push({ file, reason: `JSON ilegible: ${(e as Error).message}` });
    }
  }
  return { valid, invalid };
}

// ---------- Resolución de categorías y marcas ----------

export interface ExistingNamedEntity {
  id: string;
  name: string;
}

export interface NameResolution {
  /** nombre normalizado → id existente */
  matched: Map<string, string>;
  /** nombres (casing original) que no existen y deben crearse */
  toCreate: string[];
  /** id del default ("Sin categoría"/"Sin marca") si ya existe; null si falta crearlo */
  defaultId: string | null;
}

export const DEFAULT_CATEGORY_NAME = 'Sin categoría';
export const DEFAULT_BRAND_NAME = 'Sin marca';

/** Normalización para matching: trim + lowercase + NFD sin acentos. */
export function normalizeNameForMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolveNamed(
  fichas: BibliotecaFicha[],
  getValor: (f: BibliotecaFicha) => string | undefined,
  existing: ExistingNamedEntity[],
  defaultName: string,
): NameResolution {
  const byNorm = new Map<string, string>();
  for (const e of existing) {
    const norm = normalizeNameForMatch(e.name);
    if (norm && !byNorm.has(norm)) byNorm.set(norm, e.id);
  }
  const matched = new Map<string, string>();
  const toCreate: string[] = [];
  const seen = new Set<string>();
  for (const ficha of fichas) {
    const valor = getValor(ficha)?.trim();
    if (!valor) continue; // ausente → default (se asigna al final)
    const norm = normalizeNameForMatch(valor);
    const existingId = byNorm.get(norm);
    if (existingId) {
      if (!matched.has(norm)) matched.set(norm, existingId);
    } else if (!seen.has(norm)) {
      seen.add(norm);
      toCreate.push(valor);
    }
  }
  return {
    matched,
    toCreate,
    defaultId: byNorm.get(normalizeNameForMatch(defaultName)) ?? null,
  };
}

export function resolveCategories(
  fichas: BibliotecaFicha[],
  existingCategories: ExistingNamedEntity[],
): NameResolution {
  return resolveNamed(fichas, (f) => f.categoria?.valor, existingCategories, DEFAULT_CATEGORY_NAME);
}

export function resolveBrands(
  fichas: BibliotecaFicha[],
  existingBrands: ExistingNamedEntity[],
): NameResolution {
  return resolveNamed(fichas, (f) => f.marca?.valor, existingBrands, DEFAULT_BRAND_NAME);
}

/**
 * Id final para una ficha: match existente, creado en esta corrida, o el
 * default. Devuelve null solo si el default no existe ni fue creado.
 */
export function resolveEntityId(
  valor: string | undefined,
  resolution: NameResolution,
  createdIds: Map<string, string>,
): string | null {
  const trimmed = valor?.trim();
  if (trimmed) {
    const norm = normalizeNameForMatch(trimmed);
    const id = resolution.matched.get(norm) ?? createdIds.get(norm);
    if (id) return id;
  }
  return resolution.defaultId;
}

/** Datos de creación de una categoría nueva (slug sin acentos, estilo repo). */
export function toCategoryCreate(name: string): { name: string; slug: string; isActive: boolean } {
  return { name: name.trim(), slug: generateSlug(name), isActive: true };
}

export function toBrandCreate(name: string): { name: string; slug: string; isActive: boolean } {
  return { name: name.trim(), slug: generateSlug(name), isActive: true };
}

// ---------- Match de productos por SKU ----------

export interface MatchedProduct {
  ficha: BibliotecaFicha;
  /** SKU tal como está almacenado en la BD */
  sku: string;
}

export interface MatchResult {
  updates: MatchedProduct[];
  creates: BibliotecaFicha[];
}

/**
 * Match de SKU case-insensitive (uppercase por ambos lados, trim). Las
 * fichas sin match van a creates (conservan su referencia como sku).
 */
export function matchProducts(fichas: BibliotecaFicha[], existingSkus: string[]): MatchResult {
  const byNorm = new Map<string, string>();
  for (const sku of existingSkus) {
    const norm = sku.trim().toUpperCase();
    if (norm && !byNorm.has(norm)) byNorm.set(norm, sku);
  }
  const updates: MatchedProduct[] = [];
  const creates: BibliotecaFicha[] = [];
  for (const ficha of fichas) {
    const sku = byNorm.get(ficha.referencia.trim().toUpperCase());
    if (sku) updates.push({ ficha, sku });
    else creates.push(ficha);
  }
  return { updates, creates };
}

// ---------- Construcción de datos de producto ----------

/** Identidad previa de un producto (backup, idempotencia y merge). */
export interface ExistingProductIdentity {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string;
  brandId: string;
  extraAttributes?: unknown;
  nameLockedAt?: Date | null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge de extraAttributes: preserva TODAS las claves preexistentes
 * (p. ej. márgenes "PLATINO") y solo añade/actualiza las del patch. Un base
 * no-objeto (array/escalar/null) se reemplaza por {} antes del merge.
 */
export function deepMergeExtraAttributes(
  base: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(isPlainObject(base) ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    const prev = result[key];
    result[key] =
      isPlainObject(prev) && isPlainObject(value) ? deepMergeExtraAttributes(prev, value) : value;
  }
  return result;
}

/** Bloque extraAttributes.biblioteca: estado + origen/razón del nombre de vitrina + fuentes. */
export function buildBibliotecaAttributes(ficha: BibliotecaFicha): Record<string, unknown> {
  const biblioteca: Record<string, unknown> = {
    estado: ficha.estado,
    origen: ficha.nombre_vitrina?.origen ?? null,
    fuentes_consultadas: ficha.fuentes_consultadas ?? [],
  };
  if (ficha.nombre_vitrina?.razon) biblioteca.razon = ficha.nombre_vitrina.razon;
  return biblioteca;
}

/** Nombre de vitrina recortado al presupuesto de 70 chars (ADR-002). */
export function fichaVitrinaName(ficha: BibliotecaFicha): string {
  return truncateProductName((ficha.nombre_vitrina?.valor ?? '').trim());
}

/** true cuando el nombre de vitrina original excede 70 chars (se recorta). */
export function isNameTruncated(ficha: BibliotecaFicha): boolean {
  const original = (ficha.nombre_vitrina?.valor ?? '').trim();
  return original.length > fichaVitrinaName(ficha).length;
}

export interface ProductUpdateData {
  name: string;
  description: string | null;
  categoryId: string;
  brandId: string;
  nameSource: string;
  nameLockedAt: Date;
  lastSeenAt: Date;
  extraAttributes: Record<string, unknown>;
}

/**
 * Datos del UPDATE de identidad curada (ADR-002): name=nombre_vitrina (≤70),
 * description, categoría/marca resueltas, nameSource="curado", bloqueo
 * nameLockedAt y lastSeenAt. extraAttributes preserva las claves existentes
 * (PLATINO etc.) y añade el bloque "biblioteca". Nunca toca Price.
 */
export function buildUpdateData(
  ficha: BibliotecaFicha,
  categoryId: string,
  brandId: string,
  now: Date,
  existingExtraAttributes?: unknown,
): ProductUpdateData {
  return {
    name: fichaVitrinaName(ficha),
    description: ficha.descripcion?.valor ?? null,
    categoryId,
    brandId,
    nameSource: 'curado',
    nameLockedAt: now,
    lastSeenAt: now,
    extraAttributes: deepMergeExtraAttributes(existingExtraAttributes, {
      biblioteca: buildBibliotecaAttributes(ficha),
    }),
  };
}

export interface ProductCreateData extends ProductUpdateData {
  sku: string;
  isActive: boolean;
}

/**
 * Datos del CREATE para una referencia nueva: sku=referencia de la ficha tal
 * cual, isActive=false (borrador invisible), misma identidad curada que el
 * update. lifecycleStatus/publishStatus corren por defaults del schema
 * (DRAFT/"borrador"); sin precios ni listaId.
 */
export function buildCreateData(
  ficha: BibliotecaFicha,
  categoryId: string,
  brandId: string,
  now: Date,
): ProductCreateData {
  return {
    sku: ficha.referencia.trim(),
    name: fichaVitrinaName(ficha),
    description: ficha.descripcion?.valor ?? null,
    categoryId,
    brandId,
    extraAttributes: { biblioteca: buildBibliotecaAttributes(ficha) },
    isActive: false,
    nameSource: 'curado',
    nameLockedAt: now,
    lastSeenAt: now,
  };
}

// ---------- Imágenes ----------

export interface ImageRowData {
  url: string;
  type: 'PRINCIPAL';
  isPrimary: boolean;
  alt: string;
}

/**
 * Imagen principal de la ficha (0 o 1 filas): url de imagen.valor, tipo
 * PRINCIPAL, isPrimary=true, alt = nombre de vitrina.
 */
export function buildImageRows(ficha: BibliotecaFicha): ImageRowData[] {
  const url = ficha.imagen?.valor?.trim();
  if (!url) return [];
  return [{ url, type: 'PRINCIPAL', isPrimary: true, alt: fichaVitrinaName(ficha) }];
}

// ---------- Idempotencia ----------

/**
 * Skip idempotente: ya está bloqueado Y el nombre/descripción almacenados
 * coinciden exactamente con lo que la ficha escribiría (una segunda corrida
 * converge a no-op). Una ficha sin descripción no propone cambio de ella.
 */
export function isIdempotentSkip(
  existing: Pick<ExistingProductIdentity, 'name' | 'description' | 'nameLockedAt'>,
  ficha: BibliotecaFicha,
): boolean {
  if (!existing.nameLockedAt) return false;
  if (existing.name !== fichaVitrinaName(ficha)) return false;
  const fichaDesc = ficha.descripcion?.valor ?? null;
  return (existing.description ?? null) === fichaDesc;
}

// ---------- Reporte ----------

export type FichaAction = 'update' | 'create' | 'skip' | 'error';

export interface ReportActionEntry {
  ficha: BibliotecaFicha;
  action: FichaAction;
}

export interface EstadoActionCounts {
  updates: number;
  creates: number;
  skipped: number;
  errors: number;
  total: number;
}

export interface ImportReportData {
  mode: 'dry-run' | 'apply';
  generatedAt: string;
  totals: {
    fichasFiles: number;
    valid: number;
    invalid: number;
    updates: number;
    creates: number;
    skipped: number;
    errors: number;
    images: number;
    namesTruncated: number;
  };
  perEstado: Record<FichaEstado, EstadoActionCounts>;
  categoriesToCreate: string[];
  brandsToCreate: string[];
  categoriesCreated: number;
  brandsCreated: number;
  invalidFichas: InvalidFicha[];
  rowErrors: { sku: string; error: string }[];
}

export interface BuildReportInput {
  mode: 'dry-run' | 'apply';
  now: Date;
  entries: ReportActionEntry[];
  invalid: InvalidFicha[];
  categoriesToCreate: string[];
  brandsToCreate: string[];
  images: number;
  namesTruncated: number;
  categoriesCreated?: number;
  brandsCreated?: number;
  rowErrors?: { sku: string; error: string }[];
}

const emptyEstadoCounts = (): EstadoActionCounts => ({
  updates: 0,
  creates: 0,
  skipped: 0,
  errors: 0,
  total: 0,
});

/**
 * Reporte de importación (dry-run y apply): totales por acción, desglose por
 * estado (verificado/parcial/no_encontrado), categorías/marcas por
 * crear/creadas, imágenes, nombres recortados, fichas inválidas y errores
 * por fila.
 */
export function buildReport(input: BuildReportInput): ImportReportData {
  const perEstado: Record<FichaEstado, EstadoActionCounts> = {
    verificado: emptyEstadoCounts(),
    parcial: emptyEstadoCounts(),
    no_encontrado: emptyEstadoCounts(),
  };
  const totals = { updates: 0, creates: 0, skipped: 0, errors: 0 };
  for (const entry of input.entries) {
    const estadoCounts = perEstado[entry.ficha.estado] ?? emptyEstadoCounts();
    if (!perEstado[entry.ficha.estado]) perEstado[entry.ficha.estado] = estadoCounts;
    estadoCounts.total++;
    switch (entry.action) {
      case 'update':
        totals.updates++;
        estadoCounts.updates++;
        break;
      case 'create':
        totals.creates++;
        estadoCounts.creates++;
        break;
      case 'skip':
        totals.skipped++;
        estadoCounts.skipped++;
        break;
      default:
        totals.errors++;
        estadoCounts.errors++;
        break;
    }
  }
  return {
    mode: input.mode,
    generatedAt: input.now.toISOString(),
    totals: {
      fichasFiles: input.entries.length + input.invalid.length,
      valid: input.entries.length,
      invalid: input.invalid.length,
      updates: totals.updates,
      creates: totals.creates,
      skipped: totals.skipped,
      errors: totals.errors,
      images: input.images,
      namesTruncated: input.namesTruncated,
    },
    perEstado,
    categoriesToCreate: [...input.categoriesToCreate],
    brandsToCreate: [...input.brandsToCreate],
    categoriesCreated: input.categoriesCreated ?? 0,
    brandsCreated: input.brandsCreated ?? 0,
    invalidFichas: [...input.invalid],
    rowErrors: input.rowErrors ? [...input.rowErrors] : [],
  };
}

/** Timestamp de archivo: YYYYMMDD-HHmm (hora local). */
export function formatTimestamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}`
  );
}
