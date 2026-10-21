import { BadRequestException } from '@nestjs/common';
import { validatePriceWorkbookStructure } from './price-workbook-structure';

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const DOCUMENT_RELS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPES = '[Content_Types].xml';
const WORKBOOK = 'xl/workbook.xml';
const RELATIONSHIPS = 'xl/_rels/workbook.xml.rels';
const PRICES = 'xl/worksheets/sheet1.xml';
const INSTRUCTIONS = 'xl/worksheets/sheet2.xml';

function worksheet(dimension = 'A1:B2', rows = [
  '<row r="1"><c r="A1" t="inlineStr"><is><t>REFERENCIA</t></is></c><c r="B1" t="inlineStr"><is><t>DPP_ORO_IVA</t></is></c></row>',
  '<row r="2"><c r="A2" t="inlineStr"><is><t>000123-CAM</t></is></c><c r="B2"><v>123456.5</v></c></row>',
].join('')): string {
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${MAIN_NS}"><dimension ref="${dimension}"/><sheetData>${rows}</sheetData></worksheet>`;
}

function fixture(): Map<string, Buffer> {
  return new Map(Object.entries({
    [CONTENT_TYPES]: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': `<Relationships xmlns="${PACKAGE_RELS_NS}"><Relationship Id="rId0" Type="${DOCUMENT_RELS_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    [WORKBOOK]: `<?xml version="1.0"?><workbook xmlns="${MAIN_NS}" xmlns:r="${DOCUMENT_RELS_NS}"><sheets><sheet name="PRECIOS" sheetId="1" r:id="rId1"/><sheet name="INSTRUCCIONES" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    [RELATIONSHIPS]: `<Relationships xmlns="${PACKAGE_RELS_NS}"><Relationship Id="rId1" Type="${DOCUMENT_RELS_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${DOCUMENT_RELS_NS}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    [PRICES]: worksheet(),
    [INSTRUCTIONS]: worksheet('A1', '<row r="1"><c r="A1" t="inlineStr"><is><t>Rellena PRECIOS y conserva esta guía.</t></is></c></row>'),
  }).map(([name, xml]) => [name, Buffer.from(xml)]));
}

function replace(parts: Map<string, Buffer>, part: string, before: string, after: string): void {
  const xml = parts.get(part)!.toString('utf8');
  if (!xml.includes(before)) throw new Error(`Fixture does not contain ${before}`);
  parts.set(part, Buffer.from(xml.replace(before, after)));
}

describe('validatePriceWorkbookStructure — inspect every XML cell before SheetJS', () => {
  it('accepts the two agreed sheets with standard default namespaces and a numeric price', () => {
    expect(() => validatePriceWorkbookStructure(fixture())).not.toThrow();
  });

  it.each(['A5002', 'B5002', 'G3', 'C3'])('rejects hidden cell %s outside the declared A1:B2 dimension', (address) => {
    const parts = fixture();
    const row = address.match(/\d+$/)![0];
    replace(parts, PRICES, '</sheetData>', `<row r="${row}"><c r="${address}"><v>99</v></c></row></sheetData>`);
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it('rejects a duplicated row even when its second occurrence is empty', () => {
    const parts = fixture();
    replace(parts, PRICES, '</sheetData>', '<row r="2"/></sheetData>');
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it('rejects a duplicated B2 cell instead of accepting whichever value the reader keeps', () => {
    const parts = fixture();
    replace(parts, PRICES, '<v>123456.5</v></c>', '<v>123456.5</v></c><c r="B2"><v>999</v></c>');
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it.each([
    '<f>50+50</f>',
    '<f/>',
    '<f t="shared" si="0"/>',
    '<f t="array" ref="B2:B2">50+50</f>',
    '<f t="array" ref="B2:B2"/>',
  ])('rejects formula markup %s even with a harmless cached price', (formula) => {
    const parts = fixture();
    replace(parts, PRICES, '<v>123456.5</v>', `${formula}<v>123456.5</v>`);
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it('rejects an extra sheet even when it points to an existing worksheet', () => {
    const parts = fixture();
    replace(parts, WORKBOOK, '</sheets>', '<sheet name="OTRA" sheetId="3" r:id="rId1"/></sheets>');
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it.each(['Precios', 'PRECIOS_ANTERIORES', 'PRECIOS '])('rejects the altered sheet name %s', (name) => {
    const parts = fixture();
    replace(parts, WORKBOOK, 'name="PRECIOS"', `name="${name}"`);
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it('rejects duplicate relationship identifiers', () => {
    const parts = fixture();
    replace(parts, RELATIONSHIPS, 'Id="rId2"', 'Id="rId1"');
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it('rejects two sheet relationships that target the same worksheet path', () => {
    const parts = fixture();
    replace(parts, RELATIONSHIPS, 'Target="worksheets/sheet2.xml"', 'Target="worksheets/sheet1.xml"');
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it('rejects a second main workbook even when its XML part exists', () => {
    const parts = fixture();
    parts.set('xl/alternate.xml', parts.get(WORKBOOK)!);
    replace(parts, CONTENT_TYPES, '</Types>', '<Override PartName="/xl/alternate.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>');
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it('rejects a main workbook mapped exclusively to an alternative path', () => {
    const parts = fixture();
    parts.set('xl/alternate.xml', parts.get(WORKBOOK)!);
    replace(parts, CONTENT_TYPES, 'PartName="/xl/workbook.xml"', 'PartName="/xl/alternate.xml"');
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it('rejects a repeated content-type PartName even for a worksheet rather than a main workbook', () => {
    const parts = fixture();
    replace(parts, CONTENT_TYPES, '</Types>', '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it.each([CONTENT_TYPES, WORKBOOK, RELATIONSHIPS, PRICES, INSTRUCTIONS])('rejects malformed XML in %s', (part) => {
    const parts = fixture();
    parts.set(part, Buffer.from(parts.get(part)!.toString('utf8').slice(0, -1)));
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it.each([CONTENT_TYPES, WORKBOOK, RELATIONSHIPS, PRICES, INSTRUCTIONS])('rejects the missing mandatory part %s', (part) => {
    const parts = fixture();
    parts.delete(part);
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  describe.each([CONTENT_TYPES, WORKBOOK, RELATIONSHIPS, PRICES, INSTRUCTIONS])('unambiguous XML in %s', (part) => {
    it.each(['<!-- hidden markup -->', '<![CDATA[hidden markup]]>', '<?other-reader hidden?>'])('rejects %s', (markup) => {
      const parts = fixture();
      const xml = parts.get(part)!.toString('utf8');
      // Insert inside the root: these are valid XML constructs, rather than a broken declaration.
      parts.set(part, Buffer.from(xml.replace(/(<[A-Za-z][^>]*>)/, `$1${markup}`)));
      expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
    });
  });

  it.each([
    { part: PRICES, before: 'r="B2"', after: 'r="B&#50;"' },
    { part: WORKBOOK, before: 'name="PRECIOS"', after: 'name="PR&#69;CIOS"' },
  ])('rejects entity-encoded structural attributes: $after', ({ part, before, after }) => {
    const parts = fixture();
    replace(parts, part, before, after);
    expect(() => validatePriceWorkbookStructure(parts)).toThrow(BadRequestException);
  });

  it('allows escaped inline text and an entity-encoded accent in a data-validation message', () => {
    const parts = fixture();
    replace(parts, PRICES, '000123-CAM', '000123-CAM &amp; cable &lt;2&gt;');
    replace(parts, PRICES, '</worksheet>', '<dataValidations count="1"><dataValidation type="decimal" operator="greaterThan" sqref="B2:B5001" errorTitle="Precio no v&#225;lido"><formula1>0</formula1></dataValidation></dataValidations></worksheet>');
    expect(() => validatePriceWorkbookStructure(parts)).not.toThrow();
  });
});
