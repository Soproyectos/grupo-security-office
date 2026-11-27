import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GeoService } from '../../common/geo/geo.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

const prisma: any = {
  zone: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  zoneCity: { deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn((op: any) => op(prisma)),
};
const audit: any = { log: jest.fn() };

const zoneRow = (over: any = {}) => ({
  id: 'z1', name: 'Antioquia', isActive: true, createdAt: new Date('2026-11-25'),
  cities: [{ cityCode: '05001' }], _count: { users: 0 }, ...over,
});

describe('ZonesService', () => {
  let service: ZonesService;
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((op: any) => op(prisma));
    service = new ZonesService(prisma, audit, new GeoService());
  });

  it('lists zones with their cities (name and department) and the count of users', async () => {
    prisma.zone.findMany.mockResolvedValue([zoneRow({ cities: [{ cityCode: '05001' }, { cityCode: '05002' }], _count: { users: 3 } })]);
    const [zone] = await service.list();
    expect(zone).toMatchObject({ id: 'z1', name: 'Antioquia', usersCount: 3 });
    expect(zone.cities).toEqual([
      { code: '05002', name: 'Abejorral', department: 'Antioquia' },
      { code: '05001', name: 'Medellín', department: 'Antioquia' },
    ]);
  });

  describe('create', () => {
    it('creates the zone with its de-duplicated cities and audits', async () => {
      prisma.zone.findFirst.mockResolvedValue(null);
      prisma.zone.create.mockResolvedValue(zoneRow());
      await service.create({ name: 'Antioquia', cityCodes: ['05001', '05001'] }, 'root');
      expect(prisma.zone.create.mock.calls[0][0].data).toEqual({ name: 'Antioquia', cities: { create: [{ cityCode: '05001' }] } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ userId: 'root', action: 'create', entity: 'Zone' }));
    });
    it('rejects invalid city codes with the list of offenders', async () => {
      await expect(service.create({ name: 'X', cityCodes: ['05001', '99999'] }, 'root')).rejects.toThrow('Estas ciudades no son válidas: 99999');
      expect(prisma.zone.create).not.toHaveBeenCalled();
    });
    it('rejects a duplicated name (case-insensitive) with 409', async () => {
      prisma.zone.findFirst.mockResolvedValue({ id: 'other' });
      await expect(service.create({ name: 'antioquia', cityCodes: ['05001'] }, 'root')).rejects.toThrow('Ya existe una zona con ese nombre');
      expect(prisma.zone.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('replaces the whole set of cities in one transaction', async () => {
      prisma.zone.findUnique.mockResolvedValue(zoneRow());
      prisma.zone.findFirst.mockResolvedValue(null);
      prisma.zone.update.mockResolvedValue(zoneRow({ name: 'Eje', cities: [{ cityCode: '66001' }] }));
      await service.update('z1', { name: 'Eje', cityCodes: ['66001'], isActive: false }, 'root');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.zoneCity.deleteMany).toHaveBeenCalledWith({ where: { zoneId: 'z1' } });
      expect(prisma.zoneCity.createMany).toHaveBeenCalledWith({ data: [{ zoneId: 'z1', cityCode: '66001' }] });
      expect(prisma.zone.update.mock.calls[0][0].data).toEqual({ name: 'Eje', isActive: false });
    });
    it('without cityCodes the cities are untouched', async () => {
      prisma.zone.findUnique.mockResolvedValue(zoneRow());
      prisma.zone.update.mockResolvedValue(zoneRow({ isActive: false }));
      await service.update('z1', { isActive: false }, 'root');
      expect(prisma.zoneCity.deleteMany).not.toHaveBeenCalled();
    });
    it('validates cities before touching anything and 404s on a missing zone', async () => {
      prisma.zone.findUnique.mockResolvedValueOnce(zoneRow());
      await expect(service.update('z1', { cityCodes: ['00000'] }, 'root')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.zoneCity.deleteMany).not.toHaveBeenCalled();
      prisma.zone.findUnique.mockResolvedValueOnce(null);
      await expect(service.update('nope', { isActive: true }, 'root')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('409 when renaming to a name that is taken; keeping its own name is fine', async () => {
      prisma.zone.findUnique.mockResolvedValue(zoneRow());
      prisma.zone.findFirst.mockResolvedValue({ id: 'other' });
      await expect(service.update('z1', { name: 'Otra' }, 'root')).rejects.toBeInstanceOf(ConflictException);
      prisma.zone.update.mockResolvedValue(zoneRow());
      await expect(service.update('z1', { name: 'ANTIOQUIA' }, 'root')).resolves.toBeDefined();
    });
  });

  describe('delete', () => {
    it('is refused with 409 and a simple message while advisors are assigned', async () => {
      prisma.zone.findUnique.mockResolvedValue(zoneRow({ _count: { users: 2 } }));
      await expect(service.remove('z1', 'root')).rejects.toMatchObject({
        status: 409,
        response: { code: 'ZONE_HAS_USERS', message: expect.stringContaining('2 asesores asignados') },
      });
      expect(prisma.zone.delete).not.toHaveBeenCalled();
    });
    it('deletes a zone without users and audits', async () => {
      prisma.zone.findUnique.mockResolvedValue(zoneRow());
      expect(await service.remove('z1', 'root')).toEqual({ id: 'z1', deleted: true });
      expect(prisma.zone.delete).toHaveBeenCalledWith({ where: { id: 'z1' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete', entity: 'Zone' }));
    });
    it('404 for a missing zone', async () => {
      prisma.zone.findUnique.mockResolvedValue(null);
      await expect(service.remove('z1', 'root')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('ZonesController authorization', () => {
  it('sits behind the internal session and checks the portalZones:manage action in every route', () => {
    expect(Reflect.getMetadata('__guards__', ZonesController)).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata('path', ZonesController)).toBe('api/zones');
  });

  it('allows Super Admin, allows a grant holder, and refuses everyone else', async () => {
    const zones = { list: jest.fn().mockResolvedValue([]) };
    const grantsFor = (rows: Array<{ actionId: string; scope: string }>) => ({ grantsForUser: jest.fn().mockResolvedValue(rows) });
    const make = (rows: Array<{ actionId: string; scope: string }>) => new ZonesController(zones as any, grantsFor(rows) as any);
    await expect(make([]).list({ sub: 'u1', roles: ['Super Admin'] })).resolves.toEqual([]);
    await expect(make([]).list({ sub: 'u2', roles: ['Vendedor'] })).rejects.toThrow('No tienes permiso');
    await expect(make([{ actionId: 'portalAccounts:read', scope: 'global' }]).list({ sub: 'u2', roles: ['Vendedor'] })).rejects.toThrow('No tienes permiso');
  });
});
