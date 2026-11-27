import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GeoService } from '../../common/geo/geo.service';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';

const ZONE_INCLUDE = {
  cities: { select: { cityCode: true } },
  _count: { select: { users: true } },
} satisfies Prisma.ZoneInclude;

/**
 * Advisor zones: a name plus a set of cities (DIVIPOLA). Managed only by Super Admin (the controller enforces it).
 * Cities may appear in more than one zone: the auto-assignment draws among every advisor whose zone covers the city.
 */
@Injectable()
export class ZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly geo: GeoService,
  ) {}

  private view(zone: Prisma.ZoneGetPayload<{ include: typeof ZONE_INCLUDE }>) {
    const cities = zone.cities
      .map((c) => this.geo.find(c.cityCode) ?? { code: c.cityCode, name: c.cityCode, departmentCode: '', department: '' })
      .map((m) => ({ code: m.code, name: m.name, department: m.department }))
      .sort((a, b) => a.department.localeCompare(b.department, 'es') || a.name.localeCompare(b.name, 'es'));
    return { id: zone.id, name: zone.name, isActive: zone.isActive, createdAt: zone.createdAt, usersCount: zone._count.users, cities };
  }

  /** Unique, validated codes. Invalid ones are listed so the person can fix the selection. */
  private cleanCodes(codes: string[]): string[] {
    const unique = [...new Set(codes.map((c) => c.trim()))];
    const invalid = this.geo.invalidCodes(unique);
    if (invalid.length) throw new BadRequestException({ code: 'INVALID_CITY', message: `Estas ciudades no son válidas: ${invalid.slice(0, 5).join(', ')}` });
    return unique;
  }

  async list() {
    const zones = await this.prisma.zone.findMany({ orderBy: { name: 'asc' }, include: ZONE_INCLUDE });
    return zones.map((zone) => this.view(zone));
  }

  async create(dto: CreateZoneDto, actorId: string) {
    const cityCodes = this.cleanCodes(dto.cityCodes);
    await this.assertNameFree(dto.name);
    try {
      const zone = await this.prisma.zone.create({
        data: { name: dto.name, cities: { create: cityCodes.map((cityCode) => ({ cityCode })) } },
        include: ZONE_INCLUDE,
      });
      await this.audit.log({ userId: actorId, action: 'create', entity: 'Zone', entityId: zone.id, newValues: { name: zone.name, cities: cityCodes.length } });
      return this.view(zone);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw this.nameTaken();
      throw error;
    }
  }

  async update(id: string, dto: UpdateZoneDto, actorId: string) {
    const current = await this.prisma.zone.findUnique({ where: { id }, include: ZONE_INCLUDE });
    if (!current) throw new NotFoundException('Zona no encontrada');
    const cityCodes = dto.cityCodes ? this.cleanCodes(dto.cityCodes) : undefined;
    if (dto.name !== undefined && dto.name.toLowerCase() !== current.name.toLowerCase()) await this.assertNameFree(dto.name, id);
    try {
      const zone = await this.prisma.$transaction(async (tx) => {
        if (cityCodes) {
          // Replace the whole set.
          await tx.zoneCity.deleteMany({ where: { zoneId: id } });
          await tx.zoneCity.createMany({ data: cityCodes.map((cityCode) => ({ zoneId: id, cityCode })) });
        }
        return tx.zone.update({
          where: { id },
          data: { ...(dto.name !== undefined && { name: dto.name }), ...(dto.isActive !== undefined && { isActive: dto.isActive }) },
          include: ZONE_INCLUDE,
        });
      });
      await this.audit.log({
        userId: actorId, action: 'update', entity: 'Zone', entityId: id,
        oldValues: { name: current.name, isActive: current.isActive, cities: current.cities.length },
        newValues: { name: zone.name, isActive: zone.isActive, cities: zone.cities.length },
      });
      return this.view(zone);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw this.nameTaken();
      throw error;
    }
  }

  /** A zone with advisors cannot be deleted: reassign or clear those advisors first (or just deactivate the zone). */
  async remove(id: string, actorId: string) {
    const zone = await this.prisma.zone.findUnique({ where: { id }, include: ZONE_INCLUDE });
    if (!zone) throw new NotFoundException('Zona no encontrada');
    const users = zone._count.users;
    if (users > 0) {
      throw new ConflictException({
        code: 'ZONE_HAS_USERS',
        message: `No puedes eliminar la zona porque tiene ${users} ${users === 1 ? 'asesor asignado' : 'asesores asignados'}. Cámbialos de zona o desactívala.`,
      });
    }
    await this.prisma.zone.delete({ where: { id } });
    await this.audit.log({ userId: actorId, action: 'delete', entity: 'Zone', entityId: id, oldValues: { name: zone.name, cities: zone.cities.length } });
    return { id, deleted: true };
  }

  private nameTaken() { return new ConflictException({ code: 'ZONE_NAME_TAKEN', message: 'Ya existe una zona con ese nombre' }); }

  private async assertNameFree(name: string, exceptId?: string) {
    const duplicate = await this.prisma.zone.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (duplicate) throw this.nameTaken();
  }
}
