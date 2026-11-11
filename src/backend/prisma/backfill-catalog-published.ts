/**
 * Idempotent backfill: products already PUBLISHED (active and visible) whose
 * catalog sheet was never published (`catalogPublished = false`) never appear in
 * the storefront. This completes slug / primary image (only when blank) and sets
 * `catalogPublished = true`, also patching blank fields of the pinned public revision.
 *
 * DRY-RUN by default. Writes only with `--apply`:
 *   npx ts-node prisma/backfill-catalog-published.ts            (dry-run)
 *   npx ts-node prisma/backfill-catalog-published.ts --apply
 * Not run automatically by any pipeline.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const SLUG = /^[a-z0-9][a-z0-9-]{0,127}$/;

const slugify = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120).replace(/-+$/g, '');

async function main() {
  const products = await prisma.product.findMany({
    where: { lifecycleStatus: 'PUBLISHED', isActive: true, isVisible: true, catalogPublished: false },
    select: { id: true, sku: true, catalogSlug: true, catalogImageUrl: true, catalogImageAlt: true, publicRevisionId: true },
    orderBy: { sku: 'asc' },
  });
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'}: ${products.length} published products with catalogPublished=false`);

  for (const p of products) {
    const data: Prisma.ProductUncheckedUpdateInput = { catalogPublished: true };
    if (!p.catalogSlug?.trim()) {
      let base = slugify(p.sku ?? '');
      if (!SLUG.test(base)) base = 'producto';
      let candidate = base;
      for (let n = 2; await prisma.product.findFirst({ where: { catalogSlug: candidate, NOT: { id: p.id } }, select: { id: true } }); n++) candidate = `${base}-${n}`;
      data.catalogSlug = candidate;
    }
    if (!p.catalogImageUrl?.trim()) {
      const image = await prisma.productImage.findFirst({ where: { productId: p.id }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], select: { url: true, alt: true } });
      if (image?.url) {
        data.catalogImageUrl = image.url;
        if (!p.catalogImageAlt?.trim() && image.alt) data.catalogImageAlt = image.alt;
      }
    }
    console.log(`${p.sku}: ${JSON.stringify(data)}`);
    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: p.id }, data });
      if (p.publicRevisionId) {
        const rev = await tx.productRevision.findUnique({ where: { id: p.publicRevisionId }, select: { content: true } });
        const content = { ...((rev?.content ?? {}) as Record<string, unknown>) };
        let changed = false;
        for (const key of ['catalogSlug', 'catalogImageUrl', 'catalogImageAlt'] as const) {
          const value = data[key];
          const current = content[key];
          if (typeof value === 'string' && (typeof current !== 'string' || !current.trim())) { content[key] = value; changed = true; }
        }
        if (changed) await tx.productRevision.update({ where: { id: p.publicRevisionId }, data: { content: content as Prisma.InputJsonValue } });
      }
    });
  }
}

main().finally(() => prisma.$disconnect());
