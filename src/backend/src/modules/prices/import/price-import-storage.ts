import { promises as fs } from 'fs';
import * as path from 'path';
import { UPLOADS_DIR } from '../../../common/uploads-path';

/**
 * IMP-04 — Almacenamiento PRIVADO del archivo original de una revisión.
 * El directorio vive fuera del prefijo estático `UPLOADS_URL_PREFIX` (`/uploads`),
 * por lo que NUNCA se sirve por HTTP estático: el único acceso es la ruta
 * autorizada de descarga (`GET /api/prices/import/revisions/:id/file`).
 * El nombre en disco es el hash del contenido (direccionable): guardar dos veces
 * el mismo archivo no reescribe ni duplica.
 */
export function priceImportStorageDir(): string {
  return process.env.PRICE_IMPORT_STORAGE_DIR ?? path.join(UPLOADS_DIR, 'price-import-private');
}

export function storedPriceImportFileName(hash: string): string {
  return `${hash}.xlsx`;
}

export function storedPriceImportPath(hash: string): string {
  return path.join(priceImportStorageDir(), storedPriceImportFileName(hash));
}

/** Escribe el archivo privado y devuelve su ruta. */
export async function storePriceImportFile(hash: string, buffer: Buffer): Promise<string> {
  const dir = priceImportStorageDir();
  await fs.mkdir(dir, { recursive: true });
  const target = storedPriceImportPath(hash);
  await fs.writeFile(target, buffer);
  return target;
}

export async function priceImportFileExists(hash: string): Promise<boolean> {
  try {
    await fs.access(storedPriceImportPath(hash));
    return true;
  } catch {
    return false;
  }
}

export async function readPriceImportFile(hash: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(storedPriceImportPath(hash));
  } catch {
    return null;
  }
}

export async function deletePriceImportFile(hash: string): Promise<void> {
  await fs.rm(storedPriceImportPath(hash), { force: true });
}
