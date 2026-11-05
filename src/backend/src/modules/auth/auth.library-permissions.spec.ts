jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

import { AuthService } from './auth.service';

describe('Perfil de sesión: Biblioteca solo por concesiones globales vigentes', () => {
  const user = {
    id: 'library-user-fixture', name: 'Usuario de prueba', email: 'library@example.invalid',
    roles: [{ role: { name: 'Operador', permissions: [
      { permission: 'products:write' }, { permission: 'listas:read' }, { permission: 'customers:read' },
    ] } }],
  };
  const prisma = { user: { findUnique: jest.fn() }, accessGrant: { findMany: jest.fn() } };
  const legacy = { effectivePermissionsFor: jest.fn() };
  let service: AuthService;
  const grant = (actionId: string) => ({ sourceId: 'panel-fixture', actionId });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.accessGrant.findMany.mockResolvedValue([]);
    legacy.effectivePermissionsFor.mockResolvedValue(['products:notes', 'dashboard:pack:ventas']);
    service = new AuthService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, legacy as never);
  });

  it('el cargo y los permisos heredados no conceden Biblioteca ni Listas; otros dominios se conservan', async () => {
    const profile = await service.getProfile(user.id);
    expect(profile.permissions).toEqual(expect.arrayContaining(['customers:read', 'dashboard:pack:ventas']));
    expect(profile.permissions.some((permission) => /^(products|prices|providers|listas):/.test(permission))).toBe(false);
    expect(prisma.accessGrant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { source: { userId: user.id }, scopeKind: 'global' },
    }));
  });

  it('otorgar Fichas habilita el perfil y retirarlas lo revoca sin fallback al cargo', async () => {
    prisma.accessGrant.findMany.mockResolvedValueOnce(['products:read', 'products:write', 'products:notes'].map(grant));
    expect((await service.getProfile(user.id)).permissions).toEqual(expect.arrayContaining(['products:write', 'products:notes']));
    expect((await service.getProfile(user.id)).permissions).not.toContain('products:write');
  });

  it('Publicación sin edición no es efectiva; al conceder read + write + publish no da notas', async () => {
    prisma.accessGrant.findMany.mockResolvedValue(['products:read', 'products:publish'].map(grant));
    const profile = await service.getProfile(user.id);
    expect(profile.permissions).not.toContain('products:publish');
    expect(profile.permissions).not.toContain('products:write');
    expect(profile.permissions).not.toContain('products:notes');

    prisma.accessGrant.findMany.mockResolvedValue(['products:read', 'products:write', 'products:publish'].map(grant));
    const withEdit = await service.getProfile(user.id);
    expect(withEdit.permissions).toEqual(expect.arrayContaining(['products:read', 'products:write', 'products:publish']));
    expect(withEdit.permissions).not.toContain('products:notes');
  });

  it('una acción sin su dependencia de consulta no habilita botones de Biblioteca', async () => {
    prisma.accessGrant.findMany.mockResolvedValue([grant('products:write'), grant('products:notes')]);
    const profile = await service.getProfile(user.id);
    expect(profile.permissions).not.toContain('products:write');
    expect(profile.permissions).not.toContain('products:notes');
  });

  it('Super Admin conserva el acceso completo aunque no tenga concesiones ni permisos de rol', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, roles: [{ role: { name: 'Super Admin', permissions: [] } }] });
    const profile = await service.getProfile(user.id);
    expect(profile.permissions).toEqual(expect.arrayContaining(['products:read', 'products:write', 'products:notes', 'products:publish', 'prices:apply']));
  });
});
