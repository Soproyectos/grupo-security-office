import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { HierarchyService } from './hierarchy.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('HierarchyService', () => {
  let service: HierarchyService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      $queryRaw: jest.fn(),
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HierarchyService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<HierarchyService>(HierarchyService);
  });

  describe('getSubordinateIds', () => {
    it('3-level chain returns all subordinates', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: 'b', depth: 1 },
        { id: 'c', depth: 2 },
      ]);
      const result = await service.getSubordinateIds('a');
      expect(result).toContain('b');
      expect(result).toContain('c');
    });

    it('includeSelf true returns self', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: 'b', depth: 1 },
      ]);
      const result = await service.getSubordinateIds('a', { includeSelf: true });
      expect(result).toContain('a');
      expect(result).toContain('b');
    });
  });

  describe('getAncestorIds', () => {
    it('returns ancestors', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: 'b', depth: 1 },
        { id: 'c', depth: 2 },
      ]);
      const result = await service.getAncestorIds('a');
      expect(result).toContain('b');
      expect(result).toContain('c');
    });
  });

  describe('assertCanViewUser', () => {
    it('Super Admin can view anyone', async () => {
      const ctx = { userId: 'admin-id', roles: ['Super Admin'] };
      await expect(service.assertCanViewUser(ctx, 'any-user-id')).resolves.not.toThrow();
    });

    it('user can view self', async () => {
      const ctx = { userId: 'user-id', roles: ['Operador'] };
      await expect(service.assertCanViewUser(ctx, 'user-id')).resolves.not.toThrow();
    });

    it('supervisor can view subordinate', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: 'sub-id', depth: 1 },
      ]);
      const ctx = { userId: 'sup-id', roles: ['Supervisor'] };
      await expect(service.assertCanViewUser(ctx, 'sub-id')).resolves.not.toThrow();
    });

    it('denies unrelated user', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([]);
      const ctx = { userId: 'user-id', roles: ['Operador'] };
      await expect(service.assertCanViewUser(ctx, 'other-id')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getTeamTree', () => {
    it('arma el arbol multinivel en una sola query recursiva', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'a', name: 'Root', email: 'root@test.com',
      });
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: 'a', name: 'Root', email: 'root@test.com', supervisorId: null, depth: 0 },
        { id: 'b', name: 'B', email: 'b@test.com', supervisorId: 'a', depth: 1 },
        { id: 'c', name: 'C', email: 'c@test.com', supervisorId: 'a', depth: 1 },
        { id: 'd', name: 'D', email: 'd@test.com', supervisorId: 'b', depth: 2 },
      ]);

      const tree = await service.getTeamTree('a');

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tree.id).toBe('a');
      expect(tree.children).toHaveLength(2);
      const nodeB = tree.children.find((c: any) => c.id === 'b');
      expect(nodeB.children).toHaveLength(1);
      expect(nodeB.children[0].id).toBe('d');
    });

    it('no se cuelga y no duplica nodos ante datos con ciclo (protegido por path+depth en la query)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'a', name: 'Root', email: 'root@test.com',
      });
      // La query real nunca devolveria un id repetido (NOT (id = ANY(path))
      // lo impide en Postgres); esto confirma que el ensamblado en JS tampoco
      // asume que puede recorrer indefinidamente si el mock se equivocara.
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: 'a', name: 'Root', email: 'root@test.com', supervisorId: null, depth: 0 },
        { id: 'b', name: 'B', email: 'b@test.com', supervisorId: 'a', depth: 1 },
      ]);

      const tree = await service.getTeamTree('a');

      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].children).toHaveLength(0);
    });

    it('lanza si el usuario raiz no existe', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.getTeamTree('no-existe')).rejects.toThrow();
    });
  });

  describe('assertActorCanSetSupervisor (alcance de rama)', () => {
    const boss = { userId: 'boss', roles: ['Operador'] };
    const admin = { userId: 'root', roles: ['Super Admin'] };
    // 1ª consulta = rama del actor (getSubordinateIds); 2ª = ancestros del nuevo jefe (anti-ciclo).
    const branch = (ids: string[]) => prismaMock.$queryRaw.mockResolvedValueOnce(ids.map((id) => ({ id, depth: 1 })));
    const codeOf = (promise: Promise<unknown>) =>
      promise.then(() => null, (e) => e.getResponse().code);

    it('Super Admin: cualquiera hacia cualquiera, sin consultar su rama', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([]);
      await expect(service.assertActorCanSetSupervisor(admin, 'x', 'y')).resolves.toBeUndefined();
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('Super Admin: sigue bloqueado por ciclos', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'x', depth: 1 }]);
      expect(await codeOf(service.assertActorCanSetSupervisor(admin, 'x', 'y'))).toBe('SUPERVISOR_CYCLE');
    });

    it('otro actor: mueve a un subordinado hacia sí mismo', async () => {
      branch(['ana', 'luis']);
      prismaMock.$queryRaw.mockResolvedValueOnce([]);
      await expect(service.assertActorCanSetSupervisor(boss, 'luis', 'boss')).resolves.toBeUndefined();
    });

    it('otro actor: mueve a un subordinado hacia otro de su rama', async () => {
      branch(['ana', 'luis']);
      prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'boss', depth: 1 }]);
      await expect(service.assertActorCanSetSupervisor(boss, 'luis', 'ana')).resolves.toBeUndefined();
    });

    it('otro actor: no puede mover a alguien fuera de su rama', async () => {
      branch(['ana']);
      expect(await codeOf(service.assertActorCanSetSupervisor(boss, 'stranger', 'boss'))).toBe('SUPERVISOR_TARGET_OUT_OF_BRANCH');
    });

    it('otro actor: no puede cambiar su propio jefe ni el de sus superiores', async () => {
      expect(await codeOf(service.assertActorCanSetSupervisor(boss, 'boss', 'ana'))).toBe('SUPERVISOR_SELF_CHANGE');
      branch(['ana']);
      expect(await codeOf(service.assertActorCanSetSupervisor(boss, 'ceo', 'boss'))).toBe('SUPERVISOR_TARGET_OUT_OF_BRANCH');
    });

    it('otro actor: no puede mandar a alguien a un jefe fuera de su rama', async () => {
      branch(['ana', 'luis']);
      expect(await codeOf(service.assertActorCanSetSupervisor(boss, 'luis', 'stranger'))).toBe('SUPERVISOR_DESTINATION_OUT_OF_BRANCH');
    });

    it('otro actor: no puede dejar a alguien sin jefe', async () => {
      branch(['ana']);
      expect(await codeOf(service.assertActorCanSetSupervisor(boss, 'ana', null))).toBe('SUPERVISOR_REMOVAL_NOT_ALLOWED');
    });

    it('otro actor: no puede crear un ciclo dentro de su rama (A bajo su propio subordinado)', async () => {
      branch(['ana', 'luis']);
      // ancestros de luis incluyen a ana → ana bajo luis sería ciclo
      prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'ana', depth: 1 }, { id: 'boss', depth: 2 }]);
      expect(await codeOf(service.assertActorCanSetSupervisor(boss, 'ana', 'luis'))).toBe('SUPERVISOR_CYCLE');
    });
  });

  describe('assertCanSetSupervisor', () => {
    it('allows null supervisor', async () => {
      await expect(service.assertCanSetSupervisor('a', null)).resolves.not.toThrow();
    });

    it('allows valid supervisor', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([]);
      await expect(service.assertCanSetSupervisor('a', 'b')).resolves.not.toThrow();
    });

    it('prevents direct cycle', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: 'a', depth: 1 },
      ]);
      await expect(service.assertCanSetSupervisor('a', 'b')).rejects.toThrow(ConflictException);
    });

    it('prevents indirect cycle', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([
        { id: 'b', depth: 1 },
        { id: 'a', depth: 2 },
      ]);
      await expect(service.assertCanSetSupervisor('a', 'c')).rejects.toThrow(ConflictException);
    });
  });
});
