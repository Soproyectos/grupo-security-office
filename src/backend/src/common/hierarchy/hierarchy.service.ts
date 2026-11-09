import {
  Injectable,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessContext } from '../acl/acl.service';
import { TeamNode } from './types';
import { BASE_ACCESS_ROLES } from '../security/base-access';

@Injectable()
export class HierarchyService {
  constructor(private prisma: PrismaService) {}

  // Get all subordinate IDs (direct and indirect)
  async getSubordinateIds(
    userId: string,
    opts?: { includeSelf?: boolean; maxDepth?: number },
  ): Promise<string[]> {
    const maxDepth = opts?.maxDepth ?? 10;

    const result = await this.prisma.$queryRaw<
      Array<{ id: string; depth: number }>
    >`
      WITH RECURSIVE sub AS (
        SELECT u."id", 0 AS depth, ARRAY[u."id"] AS path
        FROM "users" u
        WHERE u."id" = ${userId}
        UNION ALL
        SELECT c."id", s.depth + 1, s.path || c."id"
        FROM "users" c
        JOIN sub s ON c."supervisorId" = s."id"
        WHERE NOT (c."id" = ANY(s.path))
          AND s.depth < ${maxDepth}
      )
      SELECT "id", depth FROM sub WHERE depth > 0
    `;

    if (opts?.includeSelf) {
      return [userId, ...result.map((r) => r.id)];
    }

    return result.map((r) => r.id);
  }

  /** Subordinados actuales que pertenecen al personal interno activo. */
  async getActiveInternalSubordinateIds(userId: string): Promise<string[]> {
    const ids = await this.getSubordinateIds(userId);
    if (!ids.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true, roles: { some: { role: { name: { in: [...BASE_ACCESS_ROLES] } } } } },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  // Get all ancestor IDs (superiors up the chain)
  async getAncestorIds(userId: string): Promise<string[]> {
    const result = await this.prisma.$queryRaw<
      Array<{ id: string; depth: number }>
    >`
      WITH RECURSIVE anc AS (
        SELECT u."id", 0 AS depth, ARRAY[u."id"] AS path
        FROM "users" u
        WHERE u."id" = ${userId}
        UNION ALL
        SELECT s."id", anc.depth + 1, anc.path || s."id"
        FROM "users" s
        JOIN anc ON s."supervisorId" = anc."id"
        WHERE NOT (s."id" = ANY(anc.path))
          AND anc.depth < 10
      )
      SELECT "id", depth FROM anc WHERE depth > 0
    `;

    return result.map((r) => r.id);
  }

  // Get hierarchical team tree starting from userId.
  //
  // Resuelve TODO el subarbol en una sola query recursiva (mismo patron de
  // path-tracking + tope de profundidad que getSubordinateIds/getAncestorIds)
  // y arma el arbol en memoria a partir de las filas planas. La version
  // anterior recorria el arbol con findUnique/findMany recursivos por nodo,
  // sin ningun tope ni deteccion de ciclos: ante datos con un ciclo (aunque
  // la escritura vía assertCanSetSupervisor lo prevenga, un ciclo podria
  // colarse por una migracion o edicion directa de la base) esa version se
  // hubiera colgado en recursion infinita. Este endpoint es alcanzable por
  // los 5 roles, asi que no puede depender solo de que nunca falle la
  // proteccion de escritura.
  async getTeamTree(userId: string): Promise<TeamNode> {
    const root = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!root) {
      throw new Error(`User ${userId} not found`);
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        email: string;
        supervisorId: string | null;
        depth: number;
      }>
    >`
      WITH RECURSIVE team AS (
        SELECT u."id", u."name", u."email", u."supervisorId", 0 AS depth, ARRAY[u."id"] AS path
        FROM "users" u
        WHERE u."id" = ${userId}
        UNION ALL
        SELECT c."id", c."name", c."email", c."supervisorId", t.depth + 1, t.path || c."id"
        FROM "users" c
        JOIN team t ON c."supervisorId" = t."id"
        WHERE NOT (c."id" = ANY(t.path))
          AND t.depth < 10
      )
      SELECT "id", "name", "email", "supervisorId", depth FROM team
    `;

    const nodeById = new Map<string, TeamNode>(
      rows.map((r) => [
        r.id,
        { id: r.id, name: r.name, email: r.email, depth: r.depth, children: [] },
      ]),
    );

    for (const row of rows) {
      if (row.id === userId) continue;
      const parent = row.supervisorId ? nodeById.get(row.supervisorId) : undefined;
      const node = nodeById.get(row.id);
      if (parent && node) parent.children.push(node);
    }

    return nodeById.get(userId)!;
  }

  // Check if ctx.userId can view targetUserId
  async assertCanViewUser(
    ctx: AccessContext,
    targetUserId: string,
  ): Promise<void> {
    // Super Admin can view anyone
    if (ctx.roles?.includes('Super Admin')) {
      return;
    }

    // User can view themselves
    if (ctx.userId === targetUserId) {
      return;
    }

    // Supervisor can view their subordinates
    const subordinateIds = await this.getSubordinateIds(ctx.userId);
    if (subordinateIds.includes(targetUserId)) {
      return;
    }

    throw new ForbiddenException(
      `User ${ctx.userId} cannot view user ${targetUserId}`,
    );
  }

  /**
   * Scope + anti-cycle check for changing `userId`'s supervisor, from the
   * point of view of the person doing it.
   * - Super Admin: anyone, any supervisor (anti-cycle still applies).
   * - Everybody else: only people already in their own branch (direct or
   *   indirect subordinates), and only towards themselves or someone else in
   *   their branch. They can never touch themselves or their own superiors,
   *   and cannot detach someone from the branch (supervisorId null).
   */
  async assertActorCanSetSupervisor(
    ctx: AccessContext,
    userId: string,
    supervisorId: string | null,
  ): Promise<void> {
    if (!ctx.roles?.includes('Super Admin')) {
      if (userId === ctx.userId) {
        throw new ForbiddenException({
          code: 'SUPERVISOR_SELF_CHANGE',
          message: 'No puedes cambiar tu propio jefe.',
        });
      }
      const branch = await this.getSubordinateIds(ctx.userId);
      if (!branch.includes(userId)) {
        throw new ForbiddenException({
          code: 'SUPERVISOR_TARGET_OUT_OF_BRANCH',
          message: 'Solo puedes cambiar el jefe de personas que ya están en tu equipo.',
        });
      }
      if (supervisorId === null) {
        throw new ForbiddenException({
          code: 'SUPERVISOR_REMOVAL_NOT_ALLOWED',
          message: 'No puedes dejar a una persona sin jefe. Elige otra persona de tu equipo o a ti mismo.',
        });
      }
      if (supervisorId !== ctx.userId && !branch.includes(supervisorId)) {
        throw new ForbiddenException({
          code: 'SUPERVISOR_DESTINATION_OUT_OF_BRANCH',
          message: 'El nuevo jefe debe ser tú o alguien de tu equipo.',
        });
      }
    }
    await this.assertCanSetSupervisor(userId, supervisorId);
  }

  // Check if assigning supervisorId to userId would create a cycle
  async assertCanSetSupervisor(
    userId: string,
    supervisorId: string | null,
  ): Promise<void> {
    // Setting supervisor to null is always allowed
    if (supervisorId === null) {
      return;
    }

    // Get all ancestors of the proposed supervisor (including the supervisor themselves)
    const ancestors = await this.getAncestorIds(supervisorId);
    const allAncestors = [supervisorId, ...ancestors];

    // If userId is in the ancestors of supervisorId, it would create a cycle
    if (allAncestors.includes(userId)) {
      throw new ConflictException(
        {
          code: 'SUPERVISOR_CYCLE',
          message: 'Ese cambio dejaría a alguien como jefe de su propio jefe. Elige otra persona.',
        },
      );
    }
  }
}
