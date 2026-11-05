import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { assertGlobalGrant } from '../../common/security/require-grant';

/**
 * Grants required by each handler of PricesController. Only panel grants with GLOBAL scope count: no role and
 * no Lista grants anything (Super Admin keeps its explicit exception). A handler missing here is denied.
 *
 * - Tariffs (escalafones) are catalog data: read with `products:read`, create/update/toggle/delete with
 *   `products:write`.
 * - Prices: read with `prices:read`, create/update/delete with `prices:apply`. The tariff detail embeds prices,
 *   so it needs both `products:read` and `prices:read`.
 */
export const PRICE_HANDLER_GRANTS: Record<string, readonly string[]> = {
  findAllPriceLists: ['products:read'],
  findOnePriceList: ['products:read', 'prices:read'],
  priceListUsage: ['masters:read'],
  createPriceList: ['products:write'],
  updatePriceList: ['products:write'],
  togglePriceListActive: ['products:write'],
  removePriceList: ['products:write'],
  findPricesByProduct: ['prices:read'],
  findPricesByPriceList: ['prices:read'],
  createPrice: ['prices:apply'],
  updatePrice: ['prices:apply'],
  removePrice: ['prices:apply'],
};

/** Tariff writes also accepted for a global `masters:write` holder (additional path; prices stay untouched). */
export const MASTERS_WRITE_PRICE_HANDLERS: readonly string[] = ['createPriceList', 'updatePriceList', 'togglePriceListActive', 'removePriceList'];

@Injectable()
export class PriceActionGuard implements CanActivate {
  constructor(private readonly grants: AccessAssignmentsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ctx = { userId: request.user?.sub ?? request.user?.id, roles: request.user?.roles ?? [], userName: request.user?.name ?? null };
    if (!ctx.userId) throw new ForbiddenException('Sin sesión administrativa');
    const required = PRICE_HANDLER_GRANTS[context.getHandler().name];
    if (!required) throw new ForbiddenException('Acción de precios no configurada');
    try {
      for (const actionId of required) await assertGlobalGrant(this.grants, actionId, ctx);
    } catch (error) {
      if (error instanceof ForbiddenException && MASTERS_WRITE_PRICE_HANDLERS.includes(context.getHandler().name)) {
        await assertGlobalGrant(this.grants, 'masters:write', ctx);
        return true;
      }
      throw error;
    }
    return true;
  }
}
