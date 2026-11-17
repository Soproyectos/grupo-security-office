import { buildProductSearchSql, looksLikeCode, SEARCH_RANK } from './product-search';

describe('looksLikeCode', () => {
  it.each([
    'DS-PWA48-KIT-WB',
    'DS-PW',
    'ds-pw',
    '2CD2047',
    'DS2CD2047G3',
    'DS-2CD2047G3-LI2UY/S(L)(RB)',
    'DS-K1T341AM/F',
    'camara 4MP',
  ])('%p parece un código', (term) => {
    expect(looksLikeCode(term)).toBe(true);
  });

  it.each(['camara', 'domo ptz exterior', 'Cámara bala', 'kit', '%_'])('%p son palabras', (term) => {
    expect(looksLikeCode(term)).toBe(false);
  });
});

describe('buildProductSearchSql', () => {
  const code = buildProductSearchSql({ codeLike: true });
  const words = buildProductSearchSql({ codeLike: false });

  it('ordena exacta < prefijo < contiene < difusa', () => {
    expect(SEARCH_RANK).toEqual({ exact: 0, prefix: 1, contains: 2, fuzzy: 3 });
    expect(code.rank).toMatch(/^CASE WHEN .* THEN 0 WHEN .* THEN 1 WHEN .* THEN 2 ELSE 3 END$/s);
  });

  it('cubre SKU, modelo, referencias de fabricante y nombres', () => {
    for (const part of [code.exact, code.prefix, code.contains]) {
      expect(part).toContain('p."sku"');
      expect(part).toContain('p."catalogModel"');
      expect(part).toContain('p."catalogManufacturerRefs"');
      expect(part).toContain('p."name"');
      expect(part).toContain('p."catalogName"');
    }
  });

  it('la descripción solo cuenta (en "contiene") cuando el texto no parece un código', () => {
    expect(code.literal).not.toContain('p."description"');
    expect(words.contains).toContain('p."description"');
    expect(words.exact).not.toContain('p."description"');
    expect(words.prefix).not.toContain('p."description"');
  });

  it('usa el término solo como parámetro y sin LIKE (los comodines son literales)', () => {
    const custom = buildProductSearchSql({ codeLike: true, param: '$7', alias: 'x' });
    expect(custom.literal).toContain('$7');
    expect(custom.literal).not.toContain('$1');
    expect(custom.literal).toContain('x."sku"');
    expect(custom.literal).not.toMatch(/LIKE/i);
  });
});
