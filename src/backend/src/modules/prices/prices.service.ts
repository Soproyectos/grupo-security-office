import { Inject, Injectable, NotFoundException, ConflictException, BadRequestException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Prisma as LibraryPrisma } from '../../../prisma/biblioteca/generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { AclService, AccessContext } from '../../common/acl/acl.service';
import { CopPriceError, isCopCurrency, normalizeCopPrice, resolvePriceCurrency } from '../../common/money/cop-policy';
import { AuditService } from '../audit/audit.service';
import { LibraryAuditService, type LibraryActor, type LibraryEvent } from '../library-audit/library-audit.service';
import { directLegacyProductLibrary } from '../products/product-library';
import { diffFields, PRICE_FIELD_PREFIX, ProductChangeService } from '../products/product-change.service';
import { ProductRevisionsService } from '../products/product-revisions.service';
import { CreatePriceDto } from './dto/create-price.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { findTariffNameCollision } from './import/price-tariffs';
import { buildUsageReport, deleteBlocked, impactConfirmationRequired } from '../masters/master-rules';

/** Monedas permitidas para listas y precios (ISO 4217). */
const ALLOWED_CURRENCIES = ['COP', 'USD', 'EUR'] as const;

@Injectable()
export class PricesService {
  private readonly changes: ProductChangeService;

  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private audit: AuditService,
    /** Per-product history writer (Nest injects the shared one; specs may omit it). */
    @Optional() changes?: ProductChangeService,
    /** Biblioteca: tarifas, precios y productos. Sin proveedor inyectado (specs legados) usa la fachada legacy. */
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(prisma),
    @Inject(LibraryAuditService) private readonly libraryAudit: LibraryAuditService = new LibraryAuditService(library),
    /** CAT-02: price mutations refresh only the working revision. */
    @Optional() private readonly revisions?: ProductRevisionsService,
  ) {
    this.changes = changes ?? new ProductChangeService(prisma, acl, undefined, library);
  }

  /** Contrato compartido de los modelos de biblioteca: el cliente de biblioteca se usa con los tipos operativos. */
  private get db(): PrismaService { return this.library.client as unknown as PrismaService; }
  private get dedicated(): boolean { return this.library.config.mode === 'dedicated'; }

  private write<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.library.writeTransaction((tx) => work(tx as unknown as Prisma.TransactionClient));
  }

  /**
   * Escritura de un solo dato con su evento de biblioteca. Dedicado: transacción propia (dato y evento atómicos).
   * Legacy: la misma llamada directa de siempre, sin transacción nueva (solo respeta la congelación).
   */
  private async writeWithEvent<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if (this.dedicated) return this.write(work);
    this.library.assertWritesAllowed();
    return work(this.db as unknown as Prisma.TransactionClient);
  }

  /** Auditoría histórica (legacy). En modo dedicado los eventos van a biblioteca y AuditLog no se toca. */
  private async legacyAudit(entry: Parameters<AuditService['log']>[0]): Promise<void> {
    if (!this.dedicated) await this.audit.log(entry);
  }

  private async libraryEvent(tx: Prisma.TransactionClient, event: LibraryEvent): Promise<void> {
    if (this.dedicated) await this.libraryAudit.append(tx as unknown as Parameters<LibraryAuditService['append']>[0], event);
  }

  private actor(id?: string, name?: string): LibraryActor {
    return { id: id ?? null, name: name ?? null };
  }

  /** Valida que la moneda (si se envía) esté en la whitelist. */
  private validateCurrency(currency?: string): void {
    if (currency && !(ALLOWED_CURRENCIES as readonly string[]).includes(currency)) {
      throw new BadRequestException(
        `Moneda no permitida. Use una de: ${ALLOWED_CURRENCIES.join(', ')}`,
      );
    }
  }

  /**
   * Moneda coherente (checklist validaciones de precio): si el DTO trae currency
   * y la tarifa (PriceList) destino tiene una moneda distinta → 400. Si el DTO no
   * trae currency, se hereda la de la tarifa (no se valida).
   */
  private assertPriceCurrencyMatches(
    currency: string | undefined,
    priceListCurrency: string | undefined,
  ): void {
    if (currency !== undefined && priceListCurrency !== undefined && currency !== priceListCurrency) {
      throw new BadRequestException(
        `La moneda del precio (${currency}) no coincide con la moneda de la tarifa (${priceListCurrency})`,
      );
    }
  }

  /**
   * Valida que validUntil >= validFrom (si ambos están presentes).
   * Acepta Date (valor persistido) o string ISO (DTO).
   */
  private validatePriceListDates(
    validFrom: Date | string | null,
    validUntil: Date | string | null,
  ): void {
    if (!validFrom || !validUntil) return;
    const from = validFrom instanceof Date ? validFrom : new Date(validFrom);
    const until = validUntil instanceof Date ? validUntil : new Date(validUntil);
    if (until.getTime() < from.getTime()) {
      throw new BadRequestException(
        'La fecha de fin (validUntil) no puede ser anterior a la fecha de inicio (validFrom)',
      );
    }
  }

  /**
   * Convierte un valor de fecha del DTO (string ISO como '2026-01-01') a Date.
   * Valida que no sea Invalid Date → 400. null/undefined/vacío → null.
   * Evita el 500 de Prisma ("premature end of input") al persistir strings (BUG-1).
   */
  private parsePriceDate(value: string | null | undefined): Date | null {
    if (value === null || value === undefined || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Fecha inválida: ${value}`);
    }
    return d;
  }

  /**
   * Valida invariantes de precio:
   *  - valor no negativo (value >= 0).
   *  - vigencia coherente (validFrom <= validUntil), combinando el valor nuevo
   *    con el persistido cuando solo se envía uno.
   */
  private validatePrice(
    value: number | undefined,
    validFrom?: string,
    validUntil?: string,
    existingFrom?: Date | string | null,
    existingUntil?: Date | string | null,
  ): void {
    if (value !== undefined && value < 0) {
      throw new BadRequestException('El valor del precio no puede ser negativo');
    }

    const from = validFrom ? this.parsePriceDate(validFrom) : (existingFrom instanceof Date ? existingFrom : null);
    const until = validUntil ? this.parsePriceDate(validUntil) : (existingUntil instanceof Date ? existingUntil : null);
    if (from && until && until.getTime() < from.getTime()) {
      throw new BadRequestException(
        'La fecha de fin (validUntil) no puede ser anterior a la fecha de inicio (validFrom)',
      );
    }
  }

  /**
   * IMP-03 — normaliza el valor de un precio cuando la moneda efectiva es COP
   * (misma política que el preview: entero, HALF_UP, límite único). Otras monedas
   * conservan su precisión (no se les impone COP). El valor entero COP ≤
   * 9999999999 es exacto como número JS y como Decimal(12,2).
   */
  private normalizeCopInput(value: number, currency: string): number {
    if (!isCopCurrency(currency)) return value;
    try {
      return Number(normalizeCopPrice(value).rounded);
    } catch (error) {
      if (error instanceof CopPriceError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  /**
   * Determina si dos vigencias de precio se solapan. Un null indica límite abierto:
   *  - validFrom null → inicio en -infinito.
   *  - validUntil null → fin en +infinito.
   * Dos rangos [aFrom, aUntil] y [bFrom, bUntil] se solapan si aFrom <= bUntil && bFrom <= aUntil.
   */
  private rangesOverlap(
    aFrom: Date | string | null,
    aUntil: Date | string | null,
    bFrom: Date | string | null,
    bUntil: Date | string | null,
  ): boolean {
    const aFromMs = aFrom ? new Date(aFrom as any).getTime() : -Infinity;
    const aUntilMs = aUntil ? new Date(aUntil as any).getTime() : Infinity;
    const bFromMs = bFrom ? new Date(bFrom as any).getTime() : -Infinity;
    const bUntilMs = bUntil ? new Date(bUntil as any).getTime() : Infinity;
    return aFromMs <= bUntilMs && bFromMs <= aUntilMs;
  }

  /** Formatea una fecha para el mensaje de solapamiento; null = 'abierto'. */
  private formatOverlapDate(d: Date | string | null): string {
    if (!d) return 'abierto';
    return new Date(d as any).toISOString();
  }

  /**
   * Control de solapamiento: busca otro precio del mismo producto y tarifa
   * (priceListId) cuya vigencia se solape. La Lista es solo metadato asociado.
   * Si hay conflicto → 409 con mensaje claro.
   */
  private async assertNoOverlap(params: {
    productId: string;
    priceListId?: string;
    excludeId?: string;
    validFrom: Date | string | null;
    validUntil: Date | string | null;
  }): Promise<void> {
    const { productId, priceListId, excludeId, validFrom, validUntil } = params;

    const others = (await this.db.price.findMany({
      where: {
        productId,
        ...(priceListId ? { priceListId } : {}),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })) ?? [];

    const conflict = others.find((p) =>
      this.rangesOverlap(validFrom, validUntil, p.validFrom, p.validUntil),
    );

    if (conflict) {
      throw new ConflictException(
        `El precio se solapa con la vigencia del precio ${conflict.id} (desde ${this.formatOverlapDate(conflict.validFrom)} hasta ${this.formatOverlapDate(conflict.validUntil)})`,
      );
    }
  }

  async findAllPriceLists() {
    // PriceList es metadato de tarifa (Majorista/Detalle/Oro/...); no contiene precios.
    // El permiso (products:read global) lo exige PriceActionGuard; aquí no se filtra por Lista.
    const lists = await this.db.priceList.findMany({
      include: {
        _count: { select: { prices: true } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      data: lists.map((l) => ({
        ...l,
        priceCount: l._count.prices,
      })),
    };
  }

  async findOnePriceList(id: string, _ctx?: AccessContext) {
    // El permiso (products:read + prices:read globales, porque incluye precios) lo exige PriceActionGuard.
    // Ya no se filtra por Lista: quien tiene la concesión global ve todos los precios de la tarifa.
    const list = await this.db.priceList.findUnique({
      where: { id },
      include: {
        prices: {
          include: { product: { select: { id: true, sku: true, name: true } } },
        },
      },
    });

    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    return list;
  }

  /**
   * Tariffs are data and an Excel header is matched by tariff name (or code): a name whose normalized form equals
   * the name or code of ANOTHER tariff would make a header ambiguous, so it is rejected.
   */
  private async assertTariffNameIsUnambiguous(label: string, text: string, selfId?: string): Promise<void> {
    const rows = await this.db.priceList.findMany({ select: { id: true, code: true, name: true } });
    const clash = findTariffNameCollision(text, rows.filter((r: { id: string }) => r.id !== selfId));
    if (clash) {
      throw new ConflictException(`${label} «${text}» se confunde con la tarifa «${clash.name}» (${clash.code}): en el Excel de precios no se podría distinguir. Usa otro nombre.`);
    }
  }

  async createPriceList(dto: CreatePriceListDto, actorId?: string) {
    const existing = await this.db.priceList.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Ya existe una lista con ese código');
    await this.assertTariffNameIsUnambiguous('El nombre', dto.name);

    this.validateCurrency(dto.currency);
    this.validatePriceListDates(dto.validFrom ?? null, dto.validUntil ?? null);

    const created = await this.writeWithEvent(async (tx) => {
      const row = await tx.priceList.create({
        data: {
          name: dto.name,
          code: dto.code,
          currency: dto.currency ?? 'COP',
          isActive: dto.isActive ?? true,
          validFrom: dto.validFrom,
          validUntil: dto.validUntil,
        },
      });
      await this.libraryEvent(tx, { actor: this.actor(actorId), action: 'PRICE_LIST_CREATED', entityType: 'PriceList', entityId: row.id, summary: { code: row.code, currency: row.currency, isActive: row.isActive } });
      return row;
    });

    await this.legacyAudit({
      userId: actorId,
      action: 'create',
      entity: 'PriceList',
      entityId: created.id,
      newValues: {
        name: created.name,
        code: created.code,
        currency: created.currency,
        isActive: created.isActive,
        validFrom: created.validFrom,
        validUntil: created.validUntil,
      },
    });

    return created;
  }

  /**
   * Dependencies of a tariff. Prices live in the library; quotes, customer accounts, portal tiers and portal mappings
   * belong to the operational database, which is where they are counted.
   */
  async priceListUsage(id: string) {
    const list = await this.db.priceList.findUnique({ where: { id }, select: { id: true } });
    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    return this.usageOf(id);
  }

  private async usageOf(id: string) {
    const ops = this.prisma as unknown as Record<string, { count?: (args: unknown) => Promise<number> } | undefined>;
    const operational = async (model: string): Promise<number> => {
      const delegate = ops[model];
      return typeof delegate?.count === 'function' ? delegate.count({ where: { priceListId: id } }) : 0;
    };
    const [prices, quotes, customerAccounts, portalTiers, portalMappings] = await Promise.all([
      this.db.price.count({ where: { priceListId: id } }),
      operational('quote'),
      operational('customerAccount'),
      operational('portalTier'),
      operational('portalPriceListMapping'),
    ]);
    return buildUsageReport(id, { prices, quotes, customerAccounts, portalTiers, portalMappings }, [
      { key: 'prices', code: 'HAS_PRICES', message: (n) => `tiene ${n} precio(s) asociado(s)` },
      { key: 'quotes', code: 'HAS_QUOTES', message: (n) => `la usan ${n} cotización(es)` },
      { key: 'customerAccounts', code: 'HAS_CUSTOMER_ACCOUNTS', message: (n) => `está asignada a ${n} cuenta(s) de cliente` },
      { key: 'portalTiers', code: 'HAS_PORTAL_TIERS', message: (n) => `la usan ${n} nivel(es) del portal` },
      { key: 'portalMappings', code: 'HAS_PORTAL_MAPPINGS', message: (n) => `la usan ${n} equivalencia(s) del portal` },
    ]);
  }

  async updatePriceList(id: string, dto: Partial<CreatePriceListDto> & { confirmImpact?: boolean }, actorId?: string) {
    const list = await this.db.priceList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('Lista de precios no encontrada');

    if (dto.code && dto.code !== list.code) {
      const existing = await this.db.priceList.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException('Ya existe una lista con ese código');
    }
    if (dto.name) await this.assertTariffNameIsUnambiguous('El nombre', dto.name, id);
    if (dto.code && dto.code !== list.code) await this.assertTariffNameIsUnambiguous('El código', dto.code, id);

    this.validateCurrency(dto.currency);

    if (dto.currency && dto.currency !== list.currency && !dto.confirmImpact) {
      const priceCount = await this.db.price.count({ where: { priceListId: id } });
      if (priceCount > 0) {
        throw impactConfirmationRequired(
          'Cambiar la moneda de una tarifa con precios cargados deja esos precios en otra moneda. Confirma el impacto para continuar.',
          { priceCount, fromCurrency: list.currency, toCurrency: dto.currency },
        );
      }
    }

    const validFrom = dto.validFrom !== undefined ? dto.validFrom : list.validFrom;
    const validUntil = dto.validUntil !== undefined ? dto.validUntil : list.validUntil;
    this.validatePriceListDates(validFrom ?? null, validUntil ?? null);

    const data = {
      ...(dto.name && { name: dto.name }),
      ...(dto.code && { code: dto.code }),
      ...(dto.currency && { currency: dto.currency }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.validFrom !== undefined && { validFrom: dto.validFrom }),
      ...(dto.validUntil !== undefined && { validUntil: dto.validUntil }),
    };

    const updated = await this.writeWithEvent(async (tx) => {
      const row = await tx.priceList.update({
        where: { id },
        data,
      });
      await this.libraryEvent(tx, { actor: this.actor(actorId), action: 'PRICE_LIST_UPDATED', entityType: 'PriceList', entityId: id, summary: { fields: Object.keys(data) } });
      return row;
    });

    await this.legacyAudit({
      userId: actorId,
      action: 'update',
      entity: 'PriceList',
      entityId: id,
      oldValues: {
        name: list.name,
        code: list.code,
        currency: list.currency,
        isActive: list.isActive,
        validFrom: list.validFrom,
        validUntil: list.validUntil,
      },
      newValues: data,
    });

    return updated;
  }

  async togglePriceListActive(id: string, actorId?: string) {
    const list = await this.db.priceList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('Lista de precios no encontrada');

    const updated = await this.writeWithEvent(async (tx) => {
      const row = await tx.priceList.update({
        where: { id },
        data: { isActive: !list.isActive },
      });
      await this.libraryEvent(tx, { actor: this.actor(actorId), action: 'PRICE_LIST_TOGGLED', entityType: 'PriceList', entityId: id, summary: { isActive: row.isActive } });
      return row;
    });

    await this.legacyAudit({
      userId: actorId,
      action: 'update',
      entity: 'PriceList',
      entityId: id,
      oldValues: { isActive: list.isActive },
      newValues: { isActive: updated.isActive },
    });

    return updated;
  }

  async removePriceList(id: string, actorId?: string) {
    const list = await this.db.priceList.findUnique({ where: { id } });

    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    const usage = await this.usageOf(id);
    if (!usage.canDelete) {
      if (usage.counts.prices > 0 && usage.reasons.length === 1) {
        throw new ConflictException({ code: 'DELETE_BLOCKED', message: 'No se puede eliminar una lista con precios asociados', usage });
      }
      throw deleteBlocked('la lista de precios', usage);
    }

    await this.legacyAudit({
      userId: actorId,
      action: 'delete',
      entity: 'PriceList',
      entityId: list.id,
      newValues: { name: list.name, code: list.code },
    });

    await this.writeWithEvent(async (tx) => {
      await tx.priceList.delete({ where: { id } });
      await this.libraryEvent(tx, { actor: this.actor(actorId), action: 'PRICE_LIST_DELETED', entityType: 'PriceList', entityId: id, summary: { code: list.code } });
    });
    return { message: 'Lista de precios eliminada exitosamente' };
  }

  async findPricesByProduct(productId: string, _ctx?: AccessContext) {
    // El permiso (prices:read global) lo exige PriceActionGuard; ninguna Lista interviene.
    const prices = await this.db.price.findMany({
      where: { productId },
      include: { priceList: true },
    });

    return { data: prices };
  }

  async findPricesByPriceList(priceListId: string, _ctx?: AccessContext) {
    // El permiso (prices:read global) lo exige PriceActionGuard; ninguna Lista interviene.
    const prices = await this.db.price.findMany({
      where: { priceListId },
      include: {
        product: { select: { id: true, sku: true, name: true } },
      },
    });

    return { data: prices };
  }

  async createPrice(dto: CreatePriceDto, ctx?: AccessContext) {
    const product = await this.db.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, sku: true, listaId: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const priceList = await this.db.priceList.findUnique({ where: { id: dto.priceListId } });
    if (!priceList) throw new NotFoundException('Lista de precios no encontrada');

    // Moneda coherente: si el DTO trae currency debe coincidir con la de la tarifa.
    this.assertPriceCurrencyMatches(dto.currency, priceList.currency);

    const existing = await this.db.price.findUnique({
      where: {
        productId_priceListId: {
          productId: dto.productId,
          priceListId: dto.priceListId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Ya existe un precio para este producto en esta lista');
    }

    // Invariante: Price.listaId == Product.listaId.
    const productListaId = product.listaId ?? null;
    if (dto.listaId !== undefined && dto.listaId !== productListaId) {
      throw new ConflictException('El listaId del precio no coincide con la Lista del producto');
    }

this.validateCurrency(dto.currency);
    this.validatePrice(dto.value, dto.validFrom, dto.validUntil);

    // IMP-03 — COP final entero (HALF_UP, límite único) en la escritura manual.
    const persistedValue = this.normalizeCopInput(
      dto.value,
      resolvePriceCurrency(dto.currency, priceList.currency),
    );

    // Fechas normalizadas a Date (string 'YYYY-MM-DD' → Date) para evitar 500 de Prisma.
    const validFrom = this.parsePriceDate(dto.validFrom);
    const validUntil = this.parsePriceDate(dto.validUntil);

    // Control de solapamiento: 409 si otra entrada de la misma tarifa se solapa.
    await this.assertNoOverlap({
      productId: dto.productId,
      priceListId: dto.priceListId,
      validFrom,
      validUntil,
    });

    // The price and its per-product history commit or roll back together.
    const created = await this.write(async (tx) => {
      const row = await tx.price.create({
        data: {
          productId: dto.productId,
          priceListId: dto.priceListId,
          ...(productListaId ? { listaId: dto.listaId ?? productListaId } : {}),
          value: persistedValue,
          currency: dto.currency ?? priceList.currency ?? 'COP',
          validFrom,
          validUntil,
        },
        include: {
          product: { select: { id: true, sku: true, name: true } },
          priceList: true,
        },
      });
      await this.recordPriceChange(tx, product, priceList.code, null, row.value, row.id, ctx);
      await this.libraryEvent(tx, { actor: this.actor(ctx?.userId, ctx?.userName), action: 'PRICE_CREATED_MANUAL', entityType: 'Price', entityId: row.id, summary: { productId: row.productId, priceListId: row.priceListId, tariff: priceList.code } });
      if (this.dedicated) await this.revisions?.markPendingFromLive(row.productId, tx as unknown as LibraryPrisma.TransactionClient, this.actor(ctx?.userId, ctx?.userName));
      return row;
    });

    if (!this.dedicated) await this.revisions?.markPendingFromLive(created.productId);
    await this.legacyAudit({
      userId: ctx?.userId,
      action: 'create',
      entity: 'Price',
      entityId: created.id,
      productId: created.productId,
      newValues: {
        productId: created.productId,
        productSku: created.product?.sku,
        priceListId: created.priceListId,
        priceListName: created.priceList?.name,
        value: created.value,
        currency: created.currency,
        validFrom: created.validFrom,
        validUntil: created.validUntil,
      },
    });

    return created;
  }

  async updatePrice(id: string, dto: UpdatePriceDto, ctx?: AccessContext) {
    const price = await this.db.price.findUnique({ where: { id } });
    if (!price) throw new NotFoundException('Precio no encontrado');

    // Moneda coherente: si se cambia currency, debe coincidir con la de la tarifa destino.
    if (dto.currency !== undefined) {
      const priceList = await this.db.priceList.findUnique({
        where: { id: price.priceListId },
      });
      if (priceList) {
        this.assertPriceCurrencyMatches(dto.currency, priceList.currency);
      }
    }

    // Invariante: si se cambia el listaId, debe coincidir con la Lista del producto.
    if (dto.listaId !== undefined) {
      const product = await this.db.product.findUnique({
        where: { id: price.productId },
        select: { id: true, listaId: true },
      });
      if (!product) throw new NotFoundException('Producto asociado al precio no encontrado');
      const productListaId = product.listaId ?? null;
      if (dto.listaId !== productListaId) {
        throw new ConflictException('El listaId del precio no coincide con la Lista del producto');
      }
    }

    this.validateCurrency(dto.currency);
    this.validatePrice(
      dto.value,
      dto.validFrom,
      dto.validUntil,
      price.validFrom,
      price.validUntil,
    );

    // IMP-03 — COP final entero (HALF_UP, límite único) también en la edición manual.
    const persistedValue = dto.value !== undefined
      ? this.normalizeCopInput(dto.value, resolvePriceCurrency(dto.currency, price.currency))
      : undefined;

    // Control de solapamiento: 409 si otra entrada de la misma tarifa se solapa
    // con la nueva vigencia (excluye este precio).
    // Fechas normalizadas a Date (string 'YYYY-MM-DD' → Date) para evitar 500 de Prisma (BUG-1).
    const newFrom =
      dto.validFrom !== undefined ? this.parsePriceDate(dto.validFrom) : price.validFrom;
    const newUntil =
      dto.validUntil !== undefined ? this.parsePriceDate(dto.validUntil) : price.validUntil;
    await this.assertNoOverlap({
      productId: price.productId,
      priceListId: price.priceListId,
      excludeId: price.id,
      validFrom: newFrom,
      validUntil: newUntil,
    });

    const data = {
      ...(persistedValue !== undefined && { value: persistedValue }),
      ...(dto.listaId !== undefined && { listaId: dto.listaId }),
      ...(dto.currency && { currency: dto.currency }),
      ...(dto.validFrom !== undefined && { validFrom: newFrom }),
      ...(dto.validUntil !== undefined && { validUntil: newUntil }),
    };

    const updated = await this.write(async (tx) => {
      const row = await tx.price.update({
        where: { id },
        data,
        include: {
          product: { select: { id: true, sku: true, name: true } },
          priceList: true,
        },
      });
      await this.recordPriceChange(
        tx, { id: row.productId, sku: row.product?.sku ?? '' }, row.priceList?.code ?? price.priceListId,
        price.value, row.value, id, ctx,
      );
      await this.libraryEvent(tx, { actor: this.actor(ctx?.userId, ctx?.userName), action: 'PRICE_UPDATED_MANUAL', entityType: 'Price', entityId: id, summary: { productId: row.productId, priceListId: row.priceListId, fields: Object.keys(data) } });
      if (this.dedicated) await this.revisions?.markPendingFromLive(row.productId, tx as unknown as LibraryPrisma.TransactionClient, this.actor(ctx?.userId, ctx?.userName));
      return row;
    });

    if (!this.dedicated) await this.revisions?.markPendingFromLive(updated.productId);
    // Historial inmutable (checklist 22): el log de update incluye oldValues completos
    // (value/currency/validFrom/validUntil anteriores) y newValues completos resultantes
    // con origin 'manual'. Nunca se borran ni editan los logs existentes.
    await this.legacyAudit({
      userId: ctx?.userId,
      action: 'update',
      entity: 'Price',
      entityId: id,
      productId: price.productId,
      oldValues: {
        value: price.value,
        currency: price.currency,
        listaId: price.listaId,
        validFrom: price.validFrom,
        validUntil: price.validUntil,
      },
      newValues: {
        value: persistedValue !== undefined ? persistedValue : price.value,
        currency: dto.currency !== undefined ? dto.currency : price.currency,
        listaId: dto.listaId !== undefined ? dto.listaId : price.listaId,
        validFrom: newFrom,
        validUntil: newUntil,
        origin: 'manual',
      },
    });

    return updated;
  }

  async removePrice(id: string, ctx?: AccessContext) {
    const price = await this.db.price.findUnique({ where: { id } });
    if (!price) throw new NotFoundException('Precio no encontrado');

    await this.legacyAudit({
      userId: ctx?.userId,
      action: 'delete',
      entity: 'Price',
      entityId: price.id,
      productId: price.productId,
      newValues: {
        productId: price.productId,
        priceListId: price.priceListId,
        value: price.value,
        currency: price.currency,
      },
    });

    const owner = await this.db.product.findUnique({ where: { id: price.productId }, select: { id: true, sku: true } });
    const tariff = await this.db.priceList.findUnique({ where: { id: price.priceListId }, select: { code: true } });
    await this.write(async (tx) => {
      await tx.price.delete({ where: { id } });
      if (owner) {
        await this.recordPriceChange(tx, owner, tariff?.code ?? price.priceListId, price.value, null, id, ctx);
      }
      await this.libraryEvent(tx, { actor: this.actor(ctx?.userId, ctx?.userName), action: 'PRICE_DELETED_MANUAL', entityType: 'Price', entityId: id, summary: { productId: price.productId, priceListId: price.priceListId } });
      if (this.dedicated) await this.revisions?.markPendingFromLive(price.productId, tx as unknown as LibraryPrisma.TransactionClient, this.actor(ctx?.userId, ctx?.userName));
    });
    if (!this.dedicated) await this.revisions?.markPendingFromLive(price.productId);
    return { message: 'Precio eliminado exitosamente' };
  }

  /**
   * Writes the per-product history row (`price:<TARIFF>`, source MANUAL) for a manual price
   * create/update/delete through the SAME transaction client. Nothing is written when the
   * value did not change.
   */
  private async recordPriceChange(
    tx: Parameters<ProductChangeService['record']>[0],
    product: { id: string; sku: string },
    tariffCode: string,
    before: unknown,
    after: unknown,
    sourceRef: string,
    ctx?: AccessContext,
  ): Promise<void> {
    const field = `${PRICE_FIELD_PREFIX}${tariffCode}`;
    const rows = diffFields(before === null ? {} : { [field]: before }, { [field]: after }, [field], {
      productId: product.id, sku: product.sku, source: 'MANUAL', sourceRef, actorId: ctx?.userId ?? null,
    });
    await this.changes.record(tx, rows);
  }
}
