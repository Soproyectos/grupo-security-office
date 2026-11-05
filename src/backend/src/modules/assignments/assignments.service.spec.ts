import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService } from '../../common/acl/acl.service';
import { AuditService } from '../audit/audit.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { directLegacyProductLibrary } from '../products/product-library';

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

const mockAcl = {
  isSuperAdmin: jest.fn().mockReturnValue(false),
  isListasAdmin: jest.fn().mockImplementation((roles) =>
    Array.isArray(roles) &&
    (roles.includes('Super Admin') || roles.includes('Admin Comercial')),
  ),
  levelsAtLeast: jest.fn().mockReturnValue([]),
  getAllowedListaIds: jest.fn().mockResolvedValue([]),
  getUserLevel: jest.fn().mockResolvedValue(null),
  canAdministerAccessOnLista: jest.fn().mockResolvedValue(true),
  canManageAccessOnLista: jest.fn().mockResolvedValue(true),
  canManageAccessOnProduct: jest.fn().mockResolvedValue(true),
  actionsForLevel: jest.fn().mockReturnValue(['ver']),
};

const mockAssignment = {
  id: 'assign-1',
  userId: 'user-1',
  resourceType: 'LISTA',
  resourceId: 'lista-1',
  level: 'view',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AssignmentsService', () => {
  let service: AssignmentsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    // resetAllMocks borra implementaciones: se re-establece isListasAdmin (misma
    // semántica que AclService) para que SUPER/MANAGER sean tratados como listas-admin.
    mockAcl.isListasAdmin.mockImplementation((roles) =>
      Array.isArray(roles) &&
      (roles.includes('Super Admin') || roles.includes('Admin Comercial')),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BibliotecaPrismaService, useValue: directLegacyProductLibrary(mockPrisma as never) },
        { provide: AclService, useValue: mockAcl },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<AssignmentsService>(AssignmentsService);
  });

  describe('findAll', () => {
    it('debe listar asignaciones sin filtros', async () => {
      mockPrisma.assignment.findMany.mockResolvedValue([mockAssignment]);

      const result = await service.findAll();

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.assignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({}) }),
      );
    });

    it('debe filtrar por userId y resourceType', async () => {
      mockPrisma.assignment.findMany.mockResolvedValue([mockAssignment]);

      await service.findAll({ userId: 'user-1', resourceType: 'LISTA' });

      expect(mockPrisma.assignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', resourceType: 'LISTA' }),
        }),
      );
    });
  });

  describe('create', () => {
    it('debe crear una asignación con level por defecto view', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1' });
      mockPrisma.assignment.findUnique.mockResolvedValue(null);
      mockPrisma.assignment.create.mockResolvedValue(mockAssignment);

      const dto = { userId: 'user-1', resourceType: 'LISTA', resourceId: 'lista-1' };
      const result = await service.create(dto);

      expect(result.id).toBe('assign-1');
      expect(mockPrisma.assignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ level: 'view' }),
        }),
      );
    });

    it('debe lanzar 404 si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const dto = { userId: 'no-existe', resourceType: 'LISTA', resourceId: 'lista-1' };
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      await expect(service.create(dto)).rejects.toThrow('Usuario no encontrado');
    });

    it('debe rechazar resourceType CATALOG como tipo de recurso no soportado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

      const dto = { userId: 'user-1', resourceType: 'CATALOG', resourceId: 'catalog-1' };
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      await expect(service.create(dto)).rejects.toThrow('Tipo de recurso no soportado: CATALOG');
    });

    it('debe lanzar 404 si el recurso LISTA no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.lista.findUnique.mockResolvedValue(null);

      const dto = { userId: 'user-1', resourceType: 'LISTA', resourceId: 'no-existe' };
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      await expect(service.create(dto)).rejects.toThrow('El recurso LISTA no existe');
    });

    it('debe lanzar 404 si el recurso PRICE_LIST no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.priceList.findUnique.mockResolvedValue(null);

      const dto = { userId: 'user-1', resourceType: 'PRICE_LIST', resourceId: 'no-existe' };
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      await expect(service.create(dto)).rejects.toThrow('El recurso PRICE_LIST no existe');
    });

    it('debe lanzar 404 si el recurso CATEGORY no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.category.findUnique.mockResolvedValue(null);

      const dto = { userId: 'user-1', resourceType: 'CATEGORY', resourceId: 'no-existe' };
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      await expect(service.create(dto)).rejects.toThrow('El recurso CATEGORY no existe');
    });

    it('debe lanzar 409 si ya existe una asignación activa', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1' });
      mockPrisma.assignment.findUnique.mockResolvedValue(mockAssignment);

      const dto = { userId: 'user-1', resourceType: 'LISTA', resourceId: 'lista-1' };
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow('Ya existe una asignación activa para ese recurso');
    });

    it('debe reactivar un par desactivado (soft-delete) sin colisión', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1' });
      mockPrisma.assignment.findUnique.mockResolvedValue({
        ...mockAssignment,
        isActive: false,
      });
      mockPrisma.assignment.update.mockResolvedValue({
        ...mockAssignment,
        isActive: true,
        level: 'edit',
      });

      const dto = { userId: 'user-1', resourceType: 'LISTA', resourceId: 'lista-1', level: 'edit' };
      const result = await service.create(dto);

      expect(result.isActive).toBe(true);
      expect(mockPrisma.assignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true, level: 'edit_products' }),
        }),
      );
      expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('debe actualizar level', async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(mockAssignment);
      mockPrisma.assignment.update.mockResolvedValue({ ...mockAssignment, level: 'manage' });

      const result = await service.update('assign-1', { level: 'manage' });

      expect(result.level).toBe('manage');
      expect(mockPrisma.assignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ level: 'manage' }),
        }),
      );
    });

    it('debe actualizar isActive', async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(mockAssignment);
      mockPrisma.assignment.update.mockResolvedValue({ ...mockAssignment, isActive: false });

      const result = await service.update('assign-1', { isActive: false });

      expect(result.isActive).toBe(false);
    });

    it('debe lanzar NotFoundException si la asignación no existe', async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(null);

      await expect(service.update('no-existe', { level: 'manage' })).rejects.toThrow(NotFoundException);
      await expect(service.update('no-existe', { level: 'manage' })).rejects.toThrow('Asignación no encontrada');
    });
  });

  describe('remove', () => {
    it('debe eliminar físicamente la asignación (hard-delete) con audit previo', async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(mockAssignment);
      mockPrisma.assignment.delete.mockResolvedValue(mockAssignment);

      await service.remove('assign-1');

      expect(mockPrisma.assignment.delete).toHaveBeenCalledWith({
        where: { id: 'assign-1' },
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          entity: 'Assignment',
          entityId: 'assign-1',
          oldValues: {
            resourceType: 'LISTA',
            resourceId: 'lista-1',
            level: 'view',
            isActive: true,
          },
          newValues: { deleted: true },
        }),
      );
    });

    it('debe eliminar físicamente una asignación ya inactiva (caso del bug)', async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue({ ...mockAssignment, isActive: false });
      mockPrisma.assignment.delete.mockResolvedValue({ ...mockAssignment, isActive: false });

      await service.remove('assign-1');

      expect(mockPrisma.assignment.delete).toHaveBeenCalledWith({
        where: { id: 'assign-1' },
      });
      expect(mockPrisma.assignment.update).not.toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException si la asignación no existe', async () => {
      mockPrisma.assignment.findUnique.mockResolvedValue(null);

      await expect(service.remove('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('TANDA 1B — ACL por producto, roles, anti-escalada, matrix/preview', () => {
    const SUPER = { userId: 'admin-1', roles: ['Super Admin'] };
    const MANAGER = { userId: 'assigner-1', roles: ['Admin Comercial'] };
    const TARGET = { userId: 'target-1', roles: ['Operador'] };
    const OPERATOR = { userId: 'operator-1', roles: ['Operador'] };

    it('crear asignación de PRODUCT con Super Admin', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(true);
      mockPrisma.user.findUnique.mockResolvedValue({ id: TARGET.userId });
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      mockPrisma.assignment.findUnique.mockResolvedValue(null);
      mockPrisma.assignment.create.mockResolvedValue({ ...mockAssignment, resourceType: 'PRODUCT', resourceId: 'prod-1' });

      const result = await service.create(
        { userId: TARGET.userId, resourceType: 'PRODUCT', resourceId: 'prod-1', level: 'edit_prices' },
        SUPER,
      );

      expect(result.resourceType).toBe('PRODUCT');
      expect(mockPrisma.assignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ resourceType: 'PRODUCT', level: 'edit_prices' }),
        }),
      );
    });

    it('grant por rol (ROLE:{nombre}) con Super Admin', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(true);
      mockPrisma.user.findUnique.mockResolvedValue({ id: SUPER.userId });
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-1' });
      mockPrisma.assignment.findUnique.mockResolvedValue(null);
      mockPrisma.assignment.create.mockResolvedValue({
        ...mockAssignment,
        userId: SUPER.userId,
        resourceId: 'ROLE:Admin Comercial',
      });

      const result = await service.create(
        { userId: SUPER.userId, resourceType: 'LISTA', resourceId: 'ROLE:Admin Comercial', level: 'view' },
        SUPER,
      );

      expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({ where: { name: 'Admin Comercial' }, select: { id: true } });
      expect(mockPrisma.assignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ resourceId: 'ROLE:Admin Comercial' }) }),
      );
      expect(result.resourceId).toBe('ROLE:Admin Comercial');
    });

    it('grant por rol rechazado para no Super Admin (403)', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(false);
      mockPrisma.user.findUnique.mockResolvedValue({ id: TARGET.userId });
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-1' });

      await expect(
        service.create(
          { userId: TARGET.userId, resourceType: 'LISTA', resourceId: 'ROLE:Admin Comercial', level: 'view' },
          MANAGER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('anti-escalada: manage NO puede otorgar manage_access (403)', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(false);
      mockPrisma.user.findUnique.mockResolvedValue({ id: TARGET.userId });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1' });
      mockAcl.canAdministerAccessOnLista.mockResolvedValue(true);
      mockAcl.getUserLevel.mockResolvedValue('manage');

      await expect(
        service.create(
          { userId: TARGET.userId, resourceType: 'LISTA', resourceId: 'lista-1', level: 'manage_access' },
          OPERATOR,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('anti-escalada: manage sí puede otorgar view (sin escalación)', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(false);
      mockPrisma.user.findUnique.mockResolvedValue({ id: TARGET.userId });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1' });
      mockAcl.canAdministerAccessOnLista.mockResolvedValue(true);
      mockAcl.getUserLevel.mockResolvedValue('manage');
      mockPrisma.assignment.findUnique.mockResolvedValue(null);
      mockPrisma.assignment.create.mockResolvedValue({ ...mockAssignment, userId: TARGET.userId });

      const result = await service.create(
        { userId: TARGET.userId, resourceType: 'LISTA', resourceId: 'lista-1', level: 'view' },
        MANAGER,
      );

      expect(result).toBeDefined();
      expect(mockPrisma.assignment.create).toHaveBeenCalled();
    });

    it('anti-escalada: update no puede otorgar manage con solo edit (403)', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(false);
      mockPrisma.assignment.findUnique.mockResolvedValue({ ...mockAssignment, level: 'view', resourceId: 'lista-1' });
      mockAcl.canAdministerAccessOnLista.mockResolvedValue(true);
      mockAcl.getUserLevel.mockResolvedValue('edit');

      await expect(service.update('assign-1', { level: 'manage' }, OPERATOR)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('matrix devuelve shape LISTA con asignaciones y acciones del viewer', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(true);
      mockAcl.actionsForLevel.mockReturnValue(['ver']);
      mockPrisma.lista.findMany.mockResolvedValue([{ id: 'lista-1', name: 'General' }]);
      mockPrisma.assignment.findMany.mockResolvedValue([
        { ...mockAssignment, resourceId: 'lista-1', level: 'view', user: { id: TARGET.userId, name: 'Pepito' } },
      ]);
      mockPrisma.auditLog.findMany.mockResolvedValue([{ entityId: 'assign-1', userId: SUPER.userId }]);

      const res = await service.matrix('LISTA', SUPER);

      expect(res.data).toHaveLength(1);
      const row = res.data[0];
      expect(row.resourceId).toBe('lista-1');
      expect(row.asignaciones[0].assigneeType).toBe('usuario');
      expect(row.asignaciones[0].asignadoPor).toBe(SUPER.userId);
      expect(row.viewer.acciones).toEqual(['ver']);
    });

    it('matrix rechaza entity no soportada (400)', async () => {
      await expect(service.matrix('TABLA', SUPER)).rejects.toThrow(BadRequestException);
    });

    it('preview LISTA devuelve nivel efectivo y productos restringidos', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(true);
      mockAcl.getUserLevel.mockResolvedValue('view');
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', name: 'General' });
      mockPrisma.userRole.findMany.mockResolvedValue([{ role: { name: 'Operador' } }]);
      mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod-1', name: 'Camara' }]);
      mockPrisma.assignment.findMany.mockResolvedValue([
        { resourceId: 'prod-1', level: 'view', isActive: false },
      ]);

      const res = await service.preview(
        { userId: TARGET.userId, entity: 'LISTA', entityId: 'lista-1' },
        SUPER,
      );

      expect(res.data.entity).toBe('LISTA');
      expect(res.data.nivelListaEfectivo).toBe('view');
      expect(res.data.preciosVisibles).toBe(false);
      expect(res.data.productosRestringidos).toHaveLength(1);
      expect(res.data.productosRestringidos[0].productName).toBe('Camara');
    });

    it('preview exige manage_access (403 si no lo tiene)', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(false);
      mockAcl.canManageAccessOnLista.mockResolvedValue(false);

      await expect(
        service.preview({ userId: TARGET.userId, entity: 'LISTA', entityId: 'lista-1' }, OPERATOR),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preview requiere entityId (400)', async () => {
      await expect(service.preview({ userId: TARGET.userId, entity: 'LISTA' }, SUPER)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Admin Comercial puede otorgar manage_access (nivel implícito por isListasAdmin)', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(false);
      mockPrisma.user.findUnique.mockResolvedValue({ id: TARGET.userId });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1' });
      mockAcl.canAdministerAccessOnLista.mockResolvedValue(true);
      mockPrisma.assignment.findUnique.mockResolvedValue(null);
      mockPrisma.assignment.create.mockResolvedValue({
        ...mockAssignment,
        userId: TARGET.userId,
        level: 'manage_access',
      });

      const result = await service.create(
        { userId: TARGET.userId, resourceType: 'LISTA', resourceId: 'lista-1', level: 'manage_access' },
        MANAGER,
      );

      expect(result).toBeDefined();
      expect(result.level).toBe('manage_access');
    });

    it('Admin Comercial autorizado en preview (isListasAdmin) sin consultar manage_access', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(false);
      mockAcl.canManageAccessOnLista.mockResolvedValue(false); // no se usa para AC
      mockAcl.getUserLevel.mockResolvedValue('view');
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', name: 'General' });
      mockPrisma.userRole.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.assignment.findMany.mockResolvedValue([]);

      const res = await service.preview(
        { userId: TARGET.userId, entity: 'LISTA', entityId: 'lista-1' },
        MANAGER,
      );

      expect(res.data.entity).toBe('LISTA');
      expect(mockAcl.canManageAccessOnLista).not.toHaveBeenCalled();
    });

    it('matrix con Admin Comercial ve TODOS los recursos (isListasAdmin)', async () => {
      mockAcl.isSuperAdmin.mockReturnValue(false);
      mockAcl.actionsForLevel.mockReturnValue(['ver']);
      mockPrisma.lista.findMany.mockResolvedValue([
        { id: 'lista-1', name: 'General' },
        { id: 'lista-2', name: 'Otra' },
      ]);
      mockPrisma.assignment.findMany.mockResolvedValue([]);

      const res = await service.matrix('LISTA', MANAGER);

      expect(res.data).toHaveLength(2);
      expect(mockPrisma.lista.findMany).toHaveBeenCalledWith({ select: { id: true, name: true } });
    });
  });
});
