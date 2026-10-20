import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { concessionCanAction } from '../../common/security/d5-action';

/** Cada ruta de Listas exige la acción vigente sobre la Lista concreta. */
@Injectable()
export class ListaActionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly grants: AccessAssignmentsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const ctx = { userId: user?.sub ?? user?.id, roles: user?.roles ?? [] };
    if (!ctx.userId) throw new ForbiddenException('Sin sesión administrativa');

    const actionByMethod: Record<string, string> = {
      findAll: 'listas:read', findOne: 'listas:read', findProducts: 'products:read',
      findPrices: 'prices:read', findExpiringPrices: 'prices:read',
      findAssignments: 'assignments:manage', findAudit: 'assignments:manage',
      create: 'listas:create', duplicate: 'listas:duplicate', update: 'listas:update',
      toggleActive: 'listas:update', archive: 'listas:archive', restore: 'listas:update',
      unlinkProduct: 'listas:unlink', deletionRequest: 'listas:delete', remove: 'listas:delete',
    };
    const method = context.getHandler().name;
    const action = method === 'update' && request.body?.archivedAt
      ? 'listas:archive'
      : actionByMethod[method];
    if (!action) throw new ForbiddenException('Acción administrativa no configurada');
    const listaId = request.params?.id;
    const resource = listaId ? { id: listaId, kind: 'lista' as const, listId: listaId } : undefined;
    if (listaId && !(await this.prisma.lista.findUnique({ where: { id: listaId }, select: { id: true } }))) {
      throw new NotFoundException('Lista no encontrada');
    }
    if (!(await concessionCanAction(this.grants, action, ctx, resource)).allowed) {
      throw new ForbiddenException(`Sin permiso ${action} sobre esta Lista`);
    }
    return true;
  }
}
