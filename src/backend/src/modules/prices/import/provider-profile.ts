import { PRICE_IMPORT_TARIFFS, type PriceImportTariff } from './price-import.types';

/**
 * IMP-07B (07B) — Núcleo puro del perfil de proveedor: validación, huella de
 * encabezados (detección de cambios de estructura) y resolución de
 * equivalencias. Sin acceso a BD; se prueba de forma determinista.
 *
 * Reglas (contrato IMP-07 §4):
 *  - Separadores y moneda DECLARADOS por el perfil (no heurísticas por fila).
 *  - Cambio de estructura exige revisar el perfil (sube `version`).
 *  - Referencia externa sin equivalencia única queda PENDIENTE (no se adivina).
 */

export const PROVIDER_SEPARATORS = ['.', ','] as const;
export const PROVIDER_THOUSANDS = ['', '.', ','] as const;

export interface ProviderProfileInput {
  providerName: string;
  sheet: string;
  headerRow: number;
  thousandsSeparator: string;
  decimalSeparator: string;
  currency: string;
  tariffs: string[];
  expectedColumns: string[];
}

export interface NormalizedProviderProfile {
  providerName: string;
  sheet: string;
  headerRow: number;
  thousandsSeparator: '' | '.' | ',';
  decimalSeparator: '.' | ',';
  currency: 'COP';
  tariffs: PriceImportTariff[];
  expectedColumns: string[];
}

export interface ProfileValidation {
  errors: string[];
  value: NormalizedProviderProfile | null;
}

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Valida y normaliza un perfil. Devuelve TODOS los errores (no el primero). */
export function validateProviderProfile(input: ProviderProfileInput): ProfileValidation {
  const errors: string[] = [];
  const providerName = clean(input?.providerName);
  const sheet = clean(input?.sheet);
  const headerRow = input?.headerRow;
  const thousandsSeparator = clean(input?.thousandsSeparator);
  const decimalSeparator = clean(input?.decimalSeparator);
  const currency = clean(input?.currency).toUpperCase();

  if (!providerName) errors.push('Indica el proveedor.');
  else if (providerName.length > 120) errors.push('El nombre del proveedor es demasiado largo (máx. 120).');
  if (!sheet) errors.push('Indica la hoja del archivo del proveedor.');
  else if (sheet.length > 100) errors.push('El nombre de la hoja es demasiado largo (máx. 100).');
  if (!Number.isInteger(headerRow) || (headerRow as number) < 1 || (headerRow as number) > 1000) {
    errors.push('La fila de encabezado debe ser un entero entre 1 y 1000.');
  }
  if (!(PROVIDER_THOUSANDS as readonly string[]).includes(thousandsSeparator)) {
    errors.push('El separador de miles debe ser punto, coma o vacío.');
  }
  if (!(PROVIDER_SEPARATORS as readonly string[]).includes(decimalSeparator)) {
    errors.push('El separador decimal debe ser punto o coma.');
  }
  if (thousandsSeparator !== '' && thousandsSeparator === decimalSeparator) {
    errors.push('El separador de miles y el decimal no pueden ser el mismo.');
  }
  if (currency !== 'COP') errors.push('La moneda del perfil solo puede ser COP (IVA incluido).');

  const requested = Array.isArray(input?.tariffs) ? input.tariffs.map(clean).filter((t) => t !== '') : [];
  const invalidTariffs = requested.filter((t) => !(PRICE_IMPORT_TARIFFS as readonly string[]).includes(t));
  if (invalidTariffs.length > 0) errors.push(`Tarifa no reconocida: ${invalidTariffs.join(', ')}.`);
  const tariffs = PRICE_IMPORT_TARIFFS.filter((code) => requested.includes(code));
  if (tariffs.length === 0) errors.push('Selecciona al menos una tarifa válida.');

  const expectedColumns = Array.isArray(input?.expectedColumns)
    ? input.expectedColumns.map(clean).filter((c) => c !== '')
    : [];
  if (expectedColumns.length === 0) errors.push('Registra al menos un encabezado esperado (huella del archivo).');
  if (expectedColumns.some((c) => c.length > 200)) errors.push('Un encabezado esperado supera 200 caracteres.');

  if (errors.length > 0) return { errors, value: null };
  return {
    errors: [],
    value: {
      providerName,
      sheet,
      headerRow: headerRow as number,
      thousandsSeparator: thousandsSeparator as '' | '.' | ',',
      decimalSeparator: decimalSeparator as '.' | ',',
      currency: 'COP',
      tariffs,
      expectedColumns,
    },
  };
}

const fingerprint = (columns: readonly string[]): string[] =>
  columns.map((c) => clean(c).replace(/\s+/g, ' ').toUpperCase());

/**
 * ¿El archivo recibido conserva la MISMA estructura que el perfil? Si no,
 * el perfil debe revisarse (contrato §4, caso 2). Compara la huella de
 * encabezados en orden, sin distinguir mayúsculas ni espacios sobrantes.
 */
export function profileMatchesHeaders(profile: { expectedColumns: readonly string[] }, headers: readonly string[]): boolean {
  const expected = fingerprint(profile.expectedColumns);
  const actual = fingerprint(headers);
  return expected.length === actual.length && expected.every((c, i) => c === actual[i]);
}

/** ¿Cambió la ESTRUCTURA del perfil? (sube versión y exige revisión). */
export function profileStructureChanged(
  current: NormalizedProviderProfile,
  next: ProviderProfileInput,
): boolean {
  const validation = validateProviderProfile(next);
  if (validation.errors.length > 0 || !validation.value) return true;
  const n = validation.value;
  const tariffsEqual =
    current.tariffs.length === n.tariffs.length && current.tariffs.every((t, i) => t === n.tariffs[i]);
  return (
    current.providerName !== n.providerName ||
    current.sheet !== n.sheet ||
    current.headerRow !== n.headerRow ||
    current.thousandsSeparator !== n.thousandsSeparator ||
    current.decimalSeparator !== n.decimalSeparator ||
    current.currency !== n.currency ||
    !tariffsEqual ||
    fingerprint(current.expectedColumns).join('\u0000') !== fingerprint(n.expectedColumns).join('\u0000')
  );
}

export interface EquivalenceInput {
  externalRef: string;
  productId: string;
}

export interface ProviderEquivalenceView {
  externalRef: string;
  productId: string;
}

export interface ProviderProfileView {
  id: string;
  providerName: string;
  sheet: string;
  headerRow: number;
  thousandsSeparator: string;
  decimalSeparator: string;
  currency: string;
  tariffs: string[];
  expectedColumns: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  equivalences: ProviderEquivalenceView[];
}

export interface RecognitionView {
  found: boolean;
  profileId: string | null;
  providerName: string;
  version: number | null;
  matches: boolean;
  requiresReview: boolean;
  expectedColumns: string[];
}

export interface ResolvedReference {
  externalRef: string;
  productId: string | null;
  status: 'resolved' | 'pending';
}

const refKey = (value: string): string => clean(value);

/**
 * Resuelve referencias externas contra las equivalencias del perfil. Sin
 * equivalencia única la referencia queda PENDIENTE (no se asigna por parecido).
 */
export function resolveExternalReferences(
  equivalences: readonly EquivalenceInput[],
  references: readonly string[],
): ResolvedReference[] {
  const byRef = new Map<string, string>();
  // Duplicados dentro del perfil: se conserva el primero (el índice único de BD
  // impide dos equivalencias con la misma referencia externa).
  for (const eq of equivalences) {
    const key = refKey(eq.externalRef);
    if (key && !byRef.has(key)) byRef.set(key, eq.productId);
  }
  return references.map((raw) => {
    const key = refKey(raw);
    const productId = key ? byRef.get(key) ?? null : null;
    return { externalRef: raw, productId, status: productId ? 'resolved' : 'pending' };
  });
}
