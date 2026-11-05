/**
 * Cambio de jefe (T1): PATCH :id/supervisor y PUT :id aplican las mismas reglas
 * de rama. Controlador instanciado directo con mocks (sin HTTP ni base).
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersController, SetSupervisorDto } from './users.controller';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('UsersController — cambio de jefe dentro de la rama', () => {
  let users: any;
  let hierarchy: any;
  let audit: any;
  let controller: UsersController;
  const boss = { sub: 'boss', roles: ['Operador'] };
  const root = { sub: 'root', roles: ['Super Admin'] };

  beforeEach(() => {
    users = { update: jest.fn().mockResolvedValue({ id: 'ana' }) };
    hierarchy = { assertActorCanSetSupervisor: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn() };
    controller = new UsersController(users, hierarchy, audit, {} as any, {} as any, {} as any, {} as any);
  });

  it('PATCH delega en la regla de alcance con el actor real y guarda', async () => {
    await controller.setSupervisor('ana', { supervisorId: 'boss' }, boss);
    expect(hierarchy.assertActorCanSetSupervisor).toHaveBeenCalledWith({ userId: 'boss', roles: ['Operador'] }, 'ana', 'boss');
    expect(users.update).toHaveBeenCalledWith('ana', { supervisorId: 'boss' }, 'boss');
  });

  it('PATCH: si la regla rechaza, no se guarda ni se audita', async () => {
    hierarchy.assertActorCanSetSupervisor.mockRejectedValue(new Error('fuera de rama'));
    await expect(controller.setSupervisor('x', { supervisorId: 'boss' }, boss)).rejects.toThrow('fuera de rama');
    expect(users.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('PUT con supervisorId aplica la misma regla (sin bypass)', async () => {
    await controller.update('ana', { supervisorId: 'boss' } as any, root);
    expect(hierarchy.assertActorCanSetSupervisor).toHaveBeenCalledWith({ userId: 'root', roles: ['Super Admin'] }, 'ana', 'boss');
    expect(users.update).toHaveBeenCalled();
  });

  it('PUT con supervisorId: null también se valida (quitar jefe)', async () => {
    await controller.update('ana', { supervisorId: null } as any, root);
    expect(hierarchy.assertActorCanSetSupervisor).toHaveBeenCalledWith(expect.anything(), 'ana', null);
  });

  it('PUT sin supervisorId no toca la jerarquía', async () => {
    await controller.update('ana', { name: 'Ana' } as any, root);
    expect(hierarchy.assertActorCanSetSupervisor).not.toHaveBeenCalled();
  });

  it('PUT: si la regla rechaza (ciclo), no actualiza', async () => {
    hierarchy.assertActorCanSetSupervisor.mockRejectedValue(new Error('ciclo'));
    await expect(controller.update('ana', { supervisorId: UUID } as any, root)).rejects.toThrow('ciclo');
    expect(users.update).not.toHaveBeenCalled();
  });

  describe('SetSupervisorDto', () => {
    const errorsOf = (body: unknown) => validate(plainToInstance(SetSupervisorDto, body));
    it('acepta un UUID y null', async () => {
      expect(await errorsOf({ supervisorId: UUID })).toHaveLength(0);
      expect(await errorsOf({ supervisorId: null })).toHaveLength(0);
    });
    it('rechaza texto libre y cuerpo vacío', async () => {
      expect(await errorsOf({ supervisorId: 'no-uuid' })).not.toHaveLength(0);
      expect(await errorsOf({})).not.toHaveLength(0);
    });
  });
});
