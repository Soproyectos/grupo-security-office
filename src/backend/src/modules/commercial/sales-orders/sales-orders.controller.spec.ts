import 'reflect-metadata';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SalesOrdersController } from './sales-orders.controller';

/** Pedidos de venta: las rutas ya no se protegen por cargo sino por las acciones salesOrders:*. */
describe('SalesOrdersController — contrato de autorización', () => {
  const proto = SalesOrdersController.prototype as any;

  it('exige sesión interna y no usa RolesGuard ni @Roles', () => {
    const guards = Reflect.getMetadata('__guards__', SalesOrdersController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).not.toContain(RolesGuard);
    for (const name of ['findAll', 'findOne', 'updateInvoice']) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[name]) ?? []).toEqual([]);
    }
  });

  it('pasa al servicio la identidad de la sesión (nunca del cuerpo)', () => {
    const service: any = { findAll: jest.fn(), findOne: jest.fn(), updateInvoice: jest.fn() };
    const controller = new SalesOrdersController(service);
    const user = { sub: 'u1', roles: ['Operador'], jti: 'j1' };
    const ctx = { userId: 'u1', roles: ['Operador'], jti: 'j1' };
    controller.findAll(user, {} as any);
    controller.findOne(user, 'so-1');
    controller.updateInvoice(user, 'so-1', { externalInvoiceNumber: 'FE-1' } as any);
    expect(service.findAll).toHaveBeenCalledWith({}, ctx);
    expect(service.findOne).toHaveBeenCalledWith('so-1', ctx);
    expect(service.updateInvoice).toHaveBeenCalledWith('so-1', { externalInvoiceNumber: 'FE-1' }, ctx);
  });
});
