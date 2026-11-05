import 'reflect-metadata';
jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { REQUIRED_GRANTS_KEY } from '../../common/security/require-grant';
import { BrandsController } from '../brands/brands.controller';
import { CategoriesController } from '../categories/categories.controller';

const meta = (key: string, cls: any, name: string) => Reflect.getMetadata(key, cls.prototype[name]);

describe('master catalogs: new endpoints use panel grants, existing ones keep their roles', () => {
  it('category usage needs masters:read and activation needs masters:write', () => {
    expect(meta(REQUIRED_GRANTS_KEY, CategoriesController, 'usage')).toEqual(['masters:read']);
    expect(meta(REQUIRED_GRANTS_KEY, CategoriesController, 'toggleActive')).toEqual(['masters:write']);
  });

  it('brand usage needs masters:read', () => {
    expect(meta(REQUIRED_GRANTS_KEY, BrandsController, 'usage')).toEqual(['masters:read']);
  });

  it('existing category and brand writes keep their role check', () => {
    for (const [cls, name] of [[CategoriesController, 'create'], [CategoriesController, 'remove'], [BrandsController, 'update'], [BrandsController, 'remove']] as const) {
      expect(meta(ROLES_KEY, cls, name)).toEqual(expect.arrayContaining(['Super Admin', 'Admin Comercial']));
    }
  });
});
