/** Bounded ZIP/STORE writer. No paths are taken from uploaded filenames. */
export interface ZipEntry { path: string; data: Buffer }

export const ZIP_LIMITS = { entries: 20_000, entryBytes: 10 * 1024 * 1024, totalBytes: 50 * 1024 * 1024 } as const;

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function assertZipPath(path: string): void {
  if (typeof path !== 'string' || path.length > 240 || !/^[A-Za-z0-9_.\/-]+$/.test(path) ||
      path.startsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('zip-unsafe-path');
  }
}

export function writeStoredZip(entries: readonly ZipEntry[]): Buffer {
  if (!entries.length || entries.length > ZIP_LIMITS.entries) throw new Error('zip-entry-limit');
  const names = new Set<string>();
  let totalSize = 22;
  for (const entry of entries) {
    assertZipPath(entry.path);
    if (names.has(entry.path)) throw new Error('zip-duplicate-path');
    names.add(entry.path);
    if (!Buffer.isBuffer(entry.data) || entry.data.length > ZIP_LIMITS.entryBytes) throw new Error('zip-entry-size-limit');
    totalSize += 76 + 2 * Buffer.byteLength(entry.path) + entry.data.length;
    if (totalSize > ZIP_LIMITS.totalBytes) throw new Error('zip-total-size-limit');
  }
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  // Deterministic DOS epoch avoids current-local-time metadata and enables byte comparisons.
  const dosDate = 33; // 1980-01-01
  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'ascii');
    const crc = crc32(entry.data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(dosDate, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(entry.data.length, 18);
    head.writeUInt32LE(entry.data.length, 22);
    head.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(dosDate, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(entry.data.length, 20);
    directory.writeUInt32LE(entry.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    local.push(head, name, entry.data);
    central.push(directory, name);
    offset += head.length + name.length + entry.data.length;
  }
  const directorySize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end], totalSize);
}
