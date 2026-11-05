import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClassificationService } from './classification.service';
import type { ClassificationDb } from './classification.types';

interface Cat { id: string; parentId: string | null; parent?: { parentId: string | null } | null }
interface Sub { id: string; categoryId: string; legacyCategoryId: string | null; isActive: boolean; slug: string; name: string }

/** In-memory stand-in for the three Prisma delegates used by the service. */
function fakeDb(categories: Cat[], subs: Sub[]): ClassificationDb {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return {
    category: {
      findUnique: async ({ where }: any) => {
        const c = byId.get(where.id);
        return c ? { ...c, parent: c.parentId ? { parentId: byId.get(c.parentId)?.parentId ?? null } : null } : null;
      },
      findMany: async () => [],
    },
    subcategory: {
      findUnique: async ({ where }: any) => {
        const s = subs.find((x) => x.id === where.id);
        return s ? { ...s, category: byId.get(s.categoryId) ?? null } : null;
      },
      findFirst: async ({ where }: any) => subs.find((x) => x.legacyCategoryId === where.legacyCategoryId) ?? null,
    },
    product: { findMany: async () => [] },
  };
}

const categories: Cat[] = [
  { id: 'root-a', parentId: null },
  { id: 'root-b', parentId: null },
  { id: 'child-a1', parentId: 'root-a' },
  { id: 'child-a2', parentId: 'root-a' },
  { id: 'child-b1', parentId: 'root-b' },
  { id: 'grand', parentId: 'child-a1' },
];
const subs: Sub[] = [
  { id: 'sub-a1', categoryId: 'root-a', legacyCategoryId: 'child-a1', isActive: true, slug: 'a1', name: 'A1' },
  { id: 'sub-a2', categoryId: 'root-a', legacyCategoryId: 'child-a2', isActive: false, slug: 'a2', name: 'A2' },
  { id: 'sub-b1', categoryId: 'root-b', legacyCategoryId: 'child-b1', isActive: true, slug: 'b1', name: 'B1' },
  { id: 'sub-new', categoryId: 'root-a', legacyCategoryId: null, isActive: true, slug: 'new', name: 'New' },
];

describe('ClassificationService', () => {
  const service = new ClassificationService();
  const db = fakeDb(categories, subs);

  it('derives categoryId from the subcategory legacy category and marks it complete with a brand', async () => {
    const result = await service.resolve(db, { subcategoryId: 'sub-a1', brandId: 'brand' });
    expect(result).toMatchObject({ categoryId: 'child-a1', subcategoryId: 'sub-a1', status: 'complete' });
  });

  it('falls back to the root when the subcategory has no legacy category', async () => {
    const result = await service.resolve(db, { subcategoryId: 'sub-new', brandId: 'brand' });
    expect(result.categoryId).toBe('root-a');
  });

  it('is incomplete when the brand is missing', async () => {
    const result = await service.resolve(db, { subcategoryId: 'sub-a1' });
    expect(result.status).toBe('incomplete');
    expect(result.issues.map((i) => i.code)).toContain('BRAND_MISSING');
  });

  it('rejects a category that disagrees with the subcategory (CLASSIFICATION_CONFLICT)', async () => {
    const result = await service.resolve(db, { subcategoryId: 'sub-a1', categoryId: 'child-b1', brandId: 'brand' });
    expect(result.issues.find((i) => i.blocking)?.code).toBe('CLASSIFICATION_CONFLICT');
    await expect(service.assertWritable(db, { subcategoryId: 'sub-a1', categoryId: 'root-a' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a category that equals the derivation', async () => {
    const result = await service.resolve(db, { subcategoryId: 'sub-a1', categoryId: 'child-a1', brandId: 'brand' });
    expect(result.status).toBe('complete');
  });

  it('rejects an unknown subcategory and an inactive one that is newly assigned', async () => {
    expect((await service.resolve(db, { subcategoryId: 'nope' })).issues.find((i) => i.blocking)?.code).toBe('SUBCATEGORY_NOT_FOUND');
    expect((await service.resolve(db, { subcategoryId: 'sub-a2' })).issues.find((i) => i.blocking)?.code).toBe('SUBCATEGORY_INACTIVE');
  });

  it('lets an inactive subcategory be kept when it is the current one', async () => {
    const result = await service.resolve(db, { subcategoryId: 'sub-a2' }, { categoryId: 'child-a2', subcategoryId: 'sub-a2', brandId: 'brand' });
    expect(result).toMatchObject({ subcategoryId: 'sub-a2', status: 'complete' });
  });

  it('derives the subcategory for a legacy caller that only knows a child category', async () => {
    const result = await service.resolve(db, { categoryId: 'child-b1', brandId: 'brand' });
    expect(result).toMatchObject({ categoryId: 'child-b1', subcategoryId: 'sub-b1', status: 'complete' });
  });

  it('keeps a root category as given and stays incomplete', async () => {
    const result = await service.resolve(db, { categoryId: 'root-a', brandId: 'brand' });
    expect(result).toMatchObject({ categoryId: 'root-a', subcategoryId: null, status: 'incomplete' });
    expect(result.issues.every((i) => !i.blocking)).toBe(true);
  });

  it('does not derive from an inactive matching subcategory', async () => {
    const result = await service.resolve(db, { categoryId: 'child-a2', brandId: 'brand' });
    expect(result).toMatchObject({ categoryId: 'child-a2', subcategoryId: null, status: 'incomplete' });
  });

  it('rejects unknown categories (404) and categories deeper than two levels', async () => {
    await expect(service.assertWritable(db, { categoryId: 'missing' })).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.resolve(db, { categoryId: 'grand' })).issues.find((i) => i.blocking)?.code).toBe('CATEGORY_DEPTH_INVALID');
  });

  it('keeps the stored subcategory when the same category is sent again', async () => {
    const result = await service.resolve(db, { categoryId: 'child-a1' }, { categoryId: 'child-a1', subcategoryId: 'sub-a1', brandId: 'brand' });
    expect(result.subcategoryId).toBe('sub-a1');
  });

  it('drops the stored subcategory when the category changes to one without a subcategory', async () => {
    const result = await service.resolve(db, { categoryId: 'root-b' }, { categoryId: 'child-a1', subcategoryId: 'sub-a1', brandId: 'brand' });
    expect(result).toMatchObject({ categoryId: 'root-b', subcategoryId: null });
  });

  it('saves a draft with nothing known as incomplete, listing what is missing and inventing nothing', async () => {
    const result = await service.resolve(db, {});
    expect(result).toMatchObject({ categoryId: null, subcategoryId: null, status: 'incomplete', missing: ['brand', 'subcategory'] });
    expect(result.issues.some((i) => i.blocking)).toBe(false);
    expect(service.toData(result)).toEqual({ categoryId: null, subcategoryId: null });
  });

  it('lists only the brand as missing when the subcategory is known', async () => {
    expect(await service.resolve(db, { subcategoryId: 'sub-a1' })).toMatchObject({ status: 'incomplete', missing: ['brand'] });
  });

  it('explicit null category clears the category together with its subcategory; undefined leaves them', async () => {
    const current = { categoryId: 'child-a1', subcategoryId: 'sub-a1', brandId: 'brand' };
    expect(await service.resolve(db, { categoryId: null }, current)).toMatchObject({ categoryId: null, subcategoryId: null, status: 'incomplete' });
    expect(await service.resolve(db, { brandId: null }, current)).toMatchObject({ categoryId: 'child-a1', subcategoryId: 'sub-a1', missing: ['brand'] });
    expect(await service.resolve(db, {}, current)).toMatchObject({ categoryId: 'child-a1', subcategoryId: 'sub-a1', status: 'complete' });
  });

  it('clearing only the subcategory keeps the category as is', async () => {
    const result = await service.resolve(db, { subcategoryId: null }, { categoryId: 'child-a1', subcategoryId: 'sub-a1', brandId: 'brand' });
    expect(result).toMatchObject({ categoryId: 'child-a1', subcategoryId: null, missing: ['subcategory'] });
  });

  describe('importer gate (lookup only)', () => {
    const rows = {
      brand: [{ id: 'b1', name: 'Hikvision', slug: 'hikvision' }],
      category: [{ id: 'root-a', name: 'CCTV', slug: 'cctv', parentId: null }, { id: 'child-a1', name: 'Domo', slug: 'cctv-domo', parentId: 'root-a' }],
    };
    const gateDb = () => {
      const create = jest.fn();
      const match = (list: any[]) => jest.fn(async ({ where }: any) => list.find((r) => (where.parentId === undefined || r.parentId === where.parentId)
        && where.OR.some((c: any) => (c.name && c.name.equals.toLowerCase() === r.name.toLowerCase()) || (c.slug && c.slug === r.slug))) ?? null);
      return { db: { ...fakeDb(categories, subs), brand: { findFirst: match(rows.brand), create }, category: { ...fakeDb(categories, subs).category, findFirst: match(rows.category), create } } as unknown as ClassificationDb, create };
    };

    it('finds existing brand and category case-insensitively', async () => {
      const { db: gate } = gateDb();
      expect((await service.resolveExistingBrand(gate, ' hikvision ')).entity?.id).toBe('b1');
      expect((await service.resolveExistingCategory(gate, 'domo', { parentLabel: 'cctv' })).entity?.id).toBe('child-a1');
    });

    it('unknown labels create nothing and report a stable needs-confirmation code with the label', async () => {
      const { db: gate, create } = gateDb();
      expect(await service.resolveExistingBrand(gate, 'Nueva Marca')).toEqual({ entity: null, issue: expect.objectContaining({ code: 'BRAND_NEEDS_CONFIRMATION', label: 'Nueva Marca' }) });
      expect((await service.resolveExistingCategory(gate, 'Domo', { parentLabel: 'Inexistente' })).issue).toMatchObject({ code: 'CATEGORY_NEEDS_CONFIRMATION', label: 'Inexistente > Domo' });
      expect(create).not.toHaveBeenCalled();
    });

    it('an empty label is neither an entity nor an issue', async () => {
      const { db: gate } = gateDb();
      expect(await service.resolveExistingBrand(gate, '  ')).toEqual({ entity: null, issue: null });
    });
  });

  it('degrades to category-only behaviour when the client has no Subcategory model', async () => {
    const legacyDb = { ...fakeDb(categories, subs), subcategory: undefined } as ClassificationDb;
    const result = await service.resolve(legacyDb, { categoryId: 'child-a1', brandId: 'brand' });
    expect(result).toMatchObject({ categoryId: 'child-a1', subcategorySupported: false });
    expect(service.toData(result)).toEqual({ categoryId: 'child-a1' });
    expect((await service.resolve(legacyDb, { subcategoryId: 'sub-a1' })).issues.find((i) => i.blocking)?.code).toBe('SUBCATEGORY_UNSUPPORTED');
  });
});
