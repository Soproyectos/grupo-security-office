import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { readPriceTemplate } from './price-template';
import { readBoundedXlsxParts } from './xlsx-container';

function template(data: unknown[][], edit?: (sheet: XLSX.WorkSheet, book: XLSX.WorkBook) => void): Buffer {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(book, sheet, 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía de prueba']]), 'INSTRUCCIONES');
  edit?.(sheet, book);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
}

describe('Price template contract using actual XLSX files', () => {
  it('preserves text references and rounds final COP half up without adding IVA', () => {
    const parsed = readPriceTemplate(template([
      ['REFERENCIA', 'INSTALADOR_IVA', 'TIENDA_IVA', 'DPP_ORO_IVA'],
      [' 001-CAM-A ', 123456.49, 123456.5, '200000'],
    ]));
    expect(parsed.rows[0]).toMatchObject({ sku: '001-CAM-A', status: 'valid', prices: [
      { raw: '123456.49', rounded: '123456', wasRounded: true },
      { raw: '123456.5', rounded: '123457', wasRounded: true },
      { raw: '200000', rounded: '200000', wasRounded: false },
    ] });
  });

  it('reads only PRECIOS even if the instructions come first and contain other data', () => {
    const parsed = readPriceTemplate(template([['REFERENCIA', 'DPP_ORO_IVA'], ['SKU-A', 10]], (_, book) => {
      book.SheetNames.reverse();
      book.Sheets.INSTRUCCIONES = XLSX.utils.aoa_to_sheet([['No importar'], ['SKU-B', -99]]);
    }));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].sku).toBe('SKU-A');
  });

  it('keeps blanks out of the update and skips prepared empty rows', () => {
    const parsed = readPriceTemplate(template([
      ['REFERENCIA', 'TIENDA_IVA', 'INSTALADOR_IVA'], ['SKU-A', null, 123], [],
    ], (sheet) => { sheet['!ref'] = 'A1:C2001'; }));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].prices).toEqual([expect.objectContaining({ code: 'INSTALADOR_IVA', rounded: '123' })]);
  });

  it('marks both duplicates regardless of case and outside whitespace', () => {
    const parsed = readPriceTemplate(template([
      ['REFERENCIA', 'DPP_ORO_IVA'], ['SKU-A', 10], [' sku-a ', 20],
    ]));
    expect(parsed.rows.map((r) => r.status)).toEqual(['error', 'error']);
    for (const row of parsed.rows) expect(row.issues).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_REFERENCE' }));
  });

  it('does not collapse different internal spaces or punctuation in references', () => {
    const parsed = readPriceTemplate(template([
      ['REFERENCIA', 'DPP_ORO_IVA'], ['SKU-A', 10], ['SKU A', 20], ['SKUA', 30],
    ]));
    expect(parsed.rows.every((r) => r.status === 'valid')).toBe(true);
  });

  it.each([0, -10, 0.49, 9999999999.5, 1e25])('rejects out-of-range price %s', (value) => {
    const row = readPriceTemplate(template([['REFERENCIA', 'DPP_ORO_IVA'], ['SKU-A', value]])).rows[0];
    expect(row.issues).toContainEqual(expect.objectContaining({ code: 'PRICE_OUT_OF_RANGE' }));
    expect(row.prices).toEqual([]);
  });

  it.each(['123.456', '123,456', '$123456', '1e3', '123,50', '9'.repeat(100), true, new Date('2026-01-01')])('rejects ambiguous or non-number value %s', (value) => {
    const row = readPriceTemplate(template([['REFERENCIA', 'DPP_ORO_IVA'], ['SKU-A', value]])).rows[0];
    expect(row.issues).toContainEqual(expect.objectContaining({ code: 'INVALID_PRICE' }));
  });

  it('rejects formulas even when the cached result is a valid price', () => {
    const input = template([['REFERENCIA', 'DPP_ORO_IVA'], ['SKU-A', 100]], (sheet) => {
      sheet.B2 = { t: 'n', v: 100, f: '50+50' };
    });
    expect(() => readPriceTemplate(input)).toThrow(BadRequestException);
  });

  it('requires a reference as text and at least one price in each populated row', () => {
    const parsed = readPriceTemplate(template([
      ['REFERENCIA', 'DPP_ORO_IVA'], [123, 100], ['SKU-B'], [null, 10],
    ]));
    expect(parsed.rows.map((r) => r.status)).toEqual(['error', 'error', 'error']);
    expect(parsed.rows[0].issues[0].code).toBe('INVALID_REFERENCE');
    expect(parsed.rows[1].issues[0].code).toBe('PRICE_REQUIRED');
  });

  it.each([
    [['SKU', 'DPP_ORO_IVA'], ['SKU-A', 10]],
    [['REFERENCIA', 'ORO_IVA'], ['SKU-A', 10]],
    [['REFERENCIA', 'ORO_SIN_IVA'], ['SKU-A', 10]],
    [['REFERENCIA', 'DPP_ORO_IVA', 'DPP_ORO_IVA'], ['SKU-A', 10, 10]],
    [['REFERENCIA'], ['SKU-A']],
  ])('rejects altered or duplicate headers', (...data) => {
    expect(() => readPriceTemplate(template(data as unknown[][]))).toThrow(BadRequestException);
  });

  it('rejects an extra sheet, merged cells, empty templates and oversized row ranges', () => {
    const data = [['REFERENCIA', 'DPP_ORO_IVA'], ['SKU-A', 10]];
    expect(() => readPriceTemplate(template(data, (_, book) => {
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['extra']]), 'OTRA');
    }))).toThrow(BadRequestException);
    expect(() => readPriceTemplate(template(data, (sheet) => { sheet['!merges'] = [XLSX.utils.decode_range('A2:B2')]; }))).toThrow(BadRequestException);
    expect(() => readPriceTemplate(template([data[0]]))).toThrow(BadRequestException);
    expect(() => readPriceTemplate(template(data, (sheet) => { sheet['!ref'] = 'A1:B5002'; }))).toThrow(BadRequestException);
  });

  it('checks all 5000 allowed rows, including an error at the end', () => {
    const rows: unknown[][] = [['REFERENCIA', 'DPP_ORO_IVA']];
    for (let i = 0; i < 5000; i++) rows.push([`FIXTURE-${i}`, i === 4999 ? -1 : 100]);
    const parsed = readPriceTemplate(template(rows));
    expect(parsed.rows).toHaveLength(5000);
    expect(parsed.rows[4999]).toMatchObject({ row: 5001, status: 'error' });
  });

  it.each([
    ['</sheetData>', '<row r="3"><c r="C3"><v>99</v></c></row></sheetData>'],
    ['</sheetData>', '<row r="5002"><c r="B5002"><v>99</v></c></row></sheetData>'],
    ['<v>100</v></c>', '<v>100</v></c><c r="B2"><v>999</v></c>'],
  ])('rejects contradictory physical cells in a valid XLSX container', (before, after) => {
    const input = template([['REFERENCIA', 'DPP_ORO_IVA'], ['SKU-A', 100]]);
    const container = XLSX.CFB.read(input, { type: 'buffer' });
    const entry = container.FileIndex[container.FullPaths.findIndex((p) => p.endsWith('/xl/worksheets/sheet1.xml'))];
    const xml = Buffer.from(entry.content).toString('utf8');
    expect(xml).toContain(before);
    entry.content = Buffer.from(xml.replace(before, after));
    entry.size = entry.content.length;
    const changed = XLSX.CFB.write(container, { type: 'buffer', fileType: 'zip', compression: true }) as Buffer;
    expect(() => readBoundedXlsxParts(changed)).not.toThrow();
    expect(() => readPriceTemplate(changed)).toThrow(BadRequestException);
  });

  describe('purchasing template (sheet PLANTILLA, readable headers)', () => {
    const purchasing = (data: unknown[][], sheetName = 'PLANTILLA') => {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data), sheetName);
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
      return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
    };
    const headers = ['REFERENCIA *', 'PRECIO INSTALADOR (CON IVA)', 'PRECIO TIENDA (CON IVA)', 'PRECIO DPP ORO (CON IVA)',
      'PRECIO DPP PLATINO (CON IVA)', 'PRECIO CLIENTE FINAL (CON IVA)', 'PRECIO ORO (SIN IVA)', 'PRECIO INSTALLER (SIN IVA)'];

    it('maps readable headers to tariffs, ignores the SIN IVA columns and the example note', () => {
      const parsed = readPriceTemplate(purchasing([
        headers,
        ['FIXTURE-A(2.8mm)', 1190.4, 1000, 900, 800, 1500, 756, 1000],
        ['FIXTURE-B', 2000, null, null, null, 3000],
        [],
        ['Nota: estas filas son ejemplos; borrar antes de usar.'],
      ]));
      expect(parsed.tariffs).toEqual(['INSTALADOR_IVA', 'TIENDA_IVA', 'DPP_ORO_IVA', 'DPP_PLATINO_IVA', 'CLIENTE_FINAL_IVA']);
      expect(parsed.ignoredColumns).toEqual(['PRECIO ORO (SIN IVA)', 'PRECIO INSTALLER (SIN IVA)']);
      expect(parsed.rows.map((r) => r.sku)).toEqual(['FIXTURE-A(2.8mm)', 'FIXTURE-B']);
      expect(parsed.rows[0].prices.map((p) => [p.code, p.rounded])).toEqual([
        ['INSTALADOR_IVA', '1190'], ['TIENDA_IVA', '1000'], ['DPP_ORO_IVA', '900'], ['DPP_PLATINO_IVA', '800'], ['CLIENTE_FINAL_IVA', '1500']]);
      expect(parsed.rows[0].status).toBe('valid');
    });

    it('still accepts the PRECIOS sheet with readable headers and rejects a file with only SIN IVA columns', () => {
      expect(readPriceTemplate(purchasing([headers.slice(0, 2), ['FIXTURE-A', 10]], 'PRECIOS')).rows).toHaveLength(1);
      expect(() => readPriceTemplate(purchasing([['REFERENCIA', 'PRECIO ORO (SIN IVA)'], ['FIXTURE-A', 10]]))).toThrow(BadRequestException);
    });

    it('does not let a SIN IVA value become a price and rejects unknown readable headers', () => {
      const parsed = readPriceTemplate(purchasing([headers, ['FIXTURE-A', null, null, null, null, null, 756, 1000]]));
      expect(parsed.rows[0].issues).toContainEqual(expect.objectContaining({ code: 'PRICE_REQUIRED' }));
      expect(() => readPriceTemplate(purchasing([['REFERENCIA', 'PRECIO PLATA (CON IVA)'], ['FIXTURE-A', 10]]))).toThrow(BadRequestException);
    });

    it('names the column and title that cannot be read, and tolerates a trailing asterisk', () => {
      expect(() => readPriceTemplate(purchasing([['REFERENCIA', 'PRECIO TIENDA (CON IVA)', 'PRECIO PLATA (CON IVA)'], ['FIXTURE-A', 1, 2]])))
        .toThrow(/columna C: «PRECIO PLATA \(CON IVA\)» no es una tarifa/);
      expect(() => readPriceTemplate(purchasing([['REFERENCIA', 'PRECIO TIENDA (CON IVA)', 'PRECIO TIENDA (CON IVA)'], ['FIXTURE-A', 1, 2]])))
        .toThrow(/columna C: «PRECIO TIENDA \(CON IVA\)» está repetida/);
      expect(readPriceTemplate(purchasing([['REFERENCIA', 'PRECIO TIENDA (CON IVA) *'], ['FIXTURE-A', 1]])).tariffs).toEqual(['TIENDA_IVA']);
    });

    it('ignores empty trailing columns kept in the sheet range but rejects data under them', () => {
      const withEmptyTail = purchasing([['REFERENCIA', 'PRECIO TIENDA (CON IVA)'], ['FIXTURE-A', 1]]);
      const book = XLSX.read(withEmptyTail, { type: 'buffer' });
      book.Sheets.PLANTILLA['!ref'] = 'A1:H5';
      const padded = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      expect(readPriceTemplate(padded).tariffs).toEqual(['TIENDA_IVA']);
      expect(() => readPriceTemplate(purchasing([['REFERENCIA', 'PRECIO TIENDA (CON IVA)', null], ['FIXTURE-A', 1, 5]])))
        .toThrow(/columna C tiene datos pero no tiene título/);
    });

    it('rejects workbooks that carry both data sheets', () => {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers.slice(0, 2), ['FIXTURE-A', 10]]), 'PRECIOS');
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers.slice(0, 2), ['FIXTURE-A', 10]]), 'PLANTILLA');
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía']]), 'INSTRUCCIONES');
      expect(() => readPriceTemplate(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer)).toThrow(BadRequestException);
    });
  });

  describe('files re-saved by a spreadsheet app', () => {
    const edit = (input: Buffer, part: string, change: (xml: string) => string) => {
      const container = XLSX.CFB.read(input, { type: 'buffer' });
      const entry = container.FileIndex[container.FullPaths.findIndex((p) => p.endsWith(part))];
      const xml = change(Buffer.from(entry.content).toString('utf8'));
      entry.content = Buffer.from(xml);
      entry.size = entry.content.length;
      return XLSX.CFB.write(container, { type: 'buffer', fileType: 'zip', compression: true }) as Buffer;
    };
    const base = () => template([['REFERENCIA', 'DPP_ORO_IVA'], ['FIXTURE-A', 100]]);
    const extension = '<extLst><ext xmlns:loext="http://schemas.libreoffice.org/" uri="{1}"><loext:extCalcPr stringRefSyntax="CalcA1ExcelA1"/></ext></extLst>';

    it('accepts vendor extension elements in other namespaces (Excel, LibreOffice)', () => {
      const withBook = edit(base(), 'xl/workbook.xml', (xml) => xml.replace('</workbook>', `${extension}</workbook>`));
      const withSheet = edit(withBook, 'xl/worksheets/sheet1.xml', (xml) => xml.replace('</worksheet>', `${extension}</worksheet>`));
      expect(readPriceTemplate(withSheet).rows.map((r) => r.sku)).toEqual(['FIXTURE-A']);
    });

    it('still rejects a foreign element that reuses a structural name', () => {
      const smuggled = edit(base(), 'xl/worksheets/sheet1.xml', (xml) =>
        xml.replace('</worksheet>', '<extLst><ext xmlns:x="urn:x" uri="{1}"><x:row r="9"/></ext></extLst></worksheet>'));
      expect(() => readPriceTemplate(smuggled)).toThrow(BadRequestException);
    });
  });
});
