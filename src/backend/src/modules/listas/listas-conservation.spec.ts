/**
 * CAT-01 unidad A — conservación de la Biblioteca al operar sobre Listas
 * (contrato `docs/ejecucion-paneles/contratos/CAT-01.md` §3, §5.1, §6).
 *
 * Aceptación que acredita esta unidad (ficha, textual):
 *   «Eliminar/desvincular/archivar conserva identidad, medios e históricos.»
 *
 * Ejecuta contra PostgreSQL DESECHABLE `grupo_security_tanda_t08` con
 * DATABASE_URL INLINE (nunca `.env`, que apunta a Neon de PRODUCCIÓN):
 *
 *   docker exec gs-tanda-db psql -U postgres -d postgres \
 *     -c "CREATE DATABASE grupo_security_tanda_t08;"
 *   DATABASE_URL='postgresql://postgres:tanda-test-2026@localhost:54331/grupo_security_tanda_t08?schema=public' \
 *     npx prisma migrate deploy --schema prisma/schema.prisma
 *
 * Fixtures 100 % ficticias con prefijo `T08-` / `t08-spec-`, limpiadas en
 * afterAll. Nunca toca la base viva de la API de revisión (grupo_security_tanda).
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AclService } from '../../common/acl/acl.service';
import { HierarchyService } from '../../common/hierarchy/hierarchy.service';
import { AuditService } from '../audit/audit.service';
import { ListasService } from './listas.service';

jest.setTimeout(120_000);

const DATABASE_URL =
  'postgresql://postgres:tanda-test-2026@localhost:54331/grupo_security_tanda_t08?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
const acl = new AclService(prisma as never);
const audit = new AuditService(prisma as never, new HierarchyService(prisma as never));

/** Los bytes NO deben tocarse: cualquier llamada es una violación de R1. */
const files = { deleteByUrl: jest.fn().mockResolvedValue(undefined) };
const service = new ListasService(prisma as never, acl, audit, files as never);

const BYTES = Buffer.from('fake-png-bytes-t08');

let adminId = '';
const ADMIN = { userId: '', roles: ['Super Admin'] };
let memberId = '';
let catId = '';
let brandId = '';
let priceListA = '';
let priceListB = '';
let seq = 0;

const createdFileIds: string[] = [];
const createdListaIds: string[] = [];

function n(): number {
  seq += 1;
  return seq;
}

interface Bundle {
  listaId: string;
  listaCode: string;
  listaName: string;
  sku: string;
  productId: string;
  imageId: string;
  fileId: string;
  priceAId: string;
  priceBId: string;
}

/** Lista + producto (SKU único) + imagen con bytes + precios en DOS tarifas. */
async function seedBundle(label: string): Promise<Bundle> {
  const k = n();
  const lista = await prisma.lista.create({
    data: { code: `T08-${label}-${k}`, name: `Lista T08 ${label}` },
  });
  createdListaIds.push(lista.id);
  const sku = `T08-SPEC-${k}`;
  const product = await prisma.product.create({
    data: {
      sku,
      name: `Producto T08 ${label}`,
      categoryId: catId,
      brandId,
      listaId: lista.id,
      isActive: true,
    },
  });
  const file = await prisma.uploadedFile.create({
    data: { mimeType: 'image/png', data: BYTES },
  });
  createdFileIds.push(file.id);
  const image = await prisma.productImage.create({
    data: { productId: product.id, url: `/api/files/${file.id}`, isPrimary: true },
  });
  // Tarifa A: precio de la propia Lista; tarifa B: otra lista de precios.
  const priceA = await prisma.price.create({
    data: { productId: product.id, priceListId: priceListA, value: 1000, listaId: lista.id },
  });
  const priceB = await prisma.price.create({
    data: { productId: product.id, priceListId: priceListB, value: 2500, listaId: null },
  });
  return {
    sku,
    listaId: lista.id,
    listaCode: lista.code,
    listaName: lista.name,
    productId: product.id,
    imageId: image.id,
    fileId: file.id,
    priceAId: priceA.id,
    priceBId: priceB.id,
  };
}

async function seedQuote(listaId: string): Promise<string> {
  const customer = await prisma.customer.create({
    data: { code: `T08-CUST-${n()}`, name: 'Cliente fixture T08' },
  });
  const quote = await prisma.quote.create({
    data: { code: `T08-Q-${n()}`, customerId: customer.id, ownerId: adminId, listaId },
  });
  return quote.id;
}

async function readBundle(b: Bundle) {
  const [lista, product, image, file, priceA, priceB] = await Promise.all([
    prisma.lista.findUnique({ where: { id: b.listaId } }),
    prisma.product.findUnique({ where: { id: b.productId } }),
    prisma.productImage.findUnique({ where: { id: b.imageId } }),
    prisma.uploadedFile.findUnique({ where: { id: b.fileId } }),
    prisma.price.findUnique({ where: { id: b.priceAId } }),
    prisma.price.findUnique({ where: { id: b.priceBId } }),
  ]);
  return { lista, product, image, file, priceA, priceB };
}

describe('CAT-01 unidad A — conservación de Biblioteca (PostgreSQL desechable)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    const admin = await prisma.user.create({
      data: {
        email: `t08-spec-admin-${Date.now()}@example.test`,
        name: 'T08 fixture admin',
        password: 'x'.repeat(20),
        isActive: true,
      },
      select: { id: true },
    });
    adminId = admin.id;
    ADMIN.userId = admin.id;
    const member = await prisma.user.create({
      data: {
        email: `t08-spec-member-${Date.now()}@example.test`,
        name: 'T08 fixture member',
        password: 'x'.repeat(20),
        isActive: true,
      },
      select: { id: true },
    });
    memberId = member.id;
    const category = await prisma.category.create({
      data: { name: `T08 categoria ${Date.now()}`, slug: `t08-cat-${Date.now()}` },
    });
    catId = category.id;
    const brand = await prisma.brand.create({
      data: { name: `T08 marca ${Date.now()}`, slug: `t08-brand-${Date.now()}` },
    });
    brandId = brand.id;
    priceListA = (
      await prisma.priceList.create({ data: { name: 'T08 tarifa A', code: `T08-PLA-${Date.now()}` } })
    ).id;
    priceListB = (
      await prisma.priceList.create({ data: { name: 'T08 tarifa B', code: `T08-PLB-${Date.now()}` } })
    ).id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: adminId } });
    await prisma.assignment.deleteMany({ where: { userId: { in: [adminId, memberId] } } });
    await prisma.assignment.deleteMany({ where: { resourceId: { in: createdListaIds } } });
    await prisma.quote.deleteMany({ where: { ownerId: adminId } });
    await prisma.customer.deleteMany({ where: { code: { startsWith: 'T08-' } } });
    await prisma.price.deleteMany({ where: { product: { sku: { startsWith: 'T08-SPEC-' } } } });
    await prisma.productImage.deleteMany({ where: { product: { sku: { startsWith: 'T08-SPEC-' } } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'T08-SPEC-' } } });
    await prisma.lista.deleteMany({ where: { code: { startsWith: 'T08-' } } });
    await prisma.uploadedFile.deleteMany({ where: { id: { in: createdFileIds } } });
    await prisma.priceList.deleteMany({ where: { code: { startsWith: 'T08-' } } });
    await prisma.category.deleteMany({ where: { id: catId } });
    await prisma.brand.deleteMany({ where: { id: brandId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 't08-spec-' } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    files.deleteByUrl.mockClear();
  });

  describe('eliminar lista con cotizaciones → 409 y TODO intacto (R2 / §6)', () => {
    it('rechaza con ConflictException y conserva lista, producto, imagen, bytes, precios y cotización', async () => {
      const b = await seedBundle('quote');
      const quoteId = await seedQuote(b.listaId);

      await expect(service.removeLista(b.listaId, { confirm: true }, ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );

      const snapshot = await readBundle(b);
      expect(snapshot.lista).not.toBeNull();
      expect(snapshot.product).not.toBeNull();
      expect(snapshot.product!.listaId).toBe(b.listaId);
      expect(snapshot.product!.sku).toBe(b.sku);
      expect(snapshot.image).not.toBeNull();
      expect(Buffer.from(snapshot.file!.data).equals(BYTES)).toBe(true);
      expect(snapshot.priceA).not.toBeNull();
      expect(snapshot.priceB).not.toBeNull();
      expect(snapshot.priceA!.value.toNumber()).toBe(1000);
      expect(snapshot.priceB!.value.toNumber()).toBe(2500);
      expect(await prisma.quote.findUnique({ where: { id: quoteId } })).not.toBeNull();
      expect(files.deleteByUrl).not.toHaveBeenCalled();
      // No se audita una eliminación que no ocurrió.
      const log = await prisma.auditLog.findFirst({
        where: { entity: 'LISTA', entityId: b.listaId, action: 'delete' },
      });
      expect(log).toBeNull();
    });
  });

  describe('eliminar lista sin cotización → solo desaparece la Lista (§3)', () => {
    it('borra la Lista, conserva producto/imagen/bytes/precios y escribe el snapshot de auditoría', async () => {
      const b = await seedBundle('delete');
      await prisma.assignment.create({
        data: {
          userId: memberId,
          resourceType: 'LISTA',
          resourceId: b.listaId,
          level: 'view',
          isActive: true,
        },
      });

      const res = await service.removeLista(b.listaId, { confirm: true }, ADMIN);

      expect(res.message).toBe('Lista eliminada exitosamente');
      expect(await prisma.lista.findUnique({ where: { id: b.listaId } })).toBeNull();

      const snapshot = await readBundle(b);
      // Identidad: el producto sobrevive con su SKU y queda SIN lista (SET NULL).
      expect(snapshot.product).not.toBeNull();
      expect(snapshot.product!.sku).toBe(b.sku);
      expect(snapshot.product!.listaId).toBeNull();
      // Medios: fila de imagen y bytes de uploaded_files intactos.
      expect(snapshot.image).not.toBeNull();
      expect(snapshot.image!.productId).toBe(b.productId);
      expect(snapshot.file).not.toBeNull();
      expect(Buffer.from(snapshot.file!.data).equals(BYTES)).toBe(true);
      // Históricos: ambos precios siguen con sus IDs y valores.
      expect(snapshot.priceA).not.toBeNull();
      expect(snapshot.priceB).not.toBeNull();
      expect(snapshot.priceA!.value.toNumber()).toBe(1000);
      expect(snapshot.priceB!.value.toNumber()).toBe(2500);
      // Los bytes jamás pasan por files.deleteByUrl (R1).
      expect(files.deleteByUrl).not.toHaveBeenCalled();
      // Los accesos de la Lista se retiran; los del producto sobreviven.
      expect(
        await prisma.assignment.count({ where: { resourceType: 'LISTA', resourceId: b.listaId } }),
      ).toBe(0);

      // Snapshot de conservación persistido en AuditLog (prepareAuditSnapshot).
      const log = await prisma.auditLog.findFirst({
        where: { entity: 'LISTA', entityId: b.listaId, action: 'delete' },
      });
      expect(log).not.toBeNull();
      const snap = (log!.newValues as Record<string, any>).snapshot;
      expect(snap).toMatchObject({
        listaId: b.listaId,
        name: b.listaName,
        code: b.listaCode,
        productCount: 1,
        priceCount: 1,
        assignmentCount: 1,
      });
    });

    it('sin confirm: true → 400 y no escribe nada (§6)', async () => {
      const b = await seedBundle('confirm');

      await expect(service.removeLista(b.listaId, {}, ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      const snapshot = await readBundle(b);
      expect(snapshot.lista).not.toBeNull();
      expect(snapshot.product!.listaId).toBe(b.listaId);
      expect(snapshot.image).not.toBeNull();
      expect(Buffer.from(snapshot.file!.data).equals(BYTES)).toBe(true);
      expect(snapshot.priceA).not.toBeNull();
      expect(files.deleteByUrl).not.toHaveBeenCalled();
      expect(
        await prisma.auditLog.count({ where: { entity: 'LISTA', entityId: b.listaId } }),
      ).toBe(0);
    });
  });

  describe('desvincular (listas:unlink) — acción explícita, conserva todo (§3, §4)', () => {
    it('pone listaId=null sin borrar ficha, imagen, bytes ni precios y lo audita', async () => {
      const b = await seedBundle('unlink');

      const res = await service.unlinkProduct(b.listaId, b.productId, ADMIN);

      expect(res.listaId).toBeNull();

      const snapshot = await readBundle(b);
      expect(snapshot.product).not.toBeNull();
      expect(snapshot.product!.sku).toBe(b.sku);
      expect(snapshot.product!.listaId).toBeNull();
      expect(snapshot.image).not.toBeNull();
      expect(Buffer.from(snapshot.file!.data).equals(BYTES)).toBe(true);
      expect(snapshot.priceA).not.toBeNull();
      expect(snapshot.priceB).not.toBeNull();
      // La Lista sigue existiendo (unlink no la borra).
      expect(snapshot.lista).not.toBeNull();
      expect(files.deleteByUrl).not.toHaveBeenCalled();

      const log = await prisma.auditLog.findFirst({
        where: { entity: 'LISTA', entityId: b.listaId, action: 'unlink' },
      });
      expect(log).not.toBeNull();
      expect(log!.oldValues).toMatchObject({ productId: b.productId, listaId: b.listaId });
      expect(log!.newValues).toMatchObject({ listaId: null });
    });

    it('producto sin esa Lista (ya desvinculado u ajeno) → 404', async () => {
      const b = await seedBundle('unlink404');
      await service.unlinkProduct(b.listaId, b.productId, ADMIN);

      await expect(service.unlinkProduct(b.listaId, b.productId, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.unlinkProduct(b.listaId, '11111111-1111-4111-8111-999999999999', ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('usuario con solo view sobre la Lista → 403 (no desvincula)', async () => {
      const b = await seedBundle('unlink403');
      await prisma.assignment.create({
        data: {
          userId: memberId,
          resourceType: 'LISTA',
          resourceId: b.listaId,
          level: 'view',
          isActive: true,
        },
      });
      const viewer = { userId: memberId, roles: ['Operador'] };
      await expect(service.unlinkProduct(b.listaId, b.productId, viewer)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect((await prisma.product.findUnique({ where: { id: b.productId } }))!.listaId).toBe(
        b.listaId,
      );
    });
  });

  describe('archivar / restaurar (C5, §2.3)', () => {
    it('restore repone archivedAt=null E isActive=true (cierra H1)', async () => {
      const b = await seedBundle('restore');

      const archived = await service.archive(b.listaId, ADMIN);
      expect(archived.archivedAt).not.toBeNull();
      expect(archived.isActive).toBe(false);

      const restored = await service.restore(b.listaId, ADMIN);
      expect(restored.archivedAt).toBeNull();
      expect(restored.isActive).toBe(true);

      const inDb = await prisma.lista.findUnique({ where: { id: b.listaId } });
      expect(inDb!.archivedAt).toBeNull();
      expect(inDb!.isActive).toBe(true);
    });

    it('archivar no libera el SKU ni mueve productos (§3)', async () => {
      const b = await seedBundle('archive');

      await service.archive(b.listaId, ADMIN);

      const product = await prisma.product.findUnique({ where: { id: b.productId } });
      expect(product).not.toBeNull();
      expect(product!.sku).toBe(b.sku);
      expect(product!.listaId).toBe(b.listaId);

      // El SKU sigue ocupado: otro producto no puede reutilizarlo.
      await expect(
        prisma.product.create({
          data: { sku: b.sku, name: 'Clon prohibido', categoryId: catId, brandId },
        }),
      ).rejects.toThrow();

      // Y los medios y precios quedan intactos.
      const snapshot = await readBundle(b);
      expect(snapshot.image).not.toBeNull();
      expect(Buffer.from(snapshot.file!.data).equals(BYTES)).toBe(true);
      expect(snapshot.priceA).not.toBeNull();
      expect(snapshot.priceB).not.toBeNull();
    });
  });
});
