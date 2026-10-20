import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService, AccessContext } from '../../common/acl/acl.service';
import { CopPriceError, isCopCurrency, normalizeCopPrice, resolvePriceCurrency } from '../../common/money/cop-policy';
import { AuditService } from '../audit/audit.service';
import { CreatePriceDto } from './dto/create-price.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { CreatePriceListDto } from './dto/create-price-list.dto';

/** Monedas permitidas para listas y precios (ISO 4217). */
const ALLOWED_CURRENCIES = ['COP', 'USD', 'EUR'] as const;

@Injectable()
export class PricesService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private audit: AuditService,
  ) {}

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
   * Control de solapamiento (checklist 21): busca otro precio del mismo producto
   * con la misma priceListId o la misma Lista (listaId) cuya vigencia se solape.
   * Si hay conflicto → 409 con mensaje claro.
   */
  private async assertNoOverlap(params: {
    productId: string;
    priceListId?: string;
    listaId?: string | null;
    excludeId?: string;
    validFrom: Date | string | null;
    validUntil: Date | string | null;
  }): Promise<void> {
    const { productId, priceListId, listaId, excludeId, validFrom, validUntil } = params;

    const others = (await this.prisma.price.findMany({
      where: {
        productId,
        OR: [
          ...(priceListId ? [{ priceListId }] : []),
          ...(listaId ? [{ listaId }] : []),
        ],
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
    // Se expone a roles autenticados (no se filtra por Lista).
    const lists = await this.prisma.priceList.findMany({
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

  async findOnePriceList(id: string, ctx?: AccessContext) {
    // ACL: los precios incluidos se filtran por las Listas donde el usuario tiene
    // view_prices o superior (ver precios exige view_prices; escribirlos sigue exigiendo edit_prices).
    let allowedListaIds: string[] | null = null;
    if (ctx) {
      allowedListaIds = await this.acl.getAllowedListaIds(ctx.userId, ctx.roles, 'view_prices');
    }

    const pricesWhere =
      allowedListaIds === null
        ? undefined
        : { product: { listaId: { in: allowedListaIds } } };

    const list = await this.prisma.priceList.findUnique({
      where: { id },
      include: {
        prices: {
          ...(pricesWhere ? { where: pricesWhere } : {}),
          include: { product: { select: { id: true, sku: true, name: true } } },
        },
      },
    });

    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    return list;
  }

  async createPriceList(dto: CreatePriceListDto, actorId?: string) {
    const existing = await this.prisma.priceList.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Ya existe una lista con ese código');

    this.validateCurrency(dto.currency);
    this.validatePriceListDates(dto.validFrom ?? null, dto.validUntil ?? null);

    const created = await this.prisma.priceList.create({
      data: {
        name: dto.name,
        code: dto.code,
        currency: dto.currency ?? 'COP',
        isActive: dto.isActive ?? true,
        validFrom: dto.validFrom,
        validUntil: dto.validUntil,
      },
    });

    await this.audit.log({
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

  async updatePriceList(id: string, dto: Partial<CreatePriceListDto>, actorId?: string) {
    const list = await this.prisma.priceList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('Lista de precios no encontrada');

    if (dto.code && dto.code !== list.code) {
      const existing = await this.prisma.priceList.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException('Ya existe una lista con ese código');
    }

    this.validateCurrency(dto.currency);

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

    const updated = await this.prisma.priceList.update({
      where: { id },
      data,
    });

    await this.audit.log({
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
    const list = await this.prisma.priceList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('Lista de precios no encontrada');

    const updated = await this.prisma.priceList.update({
      where: { id },
      data: { isActive: !list.isActive },
    });

    await this.audit.log({
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
    const list = await this.prisma.priceList.findUnique({
      where: { id },
      include: { _count: { select: { prices: true } } },
    });

    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    if (list._count.prices > 0) {
      throw new ConflictException('No se puede eliminar una lista con precios asociados');
    }

    await this.audit.log({
      userId: actorId,
      action: 'delete',
      entity: 'PriceList',
      entityId: list.id,
      newValues: { name: list.name, code: list.code },
    });

    await this.prisma.priceList.delete({ where: { id } });
    return { message: 'Lista de precios eliminada exitosamente' };
  }

  async findPricesByProduct(productId: string, ctx?: AccessContext) {
    // Deny-by-default: ver precios exige view_prices sobre la Lista del producto.
    if (ctx) await this.acl.assertProductAccess(productId, ctx, 'view_prices');

    const prices = await this.prisma.price.findMany({
      where: { productId },
      include: { priceList: true },
    });

    return { data: prices };
  }

  async findPricesByPriceList(priceListId: string, ctx?: AccessContext) {
    // Deny-by-default: solo precios cuyo producto pertenece a una Lista donde el
    // usuario tiene view_prices o superior (ver precios exige view_prices).
    let pricesWhere: { priceListId: string; product?: { listaId: { in: string[] } } } = { priceListId };
    if (ctx) {
      const allowed = await this.acl.getAllowedListaIds(ctx.userId, ctx.roles, 'view_prices');
      if (allowed !== null) {
        pricesWhere.product = { listaId: { in: allowed } };
      }
    }

    const prices = await this.prisma.price.findMany({
      where: pricesWhere,
      include: {
        product: { select: { id: true, sku: true, name: true } },
      },
    });

    return { data: prices };
  }

  async createPrice(dto: CreatePriceDto, ctx?: AccessContext) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, listaId: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const priceList = await this.prisma.priceList.findUnique({ where: { id: dto.priceListId } });
    if (!priceList) throw new NotFoundException('Lista de precios no encontrada');

    // Moneda coherente: si el DTO trae currency debe coincidir con la de la tarifa.
    this.assertPriceCurrencyMatches(dto.currency, priceList.currency);

    // ACL: crear precio exige `edit_prices` sobre la Lista del producto (checklist 29/30).
    if (ctx && product.listaId) await this.acl.assertListaAccess(product.listaId, ctx, 'edit_prices');

    const existing = await this.prisma.price.findUnique({
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

    // Control de solapamiento (checklist 21): 409 si otro precio del mismo producto
    // (misma priceListId o misma Lista) tiene una vigencia que se solapa con la nueva.
    await this.assertNoOverlap({
      productId: dto.productId,
      priceListId: dto.priceListId,
      listaId: productListaId,
      validFrom,
      validUntil,
    });

    const created = await this.prisma.price.create({
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

    await this.audit.log({
      userId: ctx?.userId,
      action: 'create',
      entity: 'Price',
      entityId: created.id,
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
    const price = await this.prisma.price.findUnique({ where: { id } });
    if (!price) throw new NotFoundException('Precio no encontrado');

    // ACL: actualizar precio exige `edit_prices` sobre la Lista del producto dueño.
    if (ctx) {
      await this.acl.assertProductAccess(price.productId, ctx, 'edit_prices');
    }

    // Moneda coherente: si se cambia currency, debe coincidir con la de la tarifa destino.
    if (dto.currency !== undefined) {
      const priceList = await this.prisma.priceList.findUnique({
        where: { id: price.priceListId },
      });
      if (priceList) {
        this.assertPriceCurrencyMatches(dto.currency, priceList.currency);
      }
    }

    // Invariante: si se cambia el listaId, debe coincidir con la Lista del producto.
    if (dto.listaId !== undefined) {
      const product = await this.prisma.product.findUnique({
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

    // Control de solapamiento (checklist 21): 409 si otro precio del mismo producto
    // (misma priceListId o misma Lista) se solapa con la nueva vigencia (excluye este precio).
    // Fechas normalizadas a Date (string 'YYYY-MM-DD' → Date) para evitar 500 de Prisma (BUG-1).
    const newFrom =
      dto.validFrom !== undefined ? this.parsePriceDate(dto.validFrom) : price.validFrom;
    const newUntil =
      dto.validUntil !== undefined ? this.parsePriceDate(dto.validUntil) : price.validUntil;
    await this.assertNoOverlap({
      productId: price.productId,
      priceListId: price.priceListId,
      listaId: price.listaId,
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

    const updated = await this.prisma.price.update({
      where: { id },
      data,
      include: {
        product: { select: { id: true, sku: true, name: true } },
        priceList: true,
      },
    });

    // Historial inmutable (checklist 22): el log de update incluye oldValues completos
    // (value/currency/validFrom/validUntil anteriores) y newValues completos resultantes
    // con origin 'manual'. Nunca se borran ni editan los logs existentes.
    await this.audit.log({
      userId: ctx?.userId,
      action: 'update',
      entity: 'Price',
      entityId: id,
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
    const price = await this.prisma.price.findUnique({ where: { id } });
    if (!price) throw new NotFoundException('Precio no encontrado');

    // ACL: eliminar precio exige `edit_prices` sobre la Lista del producto dueño.
    if (ctx) {
      await this.acl.assertProductAccess(price.productId, ctx, 'edit_prices');
    }

    await this.audit.log({
      userId: ctx?.userId,
      action: 'delete',
      entity: 'Price',
      entityId: price.id,
      newValues: {
        productId: price.productId,
        priceListId: price.priceListId,
        value: price.value,
        currency: price.currency,
      },
    });

    await this.prisma.price.delete({ where: { id } });
    return { message: 'Precio eliminado exitosamente' };
  }
}
