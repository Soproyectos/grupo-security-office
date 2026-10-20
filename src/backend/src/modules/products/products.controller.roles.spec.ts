import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ALL_ROLES } from '../../common/rbac/roles.constants';
import { ProductsController } from './products.controller';

describe('ProductsController — matriz de roles (contrato)', () => {
  const rolesOf = (method: Function): string[] =>
    Reflect.getMetadata(ROLES_KEY, method) ?? [];

  it('GET trending no es público y exige rol de staff (expone precios y extraAttributes)', () => {
    const handler = ProductsController.prototype.findTrending;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ProductsController)).toBeUndefined();
    expect(rolesOf(handler)).toEqual(expect.arrayContaining(ALL_ROLES));
    expect(rolesOf(handler).length).toBeGreaterThan(0);
  });

  it('ningún handler de ProductsController es público', () => {
    const handlers = Object.getOwnPropertyNames(ProductsController.prototype).filter(
      (name) => name !== 'constructor' && typeof (ProductsController.prototype as any)[name] === 'function',
    );
    const publicHandlers = handlers.filter((name) =>
      Reflect.getMetadata(IS_PUBLIC_KEY, (ProductsController.prototype as any)[name]),
    );
    expect(publicHandlers).toEqual([]);
  });

  it('PATCH :id/publish incluye Supervisor (publish:manage) y roles de escritura', () => {
    const roles = rolesOf(ProductsController.prototype.publish);
    expect(roles).toContain('Supervisor');
    expect(roles).toEqual(expect.arrayContaining(['Super Admin', 'Supervisor', 'Admin Comercial']));
  });

  it('PATCH :id/unpublish incluye Supervisor (publish:manage)', () => {
    const roles = rolesOf(ProductsController.prototype.unpublish);
    expect(roles).toContain('Supervisor');
    expect(roles).toEqual(expect.arrayContaining(['Super Admin', 'Supervisor', 'Admin Comercial']));
  });

  it('DELETE :id incluye Admin Comercial (products:delete) y Super Admin', () => {
    const roles = rolesOf(ProductsController.prototype.remove);
    expect(roles).toContain('Admin Comercial');
    expect(roles).toContain('Super Admin');
  });
});
