import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './promotion.dto';

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
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'notice-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) }, $transaction: jest.fn(), $queryRaw: jest.fn().mockResolvedValue([{ id: 'supervisor-a' }]) };
    prisma.$transaction.mockImplementation(fn => fn(prisma));
    service = new PromotionsService(prisma);
  });
  afterEach(() => jest.useRealTimers());

  it('el vendedor recibe globales y su equipo; vigencia se filtra en servidor', async () => {
    await service.current(seller);
    expect(prisma.$queryRaw).toHaveBeenCalledWith(expect.any(Array), 'seller-a');
    expect(prisma.salesPromotion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, startsAt: { lte: new Date('2026-10-05T15:00:00Z') }, endsAt: { gt: new Date('2026-10-05T15:00:00Z') },
        OR: [{ audience: 'GLOBAL' }, { audience: 'TEAM', createdById: { in: ['seller-a', 'supervisor-a'] } }] },
      select: { id: true, title: true, message: true, startsAt: true, endsAt: true, flyer: true },
    }));
  });

  it('identidad ausente nunca produce una lectura global', async () => {
    await expect(service.current({ roles: ['Vendedor'] })).rejects.toThrow(ForbiddenException);
    expect(prisma.salesPromotion.findMany).not.toHaveBeenCalled();
  });

  it.each(['Vendedor', 'Admin Comercial', 'Operador', 'Consulta'])('%s no publica ni gestiona ni retira', async role => {
    const ctx = { userId: 'user', roles: [role] };
    await expect(service.publish(dto, ctx)).rejects.toThrow(ForbiddenException);
    await expect(service.manage(ctx)).rejects.toThrow(ForbiddenException);
    await expect(service.edit('notice-1', dto, ctx)).rejects.toThrow(ForbiddenException);
    await expect(service.setFlyer('notice-1', undefined, ctx)).rejects.toThrow(ForbiddenException);
    await expect(service.withdraw('notice-1', ctx)).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('el supervisor publica solo para su equipo y se audita en la transacción', async () => {
    await service.publish(dto, supervisor);
    expect(prisma.salesPromotion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ createdById: 'supervisor-a', audience: 'TEAM' }) });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entity: 'SalesPromotion', entityId: 'notice-1', userId: 'supervisor-a' }) });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('Super Admin publica para todos', async () => {
    await service.publish(dto, admin);
    expect(prisma.salesPromotion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ createdById: 'admin', audience: 'GLOBAL' }) });
  });

  it('supervisor gestiona solo sus avisos y Super Admin puede gestionar todos', async () => {
    await service.manage(supervisor);
    expect(prisma.salesPromotion.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { createdById: 'supervisor-a' } }));
    await service.manage(admin);
    expect(prisma.salesPromotion.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });

  it('supervisor retira sin poder modificar avisos de otro autor', async () => {
    prisma.salesPromotion.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.withdraw('other-notice', supervisor)).rejects.toThrow(NotFoundException);
    expect(prisma.salesPromotion.updateMany).toHaveBeenCalledWith({ where: { id: 'other-notice', createdById: 'supervisor-a' }, data: { isActive: false } });
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
  it('editar conserva audiencia y autor y aplica propiedad al supervisor', async () => {
    await service.edit('notice-1', dto, supervisor);
    expect(prisma.salesPromotion.updateMany).toHaveBeenCalledWith({
      where: { id: 'notice-1', createdById: 'supervisor-a' },
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
    expect(prisma.salesPromotion.updateMany).toHaveBeenLastCalledWith({ where: { id: 'notice-1', createdById: 'supervisor-a' }, data: { flyer: saved.flyer } });
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

