import { computeQuoteTotals, generateQuoteCode } from './quote-math';

describe('generateQuoteCode', () => {
  it('continues from the largest numeric suffix, so COT-10000 follows COT-9999', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([{ code: 'COT-9999' }]), quote: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(generateQuoteCode(prisma)).resolves.toBe('COT-10000');
  });
  it('starts at COT-0001 when there are no quotes', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([]), quote: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(generateQuoteCode(prisma)).resolves.toBe('COT-0001');
  });
});

describe('computeQuoteTotals', () => {
  it('treats tariff prices as IVA-included: the total is the sum and IVA is only the part it contains', () => {
    const totals = computeQuoteTotals([{ lineTotal: 650000, unitPrice: 200000 }, { lineTotal: 0, unitPrice: null }], 0, 19);
    expect(totals).toEqual({ subtotal: 650000, taxAmount: 103781.51, total: 650000 });
  });
  it('applies the discount before extracting the included IVA', () => {
    expect(computeQuoteTotals([{ lineTotal: 1190, unitPrice: 1190 }], 190, 19)).toEqual({ subtotal: 1190, taxAmount: 159.66, total: 1000 });
  });
});
