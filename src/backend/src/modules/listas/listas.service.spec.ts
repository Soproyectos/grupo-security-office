import { createPrismaMock } from '../../__test__/mocks/prisma.mock';
import { randomUUID } from 'crypto';

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AclService } from '../../common/acl/acl.service';
import { ListasService } from './listas.service';
import { PrismaService } from '../../prisma/prisma.service';

type AnyMock = ReturnType<typeof createPrismaMock>;

const ADMIN = { userId: 'admin-1', roles: ['Super Admin'] };
const VIEWER = { userId: 'pepito-1', roles: ['Operador'] }; // view sobre LISTA-GENERAL
// Fixtures de NIVEL: rol no-admin (deny-by-default de la polÃ­tica nueva), el nivel lo
// dan los assignments del map. La polÃ­tica Admin Comercial se testea en su propio describe.
const EDITER = { userId: 'editer-1', roles: ['Operador'] }; // edit sobre LISTA-GENERAL
const EDIT_PRICES = { userId: 'price-editor', roles: ['Operador'] }; // edit_prices sobre LISTA-GENERAL
const VIEW_PRICES = { userId: 'price-viewer', roles: ['Operador'] }; // view_prices sobre LISTA-GENERAL
const MANAGER = { userId: 'manager-1', roles: ['Operador'] }; // manage sobre LISTA-GENERAL
const MANAGE_ACCESS = { userId: 'access-mgr', roles: ['Operador'] }; // manage_access sobre LISTA-GENERAL
const NOAUTH = { userId: 'none-1', roles: ['Operador'] }; // sin assignments
// Admin Comercial: "Super Admin del Ã¡rea comercial" (isListasAdmin).
const COMERCIAL = { userId: 'admin-comercial-1', roles: ['Admin Comercial'] };

const LISTA_ID = 'list-1';
const OTHER_LISTA_ID = 'list-other';

const mockLista = {
  id: LISTA_ID,
  code: 'LISTA-GENERAL',
  name: 'Lista General',
  description: 'RaÃ­z',
  type: 'catalogo',
  defaultVisibility: false,
  responsibleId: null,
  validFrom: null,
  validUntil: null,
  codigo: null,
  currency: 'COP',
  isActive: true,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { products: 3 },
};

const mockListaInactiva = { ...mockLista, isActive: false };
const mockListaArchivada = { ...mockLista, archivedAt: new Date() };
const mockOtherLista = { id: OTHER_LISTA_ID, code: 'OTHER', name: 'Otra', description: null, type: 'catalogo', defaultVisibility: false, responsibleId: null, validFrom: null, validUntil: null, codigo: null, currency: 'COP', isActive: true, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), _count: { products: 0 } };

// Assignments activos por usuario (resourceType LISTA).
const assignments: Record<
  string,
  { resourceType: string; resourceId: string; level: string; isActive: boolean }[]
> = {
  [VIEWER.userId]: [{ resourceType: 'LISTA', resourceId: LISTA_ID, level: 'view', isActive: true }],
  [EDITER.userId]: [{ resourceType: 'LISTA', resourceId: LISTA_ID, level: 'edit', isActive: true }],
  [EDIT_PRICES.userId]: [{ resourceType: 'LISTA', resourceId: LISTA_ID, level: 'edit_prices', isActive: true }],
  [VIEW_PRICES.userId]: [{ resourceType: 'LISTA', resourceId: LISTA_ID, level: 'view_prices', isActive: true }],
  [MANAGER.userId]: [{ resourceType: 'LISTA', resourceId: LISTA_ID, level: 'manage', isActive: true }],
  [MANAGE_ACCESS.userId]: [{ resourceType: 'LISTA', resourceId: LISTA_ID, level: 'manage_access', isActive: true }],
  [NOAUTH.userId]: [],
};

function buildPrisma(): AnyMock {
  const p = createPrismaMock();
  p.assignment.findMany.mockImplementation(async (args: any) => {
    const u = args?.where?.userId;
    const pool = u ? (assignments[u] ?? []) : Object.values(assignments).flat();
    const rt = args?.where?.resourceType;
    const rid = args?.where?.resourceId;
    const active = args?.where?.isActive;
    const levels = args?.where?.level?.in;
    let out = pool as any[];
    if (rid) out = out.filter((a) => a.resourceId === rid);
    if (rt) out = out.filter((a) => a.resourceType === rt);
    if (active === true) out = out.filter((a) => a.isActive);
    if (levels) out = out.filter((a) => levels.includes(a.level));
    return out;
  });
  p.lista.findUnique.mockImplementation(async (args: any) => {
    const id = args?.where?.id;
    if (id === LISTA_ID) return mockLista;
    if (id === 'inactive') return mockListaInactiva;
    if (id === 'archived') return mockListaArchivada;
    if (id === OTHER_LISTA_ID) return mockOtherLista;
    return null;
  });
  p.lista.findMany.mockResolvedValue([mockLista]);
  p.lista.count.mockResolvedValue(1);
  p.lista.update.mockImplementation(async (args: any) => {
    const id = args?.where?.id;
    const data = args?.data ?? {};
    const base = id === LISTA_ID ? mockLista : mockOtherLista;
    return { id, ...base, ...data, updatedAt: new Date() };
  });
  p.lista.create.mockImplementation(async (args: any) => ({
    id: randomUUID(),
    ...args.data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  p.product.findMany.mockResolvedValue([]);
  p.product.count.mockResolvedValue(0);
  p.price.findMany.mockResolvedValue([]);
  p.productImage.findMany.mockResolvedValue([]);
  p.auditLog.findMany.mockResolvedValue([]);
  p.auditLog.count.mockResolvedValue(0);
  return p;
}

describe('ListasService â€” ACL (T1â€“T20)', () => {
  let service: ListasService;
  let acl: AclService;
  let mockPrisma: AnyMock;
  let mockAudit: { log: jest.Mock };
  const mockFiles = { deleteByUrl: jest.fn().mockResolvedValue(undefined) };
  let mockMasterKey: { validateMasterKey: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = buildPrisma();
    mockAudit = { log: jest.fn().mockResolvedValue({}) };
    
    acl = new AclService(mockPrisma as any);
    service = new ListasService(mockPrisma as any, acl, mockAudit as any, mockFiles as any);
  });

  // T1: Super Admin sin assignment ve todas las Listas
  it('T1 - Super Admin lista todas las Listas (sin consultar assignments)', async () => {
    mockPrisma.lista.findMany.mockResolvedValue([mockLista, mockOtherLista]);
    const res = await service.findAll(ADMIN);
    expect(res.data).toHaveLength(2);
    expect(mockPrisma.assignment.findMany).not.toHaveBeenCalled();
  });

  // T2: Super Admin accede a una Lista por ID
  it('T2 - Super Admin accede a Lista por ID', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(mockLista);
    const res = await service.findOne(LISTA_ID, ADMIN);
    expect(res.id).toBe(LISTA_ID);
    expect(mockPrisma.assignment.findMany).not.toHaveBeenCalled();
  });

  // T3: Usuario sin assignment â†’ lista vacÃ­a (deny)
  it('T3 - usuario sin assignment ve lista vacÃ­a (deny-by-default)', async () => {
    mockPrisma.lista.findMany.mockResolvedValue([]);
    const res = await service.findAll(NOAUTH);
    expect(res.data).toHaveLength(0);
    expect(mockPrisma.assignment.findMany).toHaveBeenCalled();
  });

  // T4: Usuario sin assignment â†’ 404 al obtener una Lista por ID
  it('T4 - usuario sin assignment recibe 404 por Lista ajena', async () => {
    await expect(service.findOne(LISTA_ID, NOAUTH)).rejects.toThrow(NotFoundException);
  });

  // T5/T6: Usuario view â†’ ve solo su Lista
  it('T5/T6 - usuario view ve su Lista y 404 para Lista ajena', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
    const own = await service.findOne(LISTA_ID, VIEWER);
    expect(own.id).toBe(LISTA_ID);

    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockOtherLista);
    await expect(service.findOne(OTHER_LISTA_ID, VIEWER)).rejects.toThrow(NotFoundException);
  });

  // T7:Usuario view no puede crear Lista
  it('T7 - usuario view no crea Lista (403)', async () => {
    await expect(service.create({ code: 'X', name: 'X' }, VIEWER)).rejects.toThrow(ForbiddenException);
  });

  // T7b: Admin Comercial puede crear Lista y queda auto-asignado (manage_access)
  it('T7b - Admin Comercial crea Lista (persiste createdById y auto-asigna manage_access)', async () => {
    const res = await service.create(
      { code: 'COMERCIAL-NUEVA', name: 'Lista Comercial', currency: 'COP', isActive: true },
      COMERCIAL,
    );
    expect(res.code).toBe('COMERCIAL-NUEVA');
    expect(res.name).toBe('Lista Comercial');
    expect(mockPrisma.lista.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdById: COMERCIAL.userId }),
      }),
    );
    expect(mockPrisma.assignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId_resourceType_resourceId: expect.objectContaining({
            userId: COMERCIAL.userId,
            resourceType: 'LISTA',
          }),
        }),
        create: expect.objectContaining({
          userId: COMERCIAL.userId,
          resourceType: 'LISTA',
          resourceId: res.id,
          level: 'manage_access',
          isActive: true,
        }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalled();
  });

  // T7c: el creador queda con assignment manage_access sobre la lista creada
  it('T7c - el creador queda con assignment manage_access sobre la lista creada', async () => {
    const res = await service.create(
      { code: 'CREATOR-OWN', name: 'Lista del Creador', currency: 'COP', isActive: true },
      COMERCIAL,
    );

    expect(mockPrisma.assignment.upsert).toHaveBeenCalledWith({
      where: {
        userId_resourceType_resourceId: {
          userId: COMERCIAL.userId,
          resourceType: 'LISTA',
          resourceId: res.id,
        },
      },
      create: {
        userId: COMERCIAL.userId,
        resourceType: 'LISTA',
        resourceId: res.id,
        level: 'manage_access',
        isActive: true,
      },
      update: { level: 'manage_access', isActive: true },
    });
    expect(mockPrisma.lista.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdById: COMERCIAL.userId }),
      }),
    );
  });

  // T8: usuario view no edita Lista (403)
  it('T8 - usuario view no edita Lista (403)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
    await expect(service.update(LISTA_ID, { name: 'Nuevo' }, VIEWER)).rejects.toThrow(
      ForbiddenException,
    );
  });

  // T9: usuario edit puede editar Lista
  it('T9 - usuario edit edita Lista', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
    const res = await service.update(LISTA_ID, { name: 'Nuevo' }, EDITER);
    expect(res.name).toBe('Nuevo');
  });

  // T11: usuario edit no archivo (403)
  it('T11 - usuario edit no archiva Lista (403)', async () => {
    await expect(service.archive(LISTA_ID, EDITER)).rejects.toThrow(ForbiddenException);
  });

  // T12: usuario manage archivo/restaura
  it('T12 - usuario manage archivo y restaura', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
    const archived = await service.archive(LISTA_ID, MANAGER);
    expect(archived.archivedAt).toBeDefined();

    mockPrisma.lista.findUnique.mockResolvedValueOnce({ ...mockLista, archivedAt: new Date() });
    const restored = await service.restore(LISTA_ID, MANAGER);
    expect(restored.archivedAt).toBeNull();
  });

  // T13: usuario manage_access gestiona accesos (findAssignments); manage ya no basta
  it('T13 - usuario manage_access ve accesos de su Lista', async () => {
    const res = await service.findAssignments(LISTA_ID, MANAGE_ACCESS);
    // Un gestor de accesos ve todas las asignaciones de su Lista (>= 1).
    expect(res.data.length).toBeGreaterThanOrEqual(1);
    expect(res.data.every((a) => a.resourceId === LISTA_ID)).toBe(true);
  });

  it('T13b - usuario manage NO ve accesos (403, exige manage_access)', async () => {
    await expect(service.findAssignments(LISTA_ID, MANAGER)).rejects.toThrow(ForbiddenException);
  });

  // T14: usuario manage 404 sobre Lista no asignada
  it('T14 - usuario manage 404 sobre Lista no asignada', async () => {
    await expect(service.findOne(OTHER_LISTA_ID, MANAGER)).rejects.toThrow(NotFoundException);
  });

  // T16: assignment inactivo no autoriza
  it('T16 - assignment inactivo no autoriza (deny)', async () => {
    // Forzar assignment inactivo para VIEWER
    assignments[VIEWER.userId] = [{ resourceType: 'LISTA', resourceId: LISTA_ID, level: 'view', isActive: false }];
    await expect(service.findOne(LISTA_ID, VIEWER)).rejects.toThrow(NotFoundException);
  });

  // T17: Lista inactiva â†’ 404 para no-admin
  it('T17 - Lista inactiva â†’ 404 para usuario no-admin', async () => {
    mockPrisma.lista.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === LISTA_ID) return mockListaInactiva;
      return null;
    });
    await expect(service.findOne(LISTA_ID, VIEWER)).rejects.toThrow(NotFoundException);
  });

  // T18: Lista archivada â†’ 404 para no-admin
  it('T18 - Lista archivada â†’ 404 para usuario no-admin', async () => {
    mockPrisma.lista.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === LISTA_ID) return mockListaArchivada;
      return null;
    });
    await expect(service.findOne(LISTA_ID, VIEWER)).rejects.toThrow(NotFoundException);
  });

  // T1/T2 refuerzo: Super Admin ve Lista inactiva/archivada
  it('Super Admin ve Lista inactiva/archivada', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockListaInactiva);
    const res = await service.findOne(LISTA_ID, ADMIN);
    expect(res.id).toBe(LISTA_ID);
  });

  // T19/T20: acceso directo por producto/precio no salta ACL (products service)
  it('T19 - producto de Lista no asignada â†’ 404 (via acl.assertProductAccess)', async () => {
    mockPrisma.product.findUnique.mockResolvedValueOnce({ listaId: LISTA_ID });
    await expect(
      acl.assertProductAccess('prod-x', NOAUTH, 'view'),
    ).rejects.toThrow(NotFoundException);
  });

  // Validaciones de creaciÃ³n
  it('crea Lista con moneda y estado vÃ¡lidos (Super Admin)', async () => {
    const res = await service.create({ code: 'NUEVA', name: 'Lista Nueva', currency: 'USD', isActive: true }, ADMIN);
    expect(res.code).toBe('NUEVA');
    expect(res.currency).toBe('USD');
    expect(mockPrisma.lista.create).toHaveBeenCalled();
    expect(mockAudit.log).toHaveBeenCalled();
  });

  it('rechaza cÃ³digo de Lista duplicado (Super Admin)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce({ id: 'dup' });
    await expect(
      service.create({ code: 'LISTA-GENERAL', name: 'X' }, ADMIN),
    ).rejects.toThrow(ConflictException);
  });

  // ---- Campos nuevos (type, defaultVisibility, responsibleId, validFrom, validUntil) ----

  it('crea Lista con type/defaultVisibility/validFrom/validUntil y los persiste', async () => {
    const res = await service.create(
      {
        code: 'NEW-FIELDS',
        name: 'Lista Campos',
        type: 'COMERCIAL',
        defaultVisibility: true,
        validFrom: '2026-01-01T00:00:00Z',
        validUntil: '2026-12-31T23:59:59Z',
      },
      ADMIN,
    );
    expect(res.type).toBe('COMERCIAL');
    expect(res.defaultVisibility).toBe(true);
    expect(res.validFrom).toBeInstanceOf(Date);
    expect(res.validUntil).toBeInstanceOf(Date);
    expect(mockPrisma.lista.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'COMERCIAL',
          defaultVisibility: true,
          validFrom: expect.any(Date),
          validUntil: expect.any(Date),
        }),
      }),
    );
  });

  it('crea Lista con responsibleId existente (valida usuario)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-responsible' });
    const res = await service.create(
      { code: 'RESP', name: 'Lista Resp', responsibleId: 'user-responsible' },
      ADMIN,
    );
    expect(res.responsibleId).toBe('user-responsible');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-responsible' },
      select: { id: true },
    });
  });

  it('crea Lista con responsibleId inexistente â†’ 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.create({ code: 'RESP-BAD', name: 'X', responsibleId: 'no-existe' }, ADMIN),
    ).rejects.toThrow(NotFoundException);
  });

  it('crea Lista con vigencias invÃ¡lidas (validUntil < validFrom) â†’ 400', async () => {
    await expect(
      service.create(
        { code: 'BAD-DATES', name: 'X', validFrom: '2026-12-31', validUntil: '2026-01-01' },
        ADMIN,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('update persiste type/defaultVisibility/responsibleId/vigencias y audita old/new', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-responsible' });
    const res = await service.update(
      LISTA_ID,
      {
        type: 'PROMOCIONAL',
        defaultVisibility: true,
        responsibleId: 'user-responsible',
        validFrom: '2026-01-01T00:00:00Z',
        validUntil: '2026-12-31T23:59:59Z',
      },
      EDITER,
    );
    expect(res.type).toBe('PROMOCIONAL');
    expect(res.defaultVisibility).toBe(true);
    expect(res.responsibleId).toBe('user-responsible');
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: expect.objectContaining({
          type: mockLista.type,
          defaultVisibility: mockLista.defaultVisibility,
          responsibleId: mockLista.responsibleId,
          validFrom: mockLista.validFrom,
          validUntil: mockLista.validUntil,
        }),
        newValues: expect.objectContaining({
          type: 'PROMOCIONAL',
          defaultVisibility: true,
          responsibleId: 'user-responsible',
          validFrom: expect.any(Date),
          validUntil: expect.any(Date),
        }),
      }),
    );
  });

  it('update con validUntil < validFrom â†’ error de validaciÃ³n (400)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
    await expect(
      service.update(LISTA_ID, { validFrom: '2026-12-31', validUntil: '2026-01-01' }, EDITER),
    ).rejects.toThrow(BadRequestException);
  });

  // ---- Campos nuevos (codigo â€” metadata de lista importada) ----

  it('crea Lista con codigo y lo persiste + audita', async () => {
    const res = await service.create(
      { code: 'NUEVA-META', name: 'Lista Metadata', codigo: 'HIKV-2026' },
      ADMIN,
    );
    expect(res.codigo).toBe('HIKV-2026');
    expect(mockPrisma.lista.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: 'HIKV-2026',
        }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({ codigo: 'HIKV-2026' }),
      }),
    );
  });

  it('crea Lista sin codigo â†’ null (opcionales)', async () => {
    const res = await service.create({ code: 'SIN-META', name: 'Sin Meta' }, ADMIN);
    expect(res.codigo).toBeNull();
  });

  it('crea Lista con codigo duplicado â†’ 409', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce(null); // code 'NUEVA' libre
    mockPrisma.lista.findUnique.mockResolvedValueOnce({ id: 'dup' }); // codigo duplicado
    await expect(
      service.create({ code: 'NUEVA', name: 'X', codigo: 'DUP-2026' }, ADMIN),
    ).rejects.toThrow(ConflictException);
  });


  it('update (PATCH) persiste codigo y audita old/new', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
    const res = await service.update(
      LISTA_ID,
      { codigo: 'HIKV-2026' },
      EDITER,
    );
    expect(res.codigo).toBe('HIKV-2026');
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: expect.objectContaining({ codigo: mockLista.codigo }),
        newValues: expect.objectContaining({ codigo: 'HIKV-2026' }),
      }),
    );
  });

  it('update (PATCH) limpia codigo con null', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce({ ...mockLista, codigo: 'OLD' });
    const res = await service.update(LISTA_ID, { codigo: null }, EDITER);
    expect(res.codigo).toBeNull();
  });

  it('update con codigo duplicado â†’ 409', async () => {
    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista); // isBlockedByDeletion
    mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista); // fetch principal en update
    mockPrisma.lista.findUnique.mockResolvedValueOnce({
      id: LISTA_ID,
      isActive: true,
      archivedAt: null,
    }); // fetch interno del ACL (necesita isActive/archivedAt)
    mockPrisma.lista.findUnique.mockResolvedValueOnce({ id: 'otra' }); // check de codigo
    await expect(
      service.update(LISTA_ID, { codigo: 'DUP-2026' }, EDITER),
    ).rejects.toThrow(ConflictException);
  });


  // ---- Cobertura complementaria (reemplaza ACL de la entidad Catalog eliminada) ----
  // El test T16 muta assignments[VIEWER.userId] a inactivo; se restaura por suite.
  describe('cobertura complementaria (reemplaza entidad Catalog eliminada)', () => {
    beforeEach(() => {
      assignments[VIEWER.userId] = [{ resourceType: 'LISTA', resourceId: LISTA_ID, level: 'view', isActive: true }];
    });

    it('findAll filtra por isActive=true', async () => {
      mockPrisma.lista.findMany.mockResolvedValue([mockLista]);

      await service.findAll(VIEWER, { isActive: true });

      expect(mockPrisma.lista.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true, id: { in: [LISTA_ID] } }),
        }),
      );
    });

    it('findAll filtra por isActive=false (el spread de `false` era un no-op y devolvia todas)', async () => {
      mockPrisma.lista.findMany.mockResolvedValue([]);

      await service.findAll(VIEWER, { isActive: false });

      expect(mockPrisma.lista.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false, id: { in: [LISTA_ID] } }),
        }),
      );
    });

    it('findAll sin isActive no agrega el filtro al where', async () => {
      mockPrisma.lista.findMany.mockResolvedValue([mockLista]);

      await service.findAll(VIEWER);

      const where = mockPrisma.lista.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('isActive');
    });

    it('findProducts scopea por listaId y aplica search/categoryId', async () => {
      mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod-1', sku: 'S', name: 'Cam' }]);

      const res = await service.findProducts(LISTA_ID, VIEWER, { search: 'cam', categoryId: 'cat-1' });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listaId: LISTA_ID,
            categoryId: 'cat-1',
            OR: expect.any(Array),
          }),
        }),
      );
      expect(res.data).toHaveLength(1);
    });

    it('findPrices exige view_prices (403 para view)', async () => {
      await expect(service.findPrices(LISTA_ID, VIEWER)).rejects.toThrow(ForbiddenException);
    });

    it('findPrices funciona con view_prices', async () => {
      mockPrisma.price.findMany.mockResolvedValue([{ id: 'price-1', value: 1000 }]);

      const res = await service.findPrices(LISTA_ID, VIEW_PRICES);

      expect(mockPrisma.price.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ product: expect.objectContaining({ listaId: LISTA_ID }) }),
        }),
      );
      expect(res.data).toHaveLength(1);
    });

    it('findPrices funciona con edit_prices', async () => {
      mockPrisma.price.findMany.mockResolvedValue([{ id: 'price-1', value: 1000 }]);

      const res = await service.findPrices(LISTA_ID, EDIT_PRICES);

      expect(mockPrisma.price.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ product: expect.objectContaining({ listaId: LISTA_ID }) }),
        }),
      );
      expect(res.data).toHaveLength(1);
    });

    it('findProducts NO incluye precios para view (solo view_prices+)', async () => {
      mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod-1' }]);

      await service.findProducts(LISTA_ID, VIEWER);

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.include.prices).toBeUndefined();
    });

    it('findProducts incluye precios para edit_prices', async () => {
      mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod-1' }]);

      await service.findProducts(LISTA_ID, EDIT_PRICES);

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.include.prices).toBeDefined();
    });

    it('findProducts también incluye precios para view_prices', async () => {
      mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod-1' }]);

      await service.findProducts(LISTA_ID, VIEW_PRICES);

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.include.prices).toBeDefined();
    });

    it('update sin archivedAt exige edit_products (403 para edit_prices)', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);

      await expect(
        service.update(LISTA_ID, { name: 'Nueva' }, EDIT_PRICES),
      ).rejects.toThrow(ForbiddenException);
    });

    it('findAssignments exige manage (403 para view)', async () => {
      await expect(service.findAssignments(LISTA_ID, VIEWER)).rejects.toThrow(ForbiddenException);
    });

    it('findAudit exige manage (403 para view)', async () => {
      await expect(service.findAudit(LISTA_ID, VIEWER)).rejects.toThrow(ForbiddenException);
    });

    it('update con archivedAt requiere manage (403 para edit)', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      await expect(
        service.update(LISTA_ID, { archivedAt: '2026-01-01T00:00:00Z' }, EDITER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('vigencias calculadas (OLA 6)', () => {
    it('findOne aÃ±ade isExpired/isExpiringSoon/daysUntilExpiry (vence en 10 dÃ­as)', async () => {
      const validUntil = new Date(Date.now() + 10 * 86400000);
      mockPrisma.lista.findUnique.mockResolvedValueOnce({ ...mockLista, validUntil });
      const res = await service.findOne(LISTA_ID, ADMIN);
      expect(res.isExpired).toBe(false);
      expect(res.isExpiringSoon).toBe(true);
      expect(res.daysUntilExpiry).toBe(10);
    });

    it('findOne marca vencida una Lista con validUntil en el pasado', async () => {
      const validUntil = new Date(Date.now() - 2 * 86400000);
      mockPrisma.lista.findUnique.mockResolvedValueOnce({ ...mockLista, validUntil });
      const res = await service.findOne(LISTA_ID, ADMIN);
      expect(res.isExpired).toBe(true);
      expect(res.isExpiringSoon).toBe(false);
      expect(res.daysUntilExpiry).toBeLessThan(0);
    });

    it('findOne sin validUntil â†’ no vencida y daysUntilExpiry null', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      const res = await service.findOne(LISTA_ID, ADMIN);
      expect(res.isExpired).toBe(false);
      expect(res.isExpiringSoon).toBe(false);
      expect(res.daysUntilExpiry).toBeNull();
    });

    it('findAll mapea los campos calculados en cada Lista', async () => {
      const validUntil = new Date(Date.now() + 40 * 86400000);
      mockPrisma.lista.findMany.mockResolvedValue([{ ...mockLista, validUntil }]);
      const res = await service.findAll(ADMIN);
      expect(res.data[0].productCount).toBe(3);
      expect(res.data[0].isExpired).toBe(false);
      expect(res.data[0].isExpiringSoon).toBe(false);
      expect(res.data[0].daysUntilExpiry).toBe(40);
    });
  });

  describe('findExpiringPrices (OLA 6)', () => {
    it('devuelve precios prÃ³ximos a vencer con daysRemaining y respeta ventana', async () => {
      const validUntil = new Date(Date.now() + 10 * 86400000);
      mockPrisma.price.findMany.mockResolvedValueOnce([
        {
          id: 'price-1',
          productId: 'prod-1',
          priceListId: 'pl-1',
          listaId: LISTA_ID,
          value: 1000,
          currency: 'COP',
          validFrom: null,
          validUntil,
          createdAt: new Date(),
          updatedAt: new Date(),
          product: { id: 'prod-1', sku: 'SKU1', name: 'Camara' },
          priceList: { id: 'pl-1', name: 'Lista General', code: 'LG' },
        },
      ]);

      const res = await service.findExpiringPrices(LISTA_ID, EDIT_PRICES, 30);

      expect(mockPrisma.price.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            listaId: LISTA_ID,
            validUntil: { not: null, lte: expect.any(Date), gte: expect.any(Date) },
          },
        }),
      );
      expect(res.count).toBe(1);
      expect(res.days).toBe(30);
      expect(res.data[0].daysRemaining).toBe(10);
      expect(res.data[0].product.name).toBe('Camara');
    });

    it('no devuelve precios ya vencidos (validUntil >= now en la query)', async () => {
      mockPrisma.price.findMany.mockResolvedValueOnce([]);

      const res = await service.findExpiringPrices(LISTA_ID, EDIT_PRICES, 30);

      const where = mockPrisma.price.findMany.mock.calls[0][0].where;
      const gte = (where.validUntil.gte as Date).getTime();
      expect(gte).toBeLessThanOrEqual(Date.now() + 1000);
      expect(where.validUntil.not).toBeNull();
      expect(res.data).toHaveLength(0);
      expect(res.count).toBe(0);
    });

    it('sin precios â†’ data vacÃ­a, count 0', async () => {
      mockPrisma.price.findMany.mockResolvedValueOnce([]);
      const res = await service.findExpiringPrices(LISTA_ID, EDIT_PRICES);
      expect(res.data).toEqual([]);
      expect(res.count).toBe(0);
      expect(res.days).toBe(30);
    });

    it('lista inexistente â†’ 404', async () => {
      await expect(service.findExpiringPrices('no-existe', VIEWER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lista no autorizada â†’ 404', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(null);
      await expect(service.findExpiringPrices(OTHER_LISTA_ID, VIEWER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('duplicateLista (OLA 6 complemento)', () => {
    // Fuente rica con todos los campos de configuraciÃ³n a copiar.
    const fullSource = {
      ...mockLista,
      type: 'COMERCIAL',
      defaultVisibility: true,
      responsibleId: 'user-responsible',
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validUntil: new Date('2026-12-31T23:59:59Z'),
    };

    it('duplica con code Ãºnico nuevo e isActive false, productCount 0', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(fullSource);
      const res = await service.duplicateLista(LISTA_ID, ADMIN);

      expect(res.isActive).toBe(false);
      expect(res.productCount).toBe(0);
      expect(res.name).toBe('Lista General (copia)');
      expect(res.code).toMatch(/^LISTA-GENERAL-COPIA-[A-Z0-9]{4}$/);
      const data = (mockPrisma.lista.create.mock.calls[0][0] as any).data;
      expect(data.code).toBe(res.code);
      expect(data.isActive).toBe(false);
      // Unicidad: verifica que no reutiliza el code del origen.
      expect(data.code).not.toBe('LISTA-GENERAL');
    });

    it('copia la configuraciÃ³n (type/defaultVisibility/vigencias/responsable/currency) y el actor', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(fullSource);
      await service.duplicateLista(LISTA_ID, ADMIN);

      expect(mockPrisma.lista.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'COMERCIAL',
            defaultVisibility: true,
            validFrom: fullSource.validFrom,
            validUntil: fullSource.validUntil,
            responsibleId: 'user-responsible',
            currency: 'COP',
            description: 'RaÃ­z',
            createdById: ADMIN.userId,
            updatedById: ADMIN.userId,
          }),
        }),
      );
    });

    it('NO copia productos, precios ni assignments (molde de configuraciÃ³n)', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(fullSource);
      await service.duplicateLista(LISTA_ID, ADMIN);

      expect(mockPrisma.price.create).not.toHaveBeenCalled();
      expect(mockPrisma.price.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
      expect(mockPrisma.assignment.create).not.toHaveBeenCalled();
      expect(mockPrisma.assignment.upsert).not.toHaveBeenCalled();
    });

    it('audita la acciÃ³n duplicate', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(fullSource);
      await service.duplicateLista(LISTA_ID, ADMIN);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'duplicate',
          entity: 'LISTA',
          oldValues: { sourceId: LISTA_ID },
        }),
      );
    });

    it('404 si la Lista origen no existe', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(null);
      await expect(service.duplicateLista('no-existe', ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('403 si el usuario solo tiene view (exige edit+)', async () => {
      await expect(service.duplicateLista(LISTA_ID, VIEWER)).rejects.toThrow(ForbiddenException);
    });

    it('404 si el usuario no tiene assignment sobre la Lista (deny-by-default)', async () => {
      await expect(service.duplicateLista(LISTA_ID, NOAUTH)).rejects.toThrow(NotFoundException);
    });

    it('regenera el code si el candidato inicial ya existe (colisiÃ³n)', async () => {
      const codeCheck = jest.fn();
      mockPrisma.lista.findUnique.mockImplementation(async (args: any) => {
        if (args?.where?.id === LISTA_ID) return fullSource;
        codeCheck();
        // primera comprobaciÃ³n de code â†’ colisiÃ³n; siguientes â†’ libres
        return codeCheck.mock.calls.length === 1 ? { id: 'dup' } : null;
      });

      const res = await service.duplicateLista(LISTA_ID, ADMIN);

      expect(codeCheck.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(res.code).toMatch(/^LISTA-GENERAL-COPIA-[A-Z0-9]{4}$/);
      const data = (mockPrisma.lista.create.mock.calls[0][0] as any).data;
      expect(data.code).toBe(res.code);
    });

    it('trunca name y code a lÃ­mites razonables en fuentes largas', async () => {
      const longSource = {
        ...fullSource,
        name: 'X'.repeat(300),
        code: 'L'.repeat(80),
      };
      mockPrisma.lista.findUnique.mockResolvedValueOnce(longSource);

      const res = await service.duplicateLista(LISTA_ID, ADMIN);

      expect(res.name.length).toBeLessThanOrEqual(121);
      expect(res.name.endsWith('(copia)')).toBe(true);
      expect(res.code.length).toBeLessThanOrEqual(60);
      expect(res.code).toMatch(/^L+-COPIA-[A-Z0-9]{4}$/);
    });
  });

  describe('removeLista â€” eliminaciÃ³n fÃ­sica en cascada real', () => {
    it('sin confirm: true â†’ 400, no escribe nada', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([]);
      mockPrisma.price.count.mockResolvedValueOnce(0);
      mockPrisma.assignment.count.mockResolvedValueOnce(0);

      await expect(service.removeLista(LISTA_ID, {}, ADMIN)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.lista.delete).not.toHaveBeenCalled();
      expect(mockPrisma.product.deleteMany).not.toHaveBeenCalled();
    });

    it('delete exitoso (Lista vacÃ­a) â†’ 200 y audita delete ANTES de borrar', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([]);
      mockPrisma.price.count.mockResolvedValueOnce(0);
      mockPrisma.assignment.count.mockResolvedValueOnce(0);

      const res = await service.removeLista(LISTA_ID, { confirm: true }, ADMIN);

      expect(res.message).toBe('Lista eliminada exitosamente');
      expect(mockPrisma.lista.delete).toHaveBeenCalledWith({ where: { id: LISTA_ID } });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          entity: 'LISTA',
          entityId: LISTA_ID,
          newValues: expect.objectContaining({ code: mockLista.code, name: mockLista.name }),
        }),
      );
    });

    it('200 cuando la Lista tiene productos: los borra de verdad (ya no los deja huÃ©rfanos)', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
      mockPrisma.price.count.mockResolvedValueOnce(0);
      mockPrisma.assignment.count.mockResolvedValueOnce(0);
      mockPrisma.productImage.findMany.mockResolvedValueOnce([]);

      const res = await service.removeLista(LISTA_ID, { confirm: true }, ADMIN);

      expect(res.message).toBe('Lista eliminada exitosamente');
      expect(res.productosEliminados).toBe(3);
      expect(mockPrisma.lista.delete).toHaveBeenCalledWith({ where: { id: LISTA_ID } });
      expect(mockPrisma.product.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['p1', 'p2', 'p3'] } },
      });
      expect(mockPrisma.assignment.deleteMany).toHaveBeenCalledWith({
        where: { resourceType: 'LISTA', resourceId: LISTA_ID },
      });
      expect(mockPrisma.assignment.deleteMany).toHaveBeenCalledWith({
        where: { resourceType: 'PRODUCT', resourceId: { in: ['p1', 'p2', 'p3'] } },
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          entity: 'LISTA',
          entityId: LISTA_ID,
          newValues: expect.objectContaining({ productosEliminados: 3 }),
        }),
      );
    });

    it('borra las imÃ¡genes de los productos huÃ©rfanos, en BD y en almacenamiento', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([{ id: 'p1' }]);
      mockPrisma.price.count.mockResolvedValueOnce(0);
      mockPrisma.assignment.count.mockResolvedValueOnce(0);
      mockPrisma.productImage.findMany.mockResolvedValueOnce([
        { url: '/api/files/img-1' },
        { url: '/api/files/img-2' },
      ]);

      await service.removeLista(LISTA_ID, { confirm: true }, ADMIN);

      expect(mockPrisma.productImage.deleteMany).toHaveBeenCalledWith({
        where: { productId: { in: ['p1'] } },
      });
      expect(mockFiles.deleteByUrl).toHaveBeenCalledWith('/api/files/img-1');
      expect(mockFiles.deleteByUrl).toHaveBeenCalledWith('/api/files/img-2');
    });

    it('200 cuando la Lista tiene precios (se borran, propios y de sus productos)', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
      mockPrisma.price.count.mockResolvedValueOnce(5);
      mockPrisma.assignment.count.mockResolvedValueOnce(0);
      mockPrisma.productImage.findMany.mockResolvedValueOnce([]);

      const res = await service.removeLista(LISTA_ID, { confirm: true }, ADMIN);

      expect(res.message).toBe('Lista eliminada exitosamente');
      expect(mockPrisma.lista.delete).toHaveBeenCalledWith({ where: { id: LISTA_ID } });
      expect(mockPrisma.price.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ listaId: LISTA_ID }, { productId: { in: ['p1', 'p2', 'p3'] } }] },
      });
    });

    it('el historial de auditorÃ­a NO bloquea el borrado: solo historial â†’ 200 y audita delete', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([]);
      mockPrisma.price.count.mockResolvedValueOnce(0);
      mockPrisma.assignment.count.mockResolvedValueOnce(0); // sin accesos activos de terceros
      mockPrisma.auditLog.count.mockResolvedValueOnce(4); // historial: no bloquea, se conserva

      const res = await service.removeLista(LISTA_ID, { confirm: true }, ADMIN);

      expect(res.message).toBe('Lista eliminada exitosamente');
      expect(mockPrisma.lista.delete).toHaveBeenCalledWith({ where: { id: LISTA_ID } });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          entity: 'LISTA',
          entityId: LISTA_ID,
          oldValues: expect.objectContaining({ code: mockLista.code, name: mockLista.name }),
          newValues: expect.objectContaining({ code: mockLista.code, name: mockLista.name }),
        }),
      );
    });

    it('200 cuando la Lista tiene accesos activos de terceros (borra en cascada + hard-delete assignments)', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([]);
      mockPrisma.price.count.mockResolvedValueOnce(0);
      mockPrisma.assignment.count.mockResolvedValueOnce(2);
      mockPrisma.auditLog.count.mockResolvedValueOnce(4);

      const res = await service.removeLista(LISTA_ID, { confirm: true }, ADMIN);

      expect(res.message).toBe('Lista eliminada exitosamente');
      expect(mockPrisma.lista.delete).toHaveBeenCalledWith({ where: { id: LISTA_ID } });
      expect(mockPrisma.assignment.deleteMany).toHaveBeenCalledWith({
        where: { resourceType: 'LISTA', resourceId: LISTA_ID },
      });
    });

    it('404 si la Lista no existe', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(null);
      await expect(service.removeLista('no-existe', { confirm: true }, ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('403 si el usuario no es Super Admin', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([]);
      mockPrisma.price.count.mockResolvedValueOnce(0);
      mockPrisma.assignment.count.mockResolvedValueOnce(0);

      await expect(service.removeLista(LISTA_ID, { confirm: true }, MANAGER)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.lista.delete).not.toHaveBeenCalled();
    });

    it('excluye la auto-asignaciÃ³n del actor (NOT userId) y las assignments inactivas (isActive) del conteo bloqueante', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([]);
      mockPrisma.price.count.mockResolvedValueOnce(0);
      mockPrisma.assignment.count.mockResolvedValueOnce(0); // solo auto-asignaciÃ³n â†’ 0 accesos de terceros

      const res = await service.removeLista(LISTA_ID, { confirm: true }, ADMIN);

      expect(res.message).toBe('Lista eliminada exitosamente');
      expect(mockPrisma.assignment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            resourceType: 'LISTA',
            resourceId: LISTA_ID,
            isActive: true,
            NOT: { userId: ADMIN.userId },
          }),
        }),
      );
      expect(mockPrisma.lista.delete).toHaveBeenCalled();
    });

    it('Fix H9 - assignment inactivo (soft-deleted) NO bloquea el borrado (200)', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([]);
      mockPrisma.price.count.mockResolvedValueOnce(0);
      mockPrisma.assignment.count.mockResolvedValueOnce(0); // las inactivas quedan filtradas por isActive: true

      const res = await service.removeLista(LISTA_ID, { confirm: true }, ADMIN);

      expect(res.message).toBe('Lista eliminada exitosamente');
      expect(mockPrisma.lista.delete).toHaveBeenCalledWith({ where: { id: LISTA_ID } });
    });

  });

  describe('Admin Comercial â€” contenedor de compras (isListasAdmin)', () => {
    it('findAll ve TODAS las listas (getAllowedListaIds â†’ null, sin filtro de id)', async () => {
      mockPrisma.lista.findMany.mockResolvedValue([mockLista, mockOtherLista]);
      const res = await service.findAll(COMERCIAL);
      expect(res.data).toHaveLength(2);
      expect(mockPrisma.assignment.findMany).not.toHaveBeenCalled();
    });

    it('findOne accede a una Lista ajena (sin assignment previo) â€” no 404', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockOtherLista);
      const res = await service.findOne(OTHER_LISTA_ID, COMERCIAL);
      expect(res.id).toBe(OTHER_LISTA_ID);
    });

    it('puede archivar y restaurar cualquier Lista (manage implÃ­cito)', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      const archived = await service.archive(LISTA_ID, COMERCIAL);
      expect(archived.archivedAt).toBeDefined();

      mockPrisma.lista.findUnique.mockResolvedValueOnce({ ...mockLista, archivedAt: new Date() });
      const restored = await service.restore(LISTA_ID, COMERCIAL);
      expect(restored.archivedAt).toBeNull();
    });

    it('puede ver accesos (findAssignments) de cualquier Lista (manage_access implÃ­cito)', async () => {
      const res = await service.findAssignments(LISTA_ID, COMERCIAL);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('puede eliminar fÃ­sicamente una Lista vacÃ­a (DELETE â†’ 200) y audita', async () => {
      mockPrisma.lista.findUnique.mockResolvedValueOnce(mockLista);
      mockPrisma.product.findMany.mockResolvedValueOnce([]);
      mockPrisma.price.count.mockResolvedValueOnce(0);
      mockPrisma.assignment.count.mockResolvedValueOnce(0);

      const res = await service.removeLista(LISTA_ID, { confirm: true }, COMERCIAL);

      expect(res.message).toBe('Lista eliminada exitosamente');
      expect(mockPrisma.lista.delete).toHaveBeenCalledWith({ where: { id: LISTA_ID } });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'delete', entity: 'LISTA', entityId: LISTA_ID }),
      );
    });

    it('ve precios en findProducts (userCanSeePrices implÃ­cito)', async () => {
      mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod-1' }]);
      await service.findProducts(LISTA_ID, COMERCIAL);
      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.include.prices).toBeDefined();
    });
  });
});

