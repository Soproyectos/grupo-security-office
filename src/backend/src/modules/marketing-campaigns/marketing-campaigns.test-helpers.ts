/** Synthetic image bytes (valid headers only) shared by the campaign specs. */

export function pngBytes(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  b[24] = 8; // bit depth
  b[25] = 6; // RGBA
  return b;
}

export function jpegBytes(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08]);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof.set([0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01], 9);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

function riff(chunk: Buffer): Buffer {
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(chunk.length + 4, 4);
  head.write('WEBP', 8, 'ascii');
  return Buffer.concat([head, chunk]);
}

/** Lossless WebP (VP8L). */
export function webpLosslessBytes(width: number, height: number): Buffer {
  const c = Buffer.alloc(8 + 10);
  c.write('VP8L', 0, 'ascii');
  c.writeUInt32LE(10, 4);
  c[8] = 0x2f;
  c.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 9);
  return riff(c);
}

/** Lossy WebP (VP8). */
export function webpLossyBytes(width: number, height: number): Buffer {
  const c = Buffer.alloc(8 + 14);
  c.write('VP8 ', 0, 'ascii');
  c.writeUInt32LE(14, 4);
  c.set([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a], 8);
  c.writeUInt16LE(width, 14);
  c.writeUInt16LE(height, 16);
  return riff(c);
}

/** Extended WebP (VP8X). */
export function webpExtendedBytes(width: number, height: number): Buffer {
  const c = Buffer.alloc(8 + 10);
  c.write('VP8X', 0, 'ascii');
  c.writeUInt32LE(10, 4);
  const w = width - 1;
  const h = height - 1;
  c.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 12);
  return riff(c);
}
