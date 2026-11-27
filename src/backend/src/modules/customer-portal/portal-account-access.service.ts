import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HierarchyService } from '../../common/hierarchy/hierarchy.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { resolveAccess, type AccessIdentity } from '../../common/security/data-scope';
import { ROLE } from '../../common/rbac/roles.constants';

/** Staff identity of the person calling an admin endpoint (taken from the session, never from the body). */
export interface PortalAdminContext {
  userId: string;
  roles: string[];
  jti?: string;
}

export type PortalScope = 'global' | 'team' | 'own';

export const PORTAL_ACTIONS = {
  read: 'portalAccounts:read',
  assign: 'portalAccounts:assign',
  manage: 'portalAccounts:manage',
  tariffs: 'portalTariffs:manage',
} as const;

/** What the access check needs to know about an account to decide its scope. */
export interface ScopedPortalAccount {
  id: string;
  state: string;
  advisorId: string | null;
  customerId: string | null;
  customer: { ownerId: string | null } | null;
}

/**
 * Scope rules for the portal accounts panel.
 * "own" = the account's advisor is me OR its linked customer is owned by me.
 * "team" = same, for me and my subordinates (reporting hierarchy). "global" = every account.
 * A PENDING account with no advisor (whether or not it is linked to a customer) is the supervisors' queue: it is visible and
 * manageable by whoever holds `portalAccounts:assign` with team or global scope.
 */
@Injectable()
export class PortalAccountAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grants: AccessAssignmentsService,
    private readonly hierarchy: HierarchyService,
  ) {}

  private isSuperAdmin(ctx: PortalAdminContext) { return ctx.roles?.includes(ROLE.SUPER_ADMIN) === true; }

  /** Broadest scope the person holds for the action, or null when they hold none. */
  async scopeOf(actionId: string, ctx: PortalAdminContext): Promise<PortalScope | null> {
    if (!ctx?.userId) throw new ForbiddenException('Usuario sin identificar');
    if (this.isSuperAdmin(ctx)) return 'global';
    const grants = await this.grants.grantsForUser(ctx.userId);
    const identity: AccessIdentity = {
      userId: ctx.userId, ...(ctx.jti ? { jti: ctx.jti } : {}), verified: true, active: true,
      sessionValid: true, sessionUserId: ctx.userId, superAdmin: false,
    };
    const decision = resolveAccess({ identity, actionId, grants });
    return decision.allowed ? (decision.scope as PortalScope) : null;
  }

  /** Same as scopeOf but throws a simple Spanish 403 when the person has no grant. */
  async requireScope(actionId: string, ctx: PortalAdminContext): Promise<PortalScope> {
    const scope = await this.scopeOf(actionId, ctx);
    if (!scope) throw new ForbiddenException('No tienes permiso para esta acción');
    return scope;
  }

  /** The person plus everyone below them in the hierarchy. */
  async teamIds(ctx: PortalAdminContext): Promise<string[]> {
    return [...new Set([ctx.userId, ...(await this.hierarchy.getSubordinateIds(ctx.userId))])];
  }

  /** Ids whose accounts the person can reach for a scope. */
  private async idsFor(scope: PortalScope, ctx: PortalAdminContext): Promise<string[]> {
    return scope === 'team' ? this.teamIds(ctx) : [ctx.userId];
  }

  /** True when the person works the supervisors' queue (assign grant with team or global scope). */
  private async worksQueue(ctx: PortalAdminContext): Promise<boolean> {
    const scope = await this.scopeOf(PORTAL_ACTIONS.assign, ctx);
    return scope === 'team' || scope === 'global';
  }

  /** Prisma filter with the accounts the person can read. Throws 403 without `portalAccounts:read`. */
  async readWhere(ctx: PortalAdminContext): Promise<Prisma.PortalAccountWhereInput> {
    const scope = await this.requireScope(PORTAL_ACTIONS.read, ctx);
    if (scope === 'global') return {};
    const ids = await this.idsFor(scope, ctx);
    const or: Prisma.PortalAccountWhereInput[] = [
      { advisorId: { in: ids } },
      { customer: { ownerId: { in: ids } } },
    ];
    if (await this.worksQueue(ctx)) or.push({ state: 'PENDING', advisorId: null });
    return { OR: or };
  }

  /** Pure decision for one already loaded account. */
  async canReach(actionId: string, ctx: PortalAdminContext, account: ScopedPortalAccount): Promise<boolean> {
    const scope = await this.scopeOf(actionId, ctx);
    if (!scope) return false;
    if (scope === 'global') return true;
    const ids = new Set(await this.idsFor(scope, ctx));
    if ((account.advisorId && ids.has(account.advisorId)) || (account.customer?.ownerId && ids.has(account.customer.ownerId))) return true;
    const inQueue = account.state === 'PENDING' && !account.advisorId;
    return inQueue && (await this.worksQueue(ctx));
  }

  /** True when `ownerId` belongs to the person's reach for the action's scope (global any; own = me; team = my team). */
  async ownerInScope(actionId: string, ctx: PortalAdminContext, ownerId: string | null): Promise<boolean> {
    const scope = await this.scopeOf(actionId, ctx);
    if (!scope) return false;
    if (scope === 'global') return true;
    if (!ownerId) return false;
    return (await this.idsFor(scope, ctx)).includes(ownerId);
  }

  /**
   * A customer can be linked to a web account only when it is active and the person can already reach it
   * (customers:read scope on its owner). An unowned customer needs team/global scope on portalAccounts:assign
   * or customers:read global. Super Admin bypasses. Throws 403 with a simple message otherwise.
   */
  async assertCustomerLinkable(ctx: PortalAdminContext, customer: { ownerId: string | null }): Promise<void> {
    if (this.isSuperAdmin(ctx)) return;
    if (!customer.ownerId) {
      const assign = await this.scopeOf(PORTAL_ACTIONS.assign, ctx);
      const read = await this.scopeOf('customers:read', ctx);
      if (assign === 'team' || assign === 'global' || read === 'global') return;
      throw new ForbiddenException('Este cliente no tiene asesor; pide a tu supervisor que lo asigne');
    }
    if (!(await this.ownerInScope('customers:read', ctx, customer.ownerId))) {
      throw new ForbiddenException('Este cliente no está en tu alcance');
    }
  }

  /** Loads the account and checks the action on it: 404 when missing, 403 when out of the person's scope. */
  async assertAccount(actionId: string, ctx: PortalAdminContext, accountId: string): Promise<ScopedPortalAccount> {
    const account = await this.prisma.portalAccount.findUnique({
      where: { id: accountId },
      select: { id: true, state: true, advisorId: true, customerId: true, customer: { select: { ownerId: true } } },
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    if (!(await this.canReach(actionId, ctx, account))) {
      throw new ForbiddenException('Esta cuenta no está en tu alcance');
    }
    return account;
  }
}
