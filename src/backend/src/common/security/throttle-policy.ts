import { SkipThrottle, Throttle } from '@nestjs/throttler';

/**
 * Política de límite de solicitudes (ThrottlerGuard global: 20 por minuto y por IP) para las LECTURAS del catálogo.
 *
 * - Una tarjeta de producto pide su imagen (`GET /api/files/:id`) y un listado trae decenas: con el límite global
 *   desde la imagen 17 respondía 429 y la tarjeta mostraba el texto alternativo. Las lecturas baratas por id,
 *   las imágenes y el menú de categorías quedan SIN límite.
 * - Listados y búsquedas cuestan SQL (ordenan por relevancia y paginan): conservan un límite ALTO por IP y por
 *   ruta (300 por minuto) en vez de ninguno.
 *
 * Solo para métodos GET de lectura. Login, importaciones y cualquier ruta que escriba conservan su propio límite.
 */
export const CATALOG_SEARCH_LIMIT = { limit: 300, ttl: 60_000 } as const;

/** Lectura barata y sin efectos del catálogo: sin límite. */
export const CatalogRead = () => SkipThrottle();

/** Listado/búsqueda del catálogo: límite alto por IP en vez de ninguno. */
export const CatalogSearch = () => Throttle({ default: { ...CATALOG_SEARCH_LIMIT } });
