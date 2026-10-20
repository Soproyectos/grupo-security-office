/**
 * Funciones puras del catálogo público: recorren el árbol de categorías y
 * sanean los campos JSON de `Product` (`technicalSpecs`, `documents`) que se
 * escriben desde el panel y por tanto no son de fiar. Solo devuelven campos
 * aptos para un visitante anónimo.
 */

export interface CategoryNode {
  id: string;
  name?: string;
  slug: string;
  parentId: string | null;
  isActive?: boolean;
}

export interface PublicCategoryRef {
  name: string;
  slug: string;
}

export interface PublicTechnicalSpec {
  key: string;
  value: string;
  unit: string | null;
}

export interface PublicDatasheet {
  name: string;
  url: string;
}

/**
 * Ids de la categoría con el slug dado y de todas sus descendientes activas.
 * Slug desconocido o categoría inactiva → `[]`. Una categoría inactiva oculta
 * también su subárbol (igual que el menú público). Es seguro ante ciclos.
 */
export function collectCategoryIds(categories: CategoryNode[], slug: string): string[] {
  const root = categories.find((category) => category.slug === slug);
  if (!root || root.isActive === false) return [];

  const childrenOf = new Map<string, CategoryNode[]>();
  for (const category of categories) {
    if (category.parentId === null) continue;
    const siblings = childrenOf.get(category.parentId) ?? [];
    siblings.push(category);
    childrenOf.set(category.parentId, siblings);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const pending: CategoryNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    ids.push(node.id);
    for (const child of childrenOf.get(node.id) ?? []) {
      if (child.isActive !== false) pending.push(child);
    }
  }
  return ids;
}

/**
 * Ancestros de una categoría, raíz primero, SIN incluir la categoría misma.
 * Vacío para una categoría raíz. Es seguro ante ciclos.
 */
export function buildBreadcrumb(categories: CategoryNode[], parentId: string | null): PublicCategoryRef[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const chain: PublicCategoryRef[] = [];
  const seen = new Set<string>();

  let cursor = parentId;
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    const ancestor = byId.get(cursor);
    if (!ancestor) break;
    chain.unshift({ name: ancestor.name ?? ancestor.slug, slug: ancestor.slug });
    cursor = ancestor.parentId;
  }
  return chain;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, max);
}

/** Valor de una especificación como texto; `null` si está vacío o no es presentable. */
function formatSpecValue(value: unknown): string | null {
  if (typeof value === 'string') return cleanString(value, 500);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => (typeof item === 'string' || typeof item === 'number' ? formatSpecValue(item) : null))
      .filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  return null;
}

/**
 * `Product.technicalSpecs` guarda `{ key, type, unit, options, required, value }`.
 * El público solo ve `{ key, value, unit }` y solo de las entradas con valor:
 * `type`, `options`, `required` y cualquier otro campo se descartan.
 */
export function sanitizeTechnicalSpecs(raw: unknown): PublicTechnicalSpec[] {
  if (!Array.isArray(raw)) return [];

  const specs: PublicTechnicalSpec[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const key = cleanString(entry.key, 120);
    const value = formatSpecValue(entry.value);
    if (key === null || value === null) continue;
    specs.push({ key, value, unit: cleanString(entry.unit, 30) });
  }
  return specs;
}

const stripAccents = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const DATASHEET_HINT =
  /ficha[\s_-]*tecnica|data[\s_-]*sheet|hoja[\s_-]*de[\s_-]*datos|technical[\s_-]*(data[\s_-]*)?sheet|spec[\s_-]*sheet/;

/** Solo `http(s)://` o rutas del sitio (`/x`); nunca `javascript:`, `data:`, `//host` ni credenciales. */
function safeDocumentUrl(raw: unknown): { url: string; path: string } | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (url === '' || url.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(url)) return null;

  if (url.startsWith('/')) {
    return url.startsWith('//') ? null : { url, path: url.split(/[?#]/)[0] };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username !== '' || parsed.password !== '') return null;
    return { url, path: parsed.pathname };
  } catch {
    return null;
  }
}

/**
 * `Product.documents` guarda `{ name, url, type, size }`. Se publican solo las
 * fichas técnicas: `type` o `name` indican ficha técnica/datasheet, o la URL es
 * un `.pdf`. Se descartan las URL que no son `http(s)` ni del sitio.
 */
export function sanitizeDatasheets(raw: unknown): PublicDatasheet[] {
  if (!Array.isArray(raw)) return [];

  const datasheets: PublicDatasheet[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const link = safeDocumentUrl(entry.url);
    if (link === null) continue;

    const name = cleanString(entry.name, 200);
    const type = cleanString(entry.type, 60);
    const hinted =
      (name !== null && DATASHEET_HINT.test(stripAccents(name))) ||
      (type !== null && (DATASHEET_HINT.test(stripAccents(type)) || stripAccents(type) === 'ficha'));
    const isPdf = /\.pdf$/i.test(link.path);
    if (!hinted && !isPdf) continue;

    datasheets.push({ name: name ?? 'Ficha técnica', url: link.url });
  }
  return datasheets;
}
