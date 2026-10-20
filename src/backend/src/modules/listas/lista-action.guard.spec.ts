import { ForbiddenException } from '@nestjs/common';
import { ListaActionGuard } from './lista-action.guard';

const LISTA = 'list-1';
const grant = (actionId: string, resourceId = LISTA) => ({
  sourceId: `source-${actionId}`,
  actionId,
  scope: 'list',
  resourceId,
});

describe('ListaActionGuard', () => {
  const prisma = { lista: { findUnique: jest.fn() } };
  const assignments = { grantsForUser: jest.fn() };
  const guard = new ListaActionGuard(prisma as any, assignments as any);
  const request = { user: { sub: 'worker-1', roles: ['Admin Comercial'] }, params: { id: LISTA }, body: {} as any };
  const context = (method: string, overrides: Record<string, unknown> = {}) => ({
    getHandler: () => ({ [method]: () => undefined })[method],
    switchToHttp: () => ({ getRequest: () => ({ ...request, ...overrides }) }),
  }) as any;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.lista.findUnique.mockResolvedValue({ id: LISTA });
    assignments.grantsForUser.mockResolvedValue([]);
  });

  it('denies a matching role without an assigned action', async () => {
    await expect(guard.canActivate(context('findOne'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks the exact list scope on every request', async () => {
    assignments.grantsForUser.mockResolvedValue([grant('listas:read')]);
    await expect(guard.canActivate(context('findOne'))).resolves.toBe(true);
    await expect(guard.canActivate(context('findOne', { params: { id: 'list-2' } }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not turn update into archive permission', async () => {
    assignments.grantsForUser.mockResolvedValue([grant('listas:update')]);
    await expect(guard.canActivate(context('update', { body: { name: 'Nueva lista' } }))).resolves.toBe(true);
    await expect(guard.canActivate(context('update', { body: { archivedAt: '2026-10-19' } }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('revokes the same session immediately', async () => {
    assignments.grantsForUser.mockResolvedValueOnce([grant('listas:read')]).mockResolvedValueOnce([]);
    await expect(guard.canActivate(context('findOne'))).resolves.toBe(true);
    await expect(guard.canActivate(context('findOne'))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
