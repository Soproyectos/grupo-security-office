/**
 * ENMIENDA DE SEGURIDAD 2026-10-18 (coordinador) — modelo estricto de
 * concesiones: matriz de decisiones de `concessionCanAction` con su `reason`
 * observable y `concessionAssertAction`.
 */
import { ForbiddenException } from '@nestjs/common';
import { ROLE } from '../rbac/roles.constants';
import { concessionAssertAction, concessionCanAction } from './d5-action';

const row = (actionId: string) => ({ sourceId: `s-${actionId}`, actionId, scope: 'global' });
const grantsWith = (actionIds: string[]) => ({ grantsForUser: jest.fn().mockResolvedValue(actionIds.map(row)) });

describe('concessionCanAction (modelo estricto: sin concesion != permiso heredado)', () => {
  it('sin identidad → no-identity, y NI SIQUIERA se consulta a grants', async () => {
    const g = grantsWith(['products:read']);
    const d = await concessionCanAction(g as never, 'products:read', { userId: undefined, roles: ['Admin Comercial'] });
    expect(d).toEqual({ allowed: false, reason: 'no-identity' });
    expect(g.grantsForUser).not.toHaveBeenCalled();
  });

  it('Super Admin sin concesiones → permitido SOLO por excepcion explicita (reason super-admin)', async () => {
    const d = await concessionCanAction(grantsWith([]) as never, 'products:publish', { userId: 'u-1', roles: [ROLE.SUPER_ADMIN] });
    expect(d).toEqual({ allowed: true, reason: 'super-admin' });
  });

  it('rol normal sin concesiones → no-grants (la transicion D5 queda derogada)', async () => {
    for (const role of ['Admin Comercial', 'Supervisor', 'Operador', 'Vendedor', 'Consulta']) {
      const d = await concessionCanAction(grantsWith([]) as never, 'products:write', { userId: 'u-1', roles: [role] });
      expect(d).toEqual({ allowed: false, reason: 'no-grants' });
    }
  });

  it('concesion explicita con su dependencia → grant', async () => {
    const d = await concessionCanAction(grantsWith(['products:write', 'products:read']) as never, 'products:write', { userId: 'u-1', roles: ['Admin Comercial'] });
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.reason).toBe('grant');
  });

  it('concesiones para otra accion → action-denied (no se hereda del rol)', async () => {
    const d = await concessionCanAction(grantsWith(['customers:read']) as never, 'products:write', { userId: 'u-1', roles: ['Admin Comercial'] });
    expect(d).toEqual({ allowed: false, reason: 'action-denied' });
  });

  it('la accion sin su dependencia vigente → dependency-denied', async () => {
    const d = await concessionCanAction(grantsWith(['products:write']) as never, 'products:write', { userId: 'u-1', roles: ['Admin Comercial'] });
    expect(d).toEqual({ allowed: false, reason: 'dependency-denied' });
  });

  it('RETIRAR la ultima concesion con la MISMA identidad deniega la siguiente peticion', async () => {
    const g = grantsWith(['products:read', 'products:write']);
    const ctx = { userId: 'u-1', roles: ['Admin Comercial'] };
    expect((await concessionCanAction(g as never, 'products:write', ctx)).allowed).toBe(true);
    g.grantsForUser.mockResolvedValue([]); // revocacion total
    expect(await concessionCanAction(g as never, 'products:write', ctx)).toEqual({ allowed: false, reason: 'no-grants' });
  });

  it('assert: lanza 403 con el motivo visible y devuelve la decision cuando permite', async () => {
    await expect(concessionAssertAction(grantsWith([]) as never, 'products:write', { userId: 'u-1', roles: ['Operador'] }))
      .rejects.toBeInstanceOf(ForbiddenException);
    const d = await concessionAssertAction(grantsWith([ROLE.SUPER_ADMIN]) as never, 'products:publish', { userId: 'u-1', roles: [ROLE.SUPER_ADMIN] });
    expect(d.reason).toBe('super-admin');
  });
});
