/** Shared offer-price validity predicate for publication and validation reads. */
export function priceValidityWhere(now: Date) {
  return {
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    ],
  };
}

/** `validUntil` is an exclusive end; null on either side means unbounded. */
export function isPriceCurrentlyValid(
  validFrom: Date | null | undefined,
  validUntil: Date | null | undefined,
  now: Date,
): boolean {
  return (!validFrom || validFrom <= now) && (!validUntil || validUntil > now);
}
