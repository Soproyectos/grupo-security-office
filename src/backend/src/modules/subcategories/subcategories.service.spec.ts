import 'reflect-metadata';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { REQUIRED_GRANTS_KEY } from '../../common/security/require-grant';
import { findNameCollision, normalizeMasterName } from '../masters/master-rules';
import { SubcategoriesController } from './subcategories.controller';
import { SubcategoriesService } from './subcategories.service';

const root = { id: 'r1', parentId: null, isActive: true };

function build(overrides: Record<string, any> = {}) {
  const db: any = {
    subcategory: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 's1', categoryId: 'r1', name: 'Cámaras', slug: 'camaras', legacyCategoryId: null }),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }: any) => ({ id: 's-new', ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    category: { findUnique: jest.fn().mockResolvedValue(root) },
    product: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    subcategorySpec: { count: jest.fn().mockResolvedValue(0) },
    ...overrides,
  };
  const library: any = { client: db, writeTransaction: (work: any) => work(db) };
  const audit = { append: jest.fn().mockResolvedValue(null) };
  return { service: new SubcategoriesService(library, audit as never), db, audit };
}

describe('master-rules', () => {
  it('normalizes case, accents and spacing', () => {
    expect(normalizeMasterName('  Cámaras   IP ')).toBe('camaras ip');
  });
  it('finds the colliding row but not the record itself', () => {
    const rows = [{ id: 'a', name: 'Cámaras IP' }, { id: 'b', name: 'Switches' }];
    expect(findNameCollision('camaras ip', rows)?.id).toBe('a');
    expect(findNameCollision('camaras ip', rows, 'a')).toBeUndefined();
  });
});

describe('SubcategoriesService', () => {
  it('creates under an active root category with a derived slug and audits it', async () => {
    const { service, db, audit } = build();
    const row = await service.create({ categoryId: 'r1', name: 'Cámaras IP' }, { id: 'u1' });
    expect(row.slug).toBe('camaras-ip');
    expect(db.subcategory.create).toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'SUBCATEGORY_CREATED' }));
  });

  it('rejects a category that does not exist, is not root, or is inactive', async () => {
    const missing = build({ category: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(missing.service.create({ categoryId: 'x', name: 'Algo' })).rejects.toBeInstanceOf(NotFoundException);
    const child = build({ category: { findUnique: jest.fn().mockResolvedValue({ ...root, parentId: 'r0' }) } });
    await expect(child.service.create({ categoryId: 'r1', name: 'Algo' })).rejects.toMatchObject({ response: { code: 'CATEGORY_NOT_ROOT' } });
    const inactive = build({ category: { findUnique: jest.fn().mockResolvedValue({ ...root, isActive: false }) } });
    await expect(inactive.service.create({ categoryId: 'r1', name: 'Algo' })).rejects.toMatchObject({ response: { code: 'CATEGORY_INACTIVE' } });
  });

  it('rejects a duplicated normalized name and a duplicated slug inside the category', async () => {
    const { service, db } = build();
    db.subcategory.findMany.mockResolvedValue([{ id: 'x', name: 'Cámaras IP', slug: 'otro' }]);
    await expect(service.create({ categoryId: 'r1', name: 'camaras ip' })).rejects.toMatchObject({ response: { code: 'NAME_DUPLICATED', existing: { id: 'x' } } });
    db.subcategory.findMany.mockResolvedValue([{ id: 'y', name: 'Distinta', slug: 'nueva' }]);
    await expect(service.create({ categoryId: 'r1', name: 'Nueva', slug: 'nueva' })).rejects.toMatchObject({ response: { code: 'SLUG_DUPLICATED' } });
    expect(db.subcategory.create).not.toHaveBeenCalled();
  });

  it('rename keeps the id, the category and never touches products', async () => {
    const { service, db } = build();
    await service.update('s1', { name: 'Cámaras IP PoE' });
    expect(db.subcategory.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { name: 'Cámaras IP PoE' } });
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it('a parent change with products requires confirmImpact and returns the impact', async () => {
    const { service, db } = build({ category: { findUnique: jest.fn().mockResolvedValue({ ...root, id: 'r2' }) } });
    db.product.count.mockResolvedValue(7);
    const err = await service.update('s1', { categoryId: 'r2' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'IMPACT_CONFIRMATION_REQUIRED', impact: { products: 7, fromCategoryId: 'r1', toCategoryId: 'r2' } });
    expect(db.subcategory.update).not.toHaveBeenCalled();
  });

  it('a confirmed parent change moves the category of its products only', async () => {
    const { service, db } = build({ category: { findUnique: jest.fn().mockResolvedValue({ ...root, id: 'r2' }) } });
    db.product.count.mockResolvedValue(2);
    await service.update('s1', { categoryId: 'r2', confirmImpact: true });
    expect(db.product.updateMany).toHaveBeenCalledWith({ where: { subcategoryId: 's1', NOT: { categoryId: 'r2' } }, data: { categoryId: 'r2' } });
    expect(db.subcategory.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ categoryId: 'r2' }) }));
  });

  it('deactivating only flips isActive: no product, price or history is deleted', async () => {
    const { service, db } = build();
    await service.setActive('s1', false);
    expect(db.subcategory.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { isActive: false } });
    expect(db.subcategory.delete).not.toHaveBeenCalled();
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to delete a subcategory with products or molds and explains why', async () => {
    const { service, db } = build();
    db.product.count.mockResolvedValue(3);
    db.subcategorySpec.count.mockResolvedValue(2);
    const err = await service.remove('s1').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().usage).toMatchObject({ canDelete: false, counts: { products: 3, templateEntries: 2 } });
    expect(err.getResponse().usage.reasons.map((r: any) => r.code)).toEqual(['HAS_PRODUCTS', 'HAS_TEMPLATE']);
    expect(db.subcategory.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused subcategory', async () => {
    const { service, db } = build();
    await expect(service.remove('s1')).resolves.toEqual({ message: 'Subcategoría eliminada exitosamente' });
    expect(db.subcategory.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('answers 503 when the library schema has no subcategories', async () => {
    const { service } = build({ subcategory: undefined });
    await expect(service.list()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('lists paginated with the product count', async () => {
    const { service, db } = build();
    db.subcategory.count.mockResolvedValue(1);
    db.subcategory.findMany.mockResolvedValue([{ id: 's1', name: 'A', _count: { products: 4 } }]);
    const res = await service.list({ q: 'cam', page: 2, pageSize: 10 });
    expect(res).toMatchObject({ total: 1, page: 2, pageSize: 10, data: [{ id: 's1', productCount: 4 }] });
    expect(db.subcategory.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
  });
});

describe('SubcategoriesController permissions', () => {
  const proto = SubcategoriesController.prototype as unknown as Record<string, object>;
  const grants = (name: string) => Reflect.getMetadata(REQUIRED_GRANTS_KEY, proto[name]);

  it('reads need masters:read and writes need masters:write', () => {
    for (const name of ['list', 'findOne', 'usage']) expect(grants(name)).toEqual(['masters:read']);
    for (const name of ['create', 'update', 'setActive', 'remove']) expect(grants(name)).toEqual(['masters:write']);
  });
});
