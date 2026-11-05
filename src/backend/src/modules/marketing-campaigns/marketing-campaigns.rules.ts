import { BadRequestException } from '@nestjs/common';

/**
 * Pure rules of the storefront marketing campaigns: link validation, image
 * inspection (real signature + dimensions read from the file header, no
 * dependencies) and the content shape stored inside the JSON columns of
 * `storefront_banners`.
 */

export const CAMPAIGN_KINDS = ['HERO', 'POPUP'] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

export const CAMPAIGN_SLOTS = ['desktop', 'mobile', 'image'] as const;
export type CampaignSlot = (typeof CAMPAIGN_SLOTS)[number];

export const CAMPAIGN_FITS = ['cover', 'contain'] as const;
export type CampaignFit = (typeof CAMPAIGN_FITS)[number];

export const SLOTS_BY_KIND: Record<CampaignKind, readonly CampaignSlot[]> = {
  HERO: ['desktop', 'mobile'],
  POPUP: ['image'],
};

/** Draft/published JSON content of one campaign (images are base64 data URLs). */
export interface CampaignContent {
  kind: CampaignKind;
  name: string;
  alt: string;
  linkUrl: string | null;
  position: number;
  startsAt: string | null;
  endsAt: string | null;
  fit: CampaignFit;
  focusX: number;
  focusY: number;
  /** Framing of the mobile image. Optional: rows saved before it existed fall back to the desktop values. */
  fitMobile?: CampaignFit;
  focusMobileX?: number;
  focusMobileY?: number;
  imageDesktop: string | null;
  imageMobile: string | null;
  image: string | null;
}

export interface CampaignFraming {
  fit: CampaignFit;
  focusX: number;
  focusY: number;
  fitMobile: CampaignFit;
  focusMobileX: number;
  focusMobileY: number;
}

const validFit = (value: unknown): value is CampaignFit => CAMPAIGN_FITS.includes(value as CampaignFit);
const validFocus = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

/** Desktop and mobile framing with backward-compatible defaults (50/50 and the desktop values for mobile). */
export function resolveFraming(
  content: Partial<Pick<CampaignContent, 'fit' | 'focusX' | 'focusY' | 'fitMobile' | 'focusMobileX' | 'focusMobileY'>>,
): CampaignFraming {
  const fit = validFit(content.fit) ? content.fit : 'cover';
  const focusX = validFocus(content.focusX) ? content.focusX : 50;
  const focusY = validFocus(content.focusY) ? content.focusY : 50;
  return {
    fit,
    focusX,
    focusY,
    fitMobile: validFit(content.fitMobile) ? content.fitMobile : fit,
    focusMobileX: validFocus(content.focusMobileX) ? content.focusMobileX : focusX,
    focusMobileY: validFocus(content.focusMobileY) ? content.focusMobileY : focusY,
  };
}

export const MAX_NAME_LENGTH = 120;
export const MAX_ALT_LENGTH = 200;
export const MAX_LINK_LENGTH = 500;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
/** Safety ceiling for either side of an uploaded image (extra to the requested rules). */
export const MAX_IMAGE_SIDE_PX = 6000;

/** Published at the same time: at most this many HERO campaigns and this many POPUP campaigns. */
export const MAX_PUBLISHED: Record<CampaignKind, number> = { HERO: 6, POPUP: 1 };

export interface ImageRule {
  /** Name shown in error messages. */
  readonly label: string;
  readonly minWidth: number;
  /** Accepted width / height range (inclusive). */
  readonly minRatio: number;
  readonly maxRatio: number;
  /** Suggested size quoted in the error message. */
  readonly recommended: { readonly width: number; readonly height: number };
}

/**
 * PROPOSAL, adjustable: the final sizes depend on whoever designs the pieces
 * (see odd/tasks/marketing-campanas.md, pending decision 1). Changing a value
 * here is the only edit needed in the backend.
 */
export const CAMPAIGN_IMAGE_RULES: Record<CampaignSlot, ImageRule> = {
  desktop: {
    label: 'el banner de escritorio',
    minWidth: 1000,
    minRatio: 2.0,
    maxRatio: 2.6,
    recommended: { width: 1200, height: 520 },
  },
  mobile: {
    label: 'el banner de móvil',
    minWidth: 600,
    minRatio: 1.2,
    maxRatio: 1.5,
    recommended: { width: 900, height: 675 },
  },
  image: {
    label: 'la ventana emergente',
    minWidth: 600,
    minRatio: 0.6,
    maxRatio: 1.8,
    recommended: { width: 900, height: 900 },
  },
};

export const MIME_BY_FORMAT = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
export type ImageFormat = keyof typeof MIME_BY_FORMAT;

export interface InspectedImage {
  format: ImageFormat;
  mime: (typeof MIME_BY_FORMAT)[ImageFormat];
  width: number;
  height: number;
  bytes: number;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function invalidImage(): BadRequestException {
  return new BadRequestException('El archivo no es una imagen PNG, JPEG o WebP válida');
}

function readPng(b: Buffer): { width: number; height: number } | null {
  if (b.length < 24 || !b.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (b.toString('ascii', 12, 16) !== 'IHDR' || b.readUInt32BE(8) !== 13) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
const isSof = (marker: number) => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

function readJpeg(b: Buffer): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let pos = 2;
  while (pos + 3 < b.length) {
    if (b[pos] !== 0xff) return null;
    while (pos < b.length && b[pos] === 0xff) pos++; // fill bytes
    const marker = b[pos];
    pos++;
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS before any frame header
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue; // standalone markers
    if (pos + 2 > b.length) return null;
    const length = b.readUInt16BE(pos);
    if (length < 2 || pos + length > b.length) return null;
    if (isSof(marker)) {
      if (length < 8) return null;
      return { height: b.readUInt16BE(pos + 3), width: b.readUInt16BE(pos + 5) };
    }
    pos += length;
  }
  return null;
}

function readWebp(b: Buffer): { width: number; height: number } | null {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    // Lossy: 3-byte frame tag, start code 9D 01 2A, then 14-bit width / height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return {
      width: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1,
      height: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1,
    };
  }
  return null;
}

/**
 * Detects the real format from the file bytes (never from the name or the
 * declared MIME type) and reads its dimensions from the header. Throws a
 * Spanish 400 when the bytes are not a PNG, JPEG or WebP, or are too large.
 */
export function inspectImage(buffer: Buffer): InspectedImage {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw invalidImage();
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new BadRequestException('La imagen supera el máximo de 3 MB');
  }
  const candidates: Array<[ImageFormat, { width: number; height: number } | null]> = [
    ['png', readPng(buffer)],
    ['jpeg', readJpeg(buffer)],
    ['webp', readWebp(buffer)],
  ];
  const found = candidates.find(([, size]) => size !== null);
  if (!found) throw invalidImage();
  const [format, size] = found;
  if (!size || size.width < 1 || size.height < 1) throw invalidImage();
  return { format, mime: MIME_BY_FORMAT[format], width: size.width, height: size.height, bytes: buffer.length };
}

/** Validates the size of an inspected image for a slot; the message states the measure found and the one expected. */
export function assertImageDimensions(image: Pick<InspectedImage, 'width' | 'height'>, slot: CampaignSlot): void {
  const rule = CAMPAIGN_IMAGE_RULES[slot];
  const { width, height } = image;
  const suggestion = `para ${rule.label} sube una de ${rule.recommended.width} × ${rule.recommended.height} px aproximadamente`;
  const measure = `La imagen mide ${width} × ${height} px`;
  if (width > MAX_IMAGE_SIDE_PX || height > MAX_IMAGE_SIDE_PX) {
    throw new BadRequestException(`${measure}; el lado máximo es ${MAX_IMAGE_SIDE_PX} px, ${suggestion}`);
  }
  if (width < rule.minWidth) {
    throw new BadRequestException(`${measure}; el ancho mínimo es ${rule.minWidth} px, ${suggestion}`);
  }
  const ratio = width / height;
  if (ratio < rule.minRatio || ratio > rule.maxRatio) {
    throw new BadRequestException(
      `${measure} (proporción ${ratio.toFixed(2)}:1); ${suggestion} (proporción entre ${rule.minRatio} y ${rule.maxRatio})`,
    );
  }
}

export function toDataUrl(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/** Splits a stored data URL; null when it is not one of the three accepted formats. */
export function parseDataUrl(value: unknown): { mime: string; buffer: Buffer } | null {
  if (typeof value !== 'string') return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

/**
 * Normalizes the optional link of a campaign. Accepts an internal path that
 * starts with a single `/` or an `https://` URL without credentials. Anything
 * else (javascript:, data:, http:, `//host`, backslashes, spaces, control
 * characters) is rejected. Empty means "no link" (null).
 */
export function normalizeLinkUrl(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') throw new BadRequestException('El enlace debe ser texto');
  const value = raw.trim();
  if (value === '') return null;
  const reject = () => new BadRequestException('El enlace debe ser una ruta interna que empiece por «/» (por ejemplo /catalogo) o una dirección https:// completa');
  if (value.length > MAX_LINK_LENGTH) {
    throw new BadRequestException(`El enlace supera los ${MAX_LINK_LENGTH} caracteres`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f\\<>"'`]/.test(value)) throw reject();
  if (value.startsWith('/')) {
    if (value.startsWith('//')) throw reject();
    return value;
  }
  if (!/^https:\/\/[^/?#]/i.test(value)) throw reject();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw reject();
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw reject();
  return value;
}

/** ISO 8601 with explicit offset -> canonical ISO string; null/empty -> null. */
export function normalizeDate(raw: unknown, field: string): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    throw new BadRequestException(`La fecha de ${field} no es válida`);
  }
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new BadRequestException(`La fecha de ${field} no es válida`);
  return date.toISOString();
}

export function assertValidity(startsAt: string | null, endsAt: string | null): void {
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio');
  }
}

export type CampaignValidity = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED';

/** Where `now` falls in the optional [startsAt, endsAt) window. */
export function validityAt(content: Pick<CampaignContent, 'startsAt' | 'endsAt'>, now: Date): CampaignValidity {
  if (content.startsAt && new Date(content.startsAt).getTime() > now.getTime()) return 'SCHEDULED';
  if (content.endsAt && new Date(content.endsAt).getTime() <= now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}

export function isCampaignContent(value: unknown): value is CampaignContent {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && CAMPAIGN_KINDS.includes((value as { kind?: CampaignKind }).kind as CampaignKind);
}

/** Deterministic JSON text (sorted keys) to compare two JSON documents. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
