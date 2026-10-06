import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessContext } from '../../common/acl/acl.service';
import { ROLE } from '../../common/rbac/roles.constants';
import { CreatePromotionDto } from './promotion.dto';

const DISPLAY_FIELDS = { id: true, title: true, message: true, startsAt: true, endsAt: true, flyer: true } as const;

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaService) {}

  private publisher(ctx: AccessContext): string {
    if (!ctx.userId || !ctx.roles.some(role => role === ROLE.SUPER_ADMIN || role === ROLE.SUPERVISOR)) {
      throw new ForbiddenException('Solo Supervisor o Super Admin pueden publicar promociones');
    }
    return ctx.userId;
  }

  async current(ctx: AccessContext) {
    if (!ctx.userId || !ctx.roles.some(role => role === ROLE.VENDEDOR || role === ROLE.SUPERVISOR || role === ROLE.SUPER_ADMIN)) {
      throw new ForbiddenException('Acceso a promociones no autorizado');
    }
    // Walk parents, not descendants, and stop cycles/deep chains.
    const ancestors = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE ancestors AS (
        SELECT u."id", u."supervisorId", ARRAY[u."id"] AS path, 0 AS depth
        FROM "users" u WHERE u."id" = ${ctx.userId}
        UNION ALL
        SELECT p."id", p."supervisorId", a.path || p."id", a.depth + 1
        FROM "users" p JOIN ancestors a ON p."id" = a."supervisorId"
        WHERE NOT (p."id" = ANY(a.path)) AND a.depth < 10
      )
      SELECT "id" FROM ancestors WHERE depth > 0
    `;
    const now = new Date();
    return this.prisma.salesPromotion.findMany({
      where: {
        isActive: true, startsAt: { lte: now }, endsAt: { gt: now },
        OR: [{ audience: 'GLOBAL' }, { audience: 'TEAM', createdById: { in: [ctx.userId, ...ancestors.map(ancestor => ancestor.id)] } }],
      },
      select: DISPLAY_FIELDS,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
    });
  }

  async manage(ctx: AccessContext) {
    const userId = this.publisher(ctx);
    return this.prisma.salesPromotion.findMany({
      where: ctx.roles.includes(ROLE.SUPER_ADMIN) ? {} : { createdById: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  async publish(dto: CreatePromotionDto, ctx: AccessContext) {
    const userId = this.publisher(ctx);
    const startsAt = new Date(dto.startsAt), endsAt = new Date(dto.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) ||
        endsAt <= startsAt || endsAt <= new Date()) {
      throw new BadRequestException('La vigencia debe ser válida, terminar después del inicio y no haber vencido');
    }
    const title = dto.title.trim(), message = dto.message.trim();
    if (!title || title.length > 120 || !message || message.length > 2000) {
      throw new BadRequestException('El aviso requiere título y condiciones dentro del límite permitido');
    }
    return this.prisma.$transaction(async tx => {
      const promotion = await tx.salesPromotion.create({
        data: { title, message, startsAt, endsAt, createdById: userId,
          audience: ctx.roles.includes(ROLE.SUPER_ADMIN) ? 'GLOBAL' : 'TEAM' },
      });
      await tx.auditLog.create({ data: { userId, action: 'create', entity: 'SalesPromotion',
        entityId: promotion.id, newValues: { title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), audience: promotion.audience } } });
      return promotion;
    });
  }


  async edit(id: string, dto: CreatePromotionDto, ctx: AccessContext) {
    const userId = this.publisher(ctx);
    const startsAt = new Date(dto.startsAt), endsAt = new Date(dto.endsAt);
    const title = dto.title.trim(), message = dto.message.trim();
    if (!title || title.length > 120 || !message || message.length > 2000 ||
        !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) ||
        endsAt <= startsAt || endsAt <= new Date()) throw new BadRequestException('Título, condiciones o vigencia inválidos');
    return this.prisma.$transaction(async tx => {
      const result = await tx.salesPromotion.updateMany({
        where: { id, ...(ctx.roles.includes(ROLE.SUPER_ADMIN) ? {} : { createdById: userId }) },
        data: { title, message, startsAt, endsAt },
      });
      if (!result.count) throw new NotFoundException('Promoción no encontrada');
      await tx.auditLog.create({ data: { userId, action: 'update', entity: 'SalesPromotion',
        entityId: id, newValues: { title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } } });
      return tx.salesPromotion.findUniqueOrThrow({ where: { id } });
    });
  }

  async setFlyer(id: string, file: { buffer: Buffer; mimetype: string } | undefined, ctx: AccessContext) {
    const userId = this.publisher(ctx);
    let flyer: string | null = null;
    if (file) {
      const b = file.buffer;
      const png = b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg = b.length >= 4 && b[0] === 255 && b[1] === 216 && b[b.length - 2] === 255 && b[b.length - 1] === 217;
      const webp = b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
      const mime = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : null;
      if (!mime || mime !== file.mimetype || b.length > 2 * 1024 * 1024) {
        throw new BadRequestException('Usa PNG, JPEG o WebP de máximo 2 MB');
      }
      flyer = `data:${mime};base64,${b.toString('base64')}`;
    }
    return this.prisma.$transaction(async tx => {
      const result = await tx.salesPromotion.updateMany({
        where: { id, ...(ctx.roles.includes(ROLE.SUPER_ADMIN) ? {} : { createdById: userId }) },
        data: { flyer },
      });
      if (!result.count) throw new NotFoundException('Promoción no encontrada');
      await tx.auditLog.create({ data: { userId, action: 'update', entity: 'SalesPromotion',
        entityId: id, newValues: { flyerAttached: !!flyer } } });
      return { id, flyer };
    });
  }

  async withdraw(id: string, ctx: AccessContext) {
    const userId = this.publisher(ctx);
    return this.prisma.$transaction(async tx => {
      const where = { id, ...(ctx.roles.includes(ROLE.SUPER_ADMIN) ? {} : { createdById: userId }) };
      const result = await tx.salesPromotion.updateMany({ where, data: { isActive: false } });
      if (!result.count) throw new NotFoundException('Promoción no encontrada');
      await tx.auditLog.create({ data: { userId, action: 'update', entity: 'SalesPromotion', entityId: id, newValues: { isActive: false } } });
      return { id, isActive: false };
    });
  }
}
