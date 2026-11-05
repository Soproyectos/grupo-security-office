import { BadRequestException } from '@nestjs/common';
import {
  CAMPAIGN_IMAGE_RULES,
  MAX_IMAGE_BYTES,
  assertImageDimensions,
  assertValidity,
  inspectImage,
  normalizeDate,
  normalizeLinkUrl,
  parseDataUrl,
  toDataUrl,
  validityAt,
} from './marketing-campaigns.rules';
import { jpegBytes, pngBytes, webpExtendedBytes, webpLosslessBytes, webpLossyBytes } from './marketing-campaigns.test-helpers';

describe('normalizeLinkUrl', () => {
  it.each([
    ['/catalogo', '/catalogo'],
    ['  /tienda?marca=hikvision#ofertas  ', '/tienda?marca=hikvision#ofertas'],
    ['https://www.gruposecurity.co/promo', 'https://www.gruposecurity.co/promo'],
    ['HTTPS://Example.com', 'HTTPS://Example.com'],
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
  ])('acepta %p', (input, expected) => {
    expect(normalizeLinkUrl(input)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.com',
    '///evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    'https://user:pass@evil.com',
    'https://good.com@evil.com',
    'https://:secret@evil.com',
    'http://inseguro.com',
    'ftp://archivos.com',
    'https:evil.com',
    'https:///ruta',
    'https://',
    'https://exa mple.com',
    'evil.com',
    'catalogo',
    '/ruta con espacios',
    '/ruta\nsalto',
    '/ruta\u0000nulo',
    '/<script>',
    `/${'a'.repeat(600)}`,
  ])('rechaza %p', (input) => {
    expect(() => normalizeLinkUrl(input)).toThrow(BadRequestException);
  });

  it('rechaza valores que no son texto', () => {
    expect(() => normalizeLinkUrl(42)).toThrow(BadRequestException);
    expect(() => normalizeLinkUrl({ href: '/x' })).toThrow(BadRequestException);
  });
});

describe('fechas y vigencia', () => {
  it('normaliza ISO con zona horaria y rechaza lo demás', () => {
    expect(normalizeDate('2026-11-10T12:00:00-05:00', 'inicio')).toBe('2026-11-10T17:00:00.000Z');
    expect(normalizeDate(null, 'inicio')).toBeNull();
    expect(normalizeDate('', 'inicio')).toBeNull();
    expect(() => normalizeDate('2026-11-10', 'inicio')).toThrow(BadRequestException);
    expect(() => normalizeDate('mañana', 'fin')).toThrow(BadRequestException);
    expect(() => normalizeDate('2026-13-45T00:00:00Z', 'fin')).toThrow(BadRequestException);
  });

  it('el fin debe ser posterior al inicio', () => {
    expect(() => assertValidity('2026-11-10T00:00:00.000Z', '2026-11-10T00:00:00.000Z')).toThrow(BadRequestException);
    expect(() => assertValidity('2026-11-11T00:00:00.000Z', '2026-11-10T00:00:00.000Z')).toThrow(BadRequestException);
    expect(() => assertValidity('2026-11-10T00:00:00.000Z', '2026-11-11T00:00:00.000Z')).not.toThrow();
    expect(() => assertValidity(null, '2026-11-11T00:00:00.000Z')).not.toThrow();
  });

  it('validityAt: programada, vigente y vencida (el fin es exclusivo)', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    expect(validityAt({ startsAt: null, endsAt: null }, now)).toBe('ACTIVE');
    expect(validityAt({ startsAt: '2026-11-10T12:00:00.000Z', endsAt: null }, now)).toBe('ACTIVE');
    expect(validityAt({ startsAt: '2026-11-10T12:00:01.000Z', endsAt: null }, now)).toBe('SCHEDULED');
    expect(validityAt({ startsAt: null, endsAt: '2026-11-10T12:00:00.000Z' }, now)).toBe('EXPIRED');
    expect(validityAt({ startsAt: null, endsAt: '2026-11-10T12:00:01.000Z' }, now)).toBe('ACTIVE');
  });
});

describe('inspectImage: firma real y medidas leídas del encabezado', () => {
  it('lee PNG', () => {
    expect(inspectImage(pngBytes(1200, 520))).toMatchObject({ format: 'png', mime: 'image/png', width: 1200, height: 520 });
  });

  it('lee JPEG (marcador SOF)', () => {
    expect(inspectImage(jpegBytes(900, 675))).toMatchObject({ format: 'jpeg', mime: 'image/jpeg', width: 900, height: 675 });
  });

  it.each([
    ['VP8L', webpLosslessBytes(1200, 520)],
    ['VP8', webpLossyBytes(1200, 520)],
    ['VP8X', webpExtendedBytes(1200, 520)],
  ])('lee WebP %s', (_name, bytes) => {
    expect(inspectImage(bytes)).toMatchObject({ format: 'webp', mime: 'image/webp', width: 1200, height: 520 });
  });

  it('JPEG con un segmento antes del SOF no confunde la tabla DHT con el encabezado', () => {
    const dht = Buffer.from([0xff, 0xc4, 0x00, 0x05, 0x00, 0x01, 0x02]);
    const base = jpegBytes(1000, 400);
    const bytes = Buffer.concat([base.subarray(0, 2), dht, base.subarray(2)]);
    expect(inspectImage(bytes)).toMatchObject({ width: 1000, height: 400 });
  });

  it('rechaza texto o HTML con extensión de imagen (firma falsa)', () => {
    expect(() => inspectImage(Buffer.from('<html><script>alert(1)</script></html>'))).toThrow(BadRequestException);
    expect(() => inspectImage(Buffer.from('GIF89a'.padEnd(64, '\0')))).toThrow(BadRequestException);
    expect(() => inspectImage(Buffer.from('%PDF-1.7'.padEnd(64, ' ')))).toThrow(BadRequestException);
    expect(() => inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toThrow(BadRequestException);
  });

  it('rechaza vacío, truncado y encabezados dañados', () => {
    expect(() => inspectImage(Buffer.alloc(0))).toThrow(BadRequestException);
    expect(() => inspectImage(pngBytes(1200, 520).subarray(0, 20))).toThrow(BadRequestException);
    expect(() => inspectImage(jpegBytes(1200, 520).subarray(0, 10))).toThrow(BadRequestException);
    const brokenPng = pngBytes(1200, 520);
    brokenPng.write('XXXX', 12, 'ascii');
    expect(() => inspectImage(brokenPng)).toThrow(BadRequestException);
    expect(() => inspectImage(pngBytes(0, 520))).toThrow(BadRequestException);
    // Solo el inicio de RIFF/WEBP sin trozo reconocible.
    const riffOnly = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('JUNK'), Buffer.alloc(20)]);
    expect(() => inspectImage(riffOnly)).toThrow(BadRequestException);
  });

  it('rechaza más de 3 MB aunque la firma sea válida', () => {
    const big = Buffer.concat([pngBytes(1200, 520), Buffer.alloc(MAX_IMAGE_BYTES)]);
    expect(() => inspectImage(big)).toThrow(/3 MB/);
    const exact = Buffer.concat([pngBytes(1200, 520), Buffer.alloc(MAX_IMAGE_BYTES - 33)]);
    expect(inspectImage(exact).bytes).toBe(MAX_IMAGE_BYTES);
  });
});

describe('assertImageDimensions (medidas PROPUESTAS, ajustables)', () => {
  it('publica las constantes pedidas', () => {
    expect(CAMPAIGN_IMAGE_RULES.desktop).toMatchObject({ minWidth: 1000, minRatio: 2.0, maxRatio: 2.6 });
    expect(CAMPAIGN_IMAGE_RULES.mobile).toMatchObject({ minWidth: 600, minRatio: 1.2, maxRatio: 1.5 });
    expect(CAMPAIGN_IMAGE_RULES.image).toMatchObject({ minWidth: 600, minRatio: 0.6, maxRatio: 1.8 });
  });

  it.each([
    ['desktop', 1200, 520],
    ['desktop', 1000, 500], // 2.0 exacto
    ['desktop', 1300, 500], // 2.6 exacto
    ['mobile', 900, 675],
    ['mobile', 600, 500], // 1.2 exacto
    ['mobile', 600, 400], // 1.5 exacto
    ['image', 800, 800],
    ['image', 600, 1000], // 0.6 exacto
    ['image', 1800, 1000], // 1.8 exacto
  ] as const)('acepta %s %i × %i', (slot, w, h) => {
    expect(() => assertImageDimensions({ width: w, height: h }, slot)).not.toThrow();
  });

  it('el mensaje nombra la medida real y la esperada', () => {
    expect(() => assertImageDimensions({ width: 800, height: 800 }, 'desktop')).toThrow(
      'La imagen mide 800 × 800 px; el ancho mínimo es 1000 px, para el banner de escritorio sube una de 1200 × 520 px aproximadamente',
    );
    expect(() => assertImageDimensions({ width: 1200, height: 1200 }, 'desktop')).toThrow(
      /La imagen mide 1200 × 1200 px.*sube una de 1200 × 520 px aproximadamente.*entre 2 y 2\.6/,
    );
  });

  it.each([
    ['desktop', 999, 400], // ancho insuficiente
    ['desktop', 1200, 700], // demasiado alta (1.71)
    ['desktop', 1200, 400], // demasiado ancha (3.0)
    ['mobile', 599, 450],
    ['mobile', 900, 900], // 1.0
    ['mobile', 900, 500], // 1.8
    ['image', 599, 599],
    ['image', 600, 1100], // 0.545
    ['image', 1900, 1000], // 1.9
    ['image', 7000, 7000], // lado máximo de seguridad
  ] as const)('rechaza %s %i × %i', (slot, w, h) => {
    expect(() => assertImageDimensions({ width: w, height: h }, slot)).toThrow(BadRequestException);
  });
});

describe('data URL', () => {
  it('ida y vuelta, y solo acepta PNG/JPEG/WebP en base64', () => {
    const bytes = pngBytes(1200, 520);
    const url = toDataUrl(bytes, 'image/png');
    expect(parseDataUrl(url)).toMatchObject({ mime: 'image/png' });
    expect(parseDataUrl(url)!.buffer.equals(bytes)).toBe(true);
    expect(parseDataUrl('data:text/html;base64,PGh0bWw+')).toBeNull();
    expect(parseDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(parseDataUrl('/images/home/banner-hikvision.jpg')).toBeNull();
    expect(parseDataUrl(null)).toBeNull();
  });
});
