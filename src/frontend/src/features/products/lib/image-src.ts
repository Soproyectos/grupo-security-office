import { resolveAssetUrl } from '../../../services/api';

/** Backend-served images (`/api/files/:id`) need the API origin; other paths and URLs pass through. */
export function productImageSrc(src: string): string {
  return src.startsWith('/api/') ? resolveAssetUrl(src) : src;
}
