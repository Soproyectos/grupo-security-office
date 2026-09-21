import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Quote, QuoteItem } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { HierarchyService } from '../../../common/hierarchy/hierarchy.service';
import { AuditService } from '../../audit/audit.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { AddQuoteItemDto } from './dto/add-quote-item.dto';
import { UpdateQuoteItemDto } from './dto/update-quote-item.dto';
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto';
import { QuoteQueryDto } from './dto/quote-query.dto';

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
 * Quién mueve cada estado. A diferencia de las órdenes de compra (solo
 * admins), una cotización la maneja su comercial dueño: cualquier rol de
 * escritura puede transicionar SI está en scope (dueño o su jerarquía).
 */
const QUOTE_STATUS_ROLES: Record<string, string[]> = {
  enviada: ['Super Admin', 'Admin Comercial', 'Supervisor', 'Vendedor'],
  negociacion: ['Super Admin', 'Admin Comercial', 'Supervisor', 'Vendedor'],
  ganada: ['Super Admin', 'Admin Comercial', 'Supervisor'],
  perdida: ['Super Admin', 'Admin Comercial', 'Supervisor', 'Vendedor'],
  cancelada: ['Super Admin', 'Admin Comercial', 'Supervisor', 'Vendedor'],
};

/** Estados en los que los ítems todavía se pueden agregar/editar/quitar. */
const ITEM_EDITABLE_STATUSES = ['borrador', 'enviada', 'negociacion'] as const;

/** Redondeo a 2 decimales para aritmética de dinero (siempre en backend). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

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
  ) {}

  /**
   * Condición de visibilidad por jerarquía. Devuelve `null` para admins
   * (sin filtro) o un `WhereInput` con `ownerId in [self + subordinados]`.
   */
  private async scopeWhere(
    ctx: AccessContext,
  ): Promise<Prisma.QuoteWhereInput | null> {
    if (this.acl.isListasAdmin(ctx.roles)) return null;
    const ids = ctx.userId
      ? await this.hierarchy.getSubordinateIds(ctx.userId, { includeSelf: true })
      : [];
    return { ownerId: { in: ids } };
  }

  /**
   * Estado efectivo: si `validUntil` ya pasó y la cotización sigue abierta,
   * se reporta como `vencida` al leer (sin tabla ni cron, por decisión del
   * issue). El campo persistido no cambia.
   */
  private effectiveStatus<T extends { status: string; validUntil: Date | null }>(
    quote: T,
  ): T {
    if (
      ITEM_EDITABLE_STATUSES.includes(quote.status as never) &&
      quote.validUntil &&
      quote.validUntil.getTime() < Date.now()
    ) {
      return { ...quote, status: 'vencida' };
    }
    return quote;
  }

  async findAll(query: QuoteQueryDto, ctx: AccessContext) {
    const { search, status, customerId, ownerId, skip = 0, take = 50 } = query;

    const and: Prisma.QuoteWhereInput[] = [];

    const scope = await this.scopeWhere(ctx);
    if (scope) and.push(scope);
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
  async findOne(id: string, ctx: AccessContext) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { position: 'asc' } },
        customer: { select: { id: true, code: true, name: true, status: true } },
        lista: { select: { id: true, code: true, name: true, currency: true } },
        priceList: { select: { id: true, code: true, name: true, currency: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');

    const scope = await this.scopeWhere(ctx);
    if (scope) {
      const scoped = scope.ownerId as { in: string[] };
      if (!scoped.in.includes(quote.ownerId)) {
        // 404 (no 403) para no revelar la existencia fuera de scope.
        throw new NotFoundException('Cotización no encontrada');
      }
    }

    return this.effectiveStatus(quote);
  }

  async create(dto: CreateQuoteDto, ctx: AccessContext) {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');

    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer || !customer.isActive) {
      throw new NotFoundException('Cliente no encontrado');
    }

    // Solo Listas donde el usuario tenga al menos view_prices.
    await this.acl.assertListaAccess(dto.listaId, ctx, 'view_prices');

    const quote = await this.prisma.quote.create({
      data: {
        code: await this.generateCode(),
        customer: { connect: { id: dto.customerId } },
        lista: { connect: { id: dto.listaId } },
        priceList: dto.priceListId
          ? { connect: { id: dto.priceListId } }
          : undefined,
        owner: { connect: { id: ctx.userId } },
        taxRate: dto.taxRate !== undefined ? Number(dto.taxRate) : 19,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        notes: dto.notes ?? null,
      },
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'create',
      entity: 'Quote',
      entityId: quote.id,
      newValues: {
        code: quote.code,
        customerId: quote.customerId,
        listaId: quote.listaId,
        priceListId: quote.priceListId,
      },
    });

    return quote;
  }

  /**
   * Agregar ítem. Reglas:
   * - acceso producto con view_prices (issue #16)
   * - acceso vigente a la Lista de la cotización (agregar/editar sí se bloquea)
   * - precio vigente en la priceList de la cotización (misma regla de vigencia
   *   que prices.service: validFrom <= now <= validUntil, límites abiertos;
   *   si varios, el vigente con updatedAt más reciente)
   * - si no hay precio vigente → 409 citando el SKU (nunca precio 0)
   * - snapshot: unitPrice/sku/name quedan CONGELADOS en el QuoteItem
   */
  async addItem(quoteId: string, dto: AddQuoteItemDto, ctx: AccessContext) {
    const quote = await this.assertItemableQuote(quoteId, ctx);

    await this.acl.assertProductAccess(dto.productId, ctx, 'view_prices');

    if (!quote.priceListId) {
      throw new ConflictException(
        'La cotización no tiene una tarifa (priceListId) asignada',
      );
    }

    const now = new Date();
    const prices = await this.prisma.price.findMany({
      where: { productId: dto.productId, priceListId: quote.priceListId },
    });
    const vigente = prices
      .filter(
        (p) =>
          (!p.validFrom || p.validFrom <= now) &&
          (!p.validUntil || p.validUntil >= now),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

    if (!vigente) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { sku: true },
      });
      throw new ConflictException(
        `El producto ${product?.sku ?? dto.productId} no tiene precio vigente en la tarifa de la cotización`,
      );
    }

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    const discountPct = dto.discountPct !== undefined ? Number(dto.discountPct) : 0;
    assertValidDiscountPct(discountPct);
    const unitPrice = Number(vigente.value);

    const item = await this.prisma.quoteItem.create({
      data: {
        quote: { connect: { id: quoteId } },
        product: { connect: { id: dto.productId } },
        price: { connect: { id: vigente.id } },
        position: await this.nextPosition(quoteId),
        sku: product!.sku,
        name: product!.name,
        listaId: quote.listaId,
        priceListId: quote.priceListId,
        unitPrice,
        currency: vigente.currency,
        quantity: dto.quantity,
        discountPct,
        lineTotal: this.computeLineTotal(unitPrice, dto.quantity, discountPct),
        priceCapturedAt: now,
      },
    });

    await this.recalculateTotals(quoteId);
    return this.findOne(quoteId, ctx);
  }

  async updateItem(
    quoteId: string,
    itemId: string,
    dto: UpdateQuoteItemDto,
    ctx: AccessContext,
  ) {
    await this.assertItemableQuote(quoteId, ctx);

    const item = await this.prisma.quoteItem.findUnique({ where: { id: itemId } });
    if (!item || item.quoteId !== quoteId) {
      throw new NotFoundException('Ítem no encontrado en esta cotización');
    }

    const quantity = dto.quantity !== undefined ? dto.quantity : item.quantity;
    const discountPct =
      dto.discountPct !== undefined ? Number(dto.discountPct) : Number(item.discountPct);
    assertValidDiscountPct(discountPct);

    await this.prisma.quoteItem.update({
      where: { id: itemId },
      data: {
        quantity,
        discountPct,
        lineTotal: this.computeLineTotal(Number(item.unitPrice), quantity, discountPct),
      },
    });

    await this.recalculateTotals(quoteId);
    return this.findOne(quoteId, ctx);
  }

  async removeItem(quoteId: string, itemId: string, ctx: AccessContext) {
    await this.assertItemableQuote(quoteId, ctx);

    const item = await this.prisma.quoteItem.findUnique({ where: { id: itemId } });
    if (!item || item.quoteId !== quoteId) {
      throw new NotFoundException('Ítem no encontrado en esta cotización');
    }

    await this.prisma.quoteItem.delete({ where: { id: itemId } });
    await this.recalculateTotals(quoteId);
    return this.findOne(quoteId, ctx);
  }

  async updateStatus(id: string, dto: UpdateQuoteStatusDto, ctx: AccessContext) {
    const quote = await this.findOne(id, ctx);
    const from = quote.status;
    // `vencida` (estado efectivo) se trata como su estado persistido: no se
    // puede transicionar desde una cotización vencida.
    const persistedFrom = from === 'vencida'
      ? (await this.prisma.quote.findUniqueOrThrow({ where: { id } })).status
      : from;

    const allowed = QUOTE_TRANSITIONS[persistedFrom] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `No se puede pasar de ${persistedFrom} a ${dto.status}`,
      );
    }

    const roleAllowed = QUOTE_STATUS_ROLES[dto.status] ?? ['Super Admin'];
    if (!ctx.roles.some((r) => roleAllowed.includes(r))) {
      throw new ForbiddenException(
        `El estado '${dto.status}' requiere rol: ${roleAllowed.join(' o ')}`,
      );
    }

    if (dto.status === 'perdida' && !dto.lostReason) {
      throw new BadRequestException('Perdida requiere lostReason');
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

  // ============================== Helpers ==============================

  /**
   * Cotización en scope + en estado que permita editar ítems + acceso
   * vigente a la Lista (agregar/editar SÍ se bloquea sin acceso; leer no).
   */
  private async assertItemableQuote(quoteId: string, ctx: AccessContext) {
    const quote = await this.findOne(quoteId, ctx);
    if (
      !ITEM_EDITABLE_STATUSES.includes(quote.status as never)
    ) {
      throw new ConflictException(
        `Los ítems no se pueden modificar en estado '${quote.status}'`,
      );
    }
    await this.acl.assertListaAccess(quote.listaId, ctx, 'view_prices');
    return quote;
  }

  private computeLineTotal(
    unitPrice: number,
    quantity: number,
    discountPct: number,
  ): number {
    // Fórmula exacta: unitPrice * quantity * (1 - discountPct/100),
    // redondeada a 2 decimales por línea.
    return round2(unitPrice * quantity * (1 - discountPct / 100));
  }

  /**
   * Recalcula los montos denormalizados de la cotización (SÓLO backend lo hace,
   * el frontend nunca hace aritmética de dinero). Fórmula exacta:
   *   subtotal  = Σ lineTotal (ya redondeado por línea)
   *   base      = subtotal - discount (descuento global de la cotización)
   *   taxAmount = round2(base * taxRate / 100)
   *   total     = round2(base + taxAmount)
   */
  private async recalculateTotals(quoteId: string): Promise<void> {
    const quote = await this.prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: { items: true },
    });
    const subtotal = round2(
      quote.items.reduce((sum, it) => sum + Number(it.lineTotal), 0),
    );
    const base = subtotal - Number(quote.discount);
    const taxAmount = round2((base * Number(quote.taxRate)) / 100);
    await this.prisma.quote.update({
      where: { id: quoteId },
      data: { subtotal, taxAmount, total: round2(base + taxAmount) },
    });
  }

  private async nextPosition(quoteId: string): Promise<number> {
    const last = await this.prisma.quoteItem.findFirst({
      where: { quoteId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return (last?.position ?? 0) + 1;
  }

  /**
   * Código secuencial COT-0001, COT-0002, ... (mismo patrón que Customer y el
   * generador de PO del módulo suppliers eliminado). Reintenta ante carrera.
   */
  private async generateCode(attempt = 0): Promise<string> {
    if (attempt >= 5) {
      return `COT-${Date.now().toString(36).toUpperCase()}`;
    }

    const last = await this.prisma.quote.findFirst({
      where: { code: { startsWith: 'COT-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastNum = last?.code ? parseInt(last.code.slice(4), 10) : 0;
    const next = Number.isFinite(lastNum) ? lastNum + 1 : 1;
    const candidate = `COT-${String(next).padStart(4, '0')}`;

    const exists = await this.prisma.quote.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (exists) return this.generateCode(attempt + 1);
    return candidate;
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
