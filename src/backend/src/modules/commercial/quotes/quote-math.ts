import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** Statuses in which lines can still be added, edited or removed. */
export const ITEM_EDITABLE_STATUSES = ['borrador', 'enviada', 'negociacion'] as const;

/** Round to 2 decimals for money arithmetic (always done in the backend). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** unitPrice * quantity * (1 - discountPct/100), rounded per line. A line without price ("por confirmar") is 0. */
export function computeLineTotal(unitPrice: number | null, quantity: number, discountPct: number): number {
  if (unitPrice === null) return 0;
  return round2(unitPrice * quantity * (1 - discountPct / 100));
}

/**
 * Tariff prices already include IVA (business rule confirmed 2026-11-26), so IVA is never added on top:
 * subtotal = sum of line totals (lines without price are ignored); base = subtotal - discount;
 * total = round2(base); taxAmount = the IVA contained in that total = round2(base - base / (1 + taxRate / 100)).
 */
export function computeQuoteTotals(
  lines: ReadonlyArray<{ lineTotal: unknown; unitPrice?: unknown }>,
  discount: number,
  taxRate: number,
) {
  const subtotal = round2(
    lines.reduce((sum, line) => (line.unitPrice === null ? sum : sum + Number(line.lineTotal)), 0),
  );
  const base = subtotal - discount;
  const taxAmount = round2(base - base / (1 + taxRate / 100));
  return { subtotal, taxAmount, total: round2(base) };
}

/**
 * Effective status: an open quote whose `validUntil` already passed reads as `vencida` (no table, no cron).
 * The persisted status never changes.
 */
export function effectiveQuoteStatus<T extends { status: string; validUntil: Date | null }>(quote: T): T {
  if (
    ITEM_EDITABLE_STATUSES.includes(quote.status as never) &&
    quote.validUntil &&
    quote.validUntil.getTime() < Date.now()
  ) {
    return { ...quote, status: 'vencida' };
  }
  return quote;
}

/** Largest amount the money columns (Decimal(14,2)) can hold. */
export const MAX_MONEY = 999_999_999_999.99;

/** Rejects (400) any amount above the column limit, before anything is written. */
export function assertMoneyWithinLimit(...amounts: number[]): void {
  if (amounts.some((a) => !Number.isFinite(a) || Math.abs(a) > MAX_MONEY)) {
    throw new BadRequestException('El total supera el máximo permitido');
  }
}

/**
 * Sequential code COT-0001, COT-0002, ... The next number comes from the largest numeric suffix (so COT-10000
 * follows COT-9999). Shared by staff quotes and quotes sent from the customer portal.
 */
export async function generateQuoteCode(
  prisma: Pick<PrismaService, 'quote' | '$queryRaw'>,
  attempt = 0,
): Promise<string> {
  if (attempt >= 5) return `COT-${Date.now().toString(36).toUpperCase()}`;

  const rows = await prisma.$queryRaw<{ code: string }[]>`
    SELECT "code" FROM "quotes" WHERE "code" ~ '^COT-[0-9]+$'
    ORDER BY length("code") DESC, "code" DESC LIMIT 1`;
  const lastNum = rows?.[0]?.code ? parseInt(rows[0].code.slice(4), 10) : 0;
  const next = Number.isFinite(lastNum) ? lastNum + 1 : 1;
  const candidate = `COT-${String(next).padStart(4, '0')}`;

  const exists = await prisma.quote.findUnique({ where: { code: candidate }, select: { id: true } });
  if (exists) return generateQuoteCode(prisma, attempt + 1);
  return candidate;
}

/**
 * Runs `create` (which must generate its own code); if the code unique constraint is hit by a concurrent
 * request, tries again with a fresh code. After 3 attempts: 409.
 */
export async function withQuoteCodeRetry<T>(create: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await create();
    } catch (error) {
      const target = (error as { meta?: { target?: unknown } })?.meta?.target;
      const isCodeClash =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (Array.isArray(target) ? target.includes('code') : String(target ?? 'code').includes('code'));
      if (!isCodeClash) throw error;
    }
  }
  throw new ConflictException('Intenta de nuevo');
}
