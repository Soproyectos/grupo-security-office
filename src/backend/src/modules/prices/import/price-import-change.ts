import { Prisma } from '@prisma/client';

export interface PriceChangeMeasure {
  /** Signed percent change as text with 2 decimals (HALF_UP); null when the previous price is zero. */
  changePercent: string | null;
  /** True when the change is strictly above the threshold, or when the previous price is zero. */
  largeChange: boolean;
}

/**
 * Large-change alert (R3). `|new - previous| / previous * 100 > threshold`, strictly,
 * computed with Decimal on the unrounded ratio. A previous price of zero cannot yield
 * a percent and is always flagged. The displayed percent is rounded HALF_UP to 2
 * decimals, so a ratio such as 30.004% shows as 30.00 and is still flagged.
 */
export function measurePriceChange(
  previous: Prisma.Decimal.Value,
  next: Prisma.Decimal.Value,
  thresholdPct: number,
): PriceChangeMeasure {
  const oldValue = new Prisma.Decimal(previous);
  const newValue = new Prisma.Decimal(next);
  if (oldValue.isZero()) return { changePercent: null, largeChange: !newValue.isZero() };
  const signed = newValue.minus(oldValue).div(oldValue).times(100);
  return {
    changePercent: signed.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
    largeChange: signed.abs().gt(thresholdPct),
  };
}

/** `price_import_revision_prices.changePercent` is DECIMAL(9,2): keep an extreme ratio from overflowing it. */
export const MAX_STORED_CHANGE_PERCENT = '9999999.99';

export function clampChangePercentForStorage(changePercent: string | null | undefined): string | null {
  if (changePercent === null || changePercent === undefined) return null;
  const value = new Prisma.Decimal(changePercent);
  const limit = new Prisma.Decimal(MAX_STORED_CHANGE_PERCENT);
  if (value.gt(limit)) return MAX_STORED_CHANGE_PERCENT;
  return value.toFixed(2);
}
