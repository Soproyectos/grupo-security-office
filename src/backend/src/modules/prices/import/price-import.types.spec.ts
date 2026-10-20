import { LARGE_PRICE_CHANGE_PERCENT, resolveLargeChangeThresholdPct } from './price-import.types';

describe('resolveLargeChangeThresholdPct', () => {
  it('defaults to 30', () => {
    expect(LARGE_PRICE_CHANGE_PERCENT).toBe(30);
    expect(resolveLargeChangeThresholdPct(undefined)).toBe(30);
  });
  it('accepts a bounded numeric override', () => {
    expect(resolveLargeChangeThresholdPct('25')).toBe(25);
    expect(resolveLargeChangeThresholdPct(' 12.5 ')).toBe(12.5);
    expect(resolveLargeChangeThresholdPct('1')).toBe(1);
    expect(resolveLargeChangeThresholdPct('1000')).toBe(1000);
  });
  it.each(['', 'abc', '0', '0.5', '1001', '-5', 'NaN', 'Infinity', '1e3', '30%'])('falls back to 30 for %p', (raw) => {
    expect(resolveLargeChangeThresholdPct(raw)).toBe(30);
  });
});
