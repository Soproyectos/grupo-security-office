import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessContext } from '../../common/acl/acl.service';
import { ROLE } from '../../common/rbac/roles.constants';
import { CreatePromotionDto } from './promotion.dto';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { resolveAccess, type AccessIdentity } from '../../common/security/data-scope';
import { getActionDefinition } from '../../common/security/access-catalog';


const DISPLAY_FIELDS = { id: true, title: true, message: true, startsAt: true, endsAt: true, flyer: true } as const;

@Injectable()
export class PromotionsService {
  /**
   * COM-08 §4: concesiones vigentes. Opcional para tolerar harnesses antiguos;
   * Nest lo inyecta desde SecurityModule (@Global). Sin grants se deniega.
   */
  constructor(private prisma: PrismaService, private grants?: AccessAssignmentsService) {}

  private async decision(actionId: string, ctx: AccessContext, ownerId: string) {
    const superAdmin = ctx.roles?.includes(ROLE.SUPER_ADMIN) === true;
    const grants = superAdmin ? [] : (await this.grants?.grantsForUser(ctx.userId!)) ?? [];
    const identityBase: AccessIdentity = { userId: ctx.userId ?? '', verified: true, active: true,
      sessionValid: true, sessionUserId: ctx.userId ?? '', superAdmin, teamOwnerIds: [] };
    const resource = { id: ownerId, ownerId };
    const initial = resolveAccess({ identity: identityBase, actionId, grants, resource });
    if (initial.allowed || superAdmin || !grants.some(row => row.actionId === actionId)) return initial;
    const relevantActions = new Set<string>([actionId]);
    const visitDependencies = (id: string) => {
      for (const dependency of getActionDefinition(id)?.dependencies ?? []) {
        if (relevantActions.has(dependency)) continue;
        relevantActions.add(dependency);
        visitDependencies(dependency);
      }
    };
    visitDependencies(actionId);
    if (!grants.some(row => row.scope === 'team' && relevantActions.has(row.actionId))) return initial;
    const identity: AccessIdentity = { ...identityBase, teamOwnerIds: await this.teamIds(ctx.userId) };
    return resolveAccess({ identity, actionId, grants, resource });
  }

  private async teamIds(userId?: string): Promise<string[]> {
    if (!userId) return [];
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE team AS (
        SELECT u."id", ARRAY[u."id"] AS path, 0 AS depth FROM "users" u WHERE u."supervisorId" = ${userId}
        UNION ALL
        SELECT c."id", t.path || c."id", t.depth + 1 FROM "users" c JOIN team t ON c."supervisorId" = t."id"
        WHERE NOT (c."id" = ANY(t.path)) AND t.depth < 10
      ) SELECT "id" FROM team`;
    return rows.map(row => row.id);
  }

  private async assertAction(actionId: string, ctx: AccessContext, ownerId = ctx.userId ?? ''): Promise<void> {
    if (!ctx.userId || !(await this.decision(actionId, ctx, ownerId)).allowed) {
      throw new ForbiddenException(`Sin permiso ${actionId}`);
    }
  }

  private async assertExistingAction(actionId: string, id: string, ctx: AccessContext): Promise<void> {
    const row = await this.prisma.salesPromotion.findUnique({ where: { id }, select: { createdById: true } });
    if (!row) throw new NotFoundException('Promoción no encontrada');
    await this.assertAction(actionId, ctx, row.createdById);
  }

  private publisher(ctx: AccessContext): string {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');
    return ctx.userId;
  }

  async current(ctx: AccessContext) {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');
    // COM-08 J2: con grants vigentes y sin `commercialPromotions:read` la
    // lectura devuelve lista vacía SIN consultar (patrón «omitir» de COM-05).
    if (!(await this.decision('commercialPromotions:read', ctx, ctx.userId)).allowed) return [];
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
    const rows = await this.prisma.salesPromotion.findMany({
      where: {
        // COM-08 §3: los borradores (publishedAt null) NO son visibles.
        publishedAt: { not: null },
        isActive: true, startsAt: { lte: now }, endsAt: { gt: now },
        OR: [{ audience: 'GLOBAL' }, { audience: 'TEAM', createdById: { in: [ctx.userId, ...ancestors.map(ancestor => ancestor.id)] } }],
      },
      select: DISPLAY_FIELDS,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
    });
    // Aquí se consulta como destinatario. La concesión se comprobó sobre la
    // cuenta del lector; la audiencia limita qué avisos puede recibir. El
    // autor solo determina alcance en la pantalla de gestión.
    return rows;
  }

  async manage(ctx: AccessContext) {
    const userId = this.publisher(ctx);
    const readDecision = await this.decision('commercialPromotions:read', ctx, userId);
    if (!readDecision.allowed) return [];
    const ownerIds = readDecision.scope === 'global' ? undefined :
      readDecision.scope === 'team' ? [...new Set([userId, ...await this.teamIds(userId)])] : [userId];
    const rows = await this.prisma.salesPromotion.findMany({
      where: ownerIds ? { createdById: { in: ownerIds } } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    const allowed = await Promise.all(rows.map(async row => (await this.decision('commercialPromotions:read', ctx, row.createdById)).allowed));
    return rows.filter((_row, index) => allowed[index]);
  }

  async publish(dto: CreatePromotionDto, ctx: AccessContext) {
    // COM-08 §3/regla 3: preparar NO publica — crea en borrador (publishedAt null).
    await this.assertAction('commercialPromotions:create', ctx);
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
        data: { title, message, startsAt, endsAt, createdById: userId, publishedAt: null,
          audience: ctx.roles.includes(ROLE.SUPER_ADMIN) || (await this.decision('commercialPromotions:create', ctx, userId)).scope === 'global' ? 'GLOBAL' : 'TEAM' },
      });
      await tx.auditLog.create({ data: { userId, action: 'create', entity: 'SalesPromotion',
        entityId: promotion.id, newValues: { title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), audience: promotion.audience } } });
      return promotion;
    });
  }


  async edit(id: string, dto: CreatePromotionDto, ctx: AccessContext) {
    await this.assertExistingAction('commercialPromotions:edit', id, ctx);
    const userId = this.publisher(ctx);
    const startsAt = new Date(dto.startsAt), endsAt = new Date(dto.endsAt);
    const title = dto.title.trim(), message = dto.message.trim();
    if (!title || title.length > 120 || !message || message.length > 2000 ||
        !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) ||
        endsAt <= startsAt || endsAt <= new Date()) throw new BadRequestException('Título, condiciones o vigencia inválidos');
    return this.prisma.$transaction(async tx => {
      const result = await tx.salesPromotion.updateMany({
        where: { id },
        data: { title, message, startsAt, endsAt },
      });
      if (!result.count) throw new NotFoundException('Promoción no encontrada');
      await tx.auditLog.create({ data: { userId, action: 'update', entity: 'SalesPromotion',
        entityId: id, newValues: { title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } } });
      return tx.salesPromotion.findUniqueOrThrow({ where: { id } });
    });
  }

  async setFlyer(id: string, file: { buffer: Buffer; mimetype: string } | undefined, ctx: AccessContext) {
    await this.assertExistingAction('commercialPromotions:edit', id, ctx);
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
        where: { id },
        data: { flyer },
      });
      if (!result.count) throw new NotFoundException('Promoción no encontrada');
      await tx.auditLog.create({ data: { userId, action: 'update', entity: 'SalesPromotion',
        entityId: id, newValues: { flyerAttached: !!flyer } } });
      return { id, flyer };
    });
  }

  async withdraw(id: string, ctx: AccessContext) {
    await this.assertExistingAction('commercialPromotions:withdraw', id, ctx);
    const userId = this.publisher(ctx);
    return this.prisma.$transaction(async tx => {
      const where = { id };
      const result = await tx.salesPromotion.updateMany({ where, data: { isActive: false } });
      if (!result.count) throw new NotFoundException('Promoción no encontrada');
      await tx.auditLog.create({ data: { userId, action: 'update', entity: 'SalesPromotion', entityId: id, newValues: { isActive: false } } });
      return { id, isActive: false };
    });
  }

  /**
   * COM-08 §3 — publicación EXPLÍCITA de un borrador (acción
   * `commercialPromotions:publish`, independiente de create/edit — regla 3
   * «preparar no publica»). Auditoría con antes/después; 409 si ya estaba
   * publicado (patrón COM-03 F7); 400 si la vigencia ya venció.
   */
  async publishExisting(id: string, ctx: AccessContext) {
    await this.assertExistingAction('commercialPromotions:publish', id, ctx);
    const userId = this.publisher(ctx);
    const promotion = await this.prisma.salesPromotion.findUnique({ where: { id } });
    if (!promotion) {
      throw new NotFoundException('Promoción no encontrada');
    }
    if (promotion.publishedAt) throw new ConflictException('El aviso ya está publicado');
    if (promotion.endsAt <= new Date()) {
      throw new BadRequestException('La vigencia ya venció; edita las fechas antes de publicar');
    }
    const publishedAt = new Date();
    await this.prisma.$transaction(async tx => {
      const result = await tx.salesPromotion.updateMany({
        where: { id, publishedAt: null },
        data: { publishedAt },
      });
      if (!result.count) throw new ConflictException('El aviso ya está publicado');
      await tx.auditLog.create({ data: { userId, action: 'publish', entity: 'SalesPromotion',
        entityId: id, oldValues: { publishedAt: null },
        newValues: { publishedAt: publishedAt.toISOString() } } });
    });
    return { id, publishedAt };
  }
}
