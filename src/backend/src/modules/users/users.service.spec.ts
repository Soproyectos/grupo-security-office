jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
  genSalt: jest.fn(),
}));

import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { BCRYPT_ROUNDS } from '../../common/security/password.constants';
import { PasswordPolicyService } from '../../common/security/password-policy.service';
import { PrivilegedAccountService } from '../../common/security/privileged-account.service';
import { SessionService } from '../../common/security/session.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

const mockUser = {
  id: 'user-1',
  email: 'user@test.com',
  name: 'User Test',
  password: '$2b$10$hashedpassword',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUserWithRoles = {
  ...mockUser,
  roles: [
    { userId: 'user-1', roleId: 'role-1', role: { id: 'role-1', name: 'Super Admin', description: null } },
  ],
};

const mockCreatedUser = {
  ...mockUser,
  id: 'new-id',
  email: 'new@test.com',
  name: 'New User',
  roles: [
    { userId: 'new-id', roleId: 'role-1', role: { id: 'role-1', name: 'Super Admin', description: null } },
  ],
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        // La politica real se prueba en su propio spec; aqui se neutraliza para
        // que estos tests sigan cubriendo la logica de usuarios, no la de
        // fuerza de contrasena.
        {
          provide: PasswordPolicyService,
          useValue: {
            assert: jest.fn(),
            check: jest.fn().mockReturnValue({ valid: true, score: 4, feedback: [] }),
          },
        },
        {
          provide: PrivilegedAccountService,
          useValue: {
            isSuperAdmin: jest.fn().mockResolvedValue(false),
            countActiveSuperAdmins: jest.fn().mockResolvedValue(5),
            assertNotSelfPrivilegeChange: jest.fn(),
            assertBreakGlass: jest.fn(),
            willRemoveSuperAdmin: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: SessionService,
          useValue: { revokeAllForUser: jest.fn().mockResolvedValue(0) },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findAll', () => {
    it('debe listar usuarios con paginación', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUserWithRoles]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({ skip: 0, take: 50 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].email).toBe('user@test.com');
      expect(result.data[0].password).toBeUndefined();
      expect(result.data[0].roles).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('debe buscar usuarios por search term', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUserWithRoles]);
      mockPrisma.user.count.mockResolvedValue(1);

      await service.findAll({ search: 'test' });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.objectContaining({ contains: 'test' }) }),
            ]),
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('debe retornar usuario por id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithRoles);

      const result = await service.findOne('user-1');

      expect(result.id).toBe('user-1');
      expect(result.password).toBeUndefined();
    });

    it('debe lanzar NotFoundException cuando el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('debe crear un usuario con password hasheado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashedpassword');
      mockPrisma.user.create.mockResolvedValue(mockCreatedUser);

      const dto = { email: 'new@test.com', name: 'New User', password: 'SecurePass123', roleIds: ['role-1'] };
      const result = await service.create(dto);

      expect(result.email).toBe('new@test.com');
      expect(result.password).toBeUndefined();
      expect(bcrypt.hash).toHaveBeenCalledWith('SecurePass123', BCRYPT_ROUNDS);
    });

    it('debe rechazar email duplicado con ConflictException', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const dto = { email: 'user@test.com', name: 'Dup', password: 'SecurePass123' };

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow('El email ya está registrado');
    });
  });

  describe('update', () => {
    it('debe actualizar un usuario', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUserWithRoles);

      const dto = { name: 'Updated Name' };
      const result = await service.update('user-1', dto);

      expect(result.name).toBe('User Test');
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update('no-existe', { name: 'Nope' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('debe eliminar un usuario', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.assignment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userRole.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.user.delete.mockResolvedValue(mockUser);

      const result = await service.remove('user-1');

      expect(result.message).toBe('Usuario eliminado exitosamente');
      expect(mockPrisma.assignment.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockPrisma.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('debe eliminar usuario con assignment activa sin errores (limpia assignments físicamente)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.assignment.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.userRole.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.delete.mockResolvedValue(mockUser);

      const result = await service.remove('user-1');

      expect(result.message).toBe('Usuario eliminado exitosamente');
      expect(mockPrisma.assignment.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  //  Seguridad de gestión de usuarios
  // -----------------------------------------------------------------------

  describe('Seguridad de gestión de usuarios', () => {
    it('debe hashear contraseña al crear usuario', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashedpassword');
      mockPrisma.user.create.mockResolvedValue(mockCreatedUser);

      const dto = { email: 'new@test.com', name: 'New User', password: 'PlainPassword123' };
      await service.create(dto);

      expect(bcrypt.hash).toHaveBeenCalledWith('PlainPassword123', BCRYPT_ROUNDS);
      expect(bcrypt.hash).toHaveBeenCalledTimes(1);
    });

    it('debe rechazar email duplicado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const dto = { email: 'user@test.com', name: 'Dup', password: 'SecurePass123' };

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow('El email ya está registrado');
    });

    it('debe poder desactivar usuario', async () => {
      const activeUser = { ...mockUser, isActive: true };
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      const updatedUser = { ...mockUserWithRoles, isActive: false };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.update('user-1', { isActive: false });

      expect(result.isActive).toBe(false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('debe poder cambiar roles de usuario', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userRole.deleteMany.mockResolvedValue({ count: 1 });

      const updatedWithRoles = {
        ...mockUserWithRoles,
        roles: [
          { userId: 'user-1', roleId: 'role-2', role: { id: 'role-2', name: 'Operador', description: null } },
        ],
      };
      mockPrisma.user.update.mockResolvedValue(updatedWithRoles);

      const result = await service.update('user-1', { roleIds: ['role-2'] });

      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].name).toBe('Operador');
      expect(mockPrisma.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });

    it('debe retornar usuario sin password en creación', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashedpassword');
      mockPrisma.user.create.mockResolvedValue(mockCreatedUser);

      const dto = { email: 'new@test.com', name: 'New User', password: 'SecurePass123' };
      const result = await service.create(dto);

      expect(result.password).toBeUndefined();
    });

    it('debe retornar usuario sin password en consulta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithRoles);

      const result = await service.findOne('user-1');

      expect(result.password).toBeUndefined();
    });
  });

  describe('zona del asesor', () => {
    it('crea un usuario con una zona activa y la devuelve como {id,name}', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.zone.findUnique.mockResolvedValue({ id: 'z1', isActive: true });
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashedpassword');
      mockPrisma.user.create.mockResolvedValue({ ...mockCreatedUser, zoneId: 'z1', zone: { id: 'z1', name: 'Antioquia' } });

      const result = await service.create({ email: 'new@test.com', name: 'New User', password: 'SecurePass123', zoneId: 'z1' });

      expect(mockPrisma.user.create.mock.calls[0][0].data.zoneId).toBe('z1');
      expect(mockPrisma.user.create.mock.calls[0][0].include.zone).toEqual({ select: { id: true, name: true } });
      expect(result.zone).toEqual({ id: 'z1', name: 'Antioquia' });
    });

    it('rechaza una zona inexistente o inactiva al crear, sin crear el usuario', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.zone.findUnique.mockResolvedValueOnce(null);
      await expect(service.create({ email: 'n@test.com', name: 'N N', password: 'SecurePass123', zoneId: 'nope' })).rejects.toThrow('La zona elegida no existe');
      mockPrisma.zone.findUnique.mockResolvedValueOnce({ id: 'z1', isActive: false });
      await expect(service.create({ email: 'n@test.com', name: 'N N', password: 'SecurePass123', zoneId: 'z1' })).rejects.toThrow('La zona elegida no está activa');
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('asigna, cambia y quita la zona al editar', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUserWithRoles);
      mockPrisma.zone.findUnique.mockResolvedValue({ id: 'z2', isActive: true });
      await service.update('user-1', { zoneId: 'z2' });
      expect(mockPrisma.user.update.mock.calls[0][0].data.zone).toEqual({ connect: { id: 'z2' } });
      await service.update('user-1', { zoneId: null });
      expect(mockPrisma.user.update.mock.calls[1][0].data.zone).toEqual({ disconnect: true });
    });

    it('rechaza una zona inactiva al editar y no toca la zona si no se envía', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.zone.findUnique.mockResolvedValue({ id: 'z2', isActive: false });
      await expect(service.update('user-1', { zoneId: 'z2' })).rejects.toThrow('La zona elegida no está activa');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      mockPrisma.user.update.mockResolvedValue(mockUserWithRoles);
      await service.update('user-1', { name: 'Solo nombre' });
      expect(mockPrisma.user.update.mock.calls[0][0].data).not.toHaveProperty('zone');
    });

    it('la lista y el detalle piden la zona del usuario', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUserWithRoles]);
      mockPrisma.user.count.mockResolvedValue(1);
      await service.findAll();
      expect(mockPrisma.user.findMany.mock.calls[0][0].include.zone).toEqual({ select: { id: true, name: true } });
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithRoles);
      await service.findOne('user-1');
      expect(mockPrisma.user.findUnique.mock.calls[0][0].include.zone).toEqual({ select: { id: true, name: true } });
    });
  });
});
