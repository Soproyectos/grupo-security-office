/**
 * CAT-04 backend-activos (D1): verificación de contenido real por firma mágica.
 * El `mimeType` lo declara el cliente; el tipo REAL se deduce de los primeros
 * bytes. Puro, sin dependencias, para poder testearlo sin Nest ni BD.
 */
import { createHash } from 'crypto';

export type DetectedKind = 'IMAGE' | 'PDF' | 'ZIP' | 'UNKNOWN';

/**
 * Firma mágica → tipo real. Imágenes admitidas por la plataforma (mismas que
 * `ALLOWED_IMAGE_MIMETYPES`): PNG, JPEG, WEBP (RIFF....WEBP) y GIF. ZIP cubre
 * paquetes/inventarios futuros (firmware NO se sube — diseño :267).
 */
export function detectKind(data: Buffer): DetectedKind {
  if (!data || data.length < 4) return 'UNKNOWN';
  // PNG: 89 50 4E 47 (0x89 'P' 'N' 'G')
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'IMAGE';
  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'IMAGE';
  // GIF: 'GIF87a'/'GIF89a'
  if (data.subarray(0, 3).toString('latin1') === 'GIF' && data[3] === 0x38) return 'IMAGE';
  // WEBP: 'RIFF' .... 'WEBP'
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.length >= 12 && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'IMAGE';
  // PDF: '%PDF-'
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return 'PDF';
  // ZIP: 'PK\x03\x04'
  if (data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04) return 'ZIP';
  return 'UNKNOWN';
}

/** Huella sha256 en hex lowercase (para registro de activos, diseño :319). */
export const sha256Hex = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const PDF_MIMES = new Set(['application/pdf']);
const ZIP_MIMES = new Set(['application/zip', 'application/x-zip-compressed']);

/** ¿El MIME declarado es coherente con el tipo REAL detectado? */
export function declaredMatchesDetected(declaredMime: string, detected: DetectedKind): boolean {
  const mime = (declaredMime || '').toLowerCase();
  switch (detected) {
    case 'IMAGE':
      return IMAGE_MIMES.has(mime);
    case 'PDF':
      return PDF_MIMES.has(mime);
    case 'ZIP':
      return ZIP_MIMES.has(mime);
    default:
      return false; // UNKNOWN nunca es subible
  }
}
