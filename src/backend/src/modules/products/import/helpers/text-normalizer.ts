/**
 * Normalización de texto para importación de productos.
 *
 * Limpieza estándar aplicada a todos los campos de texto:
 * - Trim de espacios
 * - Colapso de espacios múltiples
 * - Normalización de caracteres especiales
 * - Capitalización de nombres propios (marcas, categorías)
 */

/**
 * Normaliza un campo de texto genérico.
 * Aplica limpieza básica: trim, colapso de espacios, normalización Unicode.
 */
export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';

  let str = String(value).trim();

  // Normalizar Unicode (NFC) para consistencia
  str = str.normalize('NFC');

  // Colapsar espacios múltiples en uno solo
  str = str.replace(/\s+/g, ' ');

  // Remover caracteres de control (excepto newline)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return str.trim();
}

/**
 * Normaliza un SKU: trim, mayúsculas, sin espacios internos.
 */
export function normalizeSku(value: unknown): string {
  if (value === null || value === undefined) return '';

  return String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .normalize('NFC');
}

/**
 * Normaliza un nombre de marca: trim, capitalización de primera letra.
 * Ejemplo: "hikvision" → "Hikvision", "HIKVISION" → "Hikvision"
 */
export function normalizeBrandName(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return '';

  return capitalizeFirst(text);
}

/**
 * Normaliza un nombre de categoría: trim, capitalización de primera letra.
 * Ejemplo: "cctv" → "Cctv", "CÁMARAS IP" → "Cámaras ip"
 */
export function normalizeCategoryName(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return '';

  return capitalizeFirst(text);
}

/**
 * Normaliza un nombre de producto: trim, espacios colapsados.
 * NO aplica capitalización (los nombres de producto pueden tener formato propio).
 */
export function normalizeProductName(value: unknown): string {
  return normalizeText(value);
}

/**
 * Normaliza una descripción: trim, espacios colapsados, preserva newlines.
 */
export function normalizeDescription(value: unknown): string {
  if (value === null || value === undefined) return '';

  let str = String(value).trim();

  // Normalizar Unicode
  str = str.normalize('NFC');

  // Colapsar espacios pero preservar saltos de línea
  str = str.replace(/[^\S\n]+/g, ' ');

  // Colapsar múltiples newlines en uno solo
  str = str.replace(/\n{3,}/g, '\n\n');

  // Remover caracteres de control (excepto newline y tab)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return str.trim();
}

/**
 * Genera un slug a partir de un nombre.
 * Minúsculas, sin acentos, espacios→guiones, sin caracteres especiales.
 *
 * Ejemplo:
 * - "Cámaras IP Hikvision" → "camaras-ip-hikvision"
 * - "  LED  Bulb  " → "led-bulb"
 * - "Control de Acceso" → "control-de-acceso"
 */
export function generateSlug(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return '';

  return text
    .toLowerCase()
    // Normalizar acentos
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Reemplazar caracteres no alfanuméricos con guiones
    .replace(/[^a-z0-9]+/g, '-')
    // Colapsar guiones múltiples
    .replace(/-+/g, '-')
    // Remover guiones al inicio y final
    .replace(/^-|-$/g, '');
}

/**
 * Capitaliza la primera letra de un string.
 * "hikvision" → "Hikvision"
 * "HIKVISION" → "Hikvision" (primera mayúscula, resto minúsculas)
 */
function capitalizeFirst(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** Escapa metacaracteres de regex para usar un literal en `new RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Límite de caracteres del nombre de producto visible en vitrina (ADR-002).
 * El título es cosmético: el texto completo vive en `description`.
 */
export const PRODUCT_NAME_MAX_LENGTH = 70;

/**
 * Recorta un nombre de producto al presupuesto de vitrina
 * (PRODUCT_NAME_MAX_LENGTH) sin partir palabras ni dejar puntuación colgante.
 * Nombres ya dentro del presupuesto se devuelven intactos (función pura).
 *
 * Cadena simple (UTF-16): un `slice` es aceptable aquí, igual que el
 * comportamiento existente de deriveNameFromDescription.
 */
export function truncateProductName(
  value: string,
  maxLength: number = PRODUCT_NAME_MAX_LENGTH,
): string {
  if (value.length <= maxLength) return value;

  const slice = value.slice(0, maxLength);
  const lastBreak = Math.max(
    slice.lastIndexOf(' '),
    slice.lastIndexOf(','),
    slice.lastIndexOf(';'),
    slice.lastIndexOf('.'),
  );
  const candidate = lastBreak > 0 ? slice.slice(0, lastBreak) : slice;

  return candidate.trim().replace(/[\s,;.\-–—]+$/, '').trim() || slice.trim();
}

/**
 * Genera un nombre breve y determinístico a partir de una descripción técnica.
 * Función pura: solo resume texto presente en la descripción. No añade el
 * SKU/referencia ni inventa atributos.
 */
function deriveNameFromDescription(description: string): string | null {
  const HEADER_ARTIFACTS = ['TITLE HIKVISION TURBO'];
  const CUT_PHRASES = [
    'Compatible',
    'Admite',
    'Soporta',
    'Clasificación',
    'Compresión',
    'Entradas',
    'Capacidad',
    'Tecnología',
    'Protección',
    'Grabación',
  ];
  const MIN_USEFUL_BEFORE = 12;
  const MAX_LENGTH = PRODUCT_NAME_MAX_LENGTH;

  // 1-2. Normalizar tabs, saltos de línea y espacios repetidos a un solo espacio;
  // preserva el contenido técnico (SKU, unidades, resoluciones, tecnologías).
  const normalized = normalizeText(description);
  if (!normalized) return null;

  // 3. Eliminar artefactos de encabezado/separador (case-insensitive).
  let candidate = normalized;
  for (const artifact of HEADER_ARTIFACTS) {
    candidate = candidate
      .replace(new RegExp(escapeRegExp(artifact), 'gi'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 4. Invalidar vacío, solo separadores, o sin letras/números.
  if (!candidate || !/[a-zA-Z0-9]/.test(candidate)) return null;

  // 5-6. Primera frase de corte (case-insensitive); usar el fragmento anterior si
  // tiene >= 12 caracteres útiles, si no la descripción normalizada completa.
  const lower = candidate.toLowerCase();
  let cutIndex = -1;
  for (const phrase of CUT_PHRASES) {
    const idx = lower.indexOf(phrase.toLowerCase());
    if (idx !== -1 && (cutIndex === -1 || idx < cutIndex)) cutIndex = idx;
  }
  let nameCandidate = candidate;
  if (cutIndex !== -1) {
    const before = candidate.slice(0, cutIndex).trim();
    if (before.length >= MIN_USEFUL_BEFORE) nameCandidate = before;
  }

  // 7. Limitar al presupuesto de vitrina (70 caracteres) sin partir palabras.
  if (nameCandidate.length > MAX_LENGTH) {
    const slice = nameCandidate.slice(0, MAX_LENGTH);
    const lastBreak = Math.max(
      slice.lastIndexOf(' '),
      slice.lastIndexOf(','),
      slice.lastIndexOf(';'),
      slice.lastIndexOf('.'),
    );
    nameCandidate = lastBreak > 0 ? slice.slice(0, lastBreak) : slice;
  }
  nameCandidate = nameCandidate.trim().replace(/[\s,;.\-–—]+$/, '').trim();

  // 8. null solo si no hay un candidato válido.
  if (!nameCandidate || !/[a-zA-Z0-9]/.test(nameCandidate)) return null;
  return nameCandidate;
}

/**
 * Resuelve el valor efectivo de `name` para una fila de importación.
 *
 * - Si hay un nombre explícito útil, lo usa (solo colapsa espacios) y lo
 *   recorta al presupuesto de vitrina (PRODUCT_NAME_MAX_LENGTH) — nunca se
 *   rechaza una fila por longitud de nombre: el título es cosmético y el
 *   texto completo vive en `description` (ADR-002).
 * - Si no, y la descripción tiene texto útil, deriva un nombre breve desde la
 *   descripción (nunca usa toda la descripción como `name`; ya nace ≤70).
 * - En otro caso devuelve cadena vacía.
 *
 * Compartida entre `RowValidatorService` (para no rechazar por NAME_REQUIRED
 * una fila cuyo nombre SÍ es derivable) y `RowNormalizerService` (para
 * construir el `name` real que se persiste). Debe usarse la misma lógica en
 * ambos lugares — si se derivan de forma distinta, filas que pasan la
 * validación podrían normalizarse con un nombre diferente al validado.
 */
export function resolveEffectiveName(rawName: unknown, rawDescription: unknown): string {
  const explicitName = normalizeProductName(rawName);
  if (explicitName) return truncateProductName(explicitName);

  const derived = deriveNameFromDescription(normalizeDescription(rawDescription));
  return derived ?? '';
}
