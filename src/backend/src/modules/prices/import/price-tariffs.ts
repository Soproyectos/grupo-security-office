import { LEGACY_TARIFF_ORDER, type PriceImportTariffRef } from './price-import.types';

/**
 * Tariffs are data: the Excel header must equal the tariff NAME defined in Biblioteca (or its stable code).
 * These pure helpers are shared by the reader, the templates and the tariff create/update collision check.
 */

/** NFC, accents stripped, case-insensitive, collapsed spaces, trailing " *" (required-column mark) removed. */
export function normalizeTariffText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim().replace(/\s+/g, ' ')
    .replace(/ ?\*$/, '')
    .trim();
}

const WITH_VAT_SUFFIX = /\s*\(\s*con iva\s*\)$/;
const PRICE_PREFIX = /^precio\s+/;

/** Same text without the optional "(CON IVA)" suffix: "Tienda" and "Tienda (con IVA)" are the same header. */
export const tariffIdentityKey = (value: unknown): string => normalizeTariffText(value).replace(WITH_VAT_SUFFIX, '').trim();

/** Candidate keys of an Excel header, most specific first (full text, no suffix, no legacy "PRECIO " prefix). */
export function headerCandidates(header: unknown): { exact: string; loose: string[] } {
  const exact = normalizeTariffText(header);
  const noSuffix = exact.replace(WITH_VAT_SUFFIX, '').trim();
  const noPrefix = noSuffix.replace(PRICE_PREFIX, '').trim();
  return { exact, loose: [...new Set([noSuffix, noPrefix])].filter((key) => key !== '') };
}

export type TariffMatch = { kind: 'match'; code: string } | { kind: 'ambiguous'; codes: string[] } | { kind: 'none' };

/** Resolves headers against a tariff list by normalized name or code; ambiguity is reported, never guessed. */
export function createTariffMatcher(tariffs: readonly PriceImportTariffRef[]): (header: unknown) => TariffMatch {
  const index = (key: (v: string) => string) => {
    const map = new Map<string, Set<string>>();
    for (const tariff of tariffs) {
      for (const text of [tariff.name, tariff.code]) {
        const k = key(text);
        if (!k) continue;
        const set = map.get(k) ?? new Set<string>();
        set.add(tariff.code);
        map.set(k, set);
      }
    }
    return map;
  };
  const exactIndex = index(normalizeTariffText);
  const looseIndex = index(tariffIdentityKey);
  const resolve = (set: Set<string> | undefined): TariffMatch | null => {
    if (!set) return null;
    return set.size === 1 ? { kind: 'match', code: [...set][0] } : { kind: 'ambiguous', codes: [...set].sort() };
  };
  return (header) => {
    const { exact, loose } = headerCandidates(header);
    const byExact = resolve(exactIndex.get(exact));
    if (byExact) return byExact;
    for (const key of loose) {
      const hit = resolve(looseIndex.get(key));
      if (hit) return hit;
    }
    return { kind: 'none' };
  };
}

/** Stable order: the five historic codes first, then the rest by name (then code). */
export function orderTariffs<T extends PriceImportTariffRef>(tariffs: readonly T[]): T[] {
  const rank = (code: string) => { const i = LEGACY_TARIFF_ORDER.indexOf(code); return i === -1 ? LEGACY_TARIFF_ORDER.length : i; };
  return [...tariffs].sort((a, b) => rank(a.code) - rank(b.code)
    || a.name.localeCompare(b.name, 'es') || a.code.localeCompare(b.code));
}

/**
 * The tariff whose name or code would make the header of `name` ambiguous, if any (`self` is excluded so a tariff
 * can be saved again with its own name). Used by tariff create/update to answer 409.
 */
export function findTariffNameCollision<T extends PriceImportTariffRef & { id?: string }>(
  name: string, others: readonly T[],
): T | undefined {
  const key = tariffIdentityKey(name);
  if (!key) return undefined;
  return others.find((other) => tariffIdentityKey(other.name) === key || tariffIdentityKey(other.code) === key);
}
