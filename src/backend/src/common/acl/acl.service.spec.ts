import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();
(mockPrisma as any).accessGrant = { findMany: jest.fn() };

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AclService, LEVEL_RANK, normalizeLevel } from './acl.service';

const LISTA_ID = 'list-1';
const OTHER_LISTA_ID = 'list-2';
const USER = { userId: 'user-1', roles: ['Admin Comercial'] };

type GrantFixture = {
  sourceId: string;
  actionId: string;
  scopeKind: 'list' | 'product' | 'global' | 'own' | 'team';
  resourceId: string | null;
};

const grant = (
  actionId: string,
  scopeKind: GrantFixture['scopeKind'] = 'list',
  resourceId: string | null = LISTA_ID,
  sourceId = `source-${actionId}`,
): GrantFixture => ({ sourceId, actionId, scopeKind, resourceId });

function setGrants(rows: GrantFixture[]) {
  (mockPrisma as any).accessGrant.findMany.mockResolvedValue(rows);
}

describe('AclService action and scope authorization', () => {
  let acl: AclService;

  beforeEach(() => {
    jest.resetAllMocks();
    acl = new AclService(mockPrisma as any);
    (mockPrisma as any).accessGrant.findMany.mockResolvedValue([]);
    mockPrisma.product.findUnique.mockResolvedValue({ id: 'product-1', listaId: LISTA_ID });
    mockPrisma.lista.findUnique.mockResolvedValue({ id: LISTA_ID, isActive: true, archivedAt: null });
    mockPrisma.assignment.findMany.mockResolvedValue([]);
  });

  it('retains legacy level parsing without using role assignments as grants', () => {
    expect(LEVEL_RANK.edit).toBe(LEVEL_RANK.edit_products);
    expect(normalizeLevel('edit')).toBe('edit_products');
    expect(normalizeLevel('invalid')).toBeNull();
  });

  it('denies a user with no grants, including Admin Comercial', async () => {
    await expect(acl.assertListaAction(LISTA_ID, USER, 'listas:read')).rejects.toBeInstanceOf(NotFoundException);
    expect(await acl.can(LISTA_ID, USER, 'view')).toBe(false);
    expect(await acl.getAllowedListaIds(USER.userId, USER.roles)).toEqual([]);
  });

  it('keeps Super Admin as the only global role exception', async () => {
    const superAdmin = { userId: 'root', roles: ['Super Admin'] };
    await expect(acl.assertListaAction(LISTA_ID, superAdmin, 'listas:read')).resolves.toBeUndefined();
    expect(await acl.getAllowedListaIds(superAdmin.userId, superAdmin.roles)).toBeNull();
    expect((mockPrisma as any).accessGrant.findMany).not.toHaveBeenCalled();
  });

  it('allows a matching list grant and denies a different list', async () => {
    setGrants([grant('listas:read')]);
    await expect(acl.assertListaAction(LISTA_ID, USER, 'listas:read')).resolves.toBeUndefined();
    await expect(acl.assertListaAction(OTHER_LISTA_ID, USER, 'listas:read')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows global scope for that action only', async () => {
    setGrants([grant('listas:read', 'global', null)]);
    expect(await acl.getAllowedListaIds(USER.userId, USER.roles)).toBeNull();
    await expect(acl.assertListaAction(OTHER_LISTA_ID, USER, 'listas:read')).resolves.toBeUndefined();
    await expect(acl.assertListaAction(OTHER_LISTA_ID, USER, 'listas:archive')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists the whole library with a global products:read grant, with no Lista grant', async () => {
    setGrants([grant('products:read', 'global', null)]);
    expect(await acl.getAllowedListaIds(USER.userId, USER.roles)).toEqual([]);
    expect(await acl.getAllowedListaIdsForProducts(USER.userId, USER.roles)).toBeNull();
  });

  it('keeps the Lista scope for products when products:read is not global', async () => {
    setGrants([grant('products:read')]);
    expect(await acl.getAllowedListaIdsForProducts(USER.userId, USER.roles)).toEqual([]);
  });

  it('lets a list grant cover its products, while a product grant stays on one product', async () => {
    setGrants([grant('products:read')]);
    await expect(acl.assertProductAccess('product-1', USER)).resolves.toEqual({ listaId: LISTA_ID });
    setGrants([grant('products:read', 'product', 'product-1')]);
    await expect(acl.assertProductAccess('product-1', USER)).resolves.toEqual({ listaId: LISTA_ID });
    await expect(acl.assertProductAccess('product-2', USER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires the exact requested action; update does not authorize archive', async () => {
    setGrants([grant('listas:update')]);
    await expect(acl.assertListaAction(LISTA_ID, USER, 'listas:update')).resolves.toBeUndefined();
    await expect(acl.assertListaAction(LISTA_ID, USER, 'listas:archive')).rejects.toBeInstanceOf(NotFoundException);
    expect(await acl.can(LISTA_ID, USER, 'manage')).toBe(true);
  });

  it('requires dependencies at the same resource scope', async () => {
    setGrants([grant('products:write'), grant('products:read', 'list', OTHER_LISTA_ID)]);
    await expect(acl.assertListaAction(LISTA_ID, USER, 'products:write')).rejects.toBeInstanceOf(NotFoundException);

    setGrants([grant('products:write'), grant('products:read')]);
    await expect(acl.assertListaAction(LISTA_ID, USER, 'products:write')).resolves.toBeUndefined();
  });

  it('allows only the exact management action; the legacy manage adapter no longer requires sibling actions', async () => {
    setGrants([grant('listas:update'), grant('listas:archive')]);
    expect(await acl.can(LISTA_ID, USER, 'manage')).toBe(true);
    await expect(acl.assertListaAction(LISTA_ID, USER, 'listas:delete')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('honors revocation immediately by reading current grants on each check', async () => {
    (mockPrisma as any).accessGrant.findMany
      .mockResolvedValueOnce([grant('listas:read')])
      .mockResolvedValueOnce([]);
    await expect(acl.assertListaAction(LISTA_ID, USER, 'listas:read')).resolves.toBeUndefined();
    await expect(acl.assertListaAction(LISTA_ID, USER, 'listas:read')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('checks list activity after authorization and permits explicit restore access', async () => {
    setGrants([grant('listas:update')]);
    mockPrisma.lista.findUnique.mockResolvedValue({ id: LISTA_ID, isActive: false, archivedAt: new Date() });
    await expect(acl.assertListaAction(LISTA_ID, USER, 'listas:update')).rejects.toBeInstanceOf(NotFoundException);
    await expect(acl.assertListaRestoreAccess(LISTA_ID, USER, 'manage')).resolves.toBeUndefined();
  });

  it('rejects unknown legacy levels instead of broadening authorization', async () => {
    setGrants([grant('listas:read', 'global', null)]);
    await expect(acl.assertListaAccess(LISTA_ID, USER, 'unknown')).rejects.toBeInstanceOf(ForbiddenException);
    expect(await acl.can(LISTA_ID, USER, 'unknown')).toBe(false);
  });
});
