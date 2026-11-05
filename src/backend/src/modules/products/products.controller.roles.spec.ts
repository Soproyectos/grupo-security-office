import 'reflect-metadata';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { REQUIRED_GRANTS_KEY } from '../../common/security/require-grant';
import { ProductsController } from './products.controller';

/**
 * Contrato de ProductsController: la Biblioteca autoriza SOLO por concesiones de panel
 * (nunca por cargo). Antes este archivo fijaba la matriz de roles.
 */
describe('ProductsController — matriz de concesiones (contrato)', () => {
  const grantsOf = (method: Function): string[] =>
    Reflect.getMetadata(REQUIRED_GRANTS_KEY, method) ?? [];
  const rolesOf = (method: Function): string[] | undefined =>
    Reflect.getMetadata(ROLES_KEY, method);

  it('GET trending no es público y exige products:read (expone precios y extraAttributes)', () => {
    const handler = ProductsController.prototype.findTrending;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ProductsController)).toBeUndefined();
    expect(grantsOf(handler)).toEqual(['products:read']);
    expect(rolesOf(handler)).toBeUndefined();
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

  it('PATCH :id/publish y :id/unpublish exigen products:publish y no declaran cargos', () => {
    for (const handler of [ProductsController.prototype.publish, ProductsController.prototype.unpublish]) {
      expect(grantsOf(handler)).toEqual(['products:publish']);
      expect(rolesOf(handler)).toBeUndefined();
    }
  });

  it('DELETE :id exige products:delete y no declara cargos', () => {
    expect(grantsOf(ProductsController.prototype.remove)).toEqual(['products:delete']);
    expect(rolesOf(ProductsController.prototype.remove)).toBeUndefined();
  });
});
