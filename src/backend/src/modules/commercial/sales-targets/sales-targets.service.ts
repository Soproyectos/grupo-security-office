import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { HierarchyService } from '../../../common/hierarchy/hierarchy.service';
import { periodStartFromString } from '../../../common/date/month-range-bogota';
import { SalesTargetQueryDto } from './dto/sales-target-query.dto';
import { UpsertSalesTargetDto } from './dto/upsert-sales-target.dto';

@Injectable()
export class SalesTargetsService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private hierarchy: HierarchyService,
  ) {}

  /**
   * Lista metas por usuario y rango de periodos `YYYY-MM` (ambos inclusivos).
   *
   * Lectura: un usuario ve siempre las suyas; para las de OTRO usuario debe
   * ser su ancestro en la jerarquía (`assertCanViewUser`) o admin de Listas
   * (Super Admin / Admin Comercial). Sin `userId`, un no-admin solo recibe
   * las propias; un admin sin `userId` ve todas.
   */
  async findAll(query: SalesTargetQueryDto, ctx: AccessContext) {
    const isAdmin = this.acl.isListasAdmin(ctx.roles);

    let effectiveUserId = query.userId;
    if (!effectiveUserId && !isAdmin) {
      effectiveUserId = ctx.userId;
    }
    if (effectiveUserId && effectiveUserId !== ctx.userId && !isAdmin) {
      await this.hierarchy.assertCanViewUser(ctx, effectiveUserId);
    }

    const where: Prisma.SalesTargetWhereInput = {};
    if (effectiveUserId) where.userId = effectiveUserId;
    if (query.from || query.to) {
      where.period = {};
      if (query.from) where.period.gte = periodStartFromString(query.from);
      if (query.to) where.period.lte = periodStartFromString(query.to);
    }

    return this.prisma.salesTarget.findMany({
      where,
      orderBy: [{ period: 'desc' }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        setBy: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Fija (upsert) la meta de un usuario para un periodo `YYYY-MM`.
   *
   * Escritura: solo un ancestro jerárquico del dueño de la meta o un admin
   * (Super Admin / Admin Comercial) puede fijarla. En particular, un usuario
   * NO fija su propia meta salvo que sea admin.
   */
  async upsert(dto: UpsertSalesTargetDto, ctx: AccessContext) {
    if (!this.acl.isListasAdmin(ctx.roles)) {
      const subordinateIds = ctx.userId
        ? await this.hierarchy.getSubordinateIds(ctx.userId)
        : [];
      if (!subordinateIds.includes(dto.userId)) {
        throw new ForbiddenException(
          'Solo un supervisor ancestro o un admin puede fijar la meta de este usuario',
        );
      }
    }

    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('amount debe ser un numero >= 0');
    }

    const period = periodStartFromString(dto.period);
    const currency = (dto.currency ?? 'COP').toUpperCase();

    const result = await this.prisma.salesTarget.upsert({
      where: { userId_period: { userId: dto.userId, period } },
      create: {
        userId: dto.userId,
        period,
        amount,
        currency,
        notes: dto.notes ?? null,
        setById: ctx.userId ?? null,
      },
      update: {
        amount,
        currency,
        notes: dto.notes ?? null,
        setById: ctx.userId ?? null,
      },
    });

    return result;
  }
}
