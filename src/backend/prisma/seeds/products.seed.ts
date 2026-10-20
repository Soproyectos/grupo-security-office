/**
 * Carga (o actualiza) los productos de ejemplo desde prisma/seeds/data/*.json.
 * Ejecutar:  npx tsx prisma/seeds/products.seed.ts
 * Los JSON tienen la misma forma que la respuesta de la API (ProductDetailDto).
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProductDetailDto } from '../../src/modules/products/public-detail/dto/product-detail.dto';

const prisma = new PrismaClient();

const DOC_KIND = {
  datasheet: 'DATASHEET',
  manual: 'MANUAL',
  'quick-guide': 'QUICK_GUIDE',
  certificate: 'CERTIFICATE',
  other: 'OTHER_DOCUMENT',
} as const;

async function upsertProduct(p: ProductDetailDto) {
  // Obtener o crear categoría y marca por defecto para productos de catálogo
  const [defaultCategory, defaultBrand] = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'videovigilancia' },
      create: { name: 'Videovigilancia', slug: 'videovigilancia', isActive: true },
      update: {},
    }),
    prisma.brand.upsert({
      where: { slug: 'hikvision' },
      create: { name: 'Hikvision', slug: 'hikvision', isActive: true },
      update: {},
    }),
  ]);

  const data = {
    catalogSlug: p.slug,
    catalogBrand: p.brand,
    catalogModel: p.model,
    catalogName: p.name,
    catalogStatus: p.status === 'discontinued' ? ('DISCONTINUED' as const) : ('ACTIVE' as const),
    catalogPublished: true,
    catalogBadges: p.badges,
    catalogImageUrl: p.image?.src ?? null,
    catalogImageAlt: p.image?.alt ?? null,
    catalogHighlights: p.highlights,
    catalogFeatures: p.features as unknown as Prisma.InputJsonValue,
    catalogAvailableModels: p.availableModels,
    catalogBreadcrumb: p.breadcrumb as unknown as Prisma.InputJsonValue,
    catalogSpecsDisclaimer: p.specsDisclaimer ?? null,
    catalogFirmwareNote: p.firmware?.note ?? null,
  };

  await prisma.$transaction(async (tx) => {
    const saved = await tx.product.upsert({
      where: { catalogSlug: p.slug },
      create: { 
        catalogSlug: p.slug, 
        ...data,
        sku: p.model,
        name: p.name,
        categoryId: defaultCategory.id,
        brandId: defaultBrand.id,
      },
      update: data,
    });

    // Reemplaza especificaciones y recursos (más simple que sincronizar uno a uno).
    await tx.productCatalogSpecGroup.deleteMany({ where: { productId: saved.id } });
    await tx.productCatalogResource.deleteMany({ where: { productId: saved.id } });

    for (const [position, group] of p.specGroups.entries()) {
      await tx.productCatalogSpecGroup.create({
        data: {
          productId: saved.id,
          key: group.id,
          title: group.title,
          position,
          items: { create: group.items.map((item, i) => ({ label: item.label, value: item.value, position: i })) },
        },
      });
    }

    const documents = p.documents.map((d, i) => ({
      productId: saved.id,
      kind: DOC_KIND[d.type],
      title: d.title,
      language: d.language,
      url: d.url,
      fileName: d.fileName ?? null,
      position: i,
    }));
    const firmware = (p.firmware?.files ?? []).map((f, i) => ({
      productId: saved.id,
      kind: f.kind === 'firmware' ? ('FIRMWARE' as const) : ('RELEASE_NOTES' as const),
      title: f.title,
      language: 'en',
      url: f.url,
      version: f.version ?? null,
      region: f.region ?? null,
      requiresLicense: f.requiresLicense,
      position: i,
    }));

    await tx.productCatalogResource.createMany({ data: [...documents, ...firmware] });
  });

  console.log(`✔ ${p.model} (${p.slug})`);
}

async function main() {
  const dir = join(process.cwd(), 'prisma/seeds/data'); // ejecutar desde la raíz del backend
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const product = JSON.parse(readFileSync(join(dir, file), 'utf8')) as ProductDetailDto;
    await upsertProduct(product);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());