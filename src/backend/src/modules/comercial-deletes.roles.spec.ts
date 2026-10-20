import 'reflect-metadata';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { CategoriesController } from './categories/categories.controller';
import { BrandsController } from './brands/brands.controller';
import { PricesController } from './prices/prices.controller';

describe('ComercialDeletes — Admin Comercial puede eliminar todo el área comercial (contrato)', () => {
  const rolesOf = (method: Function): string[] =>
    Reflect.getMetadata(ROLES_KEY, method) ?? [];

  const expectsCommercialDelete = (method: Function, endpoint: string, actionGuarded = false) => {
    const roles = rolesOf(method);
    expect(roles).toContain('Super Admin');
    expect(roles).toContain('Admin Comercial');
    if (!actionGuarded) expect(roles).toEqual(['Super Admin', 'Admin Comercial']);
    else expect(roles).toContain('Operador'); // PriceActionGuard exige además prices:apply vigente.
  };

  it('DELETE /api/categories/:id incluye Admin Comercial y Super Admin', () => {
    expectsCommercialDelete(CategoriesController.prototype.remove, 'DELETE /api/categories/:id');
  });

  it('DELETE /api/brands/:id incluye Admin Comercial y Super Admin', () => {
    expectsCommercialDelete(BrandsController.prototype.remove, 'DELETE /api/brands/:id');
  });

  it('DELETE /api/prices/lists/:id incluye Admin Comercial y Super Admin (price list)', () => {
    expectsCommercialDelete(PricesController.prototype.removePriceList, 'DELETE /api/prices/lists/:id', true);
  });

  it('DELETE /api/prices/:id incluye Admin Comercial y Super Admin (precio)', () => {
    expectsCommercialDelete(PricesController.prototype.removePrice, 'DELETE /api/prices/:id', true);
  });

  it('DELETE de usuarios sigue siendo SOLO Super Admin (no se abre al contenedor comercial)', () => {
    const { UsersController } = require('./users/users.controller') as typeof import('./users/users.controller');
    expect(rolesOf(UsersController.prototype.remove)).toEqual(['Super Admin']);
  });
});
