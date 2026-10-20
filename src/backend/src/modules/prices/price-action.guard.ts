import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { concessionCanAction } from '../../common/security/d5-action';

@Injectable()
export class PriceActionGuard implements CanActivate {
  constructor(private prisma: PrismaService, private grants: AccessAssignmentsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ctx = { userId: request.user?.sub ?? request.user?.id, roles: request.user?.roles ?? [] };
    if (!ctx.userId) throw new ForbiddenException('Sin sesión administrativa');
    const method = context.getHandler().name;
    const action: Record<string, string> = {
      findAllPriceLists: 'prices:read', findOnePriceList: 'prices:read',
      createPriceList: 'listas:create', updatePriceList: 'listas:update',
      togglePriceListActive: 'listas:update', removePriceList: 'listas:archive',
      findPricesByProduct: 'prices:read', findPricesByPriceList: 'prices:read',
      createPrice: 'prices:apply', updatePrice: 'prices:apply', removePrice: 'prices:apply',
    };
    if (!action[method]) throw new ForbiddenException('Acción de precios no configurada');

    let productId = request.params?.productId ?? request.body?.productId;
    if (['updatePrice', 'removePrice'].includes(method)) {
      const row = await this.prisma.price.findUnique({ where: { id: request.params?.id }, select: { productId: true } });
      if (!row) throw new NotFoundException('Precio no encontrado');
      productId = row.productId;
    }
    let resource: { id: string; kind: 'product'; productId: string; listId?: string } | undefined;
    if (productId) {
      const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { listaId: true } });
      if (!product) throw new NotFoundException('Producto no encontrado');
      resource = { id: productId, kind: 'product', productId, listId: product.listaId ?? undefined };
    }
    const decision = await concessionCanAction(this.grants, action[method], ctx, resource);
    if (!decision.allowed || (!resource && ['createPriceList', 'updatePriceList', 'togglePriceListActive', 'removePriceList'].includes(method) &&
      !ctx.roles.includes('Super Admin') && !(await this.grants.grantsForUser(ctx.userId)).some((g) => g.actionId === action[method] && g.scope === 'global'))) {
      throw new ForbiddenException(`Sin permiso ${action[method]}`);
    }
    return true;
  }
}
