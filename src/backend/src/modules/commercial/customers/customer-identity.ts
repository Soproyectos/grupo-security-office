import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * Shared identity rules for a customer, used by the internal create/edit flow
 * and by the web-account approval so both paths agree on "is this the same
 * company?".
 *
 * Document: dots, commas and spaces are ignored, letters are upper-cased, and a
 * trailing "-<one digit>" (the NIT verification digit) is dropped. This function alone cannot tell a
 * verification digit typed WITHOUT a hyphen from a normal digit; for NIT customers use
 * `parseNitInput` / `normalizeDocumentForType`, which recognize it when it matches the calculated digit.
 * Email: trimmed and lower-cased.
 */
export function normalizeDocumentId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const compact = raw.toUpperCase().replace(/[\s.,]/g, '');
  return compact.replace(/^(\d{5,})-\d$/, '$1').replace(/[^A-Z0-9]/g, '');
}

// DIAN weights for the NIT verification digit (DV), applied from the rightmost digit of the base number.
const NIT_DV_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/**
 * Verification digit (DV) of a Colombian NIT base number (DIAN algorithm). Pure; the DV is never stored,
 * it can always be recalculated. Throws when the base is not 1 to 15 digits.
 */
export function computeNitDv(base: string): number {
  if (!/^\d{1,15}$/.test(base)) throw new RangeError('NIT base must be 1 to 15 digits');
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += Number(base[base.length - 1 - i]) * NIT_DV_WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder > 1 ? 11 - remainder : remainder;
}

export type NitDvStatus = 'none' | 'valid' | 'invalid';

export interface ParsedNitInput {
  /** What is stored and compared: the NIT number without verification digit. */
  base: string;
  /** The verification digit the person typed, or null when none was recognized. */
  dv: number | null;
  /** none: no DV typed; valid: typed DV matches the calculated one; invalid: typed after a hyphen and does not match. */
  dvStatus: NitDvStatus;
}

/**
 * Splits what was typed in the NIT field into the base number and an optional verification digit.
 * - "901.123.456-1": the digit after the final hyphen is the DV; it is compared with the calculated one.
 * - "9011234561" (no hyphen, exactly 10 digits): treated as base + DV only when the last digit equals the DV
 *   calculated from the first 9; otherwise it is a plain 10-digit base (no error is invented).
 * - Anything else: no DV.
 * The DV is optional: its absence is never an error.
 */
export function parseNitInput(raw: unknown): ParsedNitInput {
  const base = normalizeDocumentId(raw);
  if (typeof raw !== 'string') return { base, dv: null, dvStatus: 'none' };
  const compact = raw.toUpperCase().replace(/[\s.,]/g, '');
  const hyphen = /^(\d{5,15})-(\d)$/.exec(compact);
  if (hyphen) {
    const dv = Number(hyphen[2]);
    return { base: hyphen[1], dv, dvStatus: dv === computeNitDv(hyphen[1]) ? 'valid' : 'invalid' };
  }
  if (/^\d{10}$/.test(compact)) {
    const head = compact.slice(0, 9);
    const dv = Number(compact[9]);
    if (dv === computeNitDv(head)) return { base: head, dv, dvStatus: 'valid' };
  }
  return { base, dv: null, dvStatus: 'none' };
}

/** Verification digit to show for a stored customer document; null unless it is a NIT with a numeric number. */
export function nitDvForDisplay(documentType: string | null | undefined, documentId: string | null | undefined): number | null {
  if (typeof documentType !== 'string' || documentType.trim().toUpperCase() !== 'NIT') return null;
  const base = normalizeDocumentId(documentId); // legacy rows saved as "901.123.456-7" still show the digit
  return /^\d{1,15}$/.test(base) ? computeNitDv(base) : null;
}

/**
 * Document as it must be stored and compared for a customer of the given type. Only NITs get the
 * verification-digit treatment; every other type keeps the plain normalization.
 */
export function normalizeDocumentForType(raw: unknown, documentType: string | null | undefined): { documentId: string; dvStatus: NitDvStatus } {
  if (typeof documentType === 'string' && documentType.trim().toUpperCase() === 'NIT') {
    const { base, dvStatus } = parseNitInput(raw);
    return { documentId: base, dvStatus };
  }
  return { documentId: normalizeDocumentId(raw), dvStatus: 'none' };
}

export function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/** Document type stored for a customer: upper-cased; a document number without type is a NIT. */
export function normalizeDocumentType(raw: unknown, hasDocumentId: boolean): string | null {
  const type = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return type || (hasDocumentId ? 'NIT' : null);
}

export interface CustomerIdentityMatch {
  id: string;
  name: string;
  ownerId: string | null;
  isActive: boolean;
  documentId: string | null;
  byDocument: boolean;
  byEmail: boolean;
}

// Same rule as normalizeDocumentId, evaluated by the database so legacy rows saved as "901.123.456-7" still match.
const DOCUMENT_SQL = Prisma.sql`regexp_replace(regexp_replace(regexp_replace(upper(coalesce("documentId", '')), '[[:space:].,]', '', 'g'), '^([0-9]{5,})-[0-9]$', '\\1'), '[^A-Z0-9]', '', 'g')`;
const EMAIL_SQL = Prisma.sql`lower(btrim(coalesce(email, '')))`;

/**
 * Customers (active or not: the base keeps the unique document of soft-deleted ones) whose normalized
 * document or email equals the given ones. Pass an empty value to skip that criterion.
 */
export async function findCustomersByIdentity(
  prisma: Pick<PrismaService, '$queryRaw'>,
  criteria: { documentId?: string; email?: string; excludeId?: string },
): Promise<CustomerIdentityMatch[]> {
  const documentId = criteria.documentId ?? '';
  const email = criteria.email ?? '';
  if (!documentId && !email) return [];
  const byDocument = documentId ? Prisma.sql`(${DOCUMENT_SQL} = ${documentId})` : Prisma.sql`FALSE`;
  const byEmail = email ? Prisma.sql`(${EMAIL_SQL} = ${email})` : Prisma.sql`FALSE`;
  const exclude = criteria.excludeId ? Prisma.sql`AND id <> ${criteria.excludeId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<CustomerIdentityMatch[]>`
    SELECT id, name, "ownerId", "isActive", "documentId", ${byDocument} AS "byDocument", ${byEmail} AS "byEmail"
    FROM customers
    WHERE (${byDocument} OR ${byEmail}) ${exclude}
    ORDER BY "isActive" DESC, "createdAt" ASC
    LIMIT 5`;
  return Array.isArray(rows) ? rows : [];
}
