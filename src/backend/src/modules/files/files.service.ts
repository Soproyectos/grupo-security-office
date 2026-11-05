import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Prisma as LibraryPrisma } from '../../../prisma/biblioteca/generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import type { AuditService } from '../audit/audit.service';
import { LibraryAuditService, type LibraryActor } from '../library-audit/library-audit.service';
import { detectKind, sha256Hex, type DetectedKind } from './file-signature';

export const FILES_URL_PREFIX = '/api/files';
export const LEGACY_FILE_AUDIT = Symbol('LEGACY_FILE_AUDIT');

export interface StoreMeta {
  originalName?: string | null;
  /** CAT-04 (D1/D4): solo los archivos que nacen privados se marcan; lo público es el default. */
  visibility?: 'PUBLIC' | 'PRIVATE';
  ownerProductId?: string | null;
  /** D5: permite insertar el archivo dentro de la transacción del dueño. */
  tx?: Prisma.TransactionClient | LibraryPrisma.TransactionClient;
  actor?: LibraryActor;
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
    prisma: PrismaService,
    /**
     * CAT-04 (D3): la retención de bytes se audita (`file-retained`). Opcional
     * para conservar la construcción de 1 argumento de los specs preexistentes;
     * Nest lo inyecta (AuditModule).
     */
    @Optional() @Inject(LEGACY_FILE_AUDIT) private readonly audit?: Pick<AuditService, 'log'>,
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyFiles(prisma),
    @Inject(LibraryAuditService) private readonly libraryAudit: LibraryAuditService = new LibraryAuditService(library),
  ) { }

  private get prisma() { return this.library.client; }

  private async write<T>(tx: StoreMeta['tx'], work: (client: LibraryPrisma.TransactionClient) => Promise<T>): Promise<T> {
    this.library.assertWritesAllowed();
    if (tx) {
      if (this.library.config.mode === 'dedicated' && !this.library.ownsTransaction(tx)) {
        throw new ServiceUnavailableException({ code: 'LIBRARY_FOREIGN_TRANSACTION', message: 'La escritura de archivos requiere una transacción de biblioteca.' });
      }
      return work(tx as unknown as LibraryPrisma.TransactionClient);
    }
    if (this.library.config.mode === 'dedicated') return this.library.writeTransaction(work);
    return work(this.prisma as unknown as LibraryPrisma.TransactionClient);
  }

  /**
   * Guarda bytes en BD con su registro de activos (CAT-04 D1): tamaño real,
   * sha256 y tipo detectado por firma mágica (nunca el MIME declarado).
   * Devuelve la URL para servirlos.
   */
  async store(data: Buffer, mimeType: string, meta: StoreMeta = {}): Promise<{ id: string; url: string; detectedKind: DetectedKind }> {
    return this.write(meta.tx, async (client) => {
      const file = await client.uploadedFile.create({
        data: {
          mimeType,
          data: new Uint8Array(data),
          sizeBytes: data.length,
          sha256: sha256Hex(data),
          detectedKind: detectKind(data),
          originalName: meta.originalName ?? null,
          visibility: meta.visibility ?? 'PUBLIC',
          ownerProductId: meta.ownerProductId ?? null,
        },
        select: { id: true, detectedKind: true },
      });
      await this.libraryAudit.append(client, {
        actor: meta.actor, action: 'FILE_ADDED', entityType: 'UploadedFile', entityId: file.id,
        summary: { sizeBytes: data.length, sha256: sha256Hex(data), detectedKind: detectKind(data), visibility: meta.visibility ?? 'PUBLIC', ownerProductId: meta.ownerProductId ?? null }
      });
      return { id: file.id, url: `${FILES_URL_PREFIX}/${file.id}`, detectedKind: (file.detectedKind as DetectedKind) ?? 'UNKNOWN' };
    });
  }

  async get(id: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const file = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!file) return null;
    return { data: Buffer.from(file.data), mimeType: file.mimeType };
  }

  /** Fila completa con metadata para la decisión de acceso (D4). */
  async getRecord(id: string): Promise<FileRecord | null> {
    const file = await this.prisma.uploadedFile.findUnique({
      where: { id },
      select: { id: true, mimeType: true, data: true, visibility: true, ownerProductId: true },
    });
    if (!file) return null;
    return { ...file, data: Buffer.from(file.data) };
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
    opts: { userId?: string | null; actorName?: string | null; excludeImageId?: string; tx?: StoreMeta['tx'] } = {},
  ): Promise<{ deleted: boolean; retainedReason?: string }> {
    if (!url || !url.startsWith(`${FILES_URL_PREFIX}/`)) return { deleted: false, retainedReason: 'external-url' };
    const id = url.slice(`${FILES_URL_PREFIX}/`.length);
    const pattern = `%${url}%`;
    return this.write(opts.tx, async (client) => {
      const [images, resources, products, revisions] = await Promise.all([
        // El llamador que borra SU propia fila la excluye (D3 protege otras
        // referencias vivas/históricas, no la que se está borrando).
        client.productImage.count({
          where: opts.excludeImageId ? { url, id: { not: opts.excludeImageId } } : { url },
        }),
        client.productCatalogResource.count({ where: { url } }),
        client.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM products WHERE documents::text LIKE ${pattern}`,
        client.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM product_revisions WHERE content::text LIKE ${pattern}`,
      ]);
      const [brands, catalogImages] = this.library.config.mode === 'dedicated' ? await Promise.all([
        client.brand.count({ where: { logo: url } }), client.product.count({ where: { catalogImageUrl: url } }),
      ]) : [0, 0];
      const refs = images + resources + Number(products[0]?.count ?? 0) + Number(revisions[0]?.count ?? 0) + brands + catalogImages;
      if (refs > 0) {
        if (this.library.config.mode === 'dedicated') {
          await this.libraryAudit.append(client, {
            actor: { id: opts.userId, name: opts.actorName }, action: 'FILE_RETAINED', entityType: 'UploadedFile', entityId: id,
            summary: { url, refs: { images, resources, products: Number(products[0]?.count ?? 0), revisions: Number(revisions[0]?.count ?? 0), brands, catalogImages } }
          });
        } else if (this.audit) {
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
        await client.uploadedFile.delete({ where: { id } });
        await this.libraryAudit.append(client, { actor: { id: opts.userId, name: opts.actorName }, action: 'FILE_REMOVED', entityType: 'UploadedFile', entityId: id, summary: { url } });
        return { deleted: true };
      } catch (error) {
        if (this.library.config.mode === 'dedicated' && (error as { code?: string }).code !== 'P2025') throw error;
        // El archivo puede no existir; no bloquea el borrado lógico del dueño.
        return { deleted: false, retainedReason: 'not-found' };
      }
    });
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
    await this.write(undefined, async (client) => {
      await client.uploadedFile.updateMany({ where: { id }, data: { visibility, ownerProductId } });
      await this.libraryAudit.append(client, { action: 'FILE_VISIBILITY_CHANGED', entityType: 'UploadedFile', entityId: id, summary: { visibility, ownerProductId } });
    });
  }
}

function directLegacyFiles(prisma: PrismaService): BibliotecaPrismaService {
  if (process.env.LIBRARY_DATABASE_MODE && process.env.LIBRARY_DATABASE_MODE !== 'legacy') throw new Error('FilesService requires the library provider in dedicated mode');
  return new BibliotecaPrismaService(prisma, { mode: 'legacy', writesFrozen: false }, () => { throw new Error('Legacy must not create another client'); });
}
