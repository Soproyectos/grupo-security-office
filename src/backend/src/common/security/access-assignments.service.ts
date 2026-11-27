import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessScopeKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACCESS_CATALOG_VERSION,
  getActionDefinition,
  isActionIdFormat,
  isAssignableAction,
} from './access-catalog';
import type { AccessScope } from './access-catalog';
import { GRANTING_SOURCE_WHERE } from './granting-sources';
import {
  LIBRARY_SELECTION_ACTION_IDS,
  LIBRARY_SELECTION_TEMPLATE_ID,
  closeLibrarySelection,
} from './library-selection';
import type { AccessIdentity, ScopedGrant } from './data-scope';

export interface AssignmentSourceInput {
  readonly sourceId?: string;
  readonly kind?: 'manual' | 'template';
  readonly templateId?: string;
  readonly reason?: string;
}

export interface ReplaceSourceInput {
  readonly expectedVersion: number;
  readonly catalogVersion: string;
  readonly idempotencyKey?: string;
  readonly source?: AssignmentSourceInput;
  readonly grants: ReadonlyArray<{
    readonly actionId: string;
    readonly scope: AccessScope;
    readonly resourceId?: string;
  }>;
}

export interface RemoveSourceOptions {
  readonly expectedVersion: number;
  readonly catalogVersion?: string;
  readonly idempotencyKey?: string;
}

export interface AssignmentReceipt {
  readonly userId: string;
  readonly sourceId: string;
  readonly accessVersion: number;
  readonly changed: boolean;
  readonly replayed?: boolean;
  readonly grants: readonly ScopedGrant[];
}

export interface AccessSourceView {
  readonly id: string;
  readonly kind: string;
  readonly templateId: string | null;
  readonly catalogVersion: string;
  readonly grantedById: string;
  readonly reason: string | null;
}

// Las asignaciones agrupan varias consultas por túnel remoto; el límite de
// 5 s puede expirar antes de registrar la auditoría. Se mantiene un límite finito.
const ACCESS_ASSIGNMENT_TRANSACTION_OPTIONS = { timeout: 30_000 };

/** Order of the levels that nest inside each other (own inside team inside global). */
const LEVEL_RANK = { own: 1, team: 2, global: 3 } as const;

function versionConflict(currentVersion: number): ConflictException {
  return new ConflictException({
    code: 'access-version-conflict',
    message:
      'Las concesiones de este usuario cambiaron mientras se editaban; recargue y reintente.',
    currentVersion,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

/**
 * Asignación de concesiones por acción+alcance con procedencia (BASE-04 §7.2).
 *
 * Sólo Super Admin administra (la autoconcesión es excepción EXPLÍCITA suya);
 * la identidad llega ya verificada del servidor. Cada bloque de concesiones
 * pertenece a una fuente manual (o a la selección directa de Biblioteca) y el
 * retiro de una fuente nunca toca a las demás ni a las concesiones legacy de
 * UserPermission. Los paquetes de paneles ya no existen: todo se asigna acción
 * por acción.
 */
@Injectable()
export class AccessAssignmentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Effective grants of a user, with the source that grants each one.
   *
   * Only sources that grant access count (see `granting-sources.ts`). Rows left
   * by the removed "packages" stay in the database but no longer grant anything.
   */
  async grantsForUser(userId: string): Promise<ScopedGrant[]> {
    const rows = await this.prisma.accessGrant.findMany({
      where: { source: { userId, ...GRANTING_SOURCE_WHERE } },
      select: { sourceId: true, actionId: true, scopeKind: true, resourceId: true },
    });
    return rows.map((row) => ({
      sourceId: row.sourceId,
      actionId: row.actionId,
      scope: row.scopeKind as AccessScope,
      ...(row.resourceId ? { resourceId: row.resourceId } : {}),
    }));
  }

  /** Sources that grant access to a user (provenance), optionally for one action. */
  async sourcesFor(userId: string, actionId?: string): Promise<AccessSourceView[]> {
    return this.prisma.accessSource.findMany({
      where: {
        userId,
        ...GRANTING_SOURCE_WHERE,
        ...(actionId ? { grants: { some: { actionId } } } : {}),
      },
      select: {
        id: true,
        kind: true,
        templateId: true,
        catalogVersion: true,
        grantedById: true,
        reason: true,
      },
    });
  }

  /**
   * Creates or replaces one MANUAL source and its block of grants.
   *
   * `source.sourceId` present -> replaces the grants of that source; absent ->
   * creates a new source. The user's access state is versioned on every
   * operation (OCC): an outdated `expectedVersion` -> 409 without writing.
   * Work packages no longer exist, so no package or template source is accepted.
   */
  async replaceSource(
    actor: AccessIdentity,
    recipientId: string,
    input: ReplaceSourceInput,
  ): Promise<AssignmentReceipt> {
    this.assertWritableIdentity(actor);
    this.assertCatalogVersion(input.catalogVersion);
    if (input.source?.kind === 'template' || input.source?.templateId) {
      throw new BadRequestException('Los paquetes de paneles ya no existen; asigna las acciones una por una.');
    }
    await this.assertRecipient(recipientId);
    this.validateGrants(input.grants);
    this.assertExpectedVersion(input.expectedVersion);

    const requestHash = this.hashRequest(recipientId, input.source, input.grants);
    if (input.idempotencyKey) {
      const replay = await this.replayOperation(actor.userId, input.idempotencyKey, requestHash);
      if (replay) return replay;
    }

    const targetSourceId = input.source?.sourceId;
    await this.assertDependencies(recipientId, targetSourceId, input.grants);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const accessVersion = await this.bumpVersion(tx, recipientId, input.expectedVersion);
        const previousGrants = targetSourceId ? await tx.accessGrant.findMany({
          where: { sourceId: targetSourceId },
          select: { actionId: true, scopeKind: true, resourceId: true },
        }) : [];
        const sourceId = await this.persistSource(tx, actor.userId, recipientId, {
          catalogVersion: input.catalogVersion,
          kind: 'manual',
          ...(targetSourceId ? { sourceId: targetSourceId } : {}),
          ...(input.source?.reason ? { reason: input.source.reason } : {}),
          grants: input.grants,
        });
        const grants = input.grants.map((grant) => ({
          sourceId,
          actionId: grant.actionId,
          scope: grant.scope,
          ...(grant.resourceId ? { resourceId: grant.resourceId } : {}),
        }));

        await this.recordOperation(tx, {
          actorId: actor.userId,
          idempotencyKey: input.idempotencyKey ?? randomUUID(),
          operation: 'replaceSource',
          targetId: recipientId,
          requestHash,
          catalogVersion: input.catalogVersion,
          receipt: { userId: recipientId, sourceId, accessVersion, changed: true, grants },
        });
        await tx.auditLog.create({ data: {
          userId: actor.userId,
          action: 'replaceSource', entity: 'UserAccess', entityId: recipientId,
          oldValues: { sourceId, grants: previousGrants },
          newValues: { sourceId, grants: input.grants.map((grant) => ({
            actionId: grant.actionId, scopeKind: grant.scope, resourceId: grant.resourceId ?? '',
          })) },
        } });

        return { userId: recipientId, sourceId, accessVersion, changed: true, grants };
      }, ACCESS_ASSIGNMENT_TRANSACTION_OPTIONS);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'idempotency-conflict',
          message: 'Otra operación con la misma clave de idempotencia está en curso.',
        });
      }
      throw error;
    }
  }

  /**
   * Retiro de UNA fuente. Conserva los grants de las demás (BASE-02 §5.2) y
   * nunca queda bloqueado por dependencias: retirar es siempre permitido.
   */
  async removeSource(
    actor: AccessIdentity,
    recipientId: string,
    sourceId: string,
    options: RemoveSourceOptions,
  ): Promise<AssignmentReceipt> {
    this.assertWritableIdentity(actor);
    this.assertCatalogVersion(options.catalogVersion ?? ACCESS_CATALOG_VERSION);
    await this.assertRecipient(recipientId);
    this.assertExpectedVersion(options.expectedVersion);

    const requestHash = this.hashRequest(recipientId, { sourceId }, []);
    if (options.idempotencyKey) {
      const replay = await this.replayOperation(actor.userId, options.idempotencyKey, requestHash);
      if (replay) return replay;
    }
    const source = await this.prisma.accessSource.findUnique({ where: { id: sourceId } });
    if (!source || source.userId !== recipientId) {
      throw new NotFoundException(
        `La fuente ${sourceId} no pertenece al usuario ${recipientId}.`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const accessVersion = await this.bumpVersion(tx, recipientId, options.expectedVersion);
        const removedGrants = await tx.accessGrant.findMany({
          where: { sourceId },
          select: { actionId: true, scopeKind: true, resourceId: true },
        });
        await tx.accessSource.delete({ where: { id: sourceId } });

        await this.recordOperation(tx, {
          actorId: actor.userId,
          idempotencyKey: options.idempotencyKey ?? randomUUID(),
          operation: 'removeSource',
          targetId: recipientId,
          requestHash,
          catalogVersion: options.catalogVersion ?? ACCESS_CATALOG_VERSION,
          receipt: { userId: recipientId, sourceId, accessVersion, changed: true, grants: [] },
          removedGrants,
        });
        await tx.auditLog.create({ data: {
          userId: actor.userId,
          action: 'removeSource', entity: 'UserAccess', entityId: recipientId,
          oldValues: { sourceId, grants: removedGrants },
          newValues: { sourceId, grants: [] },
        } });

        return { userId: recipientId, sourceId, accessVersion, changed: true, grants: [] };
      }, ACCESS_ASSIGNMENT_TRANSACTION_OPTIONS);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'idempotency-conflict',
          message: 'Otra operación con la misma clave de idempotencia está en curso.',
        });
      }
      throw error;
    }
  }

  /**
   * Replaces the MANUAL block of the recipient (creates the source if missing).
   *
   * Reuses the first manual source so a second PUT "replaces the set" instead
   * of piling up sources (same criterion as `/dashboard-permissions`). An empty
   * `grants` list clears the manual block, so the last action can always be
   * removed. The Library checkbox selection is a different source and is
   * not touched.
   */
  async replaceManualSource(
    actor: AccessIdentity,
    recipientId: string,
    input: Omit<ReplaceSourceInput, 'source'> & { readonly reason?: string },
  ): Promise<AssignmentReceipt> {
    const manual = await this.prisma.accessSource.findFirst({
      where: { userId: recipientId, kind: 'manual' },
      select: { id: true },
    });
    if (input.grants.length === 0) {
      if (manual) {
        return this.removeSource(actor, recipientId, manual.id, {
          expectedVersion: input.expectedVersion,
          catalogVersion: input.catalogVersion,
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        });
      }
      // Nothing to clear: validate the request and answer without writing.
      this.assertWritableIdentity(actor);
      this.assertCatalogVersion(input.catalogVersion);
      await this.assertRecipient(recipientId);
      this.assertExpectedVersion(input.expectedVersion);
      return {
        userId: recipientId,
        sourceId: '',
        accessVersion: await this.accessVersionFor(recipientId),
        changed: false,
        grants: [],
      };
    }
    return this.replaceSource(actor, recipientId, {
      expectedVersion: input.expectedVersion,
      catalogVersion: input.catalogVersion,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      source: {
        kind: 'manual',
        ...(manual ? { sourceId: manual.id } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      },
      grants: input.grants,
    });
  }

  /**
   * Saves the Library checkbox selection as ONE direct source per user
   * (`biblioteca-seleccion`, global scope). The server closes the dependencies;
   * the client never decides. Inside the same transaction it removes the same
   * Library checkboxes from the user's manual source, so each of those actions
   * has one single place to be switched off. Library extras that are not
   * checkboxes (for example "Publicar en tienda") are never touched, and the
   * save is refused when one of them would be left without the action it needs.
   */
  async replaceLibrarySelection(
    actor: AccessIdentity,
    recipientId: string,
    input: {
      readonly expectedVersion: number;
      readonly catalogVersion?: string;
      readonly idempotencyKey?: string;
      readonly reason?: string;
      readonly actionIds: readonly string[];
    },
  ): Promise<AssignmentReceipt> {
    this.assertWritableIdentity(actor);
    const catalogVersion = input.catalogVersion ?? ACCESS_CATALOG_VERSION;
    this.assertCatalogVersion(catalogVersion);
    await this.assertRecipient(recipientId);
    this.assertExpectedVersion(input.expectedVersion);
    const actionIds = closeLibrarySelection(input.actionIds);
    const grants = actionIds.map((actionId) => ({ actionId, scope: 'global' as AccessScope }));
    this.validateGrants(grants);

    const requestHash = this.hashRequest(
      recipientId, { kind: 'template', templateId: LIBRARY_SELECTION_TEMPLATE_ID }, grants,
    );
    if (input.idempotencyKey) {
      const replay = await this.replayOperation(actor.userId, input.idempotencyKey, requestHash);
      if (replay) return replay;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const accessVersion = await this.bumpVersion(tx, recipientId, input.expectedVersion);
        const selection = await tx.accessSource.findFirst({
          where: { userId: recipientId, kind: 'template', templateId: LIBRARY_SELECTION_TEMPLATE_ID },
          select: { id: true },
        });
        const previousGrants = selection ? await tx.accessGrant.findMany({
          where: { sourceId: selection.id },
          select: { sourceId: true, actionId: true, scopeKind: true, resourceId: true },
        }) : [];
        const cleanedManualGrants = await this.removeManualSelectionGrants(tx, recipientId);
        await this.assertLibraryExtrasKeepDependencies(tx, recipientId, selection?.id, actionIds);

        let sourceId = '';
        if (grants.length) {
          sourceId = await this.persistSource(tx, actor.userId, recipientId, {
            catalogVersion,
            kind: 'template',
            templateId: LIBRARY_SELECTION_TEMPLATE_ID,
            ...(selection ? { sourceId: selection.id } : {}),
            reason: input.reason ?? 'library-selection',
            grants,
          });
        } else if (selection) {
          await tx.accessSource.delete({ where: { id: selection.id } });
        }

        const receiptGrants = grants.map((grant) => ({ sourceId, actionId: grant.actionId, scope: grant.scope }));
        const removedGrants = [...previousGrants, ...cleanedManualGrants];
        await this.recordOperation(tx, {
          actorId: actor.userId,
          idempotencyKey: input.idempotencyKey ?? randomUUID(),
          operation: 'replaceLibrarySelection',
          targetId: recipientId,
          requestHash,
          catalogVersion,
          receipt: { userId: recipientId, sourceId, accessVersion, changed: true, grants: receiptGrants },
          removedGrants,
        });
        await tx.auditLog.create({ data: {
          userId: actor.userId,
          action: 'replaceLibrarySelection', entity: 'UserAccess', entityId: recipientId,
          oldValues: { sourceId: selection?.id ?? null, grants: previousGrants, cleanedManualGrants },
          newValues: {
            sourceId: sourceId || null,
            grants: actionIds.map((actionId) => ({ actionId, scopeKind: 'global', resourceId: '' })),
            cleanedManualGrantCount: cleanedManualGrants.length,
          },
        } });
        return { userId: recipientId, sourceId, accessVersion, changed: true, grants: receiptGrants };
      }, ACCESS_ASSIGNMENT_TRANSACTION_OPTIONS);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'idempotency-conflict',
          message: 'Otra operación con la misma clave de idempotencia está en curso.',
        });
      }
      throw error;
    }
  }

  /** Removes the Library checkbox actions from the user's manual sources. */
  private async removeManualSelectionGrants(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<{ sourceId: string; actionId: string; scopeKind: AccessScopeKind; resourceId: string }[]> {
    const manualSources = await tx.accessSource.findMany({
      where: { userId, kind: 'manual' },
      select: { id: true },
    });
    if (!manualSources.length) return [];
    const where = {
      sourceId: { in: manualSources.map((source) => source.id) },
      actionId: { in: [...LIBRARY_SELECTION_ACTION_IDS] },
    };
    const removed = await tx.accessGrant.findMany({
      where,
      select: { sourceId: true, actionId: true, scopeKind: true, resourceId: true },
    });
    if (removed.length) await tx.accessGrant.deleteMany({ where });
    return removed;
  }

  /**
   * The grants that stay (everything granted outside the checkbox selection)
   * must still find the Library actions they depend on.
   */
  private async assertLibraryExtrasKeepDependencies(
    tx: Prisma.TransactionClient,
    userId: string,
    selectionSourceId: string | undefined,
    selectionActionIds: readonly string[],
  ): Promise<void> {
    const others = await tx.accessGrant.findMany({
      where: {
        source: { userId, ...GRANTING_SOURCE_WHERE },
        ...(selectionSourceId ? { sourceId: { not: selectionSourceId } } : {}),
      },
      select: { actionId: true },
    });
    const resulting = new Set([...others.map((row) => row.actionId), ...selectionActionIds]);
    const libraryIds = new Set(LIBRARY_SELECTION_ACTION_IDS);
    for (const row of others) {
      for (const dependency of getActionDefinition(row.actionId)?.dependencies ?? []) {
        if (libraryIds.has(dependency) && !resulting.has(dependency)) {
          const label = getActionDefinition(row.actionId)?.label ?? row.actionId;
          const needs = getActionDefinition(dependency)?.label ?? dependency;
          throw new BadRequestException(`Quita primero «${label}»: necesita «${needs}».`);
        }
      }
    }
  }

  /** Current OCC version of the user's access state (0 when there is none). */
  async accessVersionFor(userId: string): Promise<number> {
    const state = await this.prisma.accessState.findUnique({
      where: { userId },
      select: { version: true },
    });
    return state?.version ?? 0;
  }

  private assertWritableIdentity(actor: AccessIdentity): void {
    if (
      !actor ||
      typeof actor.userId !== 'string' ||
      actor.userId.trim() === '' ||
      actor.verified !== true ||
      actor.active !== true ||
      actor.sessionValid !== true ||
      actor.sessionUserId !== actor.userId
    ) {
      throw new UnauthorizedException('Identidad o sesión inválidas');
    }
    // EXCEPCIÓN EXPLÍCITA: sólo Super Admin administra concesiones; la
    // autoconcesión de cualquier otro rol queda prohibida con su propia línea.
    if (actor.superAdmin !== true) {
      throw new ForbiddenException(
        'Sólo Super Admin puede administrar concesiones por acción. La autoconcesión está prohibida salvo para Super Admin.',
      );
    }
  }

  private assertCatalogVersion(catalogVersion: string): void {
    if (catalogVersion !== ACCESS_CATALOG_VERSION) {
      throw new ConflictException({
        code: 'catalog-version-conflict',
        message: 'El navegador trae un catálogo desactualizado; recargue la pantalla.',
        currentCatalogVersion: ACCESS_CATALOG_VERSION,
      });
    }
  }

  private assertExpectedVersion(expectedVersion: number): void {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new BadRequestException(
        'expectedVersion debe ser un entero mayor o igual a cero.',
      );
    }
  }

  private async assertRecipient(recipientId: string): Promise<void> {
    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true },
    });
    if (!recipient) {
      throw new NotFoundException(`El usuario ${recipientId} no existe.`);
    }
  }

  /** Espejo servidor de las reglas del DTO (BASE-04 §8 → 400). */
  private validateGrants(
    grants: ReadonlyArray<{ actionId: string; scope: AccessScope; resourceId?: string }>,
  ): void {
    const seen = new Set<string>();
    for (const grant of grants) {
      if (!isActionIdFormat(grant.actionId)) {
        throw new BadRequestException(
          `"${grant.actionId}" no es un ID de acción válido; se espera el formato apartado:acción.`,
        );
      }
      const definition = getActionDefinition(grant.actionId);
      if (!definition) {
        throw new BadRequestException(
          `La acción "${grant.actionId}" no existe en el catálogo de acciones.`,
        );
      }
      if (!definition.enabled) {
        throw new BadRequestException(
          `La acción "${grant.actionId}" está deshabilitada y no puede concederse.`,
        );
      }
      if (!isAssignableAction(grant.actionId)) {
        throw new BadRequestException('Los permisos anteriores de Listas ya no pueden asignarse. Usa los accesos de Biblioteca.');
      }
      if (!definition.allowedScopes.includes(grant.scope)) {
        throw new BadRequestException(
          `La acción "${grant.actionId}" no admite el alcance "${grant.scope}"; permitidos: ${definition.allowedScopes.join(', ')}.`,
        );
      }
      const needsResource = grant.scope === 'list' || grant.scope === 'product';
      if (needsResource && !grant.resourceId) {
        throw new BadRequestException(
          `El alcance "${grant.scope}" exige un resourceId explícito para "${grant.actionId}".`,
        );
      }
      if (!needsResource && grant.resourceId) {
        throw new BadRequestException(
          `El alcance "${grant.scope}" no admite resourceId; en "${grant.actionId}" se guarda vacío.`,
        );
      }
      const key = `${grant.actionId}|${grant.scope}|${grant.resourceId ?? ''}`;
      if (seen.has(key)) {
        throw new BadRequestException(`Concesión duplicada en la petición: ${key}.`);
      }
      seen.add(key);
    }
  }

  /**
   * Dependencies (BASE-02 §5.3) are checked only on ADDED actions: if another
   * granting source already grants a dependency it counts. Removals never fail.
   * A dependent action can never reach further than what it depends on: with
   * the own / team / global levels, the dependency must be held at the same
   * level or a wider one (e.g. "edit quotes: team" needs "see quotes: team or
   * global"). Resource scopes (list, product) are a different dimension and are
   * not compared.
   */
  private async assertDependencies(
    recipientId: string,
    targetSourceId: string | undefined,
    grants: ReadonlyArray<{ actionId: string; scope?: AccessScope }>,
  ): Promise<void> {
    const others = await this.prisma.accessGrant.findMany({
      where: {
        source: { userId: recipientId, ...GRANTING_SOURCE_WHERE },
        ...(targetSourceId ? { sourceId: { not: targetSourceId } } : {}),
      },
      select: { actionId: true, scopeKind: true },
    });
    const otherActionIds = new Set(others.map((row) => row.actionId));
    const resultingActionIds = new Set([
      ...otherActionIds,
      ...grants.map((grant) => grant.actionId),
    ]);
    // Widest own/team/global level held per action (rank 0 = none of those levels).
    const widest = new Map<string, number>();
    const note = (actionId: string, scope: string | undefined) => {
      const rank = LEVEL_RANK[scope as keyof typeof LEVEL_RANK] ?? 0;
      widest.set(actionId, Math.max(widest.get(actionId) ?? 0, rank));
    };
    for (const row of others) note(row.actionId, row.scopeKind);
    for (const grant of grants) note(grant.actionId, grant.scope);

    for (const grant of grants) {
      if (otherActionIds.has(grant.actionId)) continue; // already granted by another source
      const definition = getActionDefinition(grant.actionId);
      for (const dependency of definition?.dependencies ?? []) {
        if (!resultingActionIds.has(dependency)) {
          throw new BadRequestException(
            `La acción "${grant.actionId}" requiere "${dependency}" concedida (dependencia BASE-02 §5.3).`,
          );
        }
      }
    }
    for (const grant of grants) {
      const rank = LEVEL_RANK[grant.scope as keyof typeof LEVEL_RANK];
      if (!rank) continue; // list / product scopes are not ordered against the others
      const definition = getActionDefinition(grant.actionId);
      for (const dependency of definition?.dependencies ?? []) {
        const dependencyDefinition = getActionDefinition(dependency);
        const ordered = dependencyDefinition?.allowedScopes.some((scope) => scope in LEVEL_RANK);
        if (!ordered) continue;
        if ((widest.get(dependency) ?? 0) < rank) {
          throw new BadRequestException(
            `La acción "${grant.actionId}" con alcance "${grant.scope}" no puede llegar más lejos que "${dependency}"; ` +
            `concede "${dependency}" con alcance "${grant.scope}" o más amplio.`,
          );
        }
      }
    }
  }

  /** OCC atómica: sólo incrementa si la versión sigue siendo la esperada. */
  private async bumpVersion(
    tx: Prisma.TransactionClient,
    userId: string,
    expectedVersion: number,
  ): Promise<number> {
    await tx.accessState.upsert({
      where: { userId },
      create: { userId, version: 0 },
      update: {},
    });

    const { count } = await tx.accessState.updateMany({
      where: { userId, version: expectedVersion },
      data: { version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await tx.accessState.findUnique({
        where: { userId },
        select: { version: true },
      });
      throw versionConflict(current?.version ?? 0);
    }
    return expectedVersion + 1;
  }

  private async persistSource(
    tx: Prisma.TransactionClient,
    actorId: string,
    recipientId: string,
    input: {
      readonly catalogVersion: string;
      readonly kind: 'manual' | 'template';
      readonly templateId?: string;
      readonly sourceId?: string;
      readonly reason?: string;
      readonly grants: ReadonlyArray<{
        readonly actionId: string;
        readonly scope: AccessScope;
        readonly resourceId?: string;
      }>;
    },
  ): Promise<string> {
    if (input.sourceId) {
      const existing = await tx.accessSource.findUnique({
        where: { id: input.sourceId },
        select: { userId: true, kind: true },
      });
      if (!existing || existing.userId !== recipientId) {
        throw new NotFoundException(
          `La fuente ${input.sourceId} no pertenece al usuario ${recipientId}.`,
        );
      }
      // A source never changes kind: editing must not turn a leftover of a
      // removed package into a source that grants access.
      if (existing.kind !== input.kind) {
        throw new BadRequestException('Esa asignación anterior ya no se puede editar; asigna las acciones de nuevo.');
      }
      const updated = await tx.accessSource.update({
        where: { id: input.sourceId },
        data: {
          kind: input.kind,
          templateId: input.templateId ?? null,
          reason: input.reason ?? null,
          catalogVersion: input.catalogVersion,
        },
        select: { id: true },
      });
      await tx.accessGrant.deleteMany({ where: { sourceId: updated.id } });
      await tx.accessGrant.createMany({
        data: input.grants.map((grant) => ({
          sourceId: updated.id,
          actionId: grant.actionId,
          scopeKind: grant.scope as AccessScopeKind,
          resourceId: grant.resourceId ?? '',
        })),
      });
      return updated.id;
    }

    const created = await tx.accessSource.create({
      data: {
        userId: recipientId,
        kind: input.kind,
        templateId: input.templateId ?? null,
        catalogVersion: input.catalogVersion,
        grantedById: actorId,
        reason: input.reason ?? null,
      },
      select: { id: true },
    });
    await tx.accessGrant.createMany({
      data: input.grants.map((grant) => ({
        sourceId: created.id,
        actionId: grant.actionId,
        scopeKind: grant.scope as AccessScopeKind,
        resourceId: grant.resourceId ?? '',
      })),
    });
    return created.id;
  }

  private async replayOperation(
    actorId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<AssignmentReceipt | null> {
    const existing = await this.prisma.accessOperation.findUnique({
      where: {
        actorType_actorId_idempotencyKey: {
          actorType: 'user',
          actorId,
          idempotencyKey,
        },
      },
    });
    if (!existing) return null;
    if (existing.requestHash !== requestHash || existing.outcome !== 'completed') {
      throw new ConflictException({
        code: 'idempotency-conflict',
        message:
          'La clave de idempotencia ya se usó con una operación distinta; use una clave nueva.',
      });
    }
    const receipt = existing.result as unknown as AssignmentReceipt | null;
    if (!receipt) {
      throw new ConflictException({
        code: 'idempotency-conflict',
        message: 'La operación registrada con esta clave no tiene resultado recuperable.',
      });
    }
    return { ...receipt, replayed: true };
  }

  private async recordOperation(
    tx: Prisma.TransactionClient,
    params: {
      actorId: string;
      idempotencyKey: string;
      operation: string;
      targetId: string;
      requestHash: string;
      catalogVersion: string;
      receipt: AssignmentReceipt;
      removedGrants?: readonly { actionId: string; scopeKind: AccessScopeKind; resourceId: string }[];
    },
  ): Promise<void> {
    await tx.accessOperation.create({
      data: {
        actorType: 'user',
        actorId: params.actorId,
        idempotencyKey: params.idempotencyKey,
        actionId: params.operation,
        targetType: 'user',
        targetId: params.targetId,
        requestHash: params.requestHash,
        catalogVersion: params.catalogVersion,
        outcome: 'completed',
        result: {
          ...params.receipt,
          ...(params.removedGrants ? { removedGrants: params.removedGrants } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Huella estable del payload significativo (sin expectedVersion ni clave). */
  private hashRequest(
    recipientId: string,
    source: AssignmentSourceInput | undefined,
    grants: ReadonlyArray<{ actionId: string; scope: AccessScope; resourceId?: string }>,
  ): string {
    // El `sourceId` se resuelve en servidor (p. ej. reaplicar un paquete
    // reemplaza su propia fuente) y no forma parte del payload del administrador:
    // incluirlo haría que la misma operación con la misma clave cambiara de
    // huella entre la primera aplicación y su replay.
    const normalizedSource = source
      ? {
          kind: source.kind ?? 'manual',
          templateId: source.templateId ?? null,
          reason: source.reason ?? null,
        }
      : null;
    const normalized = [...grants]
      .map((grant) => ({
        actionId: grant.actionId,
        scope: grant.scope,
        resourceId: grant.resourceId ?? '',
      }))
      .sort((a, b) =>
        `${a.actionId}|${a.scope}|${a.resourceId}`.localeCompare(
          `${b.actionId}|${b.scope}|${b.resourceId}`,
        ),
      );
    return createHash('sha256')
      .update(
        JSON.stringify({
          recipientId,
          source: normalizedSource,
          grants: normalized,
        }),
      )
      .digest('hex');
  }
}
