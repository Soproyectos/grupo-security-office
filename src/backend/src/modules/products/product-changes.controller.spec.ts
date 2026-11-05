import { ProductChangesController } from './product-changes.controller';
import { REQUIRED_GRANTS_KEY } from '../../common/security/require-grant';

describe('ProductChangesController', () => {
  it('delegates to the service with the JWT user as access context', async () => {
    const list = jest.fn().mockResolvedValue({ items: [] });
    const controller = new ProductChangesController({ list } as any);
    const out = await controller.list('p1', 'cur', '10', 'name', 'MANUAL', { sub: 'u1', roles: ['Admin Comercial'] });
    expect(out).toEqual({ items: [] });
    expect(list).toHaveBeenCalledWith('p1', { userId: 'u1', roles: ['Admin Comercial'] }, { cursor: 'cur', limit: '10', field: 'name', source: 'MANUAL' });
  });

  it('is mounted at api/products/:id/changes behind JwtAuthGuard and RolesGuard', () => {
    expect(Reflect.getMetadata('path', ProductChangesController)).toBe('api/products/:id/changes');
    const guards = Reflect.getMetadata('__guards__', ProductChangesController).map((g: any) => g.name);
    expect(guards).toEqual(['JwtAuthGuard', 'RolesGuard']);
  });

  it('requires all global grants needed for internal product history', () => {
    expect(Reflect.getMetadata(REQUIRED_GRANTS_KEY, ProductChangesController.prototype.list)).toEqual([
      'products:read', 'products:write', 'products:notes',
    ]);
  });
});
