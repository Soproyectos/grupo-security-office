import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SalesTargetsService } from './sales-targets.service';
import { createPrismaMock } from '../../../__test__/mocks/prisma.mock';

/** Concesiones por defecto de un Supervisor con paquete (edita su equipo):
 *  los specs previos de escritura siguen verdes y los nuevos de COM-04 las
 *  sustituyen con `grants.grantsForUser.mockResolvedValue(...)`. */
const EQUIPO_READ_EDIT = [
  { sourceId: 's-1', actionId: 'targets:read', scope: 'team' as const },
  { sourceId: 's-1', actionId: 'targets:edit', scope: 'team' as const },
];

describe('SalesTargetsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let acl: { isListasAdmin: jest.Mock };
  let hierarchy: {
    getSubordinateIds: jest.Mock;
    assertCanViewUser: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let grants: { grantsForUser: jest.Mock };
  let service: SalesTargetsService;

  const adminCtx = { userId: 'admin-1', roles: ['Super Admin'] };
  const supervisorCtx = { userId: 'sup-1', roles: ['Supervisor'] };
  const operadorCtx = { userId: 'op-1', roles: ['Operador'] };

  beforeEach(() => {
    prisma = createPrismaMock();
    acl = { isListasAdmin: jest.fn().mockReturnValue(false) };
    hierarchy = {
      getSubordinateIds: jest.fn().mockResolvedValue(['op-1', 'sub-1']),
      assertCanViewUser: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    grants = { grantsForUser: jest.fn().mockResolvedValue(EQUIPO_READ_EDIT) };
    service = new SalesTargetsService(
      prisma as any,
      acl as any,
      hierarchy as any,
      audit as any,
      grants as any,
    );
  });

  describe('findAll', () => {
    it('un vendedor con grants y alcance team consulta metas de su equipo', async () => {
      await service.findAll({ userId: 'op-1' }, { userId: 'seller', roles: ['Vendedor'] });
      expect(prisma.salesTarget.findMany).toHaveBeenCalled();
      expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('seller');
      expect(hierarchy.assertCanViewUser).not.toHaveBeenCalled();
    });

    it('sin userId, scope team limita los resultados a la jerarquía actual', async () => {
      prisma.salesTarget.findMany.mockResolvedValue([]);

      await service.findAll({}, operadorCtx);

      expect(prisma.salesTarget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: { in: ['op-1', 'sub-1'] } } }),
      );
      expect(hierarchy.assertCanViewUser).not.toHaveBeenCalled();
    });

    it('para una meta ajena la concesión team y la jerarquía actual autorizan la lectura', async () => {
      prisma.salesTarget.findMany.mockResolvedValue([]);

      await service.findAll({ userId: 'op-1' }, supervisorCtx);

      expect(hierarchy.assertCanViewUser).not.toHaveBeenCalled();
      expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('sup-1');
    });

    it('admin (Super Admin) sin userId ve todas las metas (sin filtro por usuario)', async () => {
      acl.isListasAdmin.mockReturnValue(true);
      prisma.salesTarget.findMany.mockResolvedValue([]);

      await service.findAll({}, adminCtx);

      expect(prisma.salesTarget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(hierarchy.assertCanViewUser).not.toHaveBeenCalled();
    });

    it('filtra por rango de periodos from/to (YYYY-MM, ambos inclusivos)', async () => {
      prisma.salesTarget.findMany.mockResolvedValue([]);

      await service.findAll({ from: '2026-01', to: '2026-06' }, operadorCtx);

      expect(prisma.salesTarget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            period: {
              gte: new Date(Date.UTC(2026, 0, 1)),
              lte: new Date(Date.UTC(2026, 5, 1)),
            },
          }),
        }),
      );
    });
  });

  describe('upsert', () => {
    const dto = {
      userId: 'op-1',
      period: '2026-09',
      amount: '150000000',
      currency: 'cop',
      notes: 'Meta Q3',
    };

    it('persiste con upsert por (userId, period) y period como dia 1 del mes', async () => {
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await service.upsert({ ...dto }, supervisorCtx);

      const expectedPeriod = new Date(Date.UTC(2026, 8, 1));
      expect(prisma.salesTarget.upsert).toHaveBeenCalledWith({
        where: { userId_period: { userId: 'op-1', period: expectedPeriod } },
        create: expect.objectContaining({
          userId: 'op-1',
          period: expectedPeriod,
          amount: 150000000,
          currency: 'COP',
          notes: 'Meta Q3',
          setById: 'sup-1',
        }),
        update: expect.objectContaining({
          amount: 150000000,
          currency: 'COP',
          setById: 'sup-1',
        }),
      });
    });

    it('un ancestro jerarquico (subordinado en getSubordinateIds) puede fijar la meta', async () => {
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await expect(
        service.upsert({ ...dto, userId: 'sub-1' }, supervisorCtx),
      ).resolves.toEqual({ id: 'st-1' });
      expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('sup-1');
    });

    it('un editor team sin el dueño en su jerarquía recibe ForbiddenException', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['otro-usuario']);

      await expect(service.upsert({ ...dto }, supervisorCtx)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.salesTarget.upsert).not.toHaveBeenCalled();
    });

    it('un usuario con targets:edit(own) puede fijar su propia meta', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's-own', actionId: 'targets:read', scope: 'own' },
        { sourceId: 's-own', actionId: 'targets:edit', scope: 'own' },
      ]);
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'own-target' });
      await expect(service.upsert({ ...dto, userId: 'op-1' }, operadorCtx)).resolves.toEqual({ id: 'own-target' });
    });

    it('Super Admin puede fijar la meta de cualquier usuario sin consultar jerarquia', async () => {
      acl.isListasAdmin.mockReturnValue(true);
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await service.upsert({ ...dto }, adminCtx);

      expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
      expect(prisma.salesTarget.upsert).toHaveBeenCalled();
    });

    it.each(['Vendedor', 'Admin Comercial'])('el rol %s no bloquea una concesión válida', async (role) => {
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-role' });
      await expect(service.upsert(dto, { userId: 'other', roles: [role] })).resolves.toEqual({ id: 'st-role' });
      expect(prisma.salesTarget.upsert).toHaveBeenCalled();
    });

    it('rechaza amount negativo o no numerico con BadRequestException', async () => {
      await expect(
        service.upsert({ ...dto, amount: '-5' }, supervisorCtx),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.upsert({ ...dto, amount: 'abc' }, supervisorCtx),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.salesTarget.upsert).not.toHaveBeenCalled();
    });
  });

  // ---------- COM-04 §5.1 — lector no escribe; editor no cambia ajenos ----------

  describe('COM-04 alcance de escritura por concesión targets:edit (aceptación 1)', () => {
    const dto = {
      userId: 'op-1',
      period: '2026-09',
      amount: '150000000',
      currency: 'cop',
      notes: 'Meta Q3',
    };

    it('lector con targets:read(team) pero SIN targets:edit → 403 y CERO escrituras', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's-r', actionId: 'targets:read', scope: 'team' },
      ]);

      await expect(service.upsert({ ...dto }, supervisorCtx)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.salesTarget.findUnique).not.toHaveBeenCalled();
      expect(prisma.salesTarget.upsert).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('editor con targets:edit(own) NO cambia integrantes de su equipo → 403 y CERO escrituras', async () => {
      // La concesión `own` impide tocar a un integrante ajeno, sin depender del rol.
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's-r', actionId: 'targets:read', scope: 'team' },
        { sourceId: 's-e', actionId: 'targets:edit', scope: 'own' },
      ]);

      await expect(
        service.upsert({ ...dto, userId: 'sub-1' }, supervisorCtx),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.salesTarget.upsert).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('editor con targets:edit(team) sobre integrante FUERA de su equipo → 403 y CERO escrituras', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['sup-1', 'sub-1']);
      grants.grantsForUser.mockResolvedValue(EQUIPO_READ_EDIT);

      await expect(
        service.upsert({ ...dto, userId: 'ajeno-1' }, supervisorCtx),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.salesTarget.upsert).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('editor con targets:edit(team) sobre integrante DE su equipo → escribe (regresión)', async () => {
      prisma.salesTarget.findUnique.mockResolvedValue(null);
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await expect(
        service.upsert({ ...dto, userId: 'sub-1' }, supervisorCtx),
      ).resolves.toEqual({ id: 'st-1' });
      expect(prisma.salesTarget.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('COM-04 alcance de lectura targets:read (regla 2)', () => {
    it('meta ajena sin targets:read(team) → 403 y NO consulta (el equipo exige asignación)', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's-r', actionId: 'targets:read', scope: 'own' },
      ]);

      await expect(
        service.findAll({ userId: 'op-1' }, supervisorCtx),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.salesTarget.findMany).not.toHaveBeenCalled();
    });

    it('meta ajena con targets:read(team) y jerarquía → consulta (regresión)', async () => {
      prisma.salesTarget.findMany.mockResolvedValue([]);

      await service.findAll({ userId: 'op-1' }, supervisorCtx);

      expect(hierarchy.assertCanViewUser).not.toHaveBeenCalled();
      expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('sup-1');
      expect(prisma.salesTarget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'op-1' } }),
      );
    });

    it('la meta propia también requiere targets:read y se deniega al revocar el grant', async () => {
      grants.grantsForUser.mockResolvedValue([]);
      prisma.salesTarget.findMany.mockResolvedValue([]);

      await expect(service.findAll({}, operadorCtx)).rejects.toThrow(ForbiddenException);
      expect(prisma.salesTarget.findMany).not.toHaveBeenCalled();
      expect(hierarchy.assertCanViewUser).not.toHaveBeenCalled();
      expect(grants.grantsForUser).toHaveBeenCalledWith('op-1');
    });
  });

  // ---------- COM-04 §5.2 — auditoría idempotente (una operación = 1 evento) ----------

  describe('COM-04 auditoría antes/después con idempotencia (aceptación 2)', () => {
    const dto = {
      userId: 'op-1',
      period: '2026-09',
      amount: '150000000',
      currency: 'cop',
      notes: 'Meta Q3',
    };
    const period = new Date(Date.UTC(2026, 8, 1));

    it('doble POST idéntico → 2 upserts con la MISMA clave, 1 fila y SOLO 1 auditoría', async () => {
      prisma.salesTarget.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'st-1',
          amount: 150000000,
          currency: 'COP',
          notes: 'Meta Q3',
        });
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await service.upsert({ ...dto }, supervisorCtx);
      await service.upsert({ ...dto }, supervisorCtx);

      expect(prisma.salesTarget.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.salesTarget.upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { userId_period: { userId: 'op-1', period } },
        }),
      );
      expect(prisma.salesTarget.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { userId_period: { userId: 'op-1', period } },
        }),
      );
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'target_upsert',
          entity: 'SalesTarget',
          entityId: 'st-1',
          userId: 'sup-1',
        }),
      );
    });

    it('POST con cambio → 1 fila y 1 auditoría con antes/después (amount/currency)', async () => {
      prisma.salesTarget.findUnique.mockResolvedValue({
        id: 'st-1',
        amount: 100000,
        currency: 'COP',
        notes: null,
      });
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await service.upsert({ ...dto, amount: '250000000' }, supervisorCtx);

      expect(prisma.salesTarget.upsert).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith({
        userId: 'sup-1',
        action: 'target_upsert',
        entity: 'SalesTarget',
        entityId: 'st-1',
        oldValues: { amount: 100000, currency: 'COP' },
        newValues: { amount: 250000000, currency: 'COP', notesChanged: true },
      });
    });

    it('reintento sin cambios de meta → reutiliza el upsert y NO audita de nuevo', async () => {
      prisma.salesTarget.findUnique.mockResolvedValue({
        id: 'st-1',
        amount: 150000000,
        currency: 'COP',
        notes: 'Meta Q3',
      });
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await service.upsert({ ...dto }, supervisorCtx);

      expect(prisma.salesTarget.upsert).toHaveBeenCalledTimes(1);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('crear (sin fila previa) audita con antes nulo y después completo', async () => {
      prisma.salesTarget.findUnique.mockResolvedValue(null);
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-9' });

      await service.upsert({ ...dto }, supervisorCtx);

      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'SalesTarget',
          entityId: 'st-9',
          oldValues: { amount: null, currency: null },
          newValues: { amount: 150000000, currency: 'COP', notesChanged: true },
        }),
      );
    });

    it('la auditoría guarda presencia/ausencia de notas, jamás su contenido (sin PII)', async () => {
      prisma.salesTarget.findUnique.mockResolvedValue(null);
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await service.upsert({ ...dto, notes: 'Cliente confidencial XYZ' }, supervisorCtx);

      expect(audit.log).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0][0];
      expect(JSON.stringify(entry)).not.toContain('confidencial');
      expect(entry.newValues.notesChanged).toBe(true);
      expect('notes' in entry.newValues).toBe(false);
      expect('notes' in (entry.oldValues ?? {})).toBe(false);
    });

    it('sin fila previa y payload rechazado (amount inválido) NO audita', async () => {
      await expect(
        service.upsert({ ...dto, amount: '-1' }, supervisorCtx),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.salesTarget.findUnique).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  // ---------- COM-04 regla 3 — moneda explícita y meta ≠ avance ----------

  describe('COM-04 moneda explícita (regla 3)', () => {
    const dto = {
      userId: 'op-1',
      period: '2026-09',
      amount: '150000000',
      currency: 'cop',
      notes: 'Meta Q3',
    };

    it('currency fuera del catálogo permitido → 400 sin escrituras ni auditoría', async () => {
      await expect(
        service.upsert({ ...dto, currency: 'MXN' }, supervisorCtx),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.salesTarget.findUnique).not.toHaveBeenCalled();
      expect(prisma.salesTarget.upsert).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('currency en minúsculas se normaliza al catálogo antes de persistir', async () => {
      prisma.salesTarget.findUnique.mockResolvedValue(null);
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await service.upsert({ ...dto, currency: 'usd' }, supervisorCtx);

      expect(prisma.salesTarget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ currency: 'USD' }),
        }),
      );
    });

    it('periodo se persiste como día 1 con la lógica Bogotá existente', async () => {
      prisma.salesTarget.findUnique.mockResolvedValue(null);
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await service.upsert({ ...dto, period: '2026-10' }, supervisorCtx);

      expect(prisma.salesTarget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_period: {
              userId: 'op-1',
              period: new Date(Date.UTC(2026, 9, 1)),
            },
          },
        }),
      );
    });
  });

  describe('COM-04 meta ≠ avance facturado (regla 3)', () => {
    it('findAll devuelve la meta persistida sin campos de avance/facturado', async () => {
      const row = {
        id: 'st-1',
        userId: 'op-1',
        period: new Date(Date.UTC(2026, 8, 1)),
        amount: 150000000,
        currency: 'COP',
        notes: null,
        setById: 'sup-1',
      };
      prisma.salesTarget.findMany.mockResolvedValue([row]);

      const rows = await service.findAll({}, operadorCtx);

      expect(rows).toEqual([row]);
      const keys = Object.keys(rows[0]);
      expect(keys).not.toContain('avance');
      expect(keys).not.toContain('invoiced');
      expect(keys).not.toContain('progressPercent');
      expect(Number(rows[0].amount)).toBe(150000000);
    });

    it('upsert devuelve la fila persistida (fuente real), no un cálculo derivado', async () => {
      const persisted = {
        id: 'st-1',
        userId: 'op-1',
        period: new Date(Date.UTC(2026, 8, 1)),
        amount: 150000000,
        currency: 'COP',
        setById: 'sup-1',
      };
      prisma.salesTarget.findUnique.mockResolvedValue(null);
      prisma.salesTarget.upsert.mockResolvedValue(persisted);

      await expect(
        service.upsert(
          {
            userId: 'op-1',
            period: '2026-09',
            amount: '150000000',
            currency: 'cop',
            notes: 'Meta Q3',
          },
          supervisorCtx,
        ),
      ).resolves.toBe(persisted);
    });
  });
});
