import { ConflictException } from '@nestjs/common';

/** Case, accent and spacing insensitive form of a master-catalog name. */
export function normalizeMasterName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface UsageReason {
  code: string;
  count: number;
  message: string;
}

export interface UsageReport<C extends Record<string, number> = Record<string, number>> {
  id: string;
  counts: C;
  canDelete: boolean;
  /** Why a delete is refused (empty when `canDelete`). */
  reasons: UsageReason[];
}

/** Builds a usage report: every `blockers` entry with a count above zero blocks the delete. */
export function buildUsageReport<C extends Record<string, number>>(
  id: string,
  counts: C,
  blockers: { key: keyof C & string; code: string; message: (count: number) => string }[],
): UsageReport<C> {
  const reasons: UsageReason[] = [];
  for (const blocker of blockers) {
    const count = counts[blocker.key] ?? 0;
    if (count > 0) reasons.push({ code: blocker.code, count, message: blocker.message(count) });
  }
  return { id, counts, canDelete: reasons.length === 0, reasons };
}

/** 409 that carries the dependency detail of a refused delete. */
export function deleteBlocked(entity: string, report: UsageReport): ConflictException {
  return new ConflictException({
    code: 'DELETE_BLOCKED',
    message: `No se puede eliminar ${entity}: ${report.reasons.map((r) => r.message).join('; ')}.`,
    usage: report,
  });
}

/** 409 for a name that already exists (normalized comparison); includes the colliding record. */
export function nameTaken(entity: string, existing: { id: string; name: string }): ConflictException {
  return new ConflictException({
    code: 'NAME_DUPLICATED',
    message: `Ya existe ${entity} con un nombre equivalente: «${existing.name}».`,
    existing: { id: existing.id, name: existing.name },
  });
}

/** Returns the first row whose normalized name equals `name` (ignoring `selfId`). */
export function findNameCollision<T extends { id: string; name: string }>(
  name: string,
  rows: readonly T[],
  selfId?: string,
): T | undefined {
  const key = normalizeMasterName(name);
  return rows.find((row) => row.id !== selfId && normalizeMasterName(row.name) === key);
}

/** 409 asking the caller to resend with `confirmImpact: true` after reviewing the impact. */
export function impactConfirmationRequired(message: string, impact: Record<string, unknown>): ConflictException {
  return new ConflictException({ code: 'IMPACT_CONFIRMATION_REQUIRED', message, impact });
}
