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
  isAssignableAction,
} from './access-catalog';
import type { AccessScope } from './access-catalog';
import { LIBRARY_SELECTION_TEMPLATE_ID, closeLibrarySelection } from './library-selection';
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

// Las asignaciones agrupan varias consultas por túnel remoto; el límite de
// 5 s puede expirar antes de registrar la auditoría. Se mantiene un límite finito.
const ACCESS_ASSIGNMENT_TRANSACTION_OPTIONS = { timeout: 30_000 };

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
 * Paquetes de Biblioteca que conviven entre sí. `biblioteca-actualizacion` es
 * el paquete anterior (fichas + precios juntos): ya no se asigna, pero se deja
 * en este conjunto a propósito para que aplicar Productos, Fichas, Precios o
 * Publicar NO le vacíe en silencio los permisos a quien aún lo tiene; solo se
 * retira cuando alguien lo retira. Los demás paquetes anteriores (Listas y
 * precios, Biblioteca de productos, Publicación del catálogo) sí se purgan.
 */
const CURRENT_LIBRARY_PACKAGE_IDS = new Set([
  'biblioteca-consulta',
  'biblioteca-fichas',
  'biblioteca-precios',
  'biblioteca-publicacion',
  'biblioteca-importaciones',
  'biblioteca-maestros',
  'biblioteca-actualizacion',
  LIBRARY_SELECTION_TEMPLATE_ID,
]);

/** Fuentes de Biblioteca que la selección por casillas reemplaza por completo. */
const SELECTION_REPLACED_PACKAGE_IDS = new Set([
  'biblioteca-consulta',
  'biblioteca-fichas',
  'biblioteca-precios',
  'biblioteca-importaciones',
  'biblioteca-maestros',
  'biblioteca-actualizacion',
]);

const LIBRARY_ACTION_PREFIXES = ['products:', 'prices:', 'providers:', 'listas:', 'imports:', 'masters:'] as const;

function isLibraryActionId(actionId: string): boolean {
  return LIBRARY_ACTION_PREFIXES.some((prefix) => actionId.startsWith(prefix));
}

/** Fuente manual o plantilla anterior: la que se purga al aplicar un paquete vigente. */
function isHistoricalLibrarySource(
  source: { kind: string; templateId: string | null } | null | undefined,
): boolean {
  if (!source) return false;
  return source.kind === 'manual' || (
    source.kind === 'template' && !CURRENT_LIBRARY_PACKAGE_IDS.has(source.templateId ?? '')
  );
}

const LIBRARY_GRANT_WHERE = {
  OR: [
    { actionId: { startsWith: 'products:' } },
    { actionId: { startsWith: 'prices:' } },
    { actionId: { startsWith: 'providers:' } },
    { actionId: { startsWith: 'listas:' } },
    { actionId: { startsWith: 'imports:' } },
    { actionId: { startsWith: 'masters:' } },
  ],
} satisfies Prisma.AccessGrantWhereInput;

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
    if (input.source?.templateId && getPackageTemplate(input.source.templateId)?.assignable === false) {
      throw new BadRequestException('Este paquete anterior solo puede retirarse; asigna un acceso de Biblioteca vigente.');
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
    await this.assertDependencies(
      recipientId, targetSourceId, input.grants, this.isCurrentLibrarySource(input.source),
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const accessVersion = await this.bumpVersion(tx, recipientId, input.expectedVersion);
        const previousGrants = targetSourceId ? await tx.accessGrant.findMany({
          where: { sourceId: targetSourceId },
          select: { actionId: true, scopeKind: true, resourceId: true },
        }) : [];
        const sourceId = await this.persistSource(tx, actor.userId, recipientId, input);
        const cleanedLibraryGrants = this.isCurrentLibrarySource(input.source)
          ? await this.removeHistoricalLibraryGrants(tx, recipientId)
          : [];
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
          removedGrants: cleanedLibraryGrants,
        });
        await tx.auditLog.create({ data: {
          userId: actor.userId,
          action: 'replaceSource', entity: 'UserAccess', entityId: recipientId,
          oldValues: { sourceId, grants: previousGrants, cleanedLibraryGrants },
          newValues: { sourceId, grants: input.grants.map((grant) => ({
            actionId: grant.actionId, scopeKind: grant.scope, resourceId: grant.resourceId ?? '',
          })), cleanedHistoricalLibraryGrantCount: cleanedLibraryGrants.length },
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
    if (template.assignable === false) {
      throw new BadRequestException('Este paquete anterior solo puede retirarse; asigna un acceso de Biblioteca vigente.');
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
   * Retira la fuente template del paquete indicado. Al quitar un paquete
   * vigente de Biblioteca, purga también grants históricos de Biblioteca en
   * fuentes manuales/anteriores; los grants comerciales se conservan.
   */
  async removePackage(
    actor: AccessIdentity,
    recipientId: string,
    packageId: string,
    options: RemoveSourceOptions,
  ): Promise<AssignmentReceipt> {
    // Autorización primero: el 403 precede al 404 del paquete no aplicado.
    this.assertWritableIdentity(actor);
    if (CURRENT_LIBRARY_PACKAGE_IDS.has(packageId)) {
      return this.removeCurrentLibraryPackage(actor, recipientId, packageId, options);
    }
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

  /**
   * Aplicar un paquete vigente de Biblioteca retira permisos de Biblioteca
   * heredados de fuentes manuales o plantillas anteriores. Las concesiones de
   * otros dominios y las de otros paquetes vigentes se conservan.
   */
  private isCurrentLibrarySource(source: AssignmentSourceInput | undefined): boolean {
    return source?.kind === 'template' && CURRENT_LIBRARY_PACKAGE_IDS.has(source.templateId ?? '');
  }

  private async removeHistoricalLibraryGrants(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<{ sourceId: string; actionId: string; scopeKind: AccessScopeKind; resourceId: string }[]> {
    const sources = await tx.accessSource.findMany({
      where: { userId },
      select: { id: true, kind: true, templateId: true },
    });
    const historicalSourceIds = sources
      .filter((source) => source.kind === 'manual' || (
        source.kind === 'template' && !CURRENT_LIBRARY_PACKAGE_IDS.has(source.templateId ?? '')
      ))
      .map((source) => source.id);
    if (!historicalSourceIds.length) return [];

    const removed = await tx.accessGrant.findMany({
      where: { sourceId: { in: historicalSourceIds }, ...LIBRARY_GRANT_WHERE },
      select: { sourceId: true, actionId: true, scopeKind: true, resourceId: true },
    });
    if (removed.length) {
      await tx.accessGrant.deleteMany({
        where: { sourceId: { in: historicalSourceIds }, ...LIBRARY_GRANT_WHERE },
      });
    }
    return removed;
  }

  /**
   * Retira un paquete vigente de Biblioteca y purga concesiones heredadas en
   * la misma transacción/version OCC. También puede limpiar residuos aunque ya
   * no exista la fuente del paquete solicitado.
   */
  private async removeCurrentLibraryPackage(
    actor: AccessIdentity,
    recipientId: string,
    packageId: string,
    options: RemoveSourceOptions,
  ): Promise<AssignmentReceipt> {
    this.assertCatalogVersion(options.catalogVersion ?? ACCESS_CATALOG_VERSION);
    await this.assertRecipient(recipientId);
    this.assertExpectedVersion(options.expectedVersion);
    const requestHash = this.hashRequest(recipientId, { kind: 'template', templateId: packageId }, []);
    if (options.idempotencyKey) {
      const replay = await this.replayOperation(actor.userId, options.idempotencyKey, requestHash);
      if (replay) return replay;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const source = await tx.accessSource.findFirst({
          where: { userId: recipientId, kind: 'template', templateId: packageId },
          select: { id: true },
        });
        const historicalSources = await tx.accessSource.findMany({
          where: { userId: recipientId },
          select: { id: true, kind: true, templateId: true },
        });
        const historicalSourceIds = historicalSources
          .filter((item) => item.kind === 'manual' || (
            item.kind === 'template' && !CURRENT_LIBRARY_PACKAGE_IDS.has(item.templateId ?? '')
          ))
          .map((item) => item.id);
        const cleanedLibraryGrants = historicalSourceIds.length
          ? await tx.accessGrant.findMany({
            where: { sourceId: { in: historicalSourceIds }, ...LIBRARY_GRANT_WHERE },
            select: { sourceId: true, actionId: true, scopeKind: true, resourceId: true },
          })
          : [];
        if (!source && !cleanedLibraryGrants.length) {
          throw new NotFoundException(`El usuario ${recipientId} no tiene aplicado el paquete "${packageId}" ni concesiones anteriores de Biblioteca que retirar.`);
        }

        const removedPackageGrants = source ? await tx.accessGrant.findMany({
          where: { sourceId: source.id },
          select: { sourceId: true, actionId: true, scopeKind: true, resourceId: true },
        }) : [];
        const accessVersion = await this.bumpVersion(tx, recipientId, options.expectedVersion);
        if (source) await tx.accessSource.delete({ where: { id: source.id } });
        if (cleanedLibraryGrants.length) {
          await tx.accessGrant.deleteMany({
            where: { sourceId: { in: historicalSourceIds }, ...LIBRARY_GRANT_WHERE },
          });
        }
        const removedGrants = [...removedPackageGrants, ...cleanedLibraryGrants];
        const receipt: AssignmentReceipt = {
          userId: recipientId,
          sourceId: source?.id ?? '',
          accessVersion,
          changed: true,
          grants: [],
        };
        await this.recordOperation(tx, {
          actorId: actor.userId,
          idempotencyKey: options.idempotencyKey ?? randomUUID(),
          operation: 'removeLibraryPackage',
          targetId: recipientId,
          requestHash,
          catalogVersion: options.catalogVersion ?? ACCESS_CATALOG_VERSION,
          receipt,
          removedGrants,
        });
        await tx.auditLog.create({ data: {
          userId: actor.userId,
          action: 'removeLibraryPackage', entity: 'UserAccess', entityId: recipientId,
          oldValues: { sourceId: source?.id ?? null, removedGrants },
          newValues: { sourceId: null, grants: [], cleanedHistoricalLibraryGrants: cleanedLibraryGrants.length },
        } });
        return receipt;
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
   * Guarda la selección de casillas de Biblioteca como UNA fuente `template`
   * (`biblioteca-seleccion`, alcance global) y, en la misma transacción,
   * reemplaza los paquetes Productos/Fichas/Precios/Actualización (anterior) y
   * purga los permisos de Biblioteca de fuentes manuales o anteriores. El
   * cierre de dependencias se calcula aquí; el cliente nunca decide. Conserva
   * Publicar en tienda solo si la selección sigue permitiendo editar fichas.
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
        const sources = await tx.accessSource.findMany({
          where: { userId: recipientId },
          select: { id: true, kind: true, templateId: true },
        });
        const hasPublication = sources.some(
          (source) => source.kind === 'template' && source.templateId === 'biblioteca-publicacion',
        );
        if (hasPublication && !actionIds.includes('products:write')) {
          throw new BadRequestException('Quita primero Publicar en tienda: necesita poder editar fichas.');
        }
        const selection = sources.find(
          (source) => source.kind === 'template' && source.templateId === LIBRARY_SELECTION_TEMPLATE_ID,
        );
        const replacedPackages = sources.filter(
          (source) => source.kind === 'template' && SELECTION_REPLACED_PACKAGE_IDS.has(source.templateId ?? ''),
        );
        const replacedIds = replacedPackages.map((source) => source.id);
        const previousGrants = await tx.accessGrant.findMany({
          where: { sourceId: { in: [...replacedIds, ...(selection ? [selection.id] : [])] } },
          select: { sourceId: true, actionId: true, scopeKind: true, resourceId: true },
        });
        if (replacedIds.length) {
          await tx.accessGrant.deleteMany({ where: { sourceId: { in: replacedIds } } });
          await tx.accessSource.deleteMany({ where: { id: { in: replacedIds } } });
        }
        const cleanedLibraryGrants = await this.removeHistoricalLibraryGrants(tx, recipientId);

        let sourceId = '';
        if (grants.length) {
          sourceId = await this.persistSource(tx, actor.userId, recipientId, {
            expectedVersion: input.expectedVersion,
            catalogVersion,
            source: {
              kind: 'template',
              templateId: LIBRARY_SELECTION_TEMPLATE_ID,
              ...(selection ? { sourceId: selection.id } : {}),
              reason: input.reason ?? 'library-selection',
            },
            grants,
          });
        } else if (selection) {
          await tx.accessSource.delete({ where: { id: selection.id } });
        }

        const receiptGrants = grants.map((grant) => ({ sourceId, actionId: grant.actionId, scope: grant.scope }));
        const removedGrants = [...previousGrants, ...cleanedLibraryGrants];
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
          oldValues: { sourceId: selection?.id ?? null, grants: previousGrants, cleanedLibraryGrants },
          newValues: {
            sourceId: sourceId || null,
            grants: actionIds.map((actionId) => ({ actionId, scopeKind: 'global', resourceId: '' })),
            replacedPackageIds: replacedPackages.map((source) => source.templateId),
            cleanedHistoricalLibraryGrantCount: cleanedLibraryGrants.length,
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
   * Dependencias (BASE-02 §5.3) sólo sobre acciones AÑADIDAS: si otra fuente
   * vigente ya la concede, la dependencia cuenta; los retiros nunca fallan.
   */
  private async assertDependencies(
    recipientId: string,
    targetSourceId: string | undefined,
    grants: ReadonlyArray<{ actionId: string }>,
    purgesHistoricalLibrary = false,
  ): Promise<void> {
    const others = await this.prisma.accessGrant.findMany({
      where: {
        source: { userId: recipientId },
        ...(targetSourceId ? { sourceId: { not: targetSourceId } } : {}),
      },
      select: { actionId: true, source: { select: { kind: true, templateId: true } } },
    });
    // Aplicar un paquete vigente de Biblioteca purga los permisos de Biblioteca
    // de fuentes manuales/anteriores en la misma operación: no pueden cubrir una
    // dependencia, o el permiso nuevo quedaría huérfano tras la purga.
    const survivingOthers = purgesHistoricalLibrary
      ? others.filter((row) => !(isHistoricalLibrarySource(row.source) && isLibraryActionId(row.actionId)))
      : others;
    const otherActionIds = new Set(survivingOthers.map((row) => row.actionId));
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
