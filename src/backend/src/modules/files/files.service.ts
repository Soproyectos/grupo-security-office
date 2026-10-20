import { Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { detectKind, sha256Hex, type DetectedKind } from './file-signature';

export const FILES_URL_PREFIX = '/api/files';

export interface StoreMeta {
  originalName?: string | null;
  /** CAT-04 (D1/D4): solo los archivos que nacen privados se marcan; lo público es el default. */
  visibility?: 'PUBLIC' | 'PRIVATE';
  ownerProductId?: string | null;
  /** D5: permite insertar el archivo dentro de la transacción del dueño. */
  tx?: Prisma.TransactionClient;
}

export interface FileRecord {
  id: string;
  mimeType: string;
  data: Buffer;
  visibility: string;
  ownerProductId: string | null;
}

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    /**
     * CAT-04 (D3): la retención de bytes se audita (`file-retained`). Opcional
     * para conservar la construcción de 1 argumento de los specs preexistentes;
     * Nest lo inyecta (AuditModule).
     */
    @Optional() private readonly audit?: AuditService,
  ) {}

  /**
   * Guarda bytes en BD con su registro de activos (CAT-04 D1): tamaño real,
   * sha256 y tipo detectado por firma mágica (nunca el MIME declarado).
   * Devuelve la URL para servirlos.
   */
  async store(data: Buffer, mimeType: string, meta: StoreMeta = {}): Promise<{ id: string; url: string; detectedKind: DetectedKind }> {
    const client = meta.tx ?? this.prisma;
    const file = await client.uploadedFile.create({
      data: {
        mimeType,
        data,
        sizeBytes: data.length,
        sha256: sha256Hex(data),
        detectedKind: detectKind(data),
        originalName: meta.originalName ?? null,
        visibility: meta.visibility ?? 'PUBLIC',
        ownerProductId: meta.ownerProductId ?? null,
      },
      select: { id: true, detectedKind: true },
    });
    return { id: file.id, url: `${FILES_URL_PREFIX}/${file.id}`, detectedKind: (file.detectedKind as DetectedKind) ?? 'UNKNOWN' };
  }

  async get(id: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const file = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!file) return null;
    return { data: file.data as Buffer, mimeType: file.mimeType };
  }

  /** Fila completa con metadata para la decisión de acceso (D4). */
  async getRecord(id: string): Promise<FileRecord | null> {
    const file = await this.prisma.uploadedFile.findUnique({
      where: { id },
      select: { id: true, mimeType: true, data: true, visibility: true, ownerProductId: true },
    });
    if (!file) return null;
    return file;
  }

  /**
   * CAT-04 (D3, diseño :212/:345): **no borra bytes referenciados**. Antes de
   * eliminar físicamente comprueba referencias vivas e históricas:
   * imágenes de producto, recursos de ficha, `documents` (JSON) y el contenido
   * de CUALQUIER revisión (pública o histórica). Si queda alguna, el archivo se
   * RETIENE (no es error: el borrado lógico del dueño procede) y se audita.
   * La GC de verdaderos huérfanos queda pendiente de política del coordinador.
   */
  async release(
    url: string | null | undefined,
    opts: { userId?: string | null; excludeImageId?: string } = {},
  ): Promise<{ deleted: boolean; retainedReason?: string }> {
    if (!url || !url.startsWith(`${FILES_URL_PREFIX}/`)) return { deleted: false, retainedReason: 'external-url' };
    const id = url.slice(`${FILES_URL_PREFIX}/`.length);
    const pattern = `%${url}%`;

    const [images, resources, products, revisions] = await Promise.all([
      // El llamador que borra SU propia fila la excluye (D3 protege otras
      // referencias vivas/históricas, no la que se está borrando).
      this.prisma.productImage.count({
        where: opts.excludeImageId ? { url, id: { not: opts.excludeImageId } } : { url },
      }),
      this.prisma.productCatalogResource.count({ where: { url } }),
      this.prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM products WHERE documents::text LIKE ${pattern}`,
      this.prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM product_revisions WHERE content::text LIKE ${pattern}`,
    ]);

    const refs = images + resources + Number(products[0]?.count ?? 0) + Number(revisions[0]?.count ?? 0);
    if (refs > 0) {
      if (this.audit) {
        await this.audit.log({
          userId: opts.userId ?? undefined,
          action: 'file-retained',
          entity: 'UploadedFile',
          entityId: id,
          newValues: { url, refs: { images, resources, products: Number(products[0]?.count ?? 0), revisions: Number(revisions[0]?.count ?? 0) } },
        });
      }
      return { deleted: false, retainedReason: 'referenced' };
    }

    try {
      await this.prisma.uploadedFile.delete({ where: { id } });
      return { deleted: true };
    } catch {
      // El archivo puede no existir; no bloquea el borrado lógico del dueño.
      return { deleted: false, retainedReason: 'not-found' };
    }
  }

  /**
   * Compatibilidad: antes borraba duro. Ahora delega en `release()` — ningún
   * llamador de producto puede destruir bytes aún referenciados (D3).
   */
  async deleteByUrl(url: string | null | undefined): Promise<void> {
    await this.release(url);
  }

  /** CAT-04 (D4): un recurso de ficha con licencia privada su archivo. */
  async setVisibilityByUrl(url: string, visibility: 'PUBLIC' | 'PRIVATE', ownerProductId: string | null): Promise<void> {
    if (!url.startsWith(`${FILES_URL_PREFIX}/`)) return;
    const id = url.slice(`${FILES_URL_PREFIX}/`.length);
    await this.prisma.uploadedFile.updateMany({ where: { id }, data: { visibility, ownerProductId } });
  }
}
