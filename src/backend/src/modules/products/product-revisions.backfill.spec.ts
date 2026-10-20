/**
 * CAT-02 backend-esquema — backfill de revisiones de producto y recuperación
 * (contrato CAT-02 §3/§5; ficha acceptance: «Backfill preserva IDs/datos/medios;
 * recuperación probada.»)
 *
 * RED observado: este spec se escribe ANTES de la implementación — `./product-revisions.backfill`
 * no existe todavía y debe fallar por módulo ausente.
 *
 * Corre contra PostgreSQL REAL en la BD desechable `grupo_security_tanda_t12`
 * con `DATABASE_URL` INLINE y guard `current_database()` (incidente registrado:
 * un e2e anterior escribió fixtures en Neon producción por omitir el guard).
 */
import { execSync } from 'child_process';

// Sujeto bajo prueba (RED: módulo inexistente todavía).
import {
  runProductRevisionBackfill,
  recoverProductRevisionBackfill,
} from './product-revisions.backfill';

jest.setTimeout(120_000);

const DATABASE_URL =
  'postgresql://postgres:tanda-test-2026@localhost:54331/grupo_security_tanda_t12?schema=public';
const EXPECTED_DB = 'grupo_security_tanda_t12';

function psql(sql: string): string {
  return execSync(
    `docker exec gs-tanda-db psql -U postgres -d ${EXPECTED_DB} -t -A -c ${JSON.stringify(sql)}`,
    { encoding: 'utf8' },
  ).trim();
}

describe('CAT-02 backend-esquema — backfill y recuperación de revisiones', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let dbGuardOk = false;
  const fixtures: { productId?: string; brandId?: string; categoryId?: string; listaId?: string } = {};

  beforeAll(async () => {
    // BD desechable: recrear SIEMPRE (cada corrida parte limpia; nunca tocar otra BD).
    execSync(
      `docker exec gs-tanda-db psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${EXPECTED_DB}'" 2>/dev/null || true`,
      { stdio: 'ignore' },
    );
    execSync(
      `docker exec gs-tanda-db psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS ${EXPECTED_DB}"`,
      { stdio: 'ignore' },
    );
    execSync(`docker exec gs-tanda-db psql -U postgres -d postgres -c "CREATE DATABASE ${EXPECTED_DB}"`, { stdio: 'ignore' });
    execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
      stdio: 'ignore',
      env: { ...process.env, DATABASE_URL },
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (await (prisma as any).$queryRawUnsafe('SELECT current_database() AS db')) as Array<{ db: string }>;
    dbGuardOk = rows[0]?.db === EXPECTED_DB;
    if (!dbGuardOk) throw new Error(`GUARD: la BD es ${rows[0]?.db}, se aborta (nunca escribir en otra)`);
  });

  afterAll(async () => {
    if (!prisma) return;
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
    const cols = psql(
      `SELECT column_name FROM information_schema.columns WHERE table_name='product_revisions' ORDER BY column_name`,
    );
    expect(cols).toContain('content');
    expect(cols).toContain('version');
    expect(cols).toContain('status');
    const productCol = psql(
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
