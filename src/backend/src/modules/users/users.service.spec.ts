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
});
