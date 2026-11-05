import 'reflect-metadata';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { CategoriesController } from './categories/categories.controller';
import { BrandsController } from './brands/brands.controller';
import { PricesController } from './prices/prices.controller';
import { PRICE_HANDLER_GRANTS } from './prices/price-action.guard';

describe('ComercialDeletes — Admin Comercial puede eliminar todo el área comercial (contrato)', () => {
  const rolesOf = (method: Function): string[] =>
    Reflect.getMetadata(ROLES_KEY, method) ?? [];

  const expectsCommercialDelete = (method: Function, endpoint: string) => {
    const roles = rolesOf(method);
    expect(roles).toContain('Super Admin');
    expect(roles).toContain('Admin Comercial');
    expect(roles).toEqual(['Super Admin', 'Admin Comercial']);
  };

  /** Biblioteca (tarifas y precios): ningún cargo concede; solo la concesión global del panel. */
  const expectsGrantOnly = (method: Function, expectedGrants: string[]) => {
    expect(rolesOf(method)).toEqual([]);
    expect(PRICE_HANDLER_GRANTS[method.name]).toEqual(expectedGrants);
  };

  it('DELETE /api/categories/:id incluye Admin Comercial y Super Admin', () => {
    expectsCommercialDelete(CategoriesController.prototype.remove, 'DELETE /api/categories/:id');
  });

  it('DELETE /api/brands/:id incluye Admin Comercial y Super Admin', () => {
    expectsCommercialDelete(BrandsController.prototype.remove, 'DELETE /api/brands/:id');
  });

  it('DELETE /api/prices/lists/:id (tarifa) ya no depende del cargo: exige products:write global', () => {
    expectsGrantOnly(PricesController.prototype.removePriceList, ['products:write']);
  });

  it('DELETE /api/prices/:id (precio) ya no depende del cargo: exige prices:apply global', () => {
    expectsGrantOnly(PricesController.prototype.removePrice, ['prices:apply']);
  });

  it('DELETE de usuarios sigue siendo SOLO Super Admin (no se abre al contenedor comercial)', () => {
    const { UsersController } = require('./users/users.controller') as typeof import('./users/users.controller');
    expect(rolesOf(UsersController.prototype.remove)).toEqual(['Super Admin']);
  });
});
