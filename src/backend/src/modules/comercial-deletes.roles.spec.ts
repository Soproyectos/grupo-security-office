import 'reflect-metadata';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { CategoriesController } from './categories/categories.controller';
import { BrandsController } from './brands/brands.controller';
import { PricesController } from './prices/prices.controller';
import { PRICE_HANDLER_GRANTS } from './prices/price-action.guard';
import { REQUIRED_GRANTS_KEY } from '../common/security/require-grant';

describe('ComercialDeletes — eliminar en el área comercial depende de la acción asignada, no del cargo (contrato)', () => {
  const rolesOf = (method: Function): string[] =>
    Reflect.getMetadata(ROLES_KEY, method) ?? [];

  /** Catálogos maestros: ningún cargo concede; solo la acción global `masters:write` (Super Admin conserva su excepción). */
  const expectsMastersWriteOnly = (method: Function) => {
    expect(rolesOf(method)).toEqual([]);
    expect(Reflect.getMetadata(REQUIRED_GRANTS_KEY, method)).toEqual(['masters:write']);
  };

  /** Biblioteca (tarifas y precios): ningún cargo concede; solo la concesión global del panel. */
  const expectsGrantOnly = (method: Function, expectedGrants: string[]) => {
    expect(rolesOf(method)).toEqual([]);
    expect(PRICE_HANDLER_GRANTS[method.name]).toEqual(expectedGrants);
  };

  it('DELETE /api/categories/:id exige masters:write y ningún cargo', () => {
    expectsMastersWriteOnly(CategoriesController.prototype.remove);
  });

  it('DELETE /api/brands/:id exige masters:write y ningún cargo', () => {
    expectsMastersWriteOnly(BrandsController.prototype.remove);
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
