import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './promotion.dto';

const FULL_GRANTS = ['commercialPromotions:read', 'commercialPromotions:create', 'commercialPromotions:edit', 'commercialPromotions:publish', 'commercialPromotions:withdraw'].map((actionId, i) => ({ sourceId: `g${i}`, actionId, scope: 'global' }));

describe('sales promotion announcements', () => {
  const supervisor = { userId: 'supervisor-a', roles: ['Supervisor'] };
  const admin = { userId: 'admin', roles: ['Super Admin'] };
  const seller = { userId: 'seller-a', roles: ['Vendedor'] };
  const dto = { title: 'Oferta de prueba', message: 'Condiciones de prueba.', startsAt: '2026-10-05T12:00:00Z', endsAt: '2026-10-10T12:00:00Z' };
  let prisma: any, service: PromotionsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T15:00:00Z'));
    prisma = { salesPromotion: { findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'notice-1', audience: 'TEAM' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'notice-1', createdById: 'supervisor-a', publishedAt: null, endsAt: new Date('2026-10-20T12:00:00Z') }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'notice-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) }, $transaction: jest.fn(), $queryRaw: jest.fn().mockResolvedValue([{ id: 'supervisor-a' }]) };
    prisma.$transaction.mockImplementation(fn => fn(prisma));
    // Harness con concesiones explícitas; casos sin acceso fijan sus grants.
    service = new PromotionsService(prisma, { grantsForUser: jest.fn().mockResolvedValue(FULL_GRANTS) } as never);
  });
  afterEach(() => jest.useRealTimers());

  it('el vendedor recibe globales y su equipo; vigencia se filtra en servidor', async () => {
    await service.current(seller);
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.any(Array), 'seller-a');
    expect(prisma.salesPromotion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { publishedAt: { not: null }, isActive: true, startsAt: { lte: new Date('2026-10-05T15:00:00Z') }, endsAt: { gt: new Date('2026-10-05T15:00:00Z') },
        OR: [{ audience: 'GLOBAL' }, { audience: 'TEAM', createdById: { in: ['seller-a', 'supervisor-a'] } }] },
      select: { id: true, title: true, message: true, startsAt: true, endsAt: true, flyer: true },
    }));
  });

  it('un vendedor con lectura propia recibe avisos de su supervisor y globales por audiencia', async () => {
    const visible = [{ id: 'team-notice', title: 'Equipo' }, { id: 'global-notice', title: 'Todos' }];
    prisma.salesPromotion.findMany.mockResolvedValue(visible);
    service = new PromotionsService(prisma, { grantsForUser: jest.fn().mockResolvedValue([
      { sourceId: 'seller-grant', actionId: 'commercialPromotions:read', scope: 'own' },
    ]) } as never);
    await expect(service.current(seller)).resolves.toEqual(visible);
    expect(prisma.salesPromotion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [{ audience: 'GLOBAL' }, { audience: 'TEAM', createdById: { in: ['seller-a', 'supervisor-a'] } }],
      }),
    }));
  });

  it('identidad ausente nunca produce una lectura global', async () => {
    await expect(service.current({ roles: ['Vendedor'] })).rejects.toThrow(ForbiddenException);
    expect(prisma.salesPromotion.findMany).not.toHaveBeenCalled();
  });

  it.each(['Vendedor', 'Admin Comercial', 'Operador', 'Consulta'])('%s conserva acceso según grants vigentes', async role => {
    const ctx = { userId: 'user', roles: [role] };
    await expect(service.publish(dto, ctx)).resolves.toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('una concesión de equipo publica solo para el equipo y se audita', async () => {
    service = new PromotionsService(prisma, { grantsForUser: jest.fn().mockResolvedValue(FULL_GRANTS.map(grant => ({ ...grant, scope: 'team' }))) } as never);
    await service.publish(dto, supervisor);
    expect(prisma.salesPromotion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ createdById: 'supervisor-a', audience: 'TEAM' }) });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entity: 'SalesPromotion', entityId: 'notice-1', userId: 'supervisor-a' }) });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('Super Admin publica para todos', async () => {
    await service.publish(dto, admin);
    expect(prisma.salesPromotion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ createdById: 'admin', audience: 'GLOBAL' }) });
  });

  it('una concesión propia limita la gestión y Super Admin puede ver todos', async () => {
    service = new PromotionsService(prisma, { grantsForUser: jest.fn().mockResolvedValue(FULL_GRANTS.map(grant => ({ ...grant, scope: 'own' }))) } as never);
    await service.manage(supervisor);
    expect(prisma.salesPromotion.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { createdById: { in: ['supervisor-a'] } } }));
    await service.manage(admin);
    expect(prisma.salesPromotion.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });

  it('supervisor retira sin poder modificar avisos de otro autor', async () => {
    prisma.salesPromotion.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.withdraw('other-notice', supervisor)).rejects.toThrow(NotFoundException);
    expect(prisma.salesPromotion.updateMany).toHaveBeenCalledWith({ where: { id: 'other-notice' }, data: { isActive: false } });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('Super Admin puede retirar un aviso y conserva historial', async () => {
    await service.withdraw('notice-1', admin);
    expect(prisma.salesPromotion.updateMany).toHaveBeenCalledWith({ where: { id: 'notice-1' }, data: { isActive: false } });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it.each([
    { startsAt: 'invalid' }, { endsAt: '2026-10-05T10:00:00Z' },
    { startsAt: '2026-10-10T12:00:00Z' }, { title: '   ' }, { message: '' },
  ])('rechaza vigencia o texto inválidos antes de publicar: %j', async patch => {
    await expect(service.publish({ ...dto, ...patch }, supervisor)).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('DTO rechaza fechas sin zona horaria y textos excesivos', () => {
    expect(validateSync(plainToInstance(CreatePromotionDto, dto))).toHaveLength(0);
    expect(validateSync(plainToInstance(CreatePromotionDto, { ...dto, startsAt: '2026-10-05', message: 'x'.repeat(2001) })).length).toBeGreaterThan(0);
  });
  it('editar conserva audiencia y autor y aplica el alcance concedido', async () => {
    await service.edit('notice-1', dto, supervisor);
    expect(prisma.salesPromotion.updateMany).toHaveBeenCalledWith({
      where: { id: 'notice-1' },
      data: { title: dto.title, message: dto.message, startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt) },
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
    await service.edit('notice-1', dto, admin);
    expect(prisma.salesPromotion.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'notice-1' } }));
  });

  it('no edita ni adjunta flyer a avisos ajenos y no crea auditoría', async () => {
    prisma.salesPromotion.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.edit('other', dto, supervisor)).rejects.toThrow(NotFoundException);
    await expect(service.setFlyer('other', undefined, supervisor)).rejects.toThrow(NotFoundException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('guarda un PNG privado y permite retirarlo sin borrar el aviso', async () => {
    const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
    const saved = await service.setFlyer('notice-1', { buffer, mimetype: 'image/png' }, supervisor);
    expect(saved.flyer).toBe('data:image/png;base64,' + buffer.toString('base64'));
    expect(prisma.salesPromotion.updateMany).toHaveBeenLastCalledWith({ where: { id: 'notice-1' }, data: { flyer: saved.flyer } });
    await service.setFlyer('notice-1', undefined, supervisor);
    expect(prisma.salesPromotion.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { flyer: null } }));
  });

  it.each([
    { buffer: Buffer.from('<svg onload="bad()"/>'), mimetype: 'image/svg+xml' },
    { buffer: Buffer.from('not an image'), mimetype: 'image/png' },
    { buffer: Buffer.alloc(2 * 1024 * 1024 + 1), mimetype: 'image/jpeg' },
  ])('rechaza imágenes inválidas o demasiado grandes', async file => {
    await expect(service.setFlyer('notice-1', file, supervisor)).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});


// ─── COM-08 backend — borrador, publicación explícita, permisos por concesión ───
describe('COM-08 — preparar/publicar/retirar con concesiones', () => {
  const supervisor = { userId: 'supervisor-a', roles: ['Supervisor'] };
  const dto = {
    title: 'Aviso COM-08',
    message: 'Condiciones COM-08.',
    startsAt: '2026-10-05T12:00:00Z',
    endsAt: '2026-10-20T12:00:00Z',
  };
  let prisma: any;
  let grants: { grantsForUser: jest.Mock };
  let service: PromotionsService;

  const build = (grantRows: any[]) => {
    grants.grantsForUser.mockResolvedValue(grantRows);
    return new PromotionsService(prisma, grants as any);
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T15:00:00Z'));
    prisma = {
      salesPromotion: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'notice-1', createdById: 'supervisor-a', publishedAt: null, endsAt: new Date('2026-10-20T12:00:00Z') }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'notice-1' }),
        create: jest.fn().mockResolvedValue({ id: 'notice-1', audience: 'TEAM' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(fn => fn(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    // ENMIENDA: defaults = concesiones completas; los tests de negacion pasan build([...]) explicito.
    grants = { grantsForUser: jest.fn().mockResolvedValue(FULL_GRANTS) };
    service = new PromotionsService(prisma, grants as any);
  });
  afterEach(() => jest.useRealTimers());

  it('crear deja BORRADOR: publishedAt null y el GET público lo excluye', async () => {
    await service.publish(dto, supervisor);
    expect(prisma.salesPromotion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ publishedAt: null }),
    });
    await service.current(supervisor);
    const where = prisma.salesPromotion.findMany.mock.calls.at(-1)[0].where;
    expect(where.publishedAt).toEqual({ not: null });
  });

  it('current acredita el filtro de vencidos y de equipo ajeno (aceptación 1)', async () => {
    await service.current(supervisor);
    const where = prisma.salesPromotion.findMany.mock.calls.at(-1)[0].where;
    expect(where.endsAt).toEqual({ gt: new Date('2026-10-05T15:00:00Z') });
    expect(where.OR).toEqual([
      { audience: 'GLOBAL' },
      { audience: 'TEAM', createdById: { in: ['supervisor-a'] } },
    ]);
  });

  it('publishExisting: publica el borrador con auditoría antes/después', async () => {
    prisma.salesPromotion.findUnique.mockResolvedValue({
      id: 'notice-1',
      publishedAt: null,
      endsAt: new Date('2026-10-20T12:00:00Z'),
      createdById: 'supervisor-a',
    });
    await service.publishExisting('notice-1', supervisor);
    expect(prisma.salesPromotion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'notice-1', publishedAt: null }),
        data: expect.objectContaining({ publishedAt: new Date('2026-10-05T15:00:00Z') }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'publish' }) }),
    );
  });

  it('publish sin commercialPromotions:publish con grants vigentes → 403 sin escrituras', async () => {
    const s = build([{ sourceId: 's1', actionId: 'commercialPromotions:read', scope: 'team' }]);
    await expect(s.publishExisting('notice-1', supervisor)).rejects.toThrow(ForbiddenException);
    await expect(s.publish(dto, supervisor)).rejects.toThrow(ForbiddenException);
    expect(prisma.salesPromotion.updateMany).not.toHaveBeenCalled();
    expect(prisma.salesPromotion.create).not.toHaveBeenCalled();
  });

  it('crear exige commercialPromotions:create cuando hay grants', async () => {
    const s = build([{ sourceId: 's1', actionId: 'commercialPromotions:read', scope: 'team' }]);
    await expect(s.publish(dto, supervisor)).rejects.toThrow(ForbiddenException);
    const ok = build([
      { sourceId: 's1', actionId: 'commercialPromotions:read', scope: 'team' },
      { sourceId: 's1', actionId: 'commercialPromotions:create', scope: 'team' },
    ]);
    await ok.publish(dto, supervisor);
    expect(prisma.salesPromotion.create).toHaveBeenCalled();
  });

  it('publicar dos veces → 409 (transición inválida, patrón COM-03 F7)', async () => {
    prisma.salesPromotion.findUnique.mockResolvedValue({
      id: 'notice-1',
      publishedAt: new Date('2026-10-04T10:00:00Z'),
      endsAt: new Date('2026-10-20T12:00:00Z'),
      createdById: 'supervisor-a',
    });
    await expect(service.publishExisting('notice-1', supervisor)).rejects.toThrow('ya está publicado');
    expect(prisma.salesPromotion.updateMany).not.toHaveBeenCalled();
  });

  it('publicar un aviso de vigencia vencida → 400 sin publicar', async () => {
    prisma.salesPromotion.findUnique.mockResolvedValue({
      id: 'notice-1',
      publishedAt: null,
      endsAt: new Date('2026-10-04T12:00:00Z'),
      createdById: 'supervisor-a',
    });
    await expect(service.publishExisting('notice-1', supervisor)).rejects.toThrow(BadRequestException);
    expect(prisma.salesPromotion.updateMany).not.toHaveBeenCalled();
  });

  it('editar NO publica: el update no lleva publishedAt (preparar no publica)', async () => {
    await service.edit('notice-1', dto, supervisor);
    const data = prisma.salesPromotion.updateMany.mock.calls.at(-1)[0].data;
    expect(data).not.toHaveProperty('publishedAt');
  });

  it('retirar exige commercialPromotions:withdraw con grants vigentes', async () => {
    const s = build([{ sourceId: 's1', actionId: 'commercialPromotions:read', scope: 'team' }]);
    await expect(s.withdraw('notice-1', supervisor)).rejects.toThrow(ForbiddenException);
    expect(prisma.salesPromotion.updateMany).not.toHaveBeenCalled();
    const ok = build([
      { sourceId: 's1', actionId: 'commercialPromotions:read', scope: 'team' },
      { sourceId: 's1', actionId: 'commercialPromotions:withdraw', scope: 'team' },
    ]);
    await ok.withdraw('notice-1', supervisor);
    expect(prisma.salesPromotion.updateMany).toHaveBeenCalled();
  });

  it('lectura sin commercialPromotions:read con grants → lista vacía SIN consultar (J2)', async () => {
    const s = build([{ sourceId: 's1', actionId: 'customers:read', scope: 'own' }]);
    const rows = await s.current(supervisor);
    expect(rows).toEqual([]);
    expect(prisma.salesPromotion.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('mismo cargo recibe solo recursos cubiertos por el alcance de lectura', async () => {
    prisma.salesPromotion.findMany.mockResolvedValue([
      { id: 'own', createdById: 'supervisor-a' },
      { id: 'other', createdById: 'outside-team' },
    ]);
    const ownOnly = build([{ sourceId: 's-own', actionId: 'commercialPromotions:read', scope: 'own' }]);
    await expect(ownOnly.manage(supervisor)).resolves.toEqual([{ id: 'own', createdById: 'supervisor-a' }]);
    const team = build([{ sourceId: 's-team', actionId: 'commercialPromotions:read', scope: 'team' }]);
    await expect(team.manage(supervisor)).resolves.toHaveLength(1);
  });

  it('manage sin grant de lectura devuelve [] sin consultar jerarquía ni promociones', async () => {
    const s = build([{ sourceId: 's-other', actionId: 'customers:read', scope: 'team' }]);
    await expect(s.manage(supervisor)).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.salesPromotion.findMany).not.toHaveBeenCalled();
  });

  it('ENMIENDA 2026-10-18: sin concesiones Supervisor es 403 (el rol no reactiva acceso)', async () => {
    const s = build([]);
    await expect(s.publish(dto, supervisor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.salesPromotion.create).not.toHaveBeenCalled();
  });

  it('ENMIENDA: Super Admin conserva acceso sin concesiones (unica excepcion explicita)', async () => {
    const s = build([]);
    await s.publish(dto, { userId: 'sa-1', roles: ['Super Admin'] });
    expect(prisma.salesPromotion.create).toHaveBeenCalled();
  });

  it('ENMIENDA: retirar todas las concesiones con la misma identidad deniega lo siguiente', async () => {
    const s = build(FULL_GRANTS);
    await s.publish(dto, supervisor);
    grants.grantsForUser.mockResolvedValue([]);
    await expect(s.publish(dto, supervisor)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
