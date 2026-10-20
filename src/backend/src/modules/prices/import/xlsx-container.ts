import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';

export const MAX_XLSX_BYTES = 5 * 1024 * 1024;
const MAX_PART_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 25 * 1024 * 1024;
const MAX_PARTS = 128;
const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const DESCRIPTOR_SIGNATURE = 0x08074b50;

interface ZipPart {
  name: string;
  nameBytes: Buffer;
  flags: number;
  method: number;
  crc: number;
  compressedBytes: number;
  expandedBytes: number;
  localOffset: number;
}

function invalid(message = 'El archivo no es una plantilla Excel válida. Vuelve a guardarlo como .xlsx.'): never {
  throw new BadRequestException(message);
}

function requireRange(buffer: Buffer, start: number, size: number, end = buffer.length): void {
  if (start < 0 || size < 0 || start + size > end || end > buffer.length) invalid();
}

function checkExtras(buffer: Buffer, start: number, length: number): void {
  const end = start + length;
  requireRange(buffer, start, length);
  for (let cursor = start; cursor < end;) {
    requireRange(buffer, cursor, 4, end);
    const tag = buffer.readUInt16LE(cursor);
    const size = buffer.readUInt16LE(cursor + 2);
    if (tag === 0x0001) invalid('La plantilla usa un formato ZIP64 que no está permitido.');
    requireRange(buffer, cursor + 4, size, end);
    cursor += 4 + size;
  }
}

function readName(bytes: Buffer, flags: number): string {
  const name = bytes.toString('utf8');
  if (!name || !Buffer.from(name, 'utf8').equals(bytes) ||
      (!(flags & 0x0800) && bytes.some((value) => value > 0x7f)) ||
      /[\\:\u0000-\u001f\u007f]/.test(name) || name.startsWith('/')) invalid();
  const segments = name.replace(/\/$/, '').split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) invalid();
  if (/(^|\/)vbaProject[^/]*|(^|\/)externalLinks(\/|$)/i.test(name)) {
    invalid('La plantilla no debe contener macros ni enlaces a otros libros de Excel.');
  }
  return name;
}

function findEnd(buffer: Buffer): number {
  // SheetJS uses the final signature, even inside a comment: accept only that same record.
  const signature = Buffer.alloc(4);
  signature.writeUInt32LE(END_SIGNATURE);
  const offset = buffer.lastIndexOf(signature);
  if (offset < Math.max(0, buffer.length - 65557) || offset + 22 > buffer.length ||
      offset + 22 + buffer.readUInt16LE(offset + 20) !== buffer.length) invalid();
  return offset;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function checkActiveContent(part: ZipPart, data: Buffer, parts: ZipPart[]): void {
  if (!/\.xml$|\.rels$/i.test(part.name)) return;
  const isBigEndian = (data[0] === 0xfe && data[1] === 0xff) || (data[0] === 0 && data[1] === 0x3c);
  if (isBigEndian && data.length % 2) invalid();
  const xmlBytes = isBigEndian ? Buffer.from(data).swap16() : data;
  const encoding = (xmlBytes[0] === 0xff && xmlBytes[1] === 0xfe) ||
    (xmlBytes[0] === 0x3c && xmlBytes[1] === 0) ? 'utf16le' : 'utf8';
  const xml = xmlBytes.toString(encoding).replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi,
    (original, hex, decimal) => {
      const code = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : original;
    });
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) invalid();
  for (const match of xml.matchAll(/<(?:[\w.-]+:)?(Override|Default|Relationship)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
    const attributes = new Map<string, string>();
    for (const attribute of match[0].matchAll(/\s([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const name = attribute[1].toLowerCase();
      if (attributes.has(name)) invalid();
      attributes.set(name, attribute[2] ?? attribute[3]);
    }
    const type = attributes.get('contenttype') ?? attributes.get('type');
    if (!type || !/vbaProject|macroEnabled|externalLink/i.test(type)) continue;
    // SheetJS includes an unused macro-enabled BIN default in ordinary XLSX files.
    const extension = attributes.get('extension')?.toLowerCase();
    if (match[1].toLowerCase() === 'default' && extension &&
        !parts.some((entry) => entry.name.toLowerCase().endsWith(`.${extension}`))) continue;
    invalid('La plantilla no debe contener macros ni enlaces a otros libros de Excel.');
  }
}

function readDirectory(buffer: Buffer, end: number): { parts: ZipPart[]; offset: number } {
  if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) invalid();
  const count = buffer.readUInt16LE(end + 10);
  const size = buffer.readUInt32LE(end + 12);
  const offset = buffer.readUInt32LE(end + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) invalid();
  if (!count || count > MAX_PARTS || buffer.readUInt16LE(end + 8) !== count ||
      offset + size !== end) invalid();
  requireRange(buffer, offset, size, end);

  const parts: ZipPart[] = [];
  const names = new Set<string>();
  let cursor = offset;
  let expandedBytes = 0;
  for (let index = 0; index < count; index++) {
    requireRange(buffer, cursor, 46, end);
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) invalid();
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedBytes = buffer.readUInt32LE(cursor + 20);
    const partBytes = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const mode = buffer.readUInt32LE(cursor + 38) >>> 16;
    // Only regular files and directories are meaningful parts of an Excel workbook.
    if (buffer.readUInt16LE(cursor + 6) > 20 ||
        (flags & ~0x080e) || (method !== 0 && method !== 8) ||
        buffer.readUInt16LE(cursor + 34) !== 0 ||
        compressedBytes === 0xffffffff || partBytes === 0xffffffff ||
        localOffset === 0xffffffff ||
        ((mode & 0xf000) !== 0 && (mode & 0xf000) !== 0x8000 && (mode & 0xf000) !== 0x4000)) invalid();
    if (partBytes > MAX_PART_BYTES || (expandedBytes += partBytes) > MAX_EXPANDED_BYTES) {
      invalid('El archivo contiene demasiados datos. Divide la lista en archivos más pequeños.');
    }
    requireRange(buffer, cursor + 46, nameLength + extraLength + commentLength, end);
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = readName(nameBytes, flags);
    const uniqueName = name.normalize('NFC').toLowerCase();
    if (names.has(uniqueName) || (name.endsWith('/') && partBytes !== 0)) invalid();
    names.add(uniqueName);
    checkExtras(buffer, cursor + 46 + nameLength, extraLength);
    parts.push({ name, nameBytes, flags, method, compressedBytes, expandedBytes: partBytes,
      localOffset, crc: buffer.readUInt32LE(cursor + 16) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end) invalid();
  return { parts, offset };
}

function readLocalPart(buffer: Buffer, part: ZipPart, directoryOffset: number):
  { compressed: Buffer; nextOffset: number } {
  const offset = part.localOffset;
  requireRange(buffer, offset, 30, directoryOffset);
  if (buffer.readUInt32LE(offset) !== LOCAL_SIGNATURE ||
      buffer.readUInt16LE(offset + 4) > 20 ||
      buffer.readUInt16LE(offset + 6) !== part.flags ||
      buffer.readUInt16LE(offset + 8) !== part.method) invalid();
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  requireRange(buffer, offset + 30, nameLength + extraLength, directoryOffset);
  if (!buffer.subarray(offset + 30, offset + 30 + nameLength).equals(part.nameBytes)) invalid();
  checkExtras(buffer, offset + 30 + nameLength, extraLength);
  const localValues = [buffer.readUInt32LE(offset + 14), buffer.readUInt32LE(offset + 18),
    buffer.readUInt32LE(offset + 22)];
  const expectedValues = [part.crc, part.compressedBytes, part.expandedBytes];
  const hasDescriptor = Boolean(part.flags & 8);
  if (localValues.some((value, index) => value !== expectedValues[index] &&
      !(hasDescriptor && value === 0))) invalid();
  const dataOffset = offset + 30 + nameLength + extraLength;
  requireRange(buffer, dataOffset, part.compressedBytes, directoryOffset);
  let nextOffset = dataOffset + part.compressedBytes;
  if (hasDescriptor) {
    requireRange(buffer, nextOffset, 12, directoryOffset);
    const matches = (start: number) => expectedValues.every((value, index) =>
      buffer.readUInt32LE(start + index * 4) === value);
    if (!matches(nextOffset)) {
      if (buffer.readUInt32LE(nextOffset) !== DESCRIPTOR_SIGNATURE) invalid();
      nextOffset += 4;
      requireRange(buffer, nextOffset, 12, directoryOffset);
      if (!matches(nextOffset)) invalid();
    }
    nextOffset += 12;
  }
  return { compressed: buffer.subarray(dataOffset, dataOffset + part.compressedBytes), nextOffset };
}

/** Bound and validate every ZIP entry before passing the original workbook to SheetJS. */
export function readBoundedXlsxParts(buffer: Buffer): Map<string, Buffer> {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) invalid();
  if (buffer.length > MAX_XLSX_BYTES) invalid('El archivo supera el límite de 5 MB.');
  const { parts, offset } = readDirectory(buffer, findEnd(buffer));
  const result = new Map<string, Buffer>();
  let cursor = 0;
  let total = 0;
  for (const part of parts.sort((left, right) => left.localOffset - right.localOffset)) {
    // Reject overlapping entries, hidden local files and ambiguous ZIP padding.
    if (part.localOffset !== cursor) invalid();
    const { compressed, nextOffset } = readLocalPart(buffer, part, offset);
    let data: Buffer;
    if (part.method === 0) {
      data = compressed;
    } else {
      try {
        const inflated = inflateRawSync(compressed, {
          maxOutputLength: Math.max(1, Math.min(part.expandedBytes, MAX_PART_BYTES, MAX_EXPANDED_BYTES - total)),
          info: true,
        }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
        if (inflated.engine.bytesWritten !== compressed.length) invalid();
        data = inflated.buffer;
      } catch {
        invalid('No se pudo leer la plantilla o contiene demasiados datos. Vuelve a guardarla como .xlsx.');
      }
    }
    total += data.length;
    if (data.length !== part.expandedBytes || data.length > MAX_PART_BYTES ||
        total > MAX_EXPANDED_BYTES || crc32(data) !== part.crc) invalid();
    checkActiveContent(part, data, parts);
    result.set(part.name, data);
    cursor = nextOffset;
  }
  if (cursor !== offset) invalid();
  return result;
}
