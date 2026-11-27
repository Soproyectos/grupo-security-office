import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { resolveAccess } from '../../../common/security/data-scope';
import { ROLE } from '../../../common/rbac/roles.constants';
import { findMunicipality } from '../../../common/geo/municipalities';
import { NotificationService } from '../../notifications/notification.service';

const MANAGE_ACTION = 'portalAccounts:manage';

/**
 * Picks the advisor of a new web account by city: one active staff user, uniformly at random, whose zone is
 * active and covers the city, and who can manage portal accounts (any scope). With no match the account stays
 * unassigned: it waits in the supervisors' queue. Never throws to the caller of the registration flow.
 */
@Injectable()
export class PortalAdvisorAssignmentService {
  private readonly logger = new Logger(PortalAdvisorAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly grants: AccessAssignmentsService,
    private readonly notifications: NotificationService,
  ) {}

  /** Staff that could take an account of this city: active zone covering it and the manage action. */
  async candidatesForCity(cityCode: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, zone: { isActive: true, cities: { some: { cityCode } } } },
      select: { id: true, roles: { select: { role: { select: { name: true } } } } },
    });
    const eligible: string[] = [];
    for (const user of users) {
      const superAdmin = user.roles.some((r) => r.role.name === ROLE.SUPER_ADMIN);
      if (await this.canManage(user.id, superAdmin)) eligible.push(user.id);
    }
    return eligible;
  }

  /** True when the staff user holds `portalAccounts:manage` (any scope); a Super Admin always does. */
  async canManage(userId: string, superAdmin: boolean): Promise<boolean> {
    const grants = superAdmin ? [] : await this.grants.grantsForUser(userId);
    return resolveAccess({
      identity: { userId, verified: true, active: true, sessionValid: true, sessionUserId: userId, superAdmin },
      actionId: MANAGE_ACTION,
      grants,
    }).allowed;
  }

  /** Uniform random pick (Math.random so tests can pin it). */
  private pick<T>(items: T[]): T { return items[Math.floor(Math.random() * items.length)]; }

  /**
   * Assigns an advisor when the account has a city and no advisor yet. Idempotent: an account that already has
   * an advisor is never reassigned here. Returns the chosen advisor id or null.
   */
  async assignForAccount(accountId: string): Promise<string | null> {
    try {
      const account = await this.prisma.portalAccount.findUnique({
        where: { id: accountId },
        select: { id: true, city: true, advisorId: true, contactName: true, companyName: true },
      });
      if (!account?.city || account.advisorId) return null;
      const candidates = await this.candidatesForCity(account.city);
      if (!candidates.length) return null;
      const advisorId = this.pick(candidates);
      // Guarded write: a concurrent assignment wins and nobody is notified twice.
      const written = await this.prisma.portalAccount.updateMany({ where: { id: account.id, advisorId: null }, data: { advisorId } });
      if (!written.count) return null;
      const city = findMunicipality(account.city);
      await this.notifications.create({
        userId: advisorId,
        type: 'LEAD_ASSIGNED',
        title: 'Nueva cuenta web por atender',
        message: `${account.contactName} (${account.companyName}) se registró desde ${city?.name ?? 'tu zona'} y quedó a tu cargo. Revisa la cuenta y actívala.`,
        data: { portalAccountId: account.id, city: account.city },
      });
      return advisorId;
    } catch (error) {
      this.logger.warn(`No se pudo asignar asesor a la cuenta ${accountId} (${(error as { code?: string })?.code ?? 'error'})`);
      return null;
    }
  }
}
