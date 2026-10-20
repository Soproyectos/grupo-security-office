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
  getPackageTemplate,
  isActionIdFormat,
} from './access-catalog';
import type { AccessScope } from './access-catalog';
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

export interface ApplyPackageOptions extends RemoveSourceOptions {
  readonly reason?: string;
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
 * pertenece a una fuente (manual o plantilla) y el retiro de una fuente nunca
 * toca a las demás ni a las concesiones legacy de UserPermission.
 */
@Injectable()
export class AccessAssignmentsService {
  constructor(private prisma: PrismaService) {}

  /** Concesiones vigentes de un usuario, con la fuente que las otorga. */
  async grantsForUser(userId: string): Promise<ScopedGrant[]> {
    const rows = await this.prisma.accessGrant.findMany({
      where: { source: { userId } },
      select: { sourceId: true, actionId: true, scopeKind: true, resourceId: true },
    });
    return rows.map((row) => ({
      sourceId: row.sourceId,
      actionId: row.actionId,
      scope: row.scopeKind as AccessScope,
      ...(row.resourceId ? { resourceId: row.resourceId } : {}),
    }));
  }

  /** Fuentes vigentes (procedencia) de un usuario, opcionalmente por acción. */
  async sourcesFor(userId: string, actionId?: string): Promise<AccessSourceView[]> {
    return this.prisma.accessSource.findMany({
      where: {
        userId,
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
   * Alta o sustitución de una fuente y su bloque de concesiones.
   *
   * `source.sourceId` presente → sustituye los grants de esa fuente; ausente →
   * crea fuente nueva. El estado del usuario versiona por cada operación (OCC):
   * `expectedVersion` desactualizada → 409 sin escribir nada.
   */
  async replaceSource(
    actor: AccessIdentity,
    recipientId: string,
    input: ReplaceSourceInput,
  ): Promise<AssignmentReceipt> {
    this.assertWritableIdentity(actor);
    this.assertCatalogVersion(input.catalogVersion);
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
        const sourceId = await this.persistSource(tx, actor.userId, recipientId, input);
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
      });
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
      });
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
   * Reemplaza el bloque MANUAL del destinatario (crea la fuente si no existe).
   *
   * Reutiliza la primera fuente manual para que un segundo PUT «reemplace el
   * conjunto» en lugar de acumular procedencias (mismo criterio que
   * `/dashboard-permissions`); las fuentes template no se tocan.
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
   * Aplica un paquete del catálogo (COM-01 §3, E2) como fuente template.
   *
   * `replaceSource` con `kind:'template'`+`templateId:<paquete>`: idempotente
   * por fuente (reaplicar reemplaza la MISMA fuente, no acumula procedencias)
   * y versionada por OCC. Valida cada selección contra el catálogo (acción
   * inexistente/deshabilitada/alcance no permitido → 400) y el `catalogVersion`
   * (desactualizado → 409). Sin migración automática de cuentas existentes:
   * sólo el destinatario indicado recibe la fuente.
   */
  async applyPackage(
    actor: AccessIdentity,
    recipientId: string,
    packageId: string,
    options: ApplyPackageOptions,
  ): Promise<AssignmentReceipt> {
    // Autorización primero: un no-SuperAdmin recibe 403 aunque el paquete
    // no exista (la validación de entrada no precede al control de acceso).
    this.assertWritableIdentity(actor);
    const template = getPackageTemplate(packageId);
    if (!template) {
      throw new BadRequestException(
        `El paquete "${packageId}" no existe en el catálogo de paquetes.`,
      );
    }

    // Reaplicar el mismo paquete reemplaza SU fuente (no acumula procedencias).
    const existing = await this.prisma.accessSource.findFirst({
      where: { userId: recipientId, kind: 'template', templateId: packageId },
      select: { id: true },
    });

    return this.replaceSource(actor, recipientId, {
      expectedVersion: options.expectedVersion,
      catalogVersion: options.catalogVersion ?? ACCESS_CATALOG_VERSION,
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      source: {
        kind: 'template',
        templateId: packageId,
        ...(existing ? { sourceId: existing.id } : {}),
        reason: options.reason ?? 'template-applied',
      },
      grants: template.selections.map((item) => ({
        actionId: item.actionId,
        scope: item.scope,
        ...(item.resourceId ? { resourceId: item.resourceId } : {}),
      })),
    });
  }

  /**
   * Retira la fuente template del paquete indicado (COM-01 §3). Conserva las
   * demás fuentes (manual u otro paquete): si otra concede la misma acción,
   * el acceso se mantiene con su alcance. El retiro nunca depende de que el
   * paquete siga en el catálogo: la fila de procedencia es la autoridad.
   */
  async removePackage(
    actor: AccessIdentity,
    recipientId: string,
    packageId: string,
    options: RemoveSourceOptions,
  ): Promise<AssignmentReceipt> {
    // Autorización primero: el 403 precede al 404 del paquete no aplicado.
    this.assertWritableIdentity(actor);
    const source = await this.prisma.accessSource.findFirst({
      where: { userId: recipientId, kind: 'template', templateId: packageId },
      select: { id: true },
    });
    if (!source) {
      throw new NotFoundException(
        `El usuario ${recipientId} no tiene aplicado el paquete "${packageId}".`,
      );
    }
    return this.removeSource(actor, recipientId, source.id, options);
  }

  /** Versión OCC vigente del estado de concesiones del usuario (0 sin estado). */
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
   * Dependencias (BASE-02 §5.3) sólo sobre acciones AÑADIDAS: si otra fuente
   * vigente ya la concede, la dependencia cuenta; los retiros nunca fallan.
   */
  private async assertDependencies(
    recipientId: string,
    targetSourceId: string | undefined,
    grants: ReadonlyArray<{ actionId: string }>,
  ): Promise<void> {
    const others = await this.prisma.accessGrant.findMany({
      where: {
        source: { userId: recipientId },
        ...(targetSourceId ? { sourceId: { not: targetSourceId } } : {}),
      },
      select: { actionId: true },
    });
    const otherActionIds = new Set(others.map((row) => row.actionId));
    const resultingActionIds = new Set([
      ...otherActionIds,
      ...grants.map((grant) => grant.actionId),
    ]);

    for (const grant of grants) {
      if (otherActionIds.has(grant.actionId)) continue; // ya concedida por otra fuente
      const definition = getActionDefinition(grant.actionId);
      for (const dependency of definition?.dependencies ?? []) {
        if (!resultingActionIds.has(dependency)) {
          throw new BadRequestException(
            `La acción "${grant.actionId}" requiere "${dependency}" concedida (dependencia BASE-02 §5.3).`,
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
    input: ReplaceSourceInput,
  ): Promise<string> {
    const kind = input.source?.kind ?? 'manual';

    if (input.source?.sourceId) {
      const existing = await tx.accessSource.findUnique({
        where: { id: input.source.sourceId },
        select: { userId: true },
      });
      if (!existing || existing.userId !== recipientId) {
        throw new NotFoundException(
          `La fuente ${input.source.sourceId} no pertenece al usuario ${recipientId}.`,
        );
      }
      const updated = await tx.accessSource.update({
        where: { id: input.source.sourceId },
        data: {
          kind,
          templateId: input.source.templateId ?? null,
          reason: input.source.reason ?? null,
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
        kind,
        templateId: input.source?.templateId ?? null,
        catalogVersion: input.catalogVersion,
        grantedById: actorId,
        reason: input.source?.reason ?? null,
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
