import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UsersController } from './users.controller';
import type { PassportSessionUser } from '../../common/security/live-admin-identity.service';

describe('Own access assignments', () => {
  const user = (id: string, roles: string[] = ['Consulta']) => ({ sub: id, roles }) as PassportSessionUser;
  let controller: UsersController;
  let findOne: jest.Mock;
  let grantsForUser: jest.Mock;

  beforeEach(() => {
    findOne = jest.fn().mockResolvedValue({ id: 'actor' });
    grantsForUser = jest.fn().mockResolvedValue([]);
    controller = new UsersController(
      { findOne } as never, {} as never, {} as never, {} as never, {} as never,
      { grantsForUser, sourcesFor: jest.fn().mockResolvedValue([]), accessVersionFor: jest.fn().mockResolvedValue(0) } as never,
      {} as never,
    );
  });

  it('lets an ordinary authenticated user obtain their current empty panel assignments', async () => {
    const result = await controller.getUserAccess('actor', user('actor'));
    expect(result.userId).toBe('actor');
    expect(result.grants).toEqual([]);
    expect(grantsForUser).toHaveBeenCalledWith('actor');
  });

  it('does not reveal another user or query their assignments', async () => {
    await expect(controller.getUserAccess('other', user('actor', ['Admin Comercial']))).rejects.toBeInstanceOf(NotFoundException);
    expect(findOne).not.toHaveBeenCalled();
    expect(grantsForUser).not.toHaveBeenCalled();
  });

  it('keeps the explicit Super Admin exception for managing another user', async () => {
    await controller.getUserAccess('other', user('actor', ['Super Admin']));
    expect(grantsForUser).toHaveBeenCalledWith('other');
  });

  it('rejects a missing identity before reading any data', async () => {
    await expect(controller.getUserAccess('actor', undefined as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('reads assignments again after revocation with the same identity', async () => {
    const identity = user('actor');
    grantsForUser.mockResolvedValueOnce([{ actionId: 'products:read', scope: 'global' }]).mockResolvedValueOnce([]);
    expect((await controller.getUserAccess('actor', identity)).grants).toHaveLength(1);
    expect((await controller.getUserAccess('actor', identity)).grants).toEqual([]);
    expect(grantsForUser).toHaveBeenCalledTimes(2);
  });
});
