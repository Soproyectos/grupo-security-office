import { BadRequestException } from '@nestjs/common';
import { deflateRawSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import { MAX_XLSX_BYTES, readBoundedXlsxParts } from './xlsx-container';

interface FixturePart {
  name: string;
  data?: Buffer;
  method?: number;
  flags?: number;
  descriptor?: boolean;
  descriptorSignature?: boolean;
  centralName?: string;
  expandedBytes?: number;
  extra?: Buffer;
  attributes?: number;
}

function checksum(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function archive(parts: FixturePart[]): Buffer {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name);
    const centralName = Buffer.from(part.centralName ?? part.name);
    const data = part.data ?? Buffer.from('<data/>');
    const method = part.method ?? 8;
    const compressed = method === 8 ? deflateRawSync(data) : data;
    const crc = checksum(data);
    const expandedBytes = part.expandedBytes ?? data.length;
    const flags = (part.flags ?? 0) | (part.descriptor ? 8 : 0);
    const extra = part.extra ?? Buffer.alloc(0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(part.descriptor ? 0 : crc, 14);
    local.writeUInt32LE(part.descriptor ? 0 : compressed.length, 18);
    local.writeUInt32LE(part.descriptor ? 0 : expandedBytes, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    const descriptor = Buffer.alloc(part.descriptor ? (part.descriptorSignature === false ? 12 : 16) : 0);
    if (descriptor.length) {
      const base = descriptor.length === 16 ? 4 : 0;
      if (base) descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(crc, base);
      descriptor.writeUInt32LE(compressed.length, base + 4);
      descriptor.writeUInt32LE(expandedBytes, base + 8);
    }
    const record = Buffer.concat([local, name, extra, compressed, descriptor]);
    localRecords.push(record);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(expandedBytes, 24);
    central.writeUInt16LE(centralName.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(part.attributes ?? 0, 38);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(Buffer.concat([central, centralName, extra]));
    offset += record.length;
  }
  const directory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, directory, end]);
}

function centralOffset(buffer: Buffer): number {
  return buffer.readUInt32LE(buffer.length - 6);
}

describe('readBoundedXlsxParts', () => {
  it.each([true, false])('accepts a real SheetJS workbook (compression=%s)', (compression) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['REFERENCIA', 'DPP_ORO_IVA'], ['000123', 123456],
    ]), 'PRECIOS');
    const file = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression });
    const parts = readBoundedXlsxParts(file);
    expect(parts.has('[Content_Types].xml')).toBe(true);
    expect(parts.get('xl/worksheets/sheet1.xml')?.toString()).toContain('000123');
  });

  it.each([true, false])('accepts coherent streaming descriptors (signature=%s)', (signature) => {
    const file = archive([{ name: 'xl/workbook.xml', descriptor: true, descriptorSignature: signature }]);
    expect(readBoundedXlsxParts(file).get('xl/workbook.xml')?.toString()).toBe('<data/>');
  });

  it('accepts harmless directory entries and a ZIP comment', () => {
    const file = archive([{ name: 'xl/', data: Buffer.alloc(0) }, { name: 'xl/workbook.xml' }]);
    file.writeUInt16LE(4, file.length - 2);
    expect(readBoundedXlsxParts(Buffer.concat([file, Buffer.from('nota')])).size).toBe(2);
  });

  it('rejects an EOCD signature hidden in a comment that would redirect SheetJS', () => {
    const file = archive([{ name: 'xl/workbook.xml' }]);
    const comment = Buffer.alloc(22);
    comment.writeUInt32LE(0x06054b50);
    file.writeUInt16LE(comment.length, file.length - 2);
    expect(() => readBoundedXlsxParts(Buffer.concat([file, comment]))).toThrow(BadRequestException);
  });

  it('rejects input above 5 MB before opening the container', () => {
    expect(() => readBoundedXlsxParts(Buffer.alloc(MAX_XLSX_BYTES + 1))).toThrow('5 MB');
  });

  it('rejects more than 128 entries', () => {
    expect(() => readBoundedXlsxParts(archive(Array.from({ length: 129 }, (_, index) => ({ name: `${index}.xml` }))))).toThrow(BadRequestException);
  });

  it('rejects declared entries larger than 10 MB', () => {
    expect(() => readBoundedXlsxParts(archive([{ name: 'data.xml', expandedBytes: 10 * 1024 * 1024 + 1 }]))).toThrow('demasiados datos');
  });

  it('rejects more than 25 MB total declared output', () => {
    const file = archive(['a', 'b', 'c'].map((name) => ({ name, expandedBytes: 9 * 1024 * 1024 })));
    expect(() => readBoundedXlsxParts(file)).toThrow('demasiados datos');
  });

  it('bounds decompression even when size metadata lies', () => {
    const file = archive([{ name: 'bomb.xml', data: Buffer.alloc(10 * 1024 * 1024 + 1, 65), expandedBytes: 1 }]);
    expect(() => readBoundedXlsxParts(file)).toThrow('demasiados datos');
  });

  it('rejects false expanded size even below the decompression limit', () => {
    expect(() => readBoundedXlsxParts(archive([{ name: 'data.xml', expandedBytes: 1 }]))).toThrow(BadRequestException);
  });

  it.each(['../evil.xml', '/evil.xml', 'xl/../evil.xml', 'xl\\evil.xml', 'C:evil.xml', 'xl//evil.xml', 'xl/./evil.xml', 'xl/evil\0.xml'])(
    'rejects unsafe path %j', (name) => {
      expect(() => readBoundedXlsxParts(archive([{ name }]))).toThrow(BadRequestException);
    });

  it('rejects duplicate names including case variants', () => {
    expect(() => readBoundedXlsxParts(archive([{ name: 'xl/a.xml' }, { name: 'XL/a.xml' }]))).toThrow(BadRequestException);
  });

  it('rejects a local filename different from its central record', () => {
    expect(() => readBoundedXlsxParts(archive([{ name: 'xl/a.xml', centralName: 'xl/b.xml' }]))).toThrow(BadRequestException);
  });

  it.each([1, 0x40, 0x2000])('rejects encryption flags %i', (flags) => {
    expect(() => readBoundedXlsxParts(archive([{ name: 'data.xml', flags }]))).toThrow(BadRequestException);
  });

  it('rejects unsupported compression', () => {
    expect(() => readBoundedXlsxParts(archive([{ name: 'data.xml', method: 12 }]))).toThrow(BadRequestException);
  });

  it('rejects symbolic links', () => {
    expect(() => readBoundedXlsxParts(archive([{ name: 'link', attributes: (0xa1ff * 65536) >>> 0 }]))).toThrow(BadRequestException);
  });

  it.each(['xl/vbaProject.bin', 'xl/externalLinks/externalLink1.xml'])('rejects prohibited part %s', (name) => {
    expect(() => readBoundedXlsxParts(archive([{ name }]))).toThrow('macros ni enlaces');
  });

  it.each([
    '<Override ContentType="application/vnd.ms-office.vbaProject"/>',
    '<Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>',
    '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink"/>',
  ])('rejects prohibited content types and relationships', (xml) => {
    expect(() => readBoundedXlsxParts(archive([{ name: '[Content_Types].xml', data: Buffer.from(xml) }]))).toThrow('macros ni enlaces');
  });

  it('rejects macro-enabled defaults when a matching file actually exists', () => {
    const file = archive([
      { name: '[Content_Types].xml', data: Buffer.from('<Default Extension="bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/>') },
      { name: 'xl/renamed.bin' },
    ]);
    expect(() => readBoundedXlsxParts(file)).toThrow('macros ni enlaces');
  });

  it('inspects metadata in UTF-16 and XML character references', () => {
    const xml = '<Relationship Type="http://example.test/vba&#x50;roject"/>';
    const data = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
    expect(() => readBoundedXlsxParts(archive([{ name: 'xl/_rels/workbook.xml.rels', data }]))).toThrow('macros ni enlaces');
  });

  it('rejects XML entity declarations', () => {
    const data = Buffer.from('<!DOCTYPE Types [<!ENTITY bad "vbaProject">]><Types/>');
    expect(() => readBoundedXlsxParts(archive([{ name: '[Content_Types].xml', data }]))).toThrow(BadRequestException);
  });

  it('rejects duplicated relationship attributes rather than choosing one', () => {
    const data = Buffer.from('<Relationship Type="safe" Type="vbaProject"/>');
    expect(() => readBoundedXlsxParts(archive([{ name: '_rels/.rels', data }]))).toThrow(BadRequestException);
  });

  it('checks stored file checksums', () => {
    const file = archive([{ name: 'data.xml', method: 0 }]);
    file[30 + 'data.xml'.length] ^= 1;
    expect(() => readBoundedXlsxParts(file)).toThrow(BadRequestException);
  });

  it('checks descriptor values', () => {
    const file = archive([{ name: 'data.xml', descriptor: true }]);
    file[centralOffset(file) - 12] ^= 1;
    expect(() => readBoundedXlsxParts(file)).toThrow(BadRequestException);
  });

  it.each([0, 5, 21, 30])('rejects truncated files (%i bytes removed)', (removed) => {
    const file = archive([{ name: 'data.xml' }]);
    expect(() => readBoundedXlsxParts(removed ? file.subarray(0, -removed) : Buffer.alloc(0))).toThrow(BadRequestException);
  });

  it('rejects multidisk archives', () => {
    const file = archive([{ name: 'data.xml' }]);
    file.writeUInt16LE(1, file.length - 18);
    expect(() => readBoundedXlsxParts(file)).toThrow(BadRequestException);
  });

  it('rejects ZIP64 markers', () => {
    const file = archive([{ name: 'data.xml' }]);
    file.writeUInt32LE(0xffffffff, file.length - 6);
    expect(() => readBoundedXlsxParts(file)).toThrow(BadRequestException);
  });

  it('rejects ZIP64 extra fields', () => {
    expect(() => readBoundedXlsxParts(archive([{ name: 'data.xml', extra: Buffer.from([1, 0, 0, 0]) }]))).toThrow('ZIP64');
  });

  it('rejects an incorrect central directory size', () => {
    const file = archive([{ name: 'data.xml' }]);
    file.writeUInt32LE(1, file.length - 10);
    expect(() => readBoundedXlsxParts(file)).toThrow(BadRequestException);
  });

  it('rejects entry offsets outside the local section', () => {
    const file = archive([{ name: 'data.xml' }]);
    file.writeUInt32LE(file.length, centralOffset(file) + 42);
    expect(() => readBoundedXlsxParts(file)).toThrow(BadRequestException);
  });

  it('rejects overlapping local entries', () => {
    const file = archive([{ name: 'a' }, { name: 'b' }]);
    const secondCentral = centralOffset(file) + 46 + 1;
    file.writeUInt32LE(0, secondCentral + 42);
    expect(() => readBoundedXlsxParts(file)).toThrow(BadRequestException);
  });
});
