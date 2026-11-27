import {
  computeNitDv,
  findCustomersByIdentity,
  nitDvForDisplay,
  normalizeDocumentForType,
  normalizeDocumentId,
  normalizeDocumentType,
  normalizeEmail,
  parseNitInput,
} from './customer-identity';

describe('NIT verification digit', () => {
  // Hand-calculated with the DIAN weights (3,7,13,17,19,...) from the rightmost digit; sum % 11 -> r, DV = r > 1 ? 11 - r : r.
  it.each([
    ['800197268', 4], // DIAN's own NIT (800.197.268-4): sum 733, r 7
    ['860002964', 4], // Banco de Bogota (860.002.964-4): sum 755, r 7
    ['901123456', 1], // sum 615, r 10
    ['900123456', 8], // sum 586, r 3
    ['900111222', 1], // sum 474, r 1 -> DV is r itself
    ['4', 1], // sum 12, r 1
    ['0', 0], // sum 0, r 0
  ])('computes the DV of %s as %i', (base, dv) => {
    expect(computeNitDv(base)).toBe(dv);
  });

  it.each(['', 'ABC', '12 3', '1234567890123456'])('refuses to calculate for %p', (base) => {
    expect(() => computeNitDv(base)).toThrow(RangeError);
  });

  it.each([
    ['901.123.456-1', { base: '901123456', dv: 1, dvStatus: 'valid' }],
    ['901123456-1', { base: '901123456', dv: 1, dvStatus: 'valid' }],
    [' 800.197.268 - 4 ', { base: '800197268', dv: 4, dvStatus: 'valid' }],
    ['901.123.456-7', { base: '901123456', dv: 7, dvStatus: 'invalid' }],
    ['901123456', { base: '901123456', dv: null, dvStatus: 'none' }],
    ['901.123.456', { base: '901123456', dv: null, dvStatus: 'none' }],
    // 10 digits without hyphen: last digit equals the DV of the first nine -> base + DV
    ['9011234561', { base: '901123456', dv: 1, dvStatus: 'valid' }],
    ['901.123.456.1', { base: '901123456', dv: 1, dvStatus: 'valid' }],
    // 10 digits whose last digit is not the calculated DV: a plain 10-digit base, no error invented
    ['9011234567', { base: '9011234567', dv: null, dvStatus: 'none' }],
    ['1.020.304.050', { base: '1020304050', dv: null, dvStatus: 'none' }],
    ['', { base: '', dv: null, dvStatus: 'none' }],
  ])('parses the NIT input %p', (raw, expected) => {
    expect(parseNitInput(raw)).toEqual(expected);
  });

  it.each([undefined, null, 123, {}])('treats %p as no NIT', (raw) => {
    expect(parseNitInput(raw)).toEqual({ base: '', dv: null, dvStatus: 'none' });
  });

  it('applies the verification digit rules only to NIT', () => {
    expect(normalizeDocumentForType('901.123.456-1', 'NIT')).toEqual({ documentId: '901123456', dvStatus: 'valid' });
    expect(normalizeDocumentForType('901123456-7', 'nit')).toEqual({ documentId: '901123456', dvStatus: 'invalid' });
    // A cedula is never checked: 10 digits ending in the "calculated" digit stay whole.
    expect(normalizeDocumentForType('9011234561', 'CC')).toEqual({ documentId: '9011234561', dvStatus: 'none' });
    expect(normalizeDocumentForType('AB-123', 'PASAPORTE')).toEqual({ documentId: 'AB123', dvStatus: 'none' });
    expect(normalizeDocumentForType('901123456-7', null)).toEqual({ documentId: '901123456', dvStatus: 'none' });
  });

  it('shows the DV only for a NIT with a numeric number', () => {
    expect(nitDvForDisplay('NIT', '800197268')).toBe(4);
    expect(nitDvForDisplay('nit', '901.123.456-7')).toBe(1); // legacy row: the stored digit is ignored, the calculated one is shown
    expect(nitDvForDisplay('CC', '800197268')).toBeNull();
    expect(nitDvForDisplay(null, '800197268')).toBeNull();
    expect(nitDvForDisplay('NIT', 'AB123')).toBeNull();
    expect(nitDvForDisplay('NIT', null)).toBeNull();
  });
});

describe('customer identity rules', () => {
  it.each([
    ['901123456', '901123456'],
    ['901.123.456', '901123456'],
    ['901.123.456-7', '901123456'],
    [' 901 123 456 - 7 ', '901123456'],
    ['901123456-7', '901123456'],
    ['1.020.304.050', '1020304050'],
    ['ab-123', 'AB123'],
    ['', ''],
  ])('normalizes the document %p to %p', (raw, expected) => {
    expect(normalizeDocumentId(raw)).toBe(expected);
  });

  it('does not guess a verification digit that was typed without hyphen', () => {
    expect(normalizeDocumentId('9011234567')).not.toBe(normalizeDocumentId('901123456'));
  });

  it.each([undefined, null, 123, {}])('treats %p as no document', (raw) => {
    expect(normalizeDocumentId(raw)).toBe('');
  });

  it('trims and lower-cases the email', () => {
    expect(normalizeEmail('  Ventas@ACME.co ')).toBe('ventas@acme.co');
    expect(normalizeEmail(undefined)).toBe('');
  });

  it('assumes NIT only when there is a document number', () => {
    expect(normalizeDocumentType(undefined, true)).toBe('NIT');
    expect(normalizeDocumentType(' cc ', true)).toBe('CC');
    expect(normalizeDocumentType(undefined, false)).toBeNull();
  });

  it('does not touch the database when there is nothing to compare', async () => {
    const prisma = { $queryRaw: jest.fn() } as any;
    await expect(findCustomersByIdentity(prisma, { documentId: '', email: '' })).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns an empty list when the driver gives nothing back', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue(undefined) } as any;
    await expect(findCustomersByIdentity(prisma, { email: 'a@b.co' })).resolves.toEqual([]);
  });
});
