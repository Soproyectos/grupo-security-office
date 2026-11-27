import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { Prisma, Quote, QuoteItem } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { directLegacyProductLibrary } from '../../products/product-library';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { HierarchyService } from '../../../common/hierarchy/hierarchy.service';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { resolveAccess } from '../../../common/security/data-scope';
import type { AccessIdentity } from '../../../common/security/data-scope';
import { AuditService } from '../../audit/audit.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { AddQuoteItemDto, DISCOUNT_NOT_ALLOWED_IN_ADD } from './dto/add-quote-item.dto';
import {
  UpdateQuoteItemDto,
  DISCOUNT_NOT_ALLOWED_IN_GENERAL_EDIT,
} from './dto/update-quote-item.dto';
import { UpdateQuoteItemDiscountDto } from './dto/update-quote-item-discount.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { QuoteQueryDto } from './dto/quote-query.dto';
import { UpdateQuoteItemPriceDto } from './dto/update-quote-item-price.dto';
import { resolveCompanyTariff } from '../../../common/pricing/company-tariff';
import {
  ITEM_EDITABLE_STATUSES,
  computeLineTotal,
  computeQuoteTotals,
  effectiveQuoteStatus,
  assertMoneyWithinLimit,
  generateQuoteCode,
  withQuoteCodeRetry,
} from './quote-math';

/**
 * Contexto de acceso del módulo: `AccessContext` + `jti` de la sesión viva
 * (Passport ya la atestiguó en esta petición; alimenta `AccessIdentity` de
 * `resolveAccess`; cada operación consume grants vigentes en el servicio.
 */
export type QuotesAccessContext = AccessContext & { jti?: string };

/**
 * Matriz de transiciones válidas de la cotización (sigue el patrón
 * PO_TRANSITIONS del módulo suppliers eliminado).
 * `vencida` no es una transición: se calcula al leer cuando `validUntil`
 * ya pasó y la cotización sigue abierta.
 */
const QUOTE_TRANSITIONS: Record<string, string[]> = {
  borrador: ['enviada', 'cancelada'],
  enviada: ['negociacion', 'ganada', 'perdida', 'cancelada'],
  negociacion: ['ganada', 'perdida', 'cancelada'],
  ganada: [],
  perdida: [],
  cancelada: [],
};



/**
 * Valida el rango de un descuento porcentual de línea. Sin este chequeo,
 * un discountPct > 100 produce lineTotal negativo y contamina subtotal/total
 * de toda la cotización (class-validator solo verifica que sea decimal, no
 * el rango, porque el campo es string por @IsDecimal).
 */
function assertValidDiscountPct(discountPct: number): void {
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
    throw new BadRequestException(
      'discountPct debe estar entre 0 y 100',
    );
  }
}

@Injectable()
export class QuotesService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private hierarchy: HierarchyService,
    private audit: AuditService,
    private grants: AccessAssignmentsService,
    /** Productos, tarifas y Listas (biblioteca); lo demás sigue siendo operativo. */
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(prisma),
  ) {}

  /** Contrato de tipos compartido: el cliente de biblioteca expone sus modelos con los tipos operativos. */
  private get db(): PrismaService { return this.library.client as unknown as PrismaService }

  /**
   * Condición de visibilidad derivada del grant quotes:read.
   */
  private async identity(ctx: QuotesAccessContext, grants: Awaited<ReturnType<AccessAssignmentsService['grantsForUser']>>): Promise<AccessIdentity> {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');
    return { userId: ctx.userId, ...(ctx.jti ? { jti: ctx.jti } : {}), verified: true,
      active: true, sessionValid: true, sessionUserId: ctx.userId,
      superAdmin: ctx.roles.includes('Super Admin'), teamOwnerIds: ctx.roles.includes('Super Admin') || !grants.some((grant) => grant.scope === 'team')
        ? [] : await this.hierarchy.getSubordinateIds(ctx.userId) };
  }

  private async decide(actionId: string, ctx: QuotesAccessContext, resource?: {id:string; ownerId?:string|null}) {
    const grants = await this.grants.grantsForUser(ctx.userId!);
    return resolveAccess({ identity: await this.identity(ctx, grants), actionId, grants,
      ...(resource ? { resource: { ...resource, kind: 'quote' as const, ownerId: resource.ownerId ?? undefined } } : {}) });
  }

  private async scopeWhere(ctx: QuotesAccessContext): Promise<Prisma.QuoteWhereInput> {
    const decision = await this.decide('quotes:read', ctx);
    if (!decision.allowed) throw new ForbiddenException('Sin permiso quotes:read');
    if (decision.scope === 'global') return {};
    if (decision.scope === 'team') return { ownerId: { in: [...new Set([ctx.userId!, ...(await this.hierarchy.getSubordinateIds(ctx.userId!))])] } };
    return { ownerId: ctx.userId };
  }

  /**
   * Estado efectivo: si `validUntil` ya pasó y la cotización sigue abierta,
   * se reporta como `vencida` al leer (sin tabla ni cron, por decisión del
   * issue). El campo persistido no cambia.
   */
  private effectiveStatus<T extends { status: string; validUntil: Date | null }>(
    quote: T,
  ): T {
    return effectiveQuoteStatus(quote);
  }

  async findAll(query: QuoteQueryDto, ctx: QuotesAccessContext) {
    const { search, status, customerId, ownerId, skip = 0, take = 50 } = query;

    const and: Prisma.QuoteWhereInput[] = [];

    const scope = await this.scopeWhere(ctx);
    if (Object.keys(scope).length > 0) and.push(scope);
    if (customerId) and.push({ customerId });
    if (ownerId) and.push({ ownerId });
    if (status) and.push({ status });
    if (search?.trim()) {
      and.push({ code: { contains: search.trim(), mode: 'insensitive' } });
    }

    const where: Prisma.QuoteWhereInput = and.length ? { AND: and } : {};

    const [data, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { _count: { select: { items: true } } },
      }),
      this.prisma.quote.count({ where }),
    ]);

    return {
      data: data.map((q) => this.effectiveStatus(q)),
      meta: { total, skip, take, totalPages: Math.max(1, Math.ceil(total / take)) },
    };
  }

  /**
   * Detalle con ítems. EXCEPCIÓN DELIBERADA: una cotización ya creada se lee
   * SIEMPRE completa con sus precios snapshot, aunque el usuario haya perdido
   * acceso a la Lista después. El snapshot es dato DE LA COTIZACIÓN, no del
   * catálogo. Lo que sí se bloquea sin acceso vigente a la Lista es AGREGAR
   * o EDITAR ítems (ver assertItemOperationAccess).
   */
  async findOne(id: string, ctx: QuotesAccessContext) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { position: 'asc' } },
        customer: { select: { id: true, code: true, name: true, status: true } },
        owner: { select: { id: true, name: true, email: true } },
        // Who sent it when it came from the customer portal (needed to contact them by WhatsApp).
        portalAccount: { select: { id: true, contactName: true, email: true, phone: true } },
      },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');

    const decision = await this.decide('quotes:read', ctx, { id, ownerId: quote.ownerId });
    if (!decision.allowed) {
      // 404 para no revelar la existencia fuera de alcance.
      throw new NotFoundException('Cotización no encontrada');
    }

    // Lista (solo filas antiguas) y tarifa viven en la biblioteca: se resuelven por id, sin relación entre bases.
    const [lista, priceList] = await Promise.all([
      quote.listaId
        ? this.db.lista.findUnique({ where: { id: quote.listaId }, select: { id: true, code: true, name: true, currency: true } })
        : Promise.resolve(null),
      quote.priceListId
        ? this.db.priceList.findUnique({ where: { id: quote.priceListId }, select: { id: true, code: true, name: true, currency: true } })
        : Promise.resolve(null),
    ]);
    return this.effectiveStatus({ ...quote, lista, priceList });
  }

  async create(dto: CreateQuoteDto, ctx: QuotesAccessContext) {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');
    // Without the grant at any level there is nothing to evaluate: fail before touching the customer.
    if (!(await this.decide('quotes:create', ctx)).allowed) throw new ForbiddenException('Sin permiso quotes:create');

    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer || !customer.isActive || !(await this.customerReadable(customer.id, customer.ownerId, ctx))) {
      throw new NotFoundException('Cliente no encontrado');
    }
    // The level of `quotes:create` limits WHOSE customers can be quoted: own = mine, team = my team's, global = any.
    if (!(await this.decide('quotes:create', ctx, { id: customer.id, ownerId: customer.ownerId })).allowed) {
      throw new ForbiddenException('No puedes crear cotizaciones para clientes fuera de tu alcance');
    }

    // Quotes no longer depend on Listas (C1): `dto.listaId`, if sent, is ignored.
    // Default price list: the company tariff (tier, else the general one); the id given by the caller wins.
    const companyTariff = (await resolveCompanyTariff({ prisma: this.prisma, db: this.db }, 'FINAL_CUSTOMER', customer.portalTierId, false))?.priceListId ?? null;
    if (dto.priceListId) await this.assertSellablePriceList(dto.priceListId, companyTariff, ctx);
    const priceListId = dto.priceListId ?? companyTariff;
    const userId = ctx.userId;

    const quote = await withQuoteCodeRetry(() => this.prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          code: await generateQuoteCode(tx),
          // Ids escalares: la tarifa pertenece a la biblioteca (sin relación entre bases).
          customerId: dto.customerId,
          priceListId,
          ownerId: userId,
          taxRate: dto.taxRate !== undefined ? Number(dto.taxRate) : 19,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          notes: dto.notes ?? null,
        },
      });
      await tx.quoteStatusEvent.create({
        data: { quoteId: created.id, fromStatus: null, toStatus: 'borrador', userId },
      });
      return created;
    }));

    await this.audit.log({
      userId: ctx.userId,
      action: 'create',
      entity: 'Quote',
      entityId: quote.id,
      newValues: {
        code: quote.code,
        customerId: quote.customerId,
        priceListId: quote.priceListId,
      },
    });

    return quote;
  }

  /**
   * Agregar ítem. Reglas:
   * - COM-03 §3: el alta NO lleva descuento (`discountPct` → 400 sin escritura);
   *   el descuento se aplica después con `updateItemDiscount` (quotes:discount)
   * - producto: quien cotiza tiene `products:read` (cualquier alcance) o es Super Admin; sin Listas (C1/C4)
   * - precio vigente en la priceList de la cotización (misma regla de vigencia
   *   que prices.service: validFrom <= now <= validUntil, límites abiertos;
   *   si varios, el vigente con updatedAt más reciente)
   * - si no hay precio vigente → la línea entra con unitPrice null («precio por
   *   confirmar»), lineTotal 0 y fuera de los totales (C5; nunca se inventa)
   * - snapshot: unitPrice/sku/name quedan CONGELADOS en el QuoteItem
   */
  async addItem(quoteId: string, dto: AddQuoteItemDto, ctx: QuotesAccessContext) {
    // Rechazo ANTES de leer o escribir (COM-02 §3, sin cambio parcial).
    if (dto.discountPct !== undefined) {
      throw new BadRequestException(DISCOUNT_NOT_ALLOWED_IN_ADD);
    }

    const quote = await this.assertItemableQuote(quoteId, ctx);

    const product = await this.assertProductReadable(dto.productId, ctx);

    // Current price in the quote's tariff (same validity rule as prices.service). With no tariff or no current
    // price the line enters as "precio por confirmar" (unitPrice null): the advisor completes it, never invented.
    const now = new Date();
    const prices = quote.priceListId
      ? await this.db.price.findMany({
          where: { productId: dto.productId, priceListId: quote.priceListId },
        })
      : [];
    const vigente = prices
      .filter(
        (p) =>
          (!p.validFrom || p.validFrom <= now) &&
          (!p.validUntil || p.validUntil >= now),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

    // Línea nueva SIEMPRE con descuento 0: aplicarlo es la operación dedicada
    // `PATCH /:id/items/:itemId/discount` (COM-03 §3), nunca el alta.
    const discountPct = 0;
    const unitPrice = vigente ? Number(vigente.value) : null;

    const lineTotal = computeLineTotal(unitPrice, dto.quantity, discountPct);
    assertMoneyWithinLimit(lineTotal);

    await this.prisma.$transaction(async (tx) => {
      await tx.quoteItem.create({
        data: {
          quoteId,
          productId: dto.productId,
          priceId: vigente?.id ?? null,
          position: await this.nextPosition(quoteId, tx),
          sku: product.sku,
          name: product.name,
          priceListId: quote.priceListId,
          unitPrice,
          currency: vigente?.currency ?? quote.currency,
          quantity: dto.quantity,
          discountPct,
          lineTotal,
          priceCapturedAt: now,
        },
      });
      await this.recalculateTotals(quoteId, tx);
    });
    return this.findOne(quoteId, ctx);
  }

  /**
   * Edición GENERAL de la línea: SOLO cantidad (COM-03 §3, regla 2).
   * `discountPct` en el payload → 400 `discount-not-allowed-in-general-edit`
   * ANTES de leer o escribir: ni la cantidad se aplica (sin cambio parcial).
   * El descuento previo se conserva SIEMPRE y `lineTotal` se re-deriva sobre
   * esa misma fórmula con el descuento conservado (regla 3: nada histórico
   * se recalcula).
   */
  async updateItem(
    quoteId: string,
    itemId: string,
    dto: UpdateQuoteItemDto,
    ctx: QuotesAccessContext,
  ) {
    if (dto.discountPct !== undefined) {
      throw new BadRequestException(DISCOUNT_NOT_ALLOWED_IN_GENERAL_EDIT);
    }

    await this.assertItemableQuote(quoteId, ctx);

    const item = await this.prisma.quoteItem.findUnique({ where: { id: itemId } });
    if (!item || item.quoteId !== quoteId) {
      throw new NotFoundException('Ítem no encontrado en esta cotización');
    }

    const quantity = dto.quantity !== undefined ? dto.quantity : item.quantity;
    // El descuento NUNCA se lee del DTO aquí: sale del ítem persistido.
    const discountPct = Number(item.discountPct);
    assertValidDiscountPct(discountPct);

    const lineTotal = computeLineTotal(this.snapshotPrice(item), quantity, discountPct);
    assertMoneyWithinLimit(lineTotal);
    await this.prisma.$transaction(async (tx) => {
      await tx.quoteItem.update({
        where: { id: itemId },
        data: { quantity, discountPct, lineTotal },
      });
      await this.recalculateTotals(quoteId, tx);
    });
    return this.findOne(quoteId, ctx);
  }

  /**
   * Operación dedicada de descuento por línea (COM-03 §3, DISENO:189
   * «Descuentos de cotización: `quotes:discount`, además de edición de la
   * cotización»). Orden de rechazo, todo ANTES de escribir:
   *  (1) cotización en scope + estado editable + Lista con view_prices → 404/409/403;
   *  (2) ítem pertenece a la cotización → 404;
   *  (3) concesión `quotes:discount` sobre el recurso vía `resolveAccess` → 403;
   *  (4) rango 0–100 → 400.
   * Conserva `quantity` (no viaja en el DTO) y re-deriva `lineTotal` con el
   * descuento nuevo y el `unitPrice` snapshot (regla 3).
   */
  async updateItemDiscount(
    quoteId: string,
    itemId: string,
    dto: UpdateQuoteItemDiscountDto,
    ctx: QuotesAccessContext,
  ) {
    const quote = await this.assertItemableQuote(quoteId, ctx);

    const item = await this.prisma.quoteItem.findUnique({ where: { id: itemId } });
    if (!item || item.quoteId !== quoteId) {
      throw new NotFoundException('Ítem no encontrado en esta cotización');
    }

    await this.assertActionAllowed('quotes:discount', quote, ctx);

    const discountPct = Number(dto.discountPct);
    assertValidDiscountPct(discountPct);

    const quantity = item.quantity;
    const lineTotal = computeLineTotal(this.snapshotPrice(item), quantity, discountPct);
    assertMoneyWithinLimit(lineTotal);
    await this.prisma.$transaction(async (tx) => {
      await tx.quoteItem.update({
        where: { id: itemId },
        data: { discountPct, lineTotal },
      });
      await this.recalculateTotals(quoteId, tx);
    });

    // DISENO:159 «aplicación de descuentos cuando se delegue»: selectiva y
    // sin PII — solo el porcentaje antes/después por ítem (patrón COM-02 §5.3).
    await this.audit.log({
      userId: ctx.userId,
      action: 'discount_change',
      entity: 'QuoteItem',
      entityId: itemId,
      oldValues: { discountPct: Number(item.discountPct) },
      newValues: { discountPct },
    });

    return this.findOne(quoteId, ctx);
  }

  /**
   * Sets the price of a line (typically one that entered as "precio por confirmar"). Same scope and
   * editability rules as any line edit (`quotes:edit`, editable status). Recomputes the line and the totals,
   * keeping the line's current discount.
   */
  async setItemPrice(
    quoteId: string,
    itemId: string,
    dto: UpdateQuoteItemPriceDto,
    ctx: QuotesAccessContext,
  ) {
    const unitPrice = Number(dto.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new BadRequestException('El precio debe ser mayor que cero');
    }
    await this.assertItemableQuote(quoteId, ctx);

    const item = await this.prisma.quoteItem.findUnique({ where: { id: itemId } });
    if (!item || item.quoteId !== quoteId) {
      throw new NotFoundException('Ítem no encontrado en esta cotización');
    }

    // Only a "precio por confirmar" line can be priced by hand; a tariff price is lowered with the discount.
    if (item.unitPrice !== null && item.unitPrice !== undefined) {
      throw new ConflictException('Este precio viene de la tarifa; para bajarlo usa el descuento');
    }
    const discountPct = Number(item.discountPct);
    assertValidDiscountPct(discountPct);
    const rounded = Math.round((unitPrice + Number.EPSILON) * 100) / 100;
    const lineTotal = computeLineTotal(rounded, item.quantity, discountPct);
    assertMoneyWithinLimit(lineTotal);

    await this.prisma.$transaction(async (tx) => {
      await tx.quoteItem.update({
        where: { id: itemId },
        data: { unitPrice: rounded, lineTotal, priceCapturedAt: new Date() },
      });
      await this.recalculateTotals(quoteId, tx);
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'price_set',
      entity: 'QuoteItem',
      entityId: itemId,
      oldValues: { unitPrice: item.unitPrice === null ? null : Number(item.unitPrice) },
      newValues: { unitPrice: rounded },
    });

    return this.findOne(quoteId, ctx);
  }

  async removeItem(quoteId: string, itemId: string, ctx: QuotesAccessContext) {
    await this.assertItemableQuote(quoteId, ctx);

    const item = await this.prisma.quoteItem.findUnique({ where: { id: itemId } });
    if (!item || item.quoteId !== quoteId) {
      throw new NotFoundException('Ítem no encontrado en esta cotización');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.quoteItem.delete({ where: { id: itemId } });
      await this.recalculateTotals(quoteId, tx);
    });
    return this.findOne(quoteId, ctx);
  }

  async updateStatus(id: string, dto: UpdateQuoteStatusDto, ctx: QuotesAccessContext) {
    const quote = await this.findOne(id, ctx);
    await this.assertActionAllowed('quotes:status', quote, ctx);
    const from = quote.status;
    // `vencida` (estado efectivo) se trata como su estado persistido: no se
    // puede transicionar desde una cotización vencida.
    const persistedFrom = from === 'vencida'
      ? (await this.prisma.quote.findUniqueOrThrow({ where: { id } })).status
      : from;

    const allowed = QUOTE_TRANSITIONS[persistedFrom] ?? [];
    if (!allowed.includes(dto.status)) {
      // F7 (COM-03 §6): conflicto de ESTADO → 409, igual que el resto del
      // módulo (ítems no editables `:441`, doble ganada `:563`). Antes era
      // 400; reversión de un solo punto si la auditoría final prefiere el
      // 400 documentado en Swagger. El mensaje no cambia (la UI lo pinta tal cual).
      throw new ConflictException(
        `No se puede pasar de ${persistedFrom} a ${dto.status}`,
      );
    }


    if (dto.status === 'perdida' && !dto.lostReason) {
      throw new BadRequestException('Perdida requiere lostReason');
    }

    if (dto.status === 'ganada' && (quote.items ?? []).some((item) => item.unitPrice === null)) {
      throw new ConflictException('Hay productos con precio por confirmar');
    }

    const now = new Date();
    const isWin = dto.status === 'ganada';

    // Transición + conversión del cliente en UNA transacción: al pasar a
    // `ganada`, si el cliente estaba en LEAD se convierte a CLIENTE con
    // convertedAt (la conversión automática que el issue de Customer dejó
    // pendiente para este momento).
    const updated = await this.prisma.$transaction(async (tx) => {
      const q = await tx.quote.update({
        where: { id },
        data: {
          status: dto.status,
          closedAt: isWin || dto.status === 'perdida' ? now : undefined,
          issuedAt: dto.status === 'enviada' ? (quote.issuedAt ?? now) : undefined,
          lostReason: dto.status === 'perdida' ? dto.lostReason : undefined,
        },
      });
      // Traceability: every status change is recorded in the same transaction as the change itself.
      await tx.quoteStatusEvent.create({
        data: {
          quoteId: id,
          fromStatus: persistedFrom,
          toStatus: dto.status,
          userId: ctx.userId,
          note: dto.status === 'perdida' ? dto.lostReason : undefined,
        },
      });
      if (isWin) {
        const customer = await tx.customer.findUnique({
          where: { id: quote.customerId },
        });
        if (customer?.status === 'LEAD') {
          await tx.customer.update({
            where: { id: customer.id },
            data: { status: 'CLIENTE', convertedAt: now },
          });
        }
        // Creación automática del pedido de venta (SalesOrder) en la misma
        // transacción: snapshot 1:1 de la quote ganada (issue #24).
        try {
          await tx.salesOrder.create({
            data: {
              code: await this.generateSalesOrderCode(tx),
              quote: { connect: { id } },
              customer: { connect: { id: quote.customerId } },
              owner: { connect: { id: quote.ownerId } },
              total: quote.total,
              currency: quote.currency,
            },
          });
        } catch (error) {
          // Lanzar dentro del $transaction revierte también el cambio de
          // estado de la quote y la conversión del cliente (atomicidad).
          this.throwOnSalesOrderConflict(error);
        }
      }
      return q;
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'status_change',
      entity: 'Quote',
      entityId: id,
      oldValues: { status: persistedFrom },
      newValues: { status: dto.status, ...(isWin ? { closedAt: now } : {}) },
    });

    return this.findOne(id, ctx);
  }

  /**
   * Status history of a quote, oldest first. Needs `quotes:history` within its scope (own = the quote's owner is
   * the caller; team; global; Super Admin bypass). Out of scope is a 403.
   */
  async history(id: string, ctx: QuotesAccessContext) {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');
    const quote = await this.prisma.quote.findUnique({ where: { id }, select: { id: true, ownerId: true } });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    const decision = await this.decide('quotes:history', ctx, { id, ownerId: quote.ownerId });
    if (!decision.allowed) throw new NotFoundException('Cotización no encontrada');

    const events = await this.prisma.quoteStatusEvent.findMany({
      where: { quoteId: id },
      orderBy: { createdAt: 'asc' },
    });
    const userIds = [...new Set(events.map((e) => e.userId).filter((v): v is string => !!v))];
    const accountIds = [...new Set(events.map((e) => e.portalAccountId).filter((v): v is string => !!v))];
    const [users, accounts] = await Promise.all([
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      accountIds.length ? this.prisma.portalAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, contactName: true } }) : Promise.resolve([]),
    ]);
    const userNames = new Map<string, string>(users.map((u): [string, string] => [u.id, u.name]));
    const accountNames = new Map<string, string>(accounts.map((a): [string, string] => [a.id, a.contactName]));

    return events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      createdAt: e.createdAt,
      actor: e.portalAccountId
        ? `Cliente: ${accountNames.get(e.portalAccountId) ?? 'cliente'}`
        : (e.userId ? userNames.get(e.userId) : null) ?? 'Sistema',
    }));
  }

  // ============================== Helpers ==============================

  /**
   * Product the caller may quote (C4): it must exist and the caller holds `products:read` in any scope, or is
   * Super Admin. Lists play no part. Missing permission is a 403; a missing product a 404.
   */
  private async assertProductReadable(productId: string, ctx: QuotesAccessContext) {
    const isSuper = ctx.roles.includes('Super Admin');
    if (!isSuper) {
      const held = await this.grants.grantsForUser(ctx.userId!);
      if (!held.some((grant) => grant.actionId === 'products:read')) {
        throw new ForbiddenException('No tienes permiso para consultar productos');
      }
    }
    const product = await this.db.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  /** The frozen price of a line as a number; null when it is "precio por confirmar". */
  private snapshotPrice(item: { unitPrice: unknown }): number | null {
    return item.unitPrice === null || item.unitPrice === undefined ? null : Number(item.unitPrice);
  }

  /**
   * Cotización en scope + en estado que permita editar ítems + acceso
   * vigente a la Lista (agregar/editar SÍ se bloquea sin acceso; leer no).
   */
  private async assertItemableQuote(quoteId: string, ctx: QuotesAccessContext) {
    const quote = await this.findOne(quoteId, ctx);
    await this.assertActionAllowed('quotes:edit', quote, ctx);
    if (
      !ITEM_EDITABLE_STATUSES.includes(quote.status as never)
    ) {
      throw new ConflictException(
        `Los ítems no se pueden modificar en estado '${quote.status}'`,
      );
    }
    return quote;
  }

  private async customerReadable(id: string, ownerId: string | null, ctx: QuotesAccessContext): Promise<boolean> {
    const grants = await this.grants.grantsForUser(ctx.userId!);
    const decision = resolveAccess({ identity: await this.identity(ctx, grants), actionId: 'customers:read',
      grants,
      resource: { id, kind: 'customer', ownerId: ownerId ?? undefined } });
    return decision.allowed;
  }

  /**
   * Decide `quotes:discount` SOBRE la cotización con `resolveAccess` (patrón
   * COM-02 §4 customers.service.ts): la identidad se construye en servidor
   * (los guards atestiguaron la sesión en ESTA petición), las concesiones
   * salen de `grantsForUser` y el alcance `team` se cubre con la jerarquía
   * actual. Sin cobertura → 403 con el motivo del resolver; NO se inventa
   * ningún permiso global — Super Admin es excepción EXPLÍCITA del resolver
   * y la dependencia `quotes:edit` se exige dentro del propio resolver.
   * El módulo sigue sin `@Permissions` (D5 pendiente, decisión del coordinador).
   */
  private async assertActionAllowed(
    actionId: 'quotes:discount' | 'quotes:edit' | 'quotes:status',
    quote: { id: string; ownerId: string | null },
    ctx: QuotesAccessContext,
  ): Promise<void> {
    const grants = await this.grants.grantsForUser(ctx.userId!);
    const decision = resolveAccess({
      identity: await this.identity(ctx, grants),
      actionId,
      grants,
      resource: { id: quote.id, kind: 'quote', ownerId: quote.ownerId ?? undefined },
    });
    if (!decision.allowed) {
      throw new ForbiddenException(
        `Sin permiso ${actionId} sobre esta cotización (${decision.reason ?? 'denegado'})`,
      );
    }
  }

  /**
   * Recalcula los montos denormalizados de la cotización (SÓLO backend lo hace,
   * el frontend nunca hace aritmética de dinero). Las líneas «precio por
   * confirmar» (unitPrice null) no suman. Fórmula en `computeQuoteTotals`.
   */
  private async recalculateTotals(
    quoteId: string,
    db: Pick<PrismaService, 'quote'> = this.prisma,
  ): Promise<void> {
    const quote = await db.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: { items: true },
    });
    const totals = computeQuoteTotals(quote.items, Number(quote.discount), Number(quote.taxRate));
    assertMoneyWithinLimit(totals.subtotal, totals.taxAmount, totals.total);
    await db.quote.update({ where: { id: quoteId }, data: totals });
  }

  /**
   * A price list chosen by hand must exist, be active and be "sellable": the company tariff, or a list used by an
   * active tier or a general mapping. Super Admin may pick any active list. Never lets a bad id reach the FK.
   */
  private async assertSellablePriceList(id: string, companyTariff: string | null, ctx: QuotesAccessContext) {
    const invalid = new BadRequestException('Esa tarifa no se puede usar en cotizaciones');
    const list = await this.db.priceList.findUnique({ where: { id } });
    if (!list || !list.isActive) throw invalid;
    if (ctx.roles.includes('Super Admin') || id === companyTariff) return;
    const [tier, mapping] = await Promise.all([
      this.prisma.portalTier.findFirst({ where: { priceListId: id, isActive: true }, select: { id: true } }),
      this.prisma.portalPriceListMapping.findFirst({ where: { priceListId: id }, select: { id: true } }),
    ]);
    if (!tier && !mapping) throw invalid;
  }

  private async nextPosition(quoteId: string, db: Pick<PrismaService, 'quoteItem'> = this.prisma): Promise<number> {
    const last = await db.quoteItem.findFirst({
      where: { quoteId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return (last?.position ?? 0) + 1;
  }

  /**
   * Código secuencial SO-0001, SO-0002, ... (mismo patrón que Quote y
   * Customer). Recibe el cliente transaccional para correr dentro de la
   * misma transacción que crea el SalesOrder (issue #24).
   */
  private async generateSalesOrderCode(
    tx: Prisma.TransactionClient,
    attempt = 0,
  ): Promise<string> {
    if (attempt >= 5) {
      // Sin fallback no-secuencial: un código de pedido debe ser siempre
      // SO-NNNN. Tras reintentos acotados se aborta con error de dominio.
      throw new ConflictException(
        'No fue posible generar un código de pedido único; reintente',
      );
    }

    const last = await tx.salesOrder.findFirst({
      where: { code: { startsWith: 'SO-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastNum = last?.code ? parseInt(last.code.slice(4), 10) : 0;
    const next = Number.isFinite(lastNum) ? lastNum + 1 : 1;
    const candidate = `SO-${String(next).padStart(4, '0')}`;

    const exists = await tx.salesOrder.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (exists) return this.generateSalesOrderCode(tx, attempt + 1);
    return candidate;
  }

  /**
   * Traduce la colisión de unicidad de SalesOrder (`quoteId` único, p.ej. dos
   * transiciones a `ganada` concurrentes) a un error de dominio controlado,
   * sin exponer el error crudo de Prisma. Cualquier otro error se re-lanza
   * intacto. Mismo patrón que `throwOnUniqueViolation` de CustomersService.
   */
  private throwOnSalesOrderConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Ya existe un pedido para esta cotización');
    }
    throw error;
  }
}
