import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { createPrismaMock } from '../../../__test__/mocks/prisma.mock';

describe('CustomersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let acl: { isListasAdmin: jest.Mock };
  let hierarchy: { getSubordinateIds: jest.Mock };
  let audit: { log: jest.Mock };
  let grants: { grantsForUser: jest.Mock };
  let service: CustomersService;

  const adminCtx = { userId: 'admin-1', roles: ['Super Admin'] };
  const operadorCtx = { userId: 'op-1', roles: ['Operador'] };

  beforeEach(() => {
    prisma = createPrismaMock();
    acl = { isListasAdmin: jest.fn().mockReturnValue(false) };
    hierarchy = { getSubordinateIds: jest.fn().mockResolvedValue([]) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    grants = { grantsForUser: jest.fn().mockResolvedValue([
      'customers:read', 'customers:create', 'customers:edit', 'customers:reassign',
    ].map((actionId) => ({ sourceId: 'test', actionId, scope: 'own' }))) };
    service = new CustomersService(
      prisma as any,
      acl as any,
      hierarchy as any,
      audit as any,
      grants as any,
    );
  });

  // ---------- CRUD básico ----------

  it('crea un lead con código secuencial CL-####, ownerId = creador y audita', async () => {
    prisma.customer.findFirst.mockResolvedValue({ code: 'CL-0007' });
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({
      id: 'c1',
      code: 'CL-0008',
      name: 'Acme',
      status: 'LEAD',
      ownerId: 'op-1',
    });

    const result = await service.create({ name: 'Acme' }, operadorCtx);

    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'CL-0008',
        name: 'Acme',
        status: 'LEAD',
        owner: { connect: { id: 'op-1' } },
        createdBy: { connect: { id: 'op-1' } },
      }),
    });
    expect(result.code).toBe('CL-0008');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entity: 'Customer', entityId: 'c1' }),
    );
  });

  it('empieza en CL-0001 cuando no hay códigos previos', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'c1', code: 'CL-0001' });

    await service.create({ name: 'Primero' }, operadorCtx);

    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'CL-0001' }),
    });
  });

  it('findOne devuelve el cliente para un admin', async () => {
    acl.isListasAdmin.mockReturnValue(true);
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, ownerId: 'otro' });

    const result = await service.findOne('c1', adminCtx);

    expect(result.id).toBe('c1');
    expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
  });

  it('soft delete marca isActive=false y audita', async () => {
    acl.isListasAdmin.mockReturnValue(true);
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1',
      isActive: true,
      code: 'CL-0001',
      name: 'X',
      status: 'LEAD',
      ownerId: 'op-1',
    });
    prisma.customer.update.mockResolvedValue({});

    await service.remove('c1', adminCtx);

    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { isActive: false },
    });
    expect(prisma.customer.delete).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', entity: 'Customer', entityId: 'c1' }),
    );
  });

  // ---------- Scoping ----------

  it('admin lista sin filtro de ownerId (ve todos)', async () => {
    acl.isListasAdmin.mockReturnValue(true);
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);

    await service.findAll({}, adminCtx);

    const where = prisma.customer.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('ownerId');
    expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
  });

  it('usuario normal solo ve clientes de su cartera y la de sus subordinados', async () => {
    hierarchy.getSubordinateIds.mockResolvedValue(['op-1', 'op-2']);
    grants.grantsForUser.mockResolvedValue([
      { sourceId: 'team-read', actionId: 'customers:read', scope: 'team' },
    ]);
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);

    await service.findAll({}, operadorCtx);

    expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('op-1');
    const where = prisma.customer.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ ownerId: { in: ['op-1', 'op-2'] } });
  });

  it('findOne devuelve 404 si el cliente está fuera del scope del usuario', async () => {
    hierarchy.getSubordinateIds.mockResolvedValue(['op-1']);
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, ownerId: 'ajeno' });

    await expect(service.findOne('c1', operadorCtx)).rejects.toThrow(NotFoundException);
  });

  // ---------- Unicidad de documento ----------

  it('permite crear dos leads sin documento (sin conflicto de unicidad)', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'c2', code: 'CL-0001' });

    await service.create({ name: 'Lead sin doc A' }, operadorCtx);
    prisma.customer.create.mockResolvedValue({ id: 'c3', code: 'CL-0002' });
    await service.create({ name: 'Lead sin doc B' }, operadorCtx);

    expect(prisma.customer.create).toHaveBeenCalledTimes(2);
    expect(
      prisma.customer.create.mock.calls.every(
        ([arg]) => arg.data.documentType === null && arg.data.documentId === null,
      ),
    ).toBe(true);
  });

  it('409 al crear con documento duplicado (P2002 en documentType/documentId)', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.findUnique.mockResolvedValue(null);
    const p2002 = new (await import('@prisma/client')).Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['documentType', 'documentId'] },
      } as any,
    );
    prisma.customer.create.mockRejectedValue(p2002);

    await expect(
      service.create({ name: 'Duplicado', documentType: 'NIT', documentId: '123' }, operadorCtx),
    ).rejects.toThrow(ConflictException);
  });

  // ---------- Conversión manual ----------

  it('convert cambia status a CLIENTE y setea convertedAt', async () => {
    acl.isListasAdmin.mockReturnValue(true);
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, status: 'LEAD' });
    prisma.customer.update.mockResolvedValue({ id: 'c1', status: 'CLIENTE', convertedAt: new Date() });

    const result = await service.convert('c1', adminCtx);

    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'CLIENTE', convertedAt: expect.any(Date) }),
    });
    expect(result.status).toBe('CLIENTE');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'convert', entity: 'Customer', entityId: 'c1' }),
    );
  });

  it('convert falla con 409 si el registro no está en LEAD', async () => {
    acl.isListasAdmin.mockReturnValue(true);
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, status: 'CLIENTE' });

    await expect(service.convert('c1', adminCtx)).rejects.toThrow(ConflictException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });
  describe('personal seller portfolio', () => {
    const seller = { userId: 'seller-1', roles: ['Vendedor'] };

    it('scopes both rows and totals to the seller even if they have subordinates', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['seller-1', 'other-seller']);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);
      await service.findAll({}, seller);
      const where = prisma.customer.findMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({ ownerId: 'seller-1' });
      expect(prisma.customer.count).toHaveBeenCalledWith({ where });
      expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
    });

    it('does not reveal another seller customer by ID', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'other', isActive: true, ownerId: 'other-seller' });
      await expect(service.findOne('other', seller)).rejects.toThrow(NotFoundException);
    });

    it('can read an owned customer', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'mine', isActive: true, ownerId: seller.userId });
      await expect(service.findOne('mine', seller)).resolves.toMatchObject({ id: 'mine' });
    });

    it('cannot create a customer for a different owner', async () => {
      await expect(service.create({ name: 'Demo', ownerId: 'other-seller' }, seller))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it.each(['other-seller', null])('cannot transfer or unassign a customer to %s', async ownerId => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'mine', isActive: true, ownerId: seller.userId });
      await expect(service.update('mine', { ownerId }, seller)).rejects.toThrow(BadRequestException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
  });

  // ---------- COM-02 §5.1 — la edición general no concede cartera/estado ----------

  describe('COM-02 edición general rechaza ownerId/status/isActive (§5.1)', () => {
    const writeCtx = { userId: 'w-1', roles: ['Admin Comercial'] };

    beforeEach(() => {
      acl.isListasAdmin.mockReturnValue(true);
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's-1', actionId: 'customers:read', scope: 'own' },
        { sourceId: 's-1', actionId: 'customers:edit', scope: 'own' },
      ]);
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        isActive: true,
        code: 'CL-0001',
        name: 'Acme',
        email: 'old@acme.test',
        ownerId: 'w-1',
        status: 'LEAD',
      });
      prisma.customer.update.mockResolvedValue({ id: 'c1', email: 'nuevo@acme.test' });
    });

    it.each([
      ['ownerId', { email: 'nuevo@acme.test', ownerId: 'otro' }],
      ['status', { name: 'Acme', status: 'INACTIVO' }],
      ['isActive', { name: 'Acme', isActive: false }],
      ['ownerId null', { name: 'Acme', ownerId: null }],
    ])('rechaza %s con 400 y CERO escrituras (ni lectura)', async (_campo, payload) => {
      await expect(service.update('c1', payload as any, writeCtx)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
      expect(prisma.customer.findUnique).not.toHaveBeenCalled();
    });

    it('el payload mixto { email, ownerId } se rechaza entero: el email NO se aplica', async () => {
      await expect(
        service.update('c1', { email: 'nuevo@acme.test', ownerId: 'otro' } as any, writeCtx),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('sí edita contactos/notas y jamás escribe owner ni status en el update', async () => {
      const result = await service.update(
        'c1',
        { email: 'nuevo@acme.test', notes: 'ok' },
        writeCtx,
      );

      expect(result.id).toBe('c1');
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({ email: 'nuevo@acme.test', notes: 'ok' }),
      });
      const data = prisma.customer.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('ownerId');
      expect(data).not.toHaveProperty('owner');
      expect(data).not.toHaveProperty('status');
    });

    it('audita el update selectivamente: PII solo como metadato, el resto por valor (F4)', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        isActive: true,
        code: 'CL-0001',
        name: 'Acme',
        email: 'old@acme.test',
        phone: '+57 300 111',
        address: 'Cra 7 # 1-23',
        notes: 'nota secreta',
        documentId: '1234567890',
        city: 'Bogotá',
        ownerId: 'w-1',
      });
      prisma.customer.update.mockResolvedValue({
        id: 'c1',
        name: 'Acme SAC',
        email: 'new@acme.test',
        phone: '+57 300 111',
        address: 'Cra 7 # 1-23',
        notes: 'nota secreta',
        documentId: '1234567890',
        city: 'Bogotá',
        ownerId: 'w-1',
      });

      await service.update(
        'c1',
        { name: 'Acme SAC', email: 'new@acme.test', notes: 'nota secreta' },
        writeCtx,
      );

      const call = audit.log.mock.calls[0][0];
      expect(call).toEqual(
        expect.objectContaining({
          action: 'update',
          entity: 'Customer',
          entityId: 'c1',
          oldValues: { name: 'Acme', changedPiiFields: ['email'] },
          newValues: { name: 'Acme SAC', changedPiiFields: ['email'] },
        }),
      );
      const row = JSON.stringify(call);
      expect(row).not.toContain('old@acme.test');
      expect(row).not.toContain('new@acme.test');
    });
  });

  // ---------- COM-02 §4 — edición por concesión (leer equipo ≠ editar equipo) ----------

  describe('COM-02 alcance de edición por concesión customers:edit (§4)', () => {
    const ana = { userId: 'ana-1', roles: ['Supervisor'] };
    const anaSoloLecturaTeam = [
      { sourceId: 's-read', actionId: 'customers:read', scope: 'team' },
      { sourceId: 's-edit', actionId: 'customers:edit', scope: 'own' },
    ];

    beforeEach(() => {
      hierarchy.getSubordinateIds.mockResolvedValue(['ana-1', 'vend-1']);
      grants.grantsForUser.mockResolvedValue(anaSoloLecturaTeam);
    });

    it('lectura team + edición own: 200 sobre cliente PROPIO', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c1',
        isActive: true,
        ownerId: 'ana-1',
        name: 'Acme',
        email: 'a@b.co',
      });
      prisma.customer.update.mockResolvedValue({ id: 'c1', name: 'Acme 2' });

      const result = await service.update('c1', { name: 'Acme 2' }, ana);

      expect(result.id).toBe('c1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'update', entityId: 'c1' }),
      );
    });

    it('lectura team NO concede edición team: 403 sobre cliente del EQUIPO', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c2',
        isActive: true,
        ownerId: 'vend-1',
        name: 'B',
        email: 'b@b.co',
      });

      await expect(service.update('c2', { name: 'B2' }, ana)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('revocar customers:edit bloquea la siguiente llamada con el mismo jti', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's-read', actionId: 'customers:read', scope: 'own' },
      ]);
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, ownerId: 'op-1' });
      await expect(service.update('c1', { name: 'Denied' }, { ...operadorCtx, jti: 'same-session' } as any))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('concesión edit(team) EXPLÍCITA (no heredada de read) sí permite editar el equipo', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's-read', actionId: 'customers:read', scope: 'team' },
        { sourceId: 's-edit', actionId: 'customers:edit', scope: 'team' },
      ]);
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c2',
        isActive: true,
        ownerId: 'vend-1',
        name: 'B',
        email: 'b@b.co',
      });
      prisma.customer.update.mockResolvedValue({ id: 'c2', name: 'B2' });

      const result = await service.update('c2', { name: 'B2' }, ana);

      expect(result.id).toBe('c2');
    });

    it('ver todos por rol (isListasAdmin) no concede editar: sin customers:edit → 403', async () => {
      acl.isListasAdmin.mockReturnValue(true);
      hierarchy.getSubordinateIds.mockResolvedValue([]);
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's', actionId: 'customers:read', scope: 'own' },
      ]);
      prisma.customer.findUnique.mockResolvedValue({
        id: 'c9',
        isActive: true,
        ownerId: 'ac-1',
        name: 'X',
      });

      await expect(
        service.update('c9', { name: 'Y' }, { userId: 'ac-1', roles: ['Admin Comercial'] }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
  });

  // ---------- COM-02 §3/§4/§5.3 — reasignación dedicada ----------

  describe('COM-02 reasignación dedicada con customers:reassign', () => {
    const sup = { userId: 'sup-1', roles: ['Supervisor'] };
    const reassignTeamGrants = [
      { sourceId: 's-read', actionId: 'customers:read', scope: 'team' },
      { sourceId: 's-re', actionId: 'customers:reassign', scope: 'team' },
    ];
    const ownedByVend = {
      id: 'c1',
      isActive: true,
      code: 'CL-0001',
      name: 'Acme',
      ownerId: 'vend-1',
      email: 'ceo@acme.test',
      phone: '+57 300 999',
      address: 'Cra 1 # 2-3',
      notes: 'confidencial',
    };

    beforeEach(() => {
      hierarchy.getSubordinateIds.mockResolvedValue(['sup-1', 'vend-1', 'vend-2']);
      grants.grantsForUser.mockResolvedValue(reassignTeamGrants);
      prisma.customer.findUnique.mockResolvedValue(ownedByVend);
      prisma.user.findUnique.mockResolvedValue({ id: 'vend-2', isActive: true });
      prisma.customer.update.mockResolvedValue({ id: 'c1', ownerId: 'vend-2' });
    });

    it('con reassign(team): 200 y auditoría actor+antes/después+motivo SIN PII', async () => {
      const result = await service.reassign(
        'c1',
        { ownerId: 'vend-2', motivo: 'Cambio de cartera solicitado' },
        sup,
      );

      expect(result.ownerId).toBe('vend-2');
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { owner: { connect: { id: 'vend-2' } } },
      });
      expect(audit.log).toHaveBeenCalledWith({
        userId: 'sup-1',
        action: 'reassign',
        entity: 'Customer',
        entityId: 'c1',
        oldValues: { ownerId: 'vend-1' },
        newValues: { ownerId: 'vend-2', motivo: 'Cambio de cartera solicitado' },
      });
      const row = JSON.stringify(audit.log.mock.calls[0][0]);
      for (const pii of [
        'ceo@acme.test',
        '+57 300 999',
        'Cra 1 # 2-3',
        'confidencial',
        'email',
        'phone',
        'address',
        'notes',
      ]) {
        expect(row).not.toContain(pii);
      }
    });

    it('vendedor con reassign(team): 200 sobre cliente PROPIO (team cubre el propio)', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue([]);
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's-read', actionId: 'customers:read', scope: 'own' },
        { sourceId: 's-re', actionId: 'customers:reassign', scope: 'team' },
      ]);
      prisma.customer.findUnique.mockResolvedValue({ ...ownedByVend, ownerId: 'seller-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'seller-1', isActive: true });
      prisma.customer.update.mockResolvedValue({ id: 'c1', ownerId: 'seller-1' });

      const result = await service.reassign(
        'c1',
        { ownerId: 'seller-1' },
        { userId: 'seller-1', roles: ['Vendedor'] },
      );

      expect(result.ownerId).toBe('seller-1');
    });

    it('vendedor SIN la acción (paquete estándar): 403 y cero escrituras', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's-read', actionId: 'customers:read', scope: 'own' },
        { sourceId: 's-edit', actionId: 'customers:edit', scope: 'own' },
      ]);
      prisma.customer.findUnique.mockResolvedValue({ ...ownedByVend, ownerId: 'seller-1' });

      await expect(
        service.reassign('c1', { ownerId: 'seller-1' }, { userId: 'seller-1', roles: ['Vendedor'] }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('cliente FUERA del alcance de lectura → 404 (no revela existencia) y sin escrituras', async () => {
      prisma.customer.findUnique.mockResolvedValue({ ...ownedByVend, ownerId: 'ajeno-1' });

      await expect(service.reassign('c1', { ownerId: 'vend-2' }, sup)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('Admin Comercial que ve todo pero sin reassign → 403 (ver ≠ reasignar)', async () => {
      acl.isListasAdmin.mockReturnValue(true);
      hierarchy.getSubordinateIds.mockResolvedValue([]);
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's', actionId: 'customers:read', scope: 'global' },
      ]);

      await expect(
        service.reassign('c1', { ownerId: 'vend-2' }, { userId: 'ac-1', roles: ['Admin Comercial'] }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('nuevo responsable inexistente o inactivo → 400 y sin escrituras', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.reassign('c1', { ownerId: 'no-existe' }, sup)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('Super Admin (excepción explícita del resolver) reasigna sin concesiones: 200', async () => {
      grants.grantsForUser.mockResolvedValue([]);
      prisma.customer.update.mockResolvedValue({ id: 'c1', ownerId: 'admin-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', isActive: true });

      const result = await service.reassign('c1', { ownerId: 'admin-1' }, adminCtx);

      expect(result.ownerId).toBe('admin-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'reassign',
          oldValues: { ownerId: 'vend-1' },
          newValues: { ownerId: 'admin-1' },
        }),
      );
    });
  });

});
