import { ForbiddenException } from '@nestjs/common';
import { ROLE } from '../rbac/roles.constants';
import type { AccessScope } from './access-catalog';
import type { ScopedGrant } from './data-scope';
import {
  assertCatalogResourceAccess,
  decideCatalogResourceAccess,
  decideCatalogResourceAccessFromGrants,
  type CatalogResource,
} from './catalog-resource-access';
import { concessionCanAction } from './d5-action';

const ctx = { userId: 'user-1', roles: ['Admin Comercial'] };
const productA: CatalogResource = { id: 'product-a', kind: 'product', productId: 'product-a', listId: 'list-a' };
const productB: CatalogResource = { id: 'product-b', kind: 'product', productId: 'product-b', listId: 'list-b' };
const listA: CatalogResource = { id: 'list-a', kind: 'lista', listId: 'list-a' };
const grant = (actionId: string, scope: AccessScope = 'list', resourceId = 'list-a'): ScopedGrant => ({
  sourceId: `source-${actionId}-${resourceId}`, actionId, scope,
  ...(scope === 'global' ? {} : { resourceId }),
});
const source = (...rows: ScopedGrant[]) => ({ grantsForUser: jest.fn<Promise<ScopedGrant[]>, [string]>().mockResolvedValue(rows) });

describe('catalog resource grants', () => {
  it.each([undefined, '', '   '])('denies missing identity %p even with Super Admin role', async (userId) => {
    const service = source(grant('products:read', 'global'));
    expect(await decideCatalogResourceAccess(service, 'products:read', { userId, roles: [ROLE.SUPER_ADMIN] }, productA))
      .toMatchObject({ allowed: false, reason: 'no-identity' });
    expect(service.grantsForUser).not.toHaveBeenCalled();
  });

  it('keeps only the explicit authenticated Super Admin exception', async () => {
    expect(await decideCatalogResourceAccess(undefined, 'products:write', { ...ctx, roles: [ROLE.SUPER_ADMIN] }, productB))
      .toMatchObject({ allowed: true, reason: 'super-admin', scope: 'global' });
    expect(await decideCatalogResourceAccess(undefined, 'products:write', ctx, productB))
      .toMatchObject({ allowed: false, reason: 'no-grants' });
  });

  it('does not let Admin Comercial broaden a list action to another list', async () => {
    const service = source(grant('products:write'), grant('products:read', 'global'));
    expect(await decideCatalogResourceAccess(service, 'products:write', ctx, productA)).toMatchObject({ allowed: true, scope: 'list' });
    expect(await decideCatalogResourceAccess(service, 'products:write', ctx, productB)).toMatchObject({ allowed: false, reason: 'resource-denied' });
  });

  it('does not let read access in B expand write access in A for any normal role', async () => {
    const service = source(grant('products:write'), grant('products:read'), grant('products:read', 'list', 'list-b'));
    const user = { ...ctx, roles: ['Operador'] };
    expect((await decideCatalogResourceAccess(service, 'products:read', user, productB)).allowed).toBe(true);
    expect((await decideCatalogResourceAccess(service, 'products:write', user, productB)).allowed).toBe(false);
  });

  it('honors an explicit global action only with its dependency on the target', async () => {
    const service = source(grant('products:write', 'global'), grant('products:read'));
    expect((await decideCatalogResourceAccess(service, 'products:write', ctx, productA)).allowed).toBe(true);
    expect(await decideCatalogResourceAccess(service, 'products:write', ctx, productB))
      .toMatchObject({ allowed: false, reason: 'dependency-denied' });
    service.grantsForUser.mockResolvedValue([grant('products:write', 'global'), grant('products:read', 'global')]);
    expect((await decideCatalogResourceAccess(service, 'products:write', ctx, productB)).allowed).toBe(true);
  });

  it('supports product-only grants, including unassigned library products', async () => {
    const service = source(grant('products:write', 'product', 'product-a'), grant('products:read', 'product', 'product-a'));
    expect((await decideCatalogResourceAccess(service, 'products:write', ctx, { ...productA, listId: undefined })).allowed).toBe(true);
    expect((await decideCatalogResourceAccess(service, 'products:write', ctx, productB)).allowed).toBe(false);
    expect((await decideCatalogResourceAccess(service, 'products:write', ctx, listA)).allowed).toBe(false);
  });

  it('does not let list grants cover an unassigned product', async () => {
    const service = source(grant('products:read'));
    expect((await decideCatalogResourceAccess(service, 'products:read', ctx, { ...productA, listId: undefined })).allowed).toBe(false);
  });

  it('checks every dependency in the price-save chain against the same resource', async () => {
    const service = source(grant('prices:save'), grant('prices:preview'));
    expect(await decideCatalogResourceAccess(service, 'prices:save', ctx, listA))
      .toMatchObject({ allowed: false, reason: 'dependency-denied' });
    service.grantsForUser.mockResolvedValue(['prices:save', 'prices:preview', 'prices:read', 'listas:read'].map((action) => grant(action)));
    expect((await decideCatalogResourceAccess(service, 'prices:save', ctx, listA)).allowed).toBe(true);
    service.grantsForUser.mockResolvedValue([
      grant('prices:save'), grant('prices:preview'), grant('prices:read'), grant('listas:read', 'list', 'list-b'),
    ]);
    expect((await decideCatalogResourceAccess(service, 'prices:save', ctx, listA)).allowed).toBe(false);
  });

  it('re-reads grants so removing the last assignment denies the same identity immediately', async () => {
    const service = source(grant('products:read'));
    expect((await decideCatalogResourceAccess(service, 'products:read', ctx, productA)).allowed).toBe(true);
    service.grantsForUser.mockResolvedValue([]);
    expect(await decideCatalogResourceAccess(service, 'products:read', ctx, productA))
      .toMatchObject({ allowed: false, reason: 'no-grants' });
    expect(service.grantsForUser).toHaveBeenCalledTimes(2);
  });

  it('never interprets an account resource as an administrative self-account exception', async () => {
    const resource = { id: ctx.userId, kind: 'account' } as unknown as CatalogResource;
    expect(await decideCatalogResourceAccess(source(grant('products:read', 'global')), 'products:read', ctx, resource))
      .toMatchObject({ allowed: false, reason: 'invalid-resource' });
  });

  it('rejects missing/mismatched resource IDs instead of silently dropping the scope check', async () => {
    const service = source(grant('products:read', 'global'));
    expect((await decideCatalogResourceAccess(service, 'products:read', ctx, { ...productA, productId: 'product-b' })).allowed).toBe(false);
    expect((await decideCatalogResourceAccess(service, 'products:read', ctx, { id: 'list-a', kind: 'lista' })).allowed).toBe(false);
  });

  it('does not enable unknown or disabled actions even for Super Admin', async () => {
    const superAdmin = { ...ctx, roles: [ROLE.SUPER_ADMIN] };
    expect(await decideCatalogResourceAccess(undefined, 'missing:action', superAdmin, productA))
      .toMatchObject({ allowed: false, reason: 'unknown-action' });
    expect(await decideCatalogResourceAccess(undefined, 'listas:link', superAdmin, listA))
      .toMatchObject({ allowed: false, reason: 'disabled-action' });
  });

  it('assert throws 403 on the actual resource; optional d5 resource argument uses the same rule', async () => {
    const service = source(grant('products:read'));
    await expect(assertCatalogResourceAccess(service, 'products:read', ctx, productB)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await concessionCanAction(service as never, 'products:read', ctx, productB))
      .toEqual({ allowed: false, reason: 'resource-denied' });
    expect(await concessionCanAction(service as never, 'products:read', ctx, productA))
      .toEqual({ allowed: true, reason: 'grant' });
  });

  it('pure batch decisions use the supplied snapshot without broadening a different action', () => {
    const rows = [grant('products:read', 'global'), grant('products:notes')];
    expect(decideCatalogResourceAccessFromGrants(rows, 'products:notes', ctx, productA).allowed).toBe(true);
    expect(decideCatalogResourceAccessFromGrants(rows, 'products:notes', ctx, productB).allowed).toBe(false);
  });
});
