import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GrantGuard, REQUIRED_GRANTS_KEY } from '../../common/security/require-grant';
import { StorefrontAdminController } from './storefront.controller';

/**
 * Administración de la tienda web: ya no se protege por cargo sino por la acción
 * asignable `storefront:manage` (global). Super Admin conserva su excepción.
 */
const ROUTES = ['overview', 'settings', 'review', 'resolve'];
const grant = (actionId: string, scope = 'global') => ({ sourceId: `s-${actionId}`, actionId, scope });

async function run(user: any, rows: any[], handler = 'overview'): Promise<boolean> {
  const guard = new GrantGuard(new Reflector(), { grantsForUser: jest.fn().mockResolvedValue(rows) } as any);
  const context = {
    getHandler: () => (StorefrontAdminController.prototype as any)[handler],
    getClass: () => StorefrontAdminController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return guard.canActivate(context);
}

describe('StorefrontAdminController — acción storefront:manage', () => {
  it('declara la acción en la clase, con GrantGuard, sin @Roles ni RolesGuard', () => {
    expect(Reflect.getMetadata(REQUIRED_GRANTS_KEY, StorefrontAdminController)).toEqual(['storefront:manage']);
    const guards = Reflect.getMetadata('__guards__', StorefrontAdminController) ?? [];
    expect(guards).toContain(GrantGuard);
    expect(guards).not.toContain(RolesGuard);
    expect(Reflect.getMetadata(ROLES_KEY, StorefrontAdminController)).toBeUndefined();
  });

  it('sin la acción responde 403 en todas las rutas, aunque el cargo sea Admin Comercial', async () => {
    for (const route of ROUTES) {
      await expect(run({ sub: 'u1', roles: ['Admin Comercial'] }, [grant('marketing:read')], route)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('con la acción y sin cargo especial pasa', async () => {
    for (const route of ROUTES) {
      await expect(run({ sub: 'u1', roles: ['Operador'] }, [grant('storefront:manage')], route)).resolves.toBe(true);
    }
  });

  it('una concesión que no es global no basta', async () => {
    await expect(run({ sub: 'u1', roles: ['Operador'] }, [grant('storefront:manage', 'own')])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Super Admin pasa sin concesiones', async () => {
    await expect(run({ sub: 'u0', roles: ['Super Admin'] }, [])).resolves.toBe(true);
  });
});
