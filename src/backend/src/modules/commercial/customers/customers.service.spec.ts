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

    describe('reassign con alcance propio', () => {
      const seller = { userId: 'seller-1', roles: ['Vendedor'] };
      const ownGrants = [
        { sourceId: 's-read', actionId: 'customers:read', scope: 'own' },
        { sourceId: 's-re', actionId: 'customers:reassign', scope: 'own' },
      ];
      beforeEach(() => {
        hierarchy.getSubordinateIds.mockResolvedValue([]);
        grants.grantsForUser.mockResolvedValue(ownGrants);
        prisma.customer.findUnique.mockResolvedValue({ ...ownedByVend, ownerId: 'seller-1' });
        prisma.user.findUnique.mockResolvedValue({ id: 'seller-1', isActive: true });
        prisma.customer.update.mockResolvedValue({ id: 'c1', ownerId: 'seller-1' });
      });

      it('sobre un cliente propio y hacia sí mismo: permitido', async () => {
        await expect(service.reassign('c1', { ownerId: 'seller-1' }, seller)).resolves.toMatchObject({ ownerId: 'seller-1' });
      });

      it('no puede pasarlo a alguien fuera de su equipo: 403 y sin escrituras', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: 'otro', isActive: true });
        await expect(service.reassign('c1', { ownerId: 'otro' }, seller)).rejects.toThrow(ForbiddenException);
        expect(prisma.customer.update).not.toHaveBeenCalled();
      });

      it('puede pasarlo a alguien de su equipo', async () => {
        hierarchy.getSubordinateIds.mockResolvedValue(['sub-1']);
        prisma.user.findUnique.mockResolvedValue({ id: 'sub-1', isActive: true });
        prisma.customer.update.mockResolvedValue({ id: 'c1', ownerId: 'sub-1' });
        await expect(service.reassign('c1', { ownerId: 'sub-1' }, seller)).resolves.toMatchObject({ ownerId: 'sub-1' });
      });

      it('un cliente de su equipo (no propio) no se puede reasignar con alcance propio: 403', async () => {
        hierarchy.getSubordinateIds.mockResolvedValue(['vend-1']);
        grants.grantsForUser.mockResolvedValue([
          { sourceId: 's-read', actionId: 'customers:read', scope: 'team' },
          { sourceId: 's-re', actionId: 'customers:reassign', scope: 'own' },
        ]);
        prisma.customer.findUnique.mockResolvedValue(ownedByVend);
        await expect(service.reassign('c1', { ownerId: 'seller-1' }, seller)).rejects.toThrow(ForbiddenException);
        expect(prisma.customer.update).not.toHaveBeenCalled();
      });

      it('con alcance global puede elegir a cualquiera', async () => {
        grants.grantsForUser.mockResolvedValue([
          { sourceId: 's-read', actionId: 'customers:read', scope: 'global' },
          { sourceId: 's-re', actionId: 'customers:reassign', scope: 'global' },
        ]);
        prisma.user.findUnique.mockResolvedValue({ id: 'otro', isActive: true });
        prisma.customer.update.mockResolvedValue({ id: 'c1', ownerId: 'otro' });
        await expect(service.reassign('c1', { ownerId: 'otro' }, seller)).resolves.toMatchObject({ ownerId: 'otro' });
      });
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

  // ---------- Identidad compartida con la web: duplicados y ciudad DIVIPOLA ----------

  describe('identidad del cliente (NIT/correo/ciudad)', () => {
    const match = (over: Record<string, unknown> = {}) => ({
      id: 'old-1', name: 'Empresa Existente', ownerId: 'op-1', isActive: true, documentId: '901123456',
      byDocument: true, byEmail: false, ...over,
    });
    // The query is a tagged template: its interpolated fragments carry the bound values (normalized document, email, excluded id).
    const sqlValues = (call: number): unknown[] =>
      prisma.$queryRaw.mock.calls[call].slice(1).flatMap((part: any) => (part && Array.isArray(part.values) ? part.values : [part]));

    beforeEach(() => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({ id: 'new-1', code: 'CL-0001' });
      prisma.$queryRaw.mockResolvedValue([]);
    });

    it('busca duplicados con el NIT normalizado, sin importar puntos, espacios ni dígito de verificación', async () => {
      await service.create({ name: 'Acme', documentId: '901.123.456-1' }, operadorCtx);
      expect(sqlValues(0)).toEqual(expect.arrayContaining(['901123456']));
      expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({ documentType: 'NIT', documentId: '901123456' });
    });

    it('409 CUSTOMER_DUPLICATE por NIT con puntos cuando ya existe sin ellos; incluye el cliente si está en su alcance', async () => {
      prisma.$queryRaw.mockResolvedValue([match()]);
      const error: any = await service
        .create({ name: 'Acme', documentType: 'NIT', documentId: '901.123.456-1' }, operadorCtx)
        .catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        code: 'CUSTOMER_DUPLICATE', field: 'documentId', existing: { id: 'old-1', name: 'Empresa Existente' },
      });
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('detecta el duplicado aunque el documento viejo tenga otro tipo (la búsqueda no filtra por tipo)', async () => {
      prisma.$queryRaw.mockResolvedValue([match()]);
      const error: any = await service
        .create({ name: 'Acme', documentType: 'CC', documentId: '901123456' }, operadorCtx)
        .catch((e) => e);
      expect(error.getResponse()).toMatchObject({ code: 'CUSTOMER_DUPLICATE', field: 'documentId' });
    });

    it('409 por correo en mayúsculas: busca el correo en minúsculas y responde field=email', async () => {
      prisma.$queryRaw.mockResolvedValue([match({ byDocument: false, byEmail: true })]);
      const error: any = await service.create({ name: 'Acme', email: '  Ventas@ACME.co ' }, operadorCtx).catch((e) => e);
      expect(sqlValues(0)).toEqual(expect.arrayContaining(['ventas@acme.co']));
      expect(error.getResponse()).toMatchObject({ code: 'CUSTOMER_DUPLICATE', field: 'email' });
    });

    it('un cliente fuera del alcance de lectura NO revela nombre ni id', async () => {
      prisma.$queryRaw.mockResolvedValue([match({ ownerId: 'otra-persona' })]);
      const error: any = await service.create({ name: 'Acme', documentId: '901123456' }, operadorCtx).catch((e) => e);
      const body = error.getResponse();
      expect(body).toMatchObject({ code: 'CUSTOMER_DUPLICATE', field: 'documentId' });
      expect(body).not.toHaveProperty('existing');
      expect(JSON.stringify(body)).not.toContain('Empresa Existente');
      expect(body.message).toContain('supervisor');
    });

    it('guarda el correo normalizado y asume NIT si hay documento sin tipo', async () => {
      await service.create({ name: 'Acme', email: 'Ventas@Acme.CO', documentId: '900123456' }, operadorCtx);
      expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({
        email: 'ventas@acme.co', documentType: 'NIT', documentId: '900123456',
      });
    });

    it('rechaza una ciudad que no está en la lista DIVIPOLA (400 INVALID_CITY) y no crea nada', async () => {
      const error: any = await service.create({ name: 'Acme', city: 'Bogotá' }, operadorCtx).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toMatchObject({ code: 'INVALID_CITY', message: 'Elige tu ciudad de la lista' });
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('acepta un código DIVIPOLA válido y lo guarda en el mismo formato que la web (5 dígitos)', async () => {
      await service.create({ name: 'Acme', city: '11001' }, operadorCtx);
      expect(prisma.customer.create.mock.calls[0][0].data.city).toBe('11001');
    });

    describe('dígito de verificación del NIT (opcional)', () => {
      // 901123456 -> DV 1 and 900111222 -> DV 1 (hand-calculated, see customer-identity.spec)
      it('con el dígito bueno (con guion y puntos) guarda solo el número base', async () => {
        await service.create({ name: 'Acme', documentType: 'NIT', documentId: '901.123.456-1' }, operadorCtx);
        expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({ documentType: 'NIT', documentId: '901123456' });
      });

      it('con el dígito malo responde 400 INVALID_NIT_DV, no busca duplicados y no crea nada', async () => {
        const error: any = await service
          .create({ name: 'Acme', documentType: 'NIT', documentId: '901.123.456-7' }, operadorCtx)
          .catch((e) => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getResponse()).toEqual({
          code: 'INVALID_NIT_DV',
          field: 'documentId',
          message: 'El dígito de verificación no coincide con el NIT. Revisa el número.',
        });
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(prisma.customer.create).not.toHaveBeenCalled();
      });

      it('el tipo por defecto (sin documentType) también es NIT y valida el dígito', async () => {
        const error: any = await service.create({ name: 'Acme', documentId: '901123456-7' }, operadorCtx).catch((e) => e);
        expect(error.getResponse()).toMatchObject({ code: 'INVALID_NIT_DV' });
      });

      it('sin dígito acepta sin error', async () => {
        await service.create({ name: 'Acme', documentType: 'NIT', documentId: '901123456' }, operadorCtx);
        expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({ documentId: '901123456' });
      });

      it('10 dígitos cuyo último dígito es el DV calculado se leen como NIT con DV y detectan el duplicado de la base', async () => {
        prisma.$queryRaw.mockResolvedValue([match()]);
        const error: any = await service.create({ name: 'Acme', documentId: '9011234561' }, operadorCtx).catch((e) => e);
        expect(sqlValues(0)).toEqual(expect.arrayContaining(['901123456']));
        expect(error.getResponse()).toMatchObject({ code: 'CUSTOMER_DUPLICATE', field: 'documentId' });
      });

      it('10 dígitos que NO coinciden con el DV calculado se guardan completos como base, sin error', async () => {
        await service.create({ name: 'Acme', documentId: '9011234567' }, operadorCtx);
        expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({ documentType: 'NIT', documentId: '9011234567' });
      });

      it('una cédula no se calcula ni se valida: 10 dígitos y guion se tratan como siempre', async () => {
        await service.create({ name: 'Ana', documentType: 'CC', documentId: '9011234561' }, operadorCtx);
        expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({ documentType: 'CC', documentId: '9011234561' });
        prisma.customer.create.mockClear();
        await service.create({ name: 'Ana', documentType: 'CC', documentId: '901123456-7' }, operadorCtx);
        expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({ documentType: 'CC', documentId: '901123456' });
      });

      it('edición: dígito malo 400 INVALID_NIT_DV sin escribir; sin dígito o con el bueno se acepta', async () => {
        prisma.customer.findUnique.mockResolvedValue({
          id: 'c1', isActive: true, code: 'CL-0001', name: 'Acme', documentType: 'NIT', documentId: '900111222', ownerId: 'w-1', status: 'CLIENTE',
        });
        prisma.customer.update.mockResolvedValue({ id: 'c1' });
        grants.grantsForUser.mockResolvedValue([
          { sourceId: 's-1', actionId: 'customers:read', scope: 'own' },
          { sourceId: 's-1', actionId: 'customers:edit', scope: 'own' },
        ]);
        const writeCtx = { userId: 'w-1', roles: ['Admin Comercial'] };
        const error: any = await service.update('c1', { documentId: '900.111.222-3' }, writeCtx).catch((e) => e);
        expect(error.getResponse()).toMatchObject({ code: 'INVALID_NIT_DV', field: 'documentId' });
        expect(prisma.customer.update).not.toHaveBeenCalled();
        await service.update('c1', { documentId: '900111222' }, writeCtx);
        await service.update('c1', { documentId: '900111222-1' }, writeCtx);
        expect(prisma.customer.update.mock.calls.map((c: any) => c[0].data.documentId)).toEqual(['900111222', '900111222']);
      });
    });

    describe('documentDv en la lectura', () => {
      it('el detalle y la lista traen el dígito calculado (no guardado) solo para NIT numérico', async () => {
        acl.isListasAdmin.mockReturnValue(true);
        prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, ownerId: 'o', documentType: 'NIT', documentId: '800197268' });
        await expect(service.findOne('c1', adminCtx)).resolves.toMatchObject({ id: 'c1', documentId: '800197268', documentDv: 4 });

        prisma.customer.findMany.mockResolvedValue([
          { id: 'a', documentType: 'NIT', documentId: '800197268' },
          { id: 'b', documentType: 'CC', documentId: '800197268' },
          { id: 'c', documentType: 'NIT', documentId: 'AB123' },
          { id: 'd', documentType: null, documentId: null },
        ]);
        prisma.customer.count.mockResolvedValue(4);
        const { data } = await service.findAll({}, adminCtx);
        expect(data.map((c: any) => c.documentDv)).toEqual([4, null, null, null]);
      });

      it('lo que se guarda no lleva documentDv', async () => {
        await service.create({ name: 'Acme', documentId: '800197268' }, operadorCtx);
        expect(prisma.customer.create.mock.calls[0][0].data).not.toHaveProperty('documentDv');
      });
    });

    describe('edición', () => {
      const writeCtx = { userId: 'w-1', roles: ['Admin Comercial'] };
      beforeEach(() => {
        grants.grantsForUser.mockResolvedValue([
          { sourceId: 's-1', actionId: 'customers:read', scope: 'own' },
          { sourceId: 's-1', actionId: 'customers:edit', scope: 'own' },
        ]);
        prisma.customer.findUnique.mockResolvedValue({
          id: 'c1', isActive: true, code: 'CL-0001', name: 'Acme', email: 'old@acme.test', city: 'Bogotá D.C.',
          documentType: 'NIT', documentId: '900111222', ownerId: 'w-1', status: 'CLIENTE',
        });
        prisma.customer.update.mockResolvedValue({ id: 'c1' });
      });

      it('un cliente antiguo con ciudad en texto libre se edita sin tocar la ciudad', async () => {
        await service.update('c1', { name: 'Acme SAS', city: 'Bogotá D.C.' }, writeCtx);
        const data = prisma.customer.update.mock.calls[0][0].data;
        expect(data).toMatchObject({ name: 'Acme SAS' });
        expect(data).not.toHaveProperty('city');
      });

      it('si la ciudad cambia debe ser DIVIPOLA: texto libre 400, código válido se guarda', async () => {
        await expect(service.update('c1', { city: 'Medellín' }, writeCtx)).rejects.toThrow(BadRequestException);
        expect(prisma.customer.update).not.toHaveBeenCalled();
        await service.update('c1', { city: '05001' }, writeCtx);
        expect(prisma.customer.update.mock.calls[0][0].data.city).toBe('05001');
      });

      it('cambiar el NIT a uno que ya tiene otro cliente da 409 y excluye al propio cliente de la búsqueda', async () => {
        prisma.$queryRaw.mockResolvedValue([match({ id: 'otro', ownerId: 'x' })]);
        const error: any = await service.update('c1', { documentId: '901.123.456-1' }, writeCtx).catch((e) => e);
        expect(error.getResponse()).toMatchObject({ code: 'CUSTOMER_DUPLICATE', field: 'documentId' });
        expect(sqlValues(0)).toEqual(expect.arrayContaining(['901123456', 'c1']));
        expect(prisma.customer.update).not.toHaveBeenCalled();
      });

      it('reescribir el mismo NIT con otro formato no busca duplicados', async () => {
        await service.update('c1', { documentId: '900.111.222-1' }, writeCtx);
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
      });
    });
  });

});
