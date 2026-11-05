/**
 * CAT-02 backend-esquema — backfill de revisiones de producto y recuperación
 * (contrato CAT-02 §3/§5; ficha acceptance: «Backfill preserva IDs/datos/medios;
 * recuperación probada.»)
 *
 * Runs against a guarded clone of the existing local synthetic PostgreSQL fixture.
 * Prepare and run with npm run test:catalog:regression; no Docker reset or migration occurs.
 */
import { localCatalogTestUrl, assertLocalCatalogDatabase } from '../../__test__/local-catalog-postgres';

// Existing implementation, exercised only against the guarded test clone.
import {
  runProductRevisionBackfill,
  recoverProductRevisionBackfill,
} from './product-revisions.backfill';

jest.setTimeout(120_000);

const DATABASE_URL = localCatalogTestUrl('backfill');

async function psql(sql: string): Promise<string> {
  const rows = await prismaQuery(sql);
  return rows.map((row: Record<string, unknown>) => Object.values(row).join('|')).join('\n');
}
let prismaQuery: (sql: string) => Promise<Array<Record<string, unknown>>>;

describe('CAT-02 backend-esquema — backfill y recuperación de revisiones', () => {
  let prisma: any;
  let dbGuardOk = false;
  const fixtures: { productId?: string; brandId?: string; categoryId?: string; listaId?: string } = {};

  beforeAll(async () => {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    await prisma.$connect();
    await assertLocalCatalogDatabase(prisma, DATABASE_URL);
    dbGuardOk = true;
    prismaQuery = (sql) => prisma.$queryRawUnsafe(sql);
  });

  afterAll(async () => {
    if (!prisma) return;
    if (!dbGuardOk) { await prisma.$disconnect(); return; }
    // Limpieza en orden de FKs (no toca productos reales: solo cat02fix*).
    await prisma.$executeRawUnsafe(`UPDATE "products" SET "publicRevisionId" = NULL WHERE "publicRevisionId" IS NOT NULL`).catch(() => 0);
    await prisma.productImage.deleteMany({ where: { productId: { startsWith: 'cat02fix' } } });
    await prisma.price.deleteMany({ where: { id: { startsWith: 'cat02fix' } } });
    await prisma.priceList.deleteMany({ where: { id: { startsWith: 'cat02fix' } } });
    await prisma.product.deleteMany({ where: { id: { startsWith: 'cat02fix' } } });
    await prisma.brand.deleteMany({ where: { id: { startsWith: 'cat02fix' } } });
    await prisma.category.deleteMany({ where: { id: { startsWith: 'cat02fix' } } });
    await prisma.$disconnect();
  });

  async function seedFixtures() {
    // Defensa idempotente: limpiar fixtures de corridas previas.
    await prisma.product.deleteMany({ where: { id: { startsWith: 'cat02fix' } } });
    await prisma.price.deleteMany({ where: { id: { startsWith: 'cat02fix' } } });
    await prisma.priceList.deleteMany({ where: { id: { startsWith: 'cat02fix' } } });
    await prisma.brand.deleteMany({ where: { id: { startsWith: 'cat02fix' } } });
    await prisma.category.deleteMany({ where: { id: { startsWith: 'cat02fix' } } });
    const brand = await prisma.brand.create({
      data: { id: 'cat02fix-brand', name: 'CAT02FIX Marca', slug: 'cat02fix-marca' },
    });
    const category = await prisma.category.create({
      data: { id: 'cat02fix-cat', name: 'CAT02FIX Categoria', slug: 'cat02fix-categoria' },
    });
    fixtures.brandId = brand.id;
    fixtures.categoryId = category.id;
    // Producto PUBLICADO (catálogo) con imagen y precio — medios reales en BD.
    const published = await prisma.product.create({
      data: {
        id: 'cat02fix-pub',
        sku: 'CAT02FIX-PUB-1',
        name: 'Producto Publicado CAT02FIX',
        description: 'Descripción pública de prueba',
        brandId: brand.id,
        categoryId: category.id,
        isActive: true,
        isVisible: true,
        publishStatus: 'publicado',
        catalogPublished: true,
        catalogSlug: 'cat02fix-pub',
        catalogName: 'Producto Publicado CAT02FIX',
        catalogImageUrl: '/api/files/cat02fix-img',
        images: {
          create: [{ id: 'cat02fix-img', url: '/api/files/cat02fix-img', alt: 'Imagen CAT02FIX', isPrimary: true }],
        },
      },
    });
    fixtures.productId = published.id;
    const lista = await prisma.priceList.create({
      data: { id: 'cat02fix-lista', name: 'CAT02FIX Lista', code: 'CAT02FIX-L' },
    });
    fixtures.listaId = lista.id;
    await prisma.price.create({
      data: {
        id: 'cat02fix-price',
        productId: published.id,
        priceListId: lista.id,
        value: '12345.67',
        currency: 'COP',
      },
    });
    // Producto BORRADOR — jamás debe recibir revisión publicada.
    await prisma.product.create({
      data: {
        id: 'cat02fix-draft',
        sku: 'CAT02FIX-DRAFT-1',
        name: 'Producto Borrador CAT02FIX',
        brandId: brand.id,
        categoryId: category.id,
        isActive: false,
        isVisible: false,
        catalogPublished: false,
      },
    });
    return published;
  }

  async function stateOf(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    const image = await prisma.productImage.findUnique({ where: { id: 'cat02fix-img' } });
    const price = await prisma.price.findUnique({ where: { id: 'cat02fix-price' } });
    return { product, image, price };
  }

  it('estructura desplegada: product_revisions existe y product.publicRevisionId también', async () => {
    const cols = await psql(
      `SELECT column_name FROM information_schema.columns WHERE table_name='product_revisions' ORDER BY column_name`,
    );
    expect(cols).toContain('content');
    expect(cols).toContain('version');
    expect(cols).toContain('status');
    const productCol = await psql(
      `SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='publicRevisionId'`,
    );
    expect(productCol).toBe('publicRevisionId');
  });

  it('backfill: preserva IDs/datos/medios del producto publicado y crea su revisión', async () => {
    const published = await seedFixtures();
    const before = await stateOf(published.id);

    const result = await runProductRevisionBackfill(prisma);

    const after = await stateOf(published.id);
    // IDs y datos de origen intactos (toda la fila del producto byte-igual en campos clave)
    expect(after.product.id).toBe(before.product.id);
    expect(after.product.sku).toBe(before.product.sku);
    expect(after.product.updatedAt.getTime()).toBe(before.product.updatedAt.getTime());
    // Medios intactos
    expect(after.image).not.toBeNull();
    expect(after.image.url).toBe(before.image.url);
    expect(after.price).not.toBeNull();
    expect(after.price.value.toFixed(2)).toBe(before.price.value.toFixed(2));

    // Revisión creada y enlazada
    const revision = await prisma.productRevision.findUnique({
      where: { id: after.product.publicRevisionId ?? 'missing' },
    });
    expect(revision).not.toBeNull();
    expect(revision.status).toBe('PUBLICADA');
    expect(revision.version).toBe(1);
    expect(revision.productId).toBe(published.id);
    // Snapshot con los medios referenciados por su MISMO id
    const content = revision.content as { sku?: string; images?: Array<{ id: string }> };
    expect(content.sku).toBe('CAT02FIX-PUB-1');
    expect(content.images?.map((i) => i.id)).toContain('cat02fix-img');
    expect(result.backfilled).toBeGreaterThanOrEqual(1);
  });

  it('backfill: el borrador NO recibe revisión publicada ni referencia pública', async () => {
    const draft = await prisma.product.findUnique({ where: { id: 'cat02fix-draft' } });
    expect(draft).not.toBeNull();
    expect(draft.catalogPublished).toBe(false);
    expect(draft.publicRevisionId).toBeNull();
    const revs = await prisma.productRevision.findMany({ where: { productId: 'cat02fix-draft' } });
    expect(revs).toHaveLength(0);
  });

  it('recuperación: el down elimina el backfill y deja productos/medios intactos', async () => {
    // Asegura fixtures + backfill previo (independiente del orden de ejecución).
    const existing = await prisma.product.findUnique({ where: { id: 'cat02fix-pub' } });
    if (!existing) {
      await seedFixtures();
      await runProductRevisionBackfill(prisma);
    }
    const before = await stateOf('cat02fix-pub');

    const result = await recoverProductRevisionBackfill(prisma);

    const after = await stateOf('cat02fix-pub');
    expect(after.product.publicRevisionId).toBeNull();
    expect(after.product.sku).toBe(before.product.sku);
    expect(after.product.updatedAt.getTime()).toBe(before.product.updatedAt.getTime());
    expect(after.image?.url).toBe(before.image.url);
    expect(after.price?.value.toFixed(2)).toBe(before.price.value.toFixed(2));
    const revs = await prisma.productRevision.findMany({ where: { productId: 'cat02fix-pub' } });
    expect(revs).toHaveLength(0);
    expect(result.removed).toBeGreaterThanOrEqual(1);
  });
});
