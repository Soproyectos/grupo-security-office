import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService, AccessContext, LEVEL_RANK } from '../../common/acl/acl.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PublishProductDto } from './dto/publish-product.dto';
import { UnpublishProductDto } from './dto/unpublish-product.dto';
import { PriceInputDto } from './dto/price-input.dto';
import { TransitionProductDto } from './dto/transition.dto';
import { DeleteProductDto } from './dto/delete-product.dto';
import { SchedulePublicationDto } from './dto/schedule-publication.dto';
import { BulkSchedulePublicationDto } from './dto/bulk-schedule-publication.dto';
import { SpecFieldDto, SpecsDto, SpecType } from './dto/spec-field.dto';
import {
  LifecycleStatus,
  LifecycleEvent,
  LIFECYCLE_STATUSES,
  TRANSITION_RULES,
  EVENT_AUDIT_ACTION,
  PRODUCTS_WRITE_ROLES,
} from './lifecycle.types';
import { Prisma, Product } from '@prisma/client';
import * as XLSX from 'xlsx';
import { normalizeText } from './import/helpers/text-normalizer';

const ALLOWED_IMAGE_MIMETYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8 MB

/** Reporte de un tick del scheduler P6 (cron cada minuto). */
export interface SchedulerTickReport {
  runAt: Date;
  /** true si el tick se descartó porque el anterior aún corría (lock en memoria). */
  skipped: boolean;
  publishOk: number;
  publishFailed: Array<{ id: string; reasons: string }>;
}

/** Resultado consolidado de una operacion de publicacion/programacion/cancelacion por Lista. */
export interface ListaPublicationBatchResult {
  listaId: string;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  results: Array<{
    productId: string;
    sku?: string;
    status: 'SUCCESS' | 'SKIPPED' | 'ERROR';
    code?: string;
    message: string;
  }>;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private audit: AuditService,
    private files: FilesService,
    ) {}

  /**
   * Lock en memoria del tick del scheduler (P6): impide que dos ticks del cron
   * se solapen en el mismo proceso. Los ticks están espaciados 1 minuto, pero
   * si una ejecución se alarga más de 60s este booleano descarta el siguiente.
   */
  private lifecycleTickRunning = false;

  private trendingCache: Map<string, { data: any; meta: { total: number; take?: number }; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos de expiración de caché

  /**
   * Cachea productos tendencia por 5 minutos
   */
  private getFromTrendingCache(key?: string): { data: any; meta: { total: number; take?: number } } | null {
    const cacheKey = key || 'default';
    const cached = this.trendingCache.get(cacheKey);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.trendingCache.delete(cacheKey);
      return null;
    }
    return { data: cached.data, meta: cached.meta };
  }

  private setTrendingCache(key: string, data: { data: any; meta: { total: number; take?: number } }): void {
    this.trendingCache.set(key, {
      ...data,
      timestamp: Date.now(),
    });
  }

  /**
   * Convierte un objeto legacy (Record<string, any>) al nuevo formato SpecFieldDto[].
   * Cada key-value se convierte en un SpecFieldDto con type TEXT por defecto.
   */
  private migrateLegacySpecs(legacy: Record<string, any> | undefined): SpecFieldDto[] | undefined {
    if (!legacy || typeof legacy !== 'object') return undefined;
    return Object.entries(legacy).map(([key, value]) => ({
      key,
      type: SpecType.TEXT,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
  }

  /**
   * Valida un array de SpecFieldDto según las reglas de tipo:
   * - TEXT: value debe ser string
   * - NUMBER: value debe ser number
   * - BOOLEAN: value debe ser boolean
   * - SELECT: value debe ser string y estar en options (si options existe)
   * - UNIT: value debe ser string, unit es obligatorio
   * - required: si true, value no puede ser null/undefined/empty string
   */
  private validateSpecs(specs: SpecFieldDto[] | undefined, fieldName: string): void {
    if (!specs || !specs.length) return;

    for (const spec of specs) {
      // Validar required
      if (spec.required && (spec.value === undefined || spec.value === null || spec.value === '')) {
        throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} es obligatorio`);
      }

      // Validar según type
      switch (spec.type) {
        case SpecType.TEXT:
          if (spec.value !== undefined && spec.value !== null && typeof spec.value !== 'string') {
            throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} debe ser de tipo TEXT (string)`);
          }
          break;
        case SpecType.NUMBER:
          if (spec.value !== undefined && spec.value !== null && typeof spec.value !== 'number') {
            throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} debe ser de tipo NUMBER (number)`);
          }
          break;
        case SpecType.BOOLEAN:
          if (spec.value !== undefined && spec.value !== null && typeof spec.value !== 'boolean') {
            throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} debe ser de tipo BOOLEAN (boolean)`);
          }
          break;
        case SpecType.SELECT:
          if (spec.value !== undefined && spec.value !== null) {
            if (typeof spec.value !== 'string') {
              throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} debe ser de tipo SELECT (string)`);
            }
            if (spec.options && spec.options.length > 0 && !spec.options.includes(spec.value)) {
              throw new BadRequestException(`El valor "${spec.value}" para "${spec.key}" en ${fieldName} no está en las opciones permitidas: ${spec.options.join(', ')}`);
            }
          }
          break;
        case SpecType.UNIT:
          if (!spec.unit) {
            throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} de tipo UNIT requiere la propiedad "unit"`);
          }
          if (spec.value !== undefined && spec.value !== null && typeof spec.value !== 'string') {
            throw new BadRequestException(`El campo "${spec.key}" en ${fieldName} debe ser de tipo UNIT (string con unidad)`);
          }
          break;
      }
    }
  }

  /**
   * Prepara specs para guardado en BD: convierte SpecFieldDto[] a JSON serializable
   * manteniendo la estructura tipada.
   */
  private prepareSpecsForStorage(specs: SpecFieldDto[] | undefined): any {
    if (!specs || !specs.length) return undefined;
    return specs.map(s => ({
      key: s.key,
      type: s.type,
      unit: s.unit,
      options: s.options,
      required: s.required,
      value: s.value,
    }));
  }

  /**
   * Combina specs nuevos (tipados) con legacy (planos) dando prioridad a los nuevos.
   * Si vienen specs nuevos, se usan esos; si no, se migran los legacy.
   */
  private resolveSpecs(
    newSpecs: SpecsDto | undefined,
    legacySpecs: Record<string, any> | undefined,
  ): SpecFieldDto[] | undefined {
    if (newSpecs && newSpecs.specs && newSpecs.specs.length > 0) {
      return newSpecs.specs;
    }
    return this.migrateLegacySpecs(legacySpecs);
  }

  /**
   * Estado calculado de stock para un conjunto de productos (checklist 42):
   * 'in_stock' (availableQty > 0), 'out_of_stock' (availableQty 0), 'no_stock_data'
   * (sin registro de stock). No oculta productos automáticamente: la regla de
   * negocio para ocultar por falta de stock queda pendiente de decisión.
   */
  private async getStockStatusMap(
    productIds: string[],
  ): Promise<Map<string, 'in_stock' | 'out_of_stock' | 'no_stock_data'>> {
    if (!productIds.length) return new Map();
    const stocks = (await this.prisma.stock.findMany({
      where: { productId: { in: productIds } },
    })) ?? [];
    const map = new Map<string, 'in_stock' | 'out_of_stock' | 'no_stock_data'>();
    for (const s of stocks) {
      map.set(s.productId, s.availableQty > 0 ? 'in_stock' : 'out_of_stock');
    }
    return map;
  }

  /**
   * Obtiene productos tendencia (últimos 30 días visibles y activos)
   */
  async findTrending(params?: {
    take?: number;
    categoryId?: string;
    search?: string;
    forceReload?: boolean;
  }): Promise<{
    data: any;
    meta: { total: number; take?: number }
  }> {
    const cacheKey = `${params?.take || 5}-${params?.categoryId || ''}-${params?.search || ''}`;
    
    if (params?.forceReload || !this.getFromTrendingCache(cacheKey)) {
      const take = params?.take || 5;

      if (params?.search && params.search.trim().length > 2) {
        // Fuzzy search para trending
        const searchTerm = params.search.trim();
        const categoryFilter = params?.categoryId ? `AND "categoryId" = '${params.categoryId}'` : '';

        const whereClause = `WHERE "isVisible" = true AND "isActive" = true AND "createdAt" >= NOW() - INTERVAL '30 days' ${categoryFilter}`;

        const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`
          SELECT COUNT(*)::bigint as count
          FROM "products"
          ${whereClause}
          AND (similarity("name", $1) + similarity("sku", $1) + similarity("description", $1)) > 0.1
        `, searchTerm);
        const total = Number(countResult[0]?.count ?? 0);

        const products = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT
            p.*,
            (similarity(p."name", $1) + similarity(p."sku", $1) + similarity(p."description", $1)) as _similarity
          FROM "products" p
          ${whereClause}
          AND (similarity(p."name", $1) + similarity(p."sku", $1) + similarity(p."description", $1)) > 0.1
          ORDER BY _similarity DESC
          LIMIT $2
        `, searchTerm, take);

        // Fetch related data
        const productIds = products.map(p => p.id);
        const [categories, brands, images, prices] = await Promise.all([
          productIds.length > 0 ? this.prisma.category.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, slug: true }
          }) : [],
          productIds.length > 0 ? this.prisma.brand.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, slug: true }
          }) : [],
          productIds.length > 0 ? this.prisma.productImage.findMany({
            where: { productId: { in: productIds }, isPrimary: true },
            select: { productId: true, url: true, alt: true, type: true, isPrimary: true, sortOrder: true }
          }) : [],
          productIds.length > 0 ? this.prisma.price.findMany({
            where: { productId: { in: productIds } },
            include: { priceList: { select: { id: true, name: true, code: true } } }
          }) : [],
        ]);

        const categoryMap = new Map<string, typeof categories[0]>(categories.map(c => [c.id, c] as const));
        const brandMap = new Map<string, typeof brands[0]>(brands.map(b => [b.id, b] as const));
        const imageMap = new Map<string, typeof images[0]>(images.map(i => [i.productId, i] as const));
        const pricesByProduct = new Map<string, typeof prices>();
        for (const price of prices) {
          const arr = pricesByProduct.get(price.productId) || [];
          arr.push(price);
          pricesByProduct.set(price.productId, arr);
        }

        const formattedProducts = products.map(p => ({
          ...p,
          category: categoryMap.get(p.categoryId) || null,
          brand: brandMap.get(p.brandId) || null,
          images: imageMap.get(p.productId) ? [imageMap.get(p.productId)!] : [],
          prices: pricesByProduct.get(p.productId) || [],
          _similarity: undefined,
        }));

        this.setTrendingCache(cacheKey, {
          data: formattedProducts,
          meta: { total, take },
        });
      } else {
        // Fallback: búsqueda por contains insensible
        const where: Prisma.ProductWhereInput = {
          isVisible: true,
          isActive: true,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          ...(params?.categoryId && { categoryId: params.categoryId }),
          ...(params?.search && {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { sku: { contains: params.search, mode: 'insensitive' } },
              { description: { contains: params.search, mode: 'insensitive' } },
            ],
          }),
        };

        const [products, total] = await Promise.all([
          this.prisma.product.findMany({
            where,
            take,
            orderBy: { createdAt: 'desc' },
            include: {
              category: { select: { id: true, name: true, slug: true } },
              brand: { select: { id: true, name: true, slug: true } },
              images: { where: { isPrimary: true }, take: 1 },
              prices: { include: { priceList: { select: { id: true, name: true, code: true } } } },
            },
          }),
          this.prisma.product.count({ where }),
        ]);

        this.setTrendingCache(cacheKey, {
          data: products,
          meta: { total, take },
        });
      }
    }

    const cached = this.getFromTrendingCache(cacheKey);
    return {
      data: cached?.data || [],
      meta: cached?.meta || { total: 0, take: params?.take || 5 },
    };
  }

  async findAll(
    params?: {
      skip?: number;
      take?: number;
      search?: string;
      categoryId?: string;
      brandId?: string;
      isVisible?: boolean;
      isActive?: boolean;
      activeListaOnly?: boolean;
    },
    ctx?: AccessContext,
  ) {
    const { skip = 0, take = 50, search, categoryId, brandId, isVisible, isActive, activeListaOnly } = params || {};

    // ACL por Lista (deny-by-default) cuando se provee contexto de usuario.
    // ctx opcional: los llamadores legacy/tests sin ctx conservan el comportamiento abierto.
    let allowedListaIds: string[] | null = null;
    if (ctx) {
      allowedListaIds = await this.acl.getAllowedListaIds(ctx.userId, ctx.roles, 'view');
    }

    let products: any[];
    let total: number;

    if (search && search.trim().length > 2) {
      // Fuzzy search usando pg_trgm similarity
      const searchTerm = search.trim();
      const listaFilter = allowedListaIds !== null
        ? (allowedListaIds.length > 0 ? `AND "listaId" IN (${allowedListaIds.map(id => `'${id}'`).join(',')})` : `AND 1=0`) // ← Cambio aquí: 1=0 fuerza 0 resultados
        : '';
      const categoryFilter = categoryId ? `AND "categoryId" = '${categoryId}'` : '';
      const brandFilter = brandId ? `AND "brandId" = '${brandId}'` : '';
      const isVisibleFilter = isVisible !== undefined ? `AND "isVisible" = ${isVisible}` : '';
      const isActiveFilter = isActive !== undefined ? `AND "isActive" = ${isActive}` : '';
      const activeListaOnlyFilter = activeListaOnly
        ? `AND EXISTS (SELECT 1 FROM "listas" l WHERE l.id = "listaId" AND l."isActive" = true AND l."archivedAt" IS NULL)`
        : '';

      const whereClause = `WHERE 1=1 ${listaFilter} ${categoryFilter} ${brandFilter} ${isVisibleFilter} ${isActiveFilter} ${activeListaOnlyFilter}`;

      // Total count with fuzzy search
      const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`
        SELECT COUNT(*)::bigint as count
        FROM "products"
        ${whereClause}
        AND (similarity("name", $1) + similarity("sku", $1) + similarity("description", $1)) > 0.1
      `, searchTerm);
      total = Number(countResult[0]?.count ?? 0);

      // Paginated results ordered by similarity desc
      products = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          p.*,
          (similarity(p."name", $1) + similarity(p."sku", $1) + similarity(p."description", $1)) as _similarity
        FROM "products" p
        ${whereClause}
        AND (similarity(p."name", $1) + similarity(p."sku", $1) + similarity(p."description", $1)) > 0.1
        ORDER BY _similarity DESC
        LIMIT $2 OFFSET $3
      `, searchTerm, take, skip);

      // Fetch related data for each product
      const productIds = products.map(p => p.id);
      const [categories, brands, images, prices] = await Promise.all([
        productIds.length > 0 ? this.prisma.category.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, slug: true }
        }) : [],
        productIds.length > 0 ? this.prisma.brand.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, slug: true }
        }) : [],
        productIds.length > 0 ? this.prisma.productImage.findMany({
          where: { productId: { in: productIds }, isPrimary: true },
          select: { productId: true, url: true, alt: true, type: true, isPrimary: true, sortOrder: true }
        }) : [],
        productIds.length > 0 ? this.prisma.price.findMany({
          where: { productId: { in: productIds } },
          include: { priceList: { select: { id: true, name: true, code: true } } }
        }) : [],
      ]);

      const categoryMap = new Map<string, typeof categories[0]>(categories.map(c => [c.id, c] as const));
      const brandMap = new Map<string, typeof brands[0]>(brands.map(b => [b.id, b] as const));
      const imageMap = new Map<string, typeof images[0]>(images.map(i => [i.productId, i] as const));
      const pricesByProduct = new Map<string, typeof prices>();
      for (const price of prices) {
        const arr = pricesByProduct.get(price.productId) || [];
        arr.push(price);
        pricesByProduct.set(price.productId, arr);
      }

      products = products.map(p => ({
        ...p,
        category: categoryMap.get(p.categoryId) || null,
        brand: brandMap.get(p.brandId) || null,
        images: imageMap.get(p.productId) ? [imageMap.get(p.productId)!] : [],
        prices: pricesByProduct.get(p.productId) || [],
        _similarity: undefined, // remove internal field
      }));
    } else {
      // Fallback: búsqueda por contains insensible (search ≤ 2 chars o sin search)
      const where: Prisma.ProductWhereInput = {
        ...(allowedListaIds !== null && { listaId: { in: allowedListaIds.length ? allowedListaIds : ['no-existe-este-id'] } }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(categoryId && { categoryId }),
        ...(brandId && { brandId }),
        ...(isVisible !== undefined && { isVisible }),
        ...(isActive !== undefined && { isActive }),
        ...(activeListaOnly && { lista: { isActive: true, archivedAt: null } }),
      };

      const [foundProducts, count] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take,
          include: {
            category: { select: { id: true, name: true, slug: true } },
            brand: { select: { id: true, name: true, slug: true } },
            images: { where: { isPrimary: true }, take: 1 },
            prices: {
            include: { priceList: { select: { id: true, name: true, code: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.product.count({ where }),
      ]);
      products = foundProducts;
      total = count;
    }

    // Filtrado por restricción explícita de assignment PRODUCT (checklist 17/31).
    // Si el usuario tiene assignment PRODUCT con isActive=false sobre algún producto,
    // ese producto debe ser denegado (403) en findOne y excluido en findAll.
    // Si el usuario tiene assignment PRODUCT activo con nivel suficiente, se permite.
    let productAssignmentsCache: { resourceId: string; level: string; isActive: boolean }[] = [];
    if (ctx) {
      productAssignmentsCache = await this.prisma.assignment.findMany({
        where: { userId: ctx.userId, resourceType: 'PRODUCT' },
        select: { resourceId: true, level: true, isActive: true },
      });
    }

    const deniedProductIds = new Set<string>();
    const activeAssignmentsByProduct = new Map<string, string[]>();
    if (productAssignmentsCache?.length > 0) {
      for (const a of productAssignmentsCache) {
        if (!a.isActive) {
          deniedProductIds.add(a.resourceId);
        } else {
          const levels = activeAssignmentsByProduct.get(a.resourceId) || [];
          levels.push(a.level);
          activeAssignmentsByProduct.set(a.resourceId, levels);
        }
      }
    }

    const filteredProducts = products.filter((p) => {
      // Si el producto está en la lista de denegación por isActive=false, excluirlo
      if (deniedProductIds.has(p.id)) return false;
      // Si el usuario tiene assignment PRODUCT activo, verificar nivel
      if (activeAssignmentsByProduct.has(p.id)) {
        const productLevels = activeAssignmentsByProduct.get(p.id)!;
        const hasSufficientLevel = productLevels.some((lvl) => {
          const rank = (LEVEL_RANK[lvl] ?? 0);
          return rank >= (LEVEL_RANK['view'] ?? 0);
        });
        if (!hasSufficientLevel) return false;
      }
      return true;
    });

    const stockStatusMap = await this.getStockStatusMap(filteredProducts.map((p) => p.id));

    return {
      data: filteredProducts.map((p) => ({
        ...p,
        stockStatus: stockStatusMap.get(p.id) ?? 'no_stock_data',
      })),
      meta: { total, skip, take },
    };
  }

  async findOne(id: string, ctx?: AccessContext) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        images: { orderBy: { sortOrder: 'asc' } },
        prices: {
          include: { priceList: true },
        },
      },
    });

    if (!product) throw new NotFoundException('Producto no encontrado');

    // Deny-by-default con restricción explícita por producto (checklist 17/31):
    // assertProductAccess evalúa assignments PRODUCT (deny prevalece) y cae a la
    // Lista dueña si no hay excepción por producto.
    if (ctx) {
      if (!product.listaId) throw new NotFoundException('Producto no encontrado');
      await this.acl.assertProductAccess(id, ctx, 'view');
    }

    const stock = await this.prisma.stock.findUnique({ where: { productId: id } });
    const allowed = ctx ? await this.allowedActions(product, ctx) : undefined;
    return {
      ...product,
      stockStatus: stock ? (stock.availableQty > 0 ? 'in_stock' : 'out_of_stock') : 'no_stock_data',
      ...(allowed ? { allowedActions: allowed } : {}),
    };
  }

  async create(dto: CreateProductDto, ctx?: AccessContext) {
    const existingSku = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
    if (existingSku) throw new ConflictException('Ya existe un producto con ese SKU');

    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
    if (!brand) throw new NotFoundException('Marca no encontrada');

    await this.validatePriceLists(dto.prices);

    // Resolver y validar specs tipados (nuevo formato) con fallback a legacy
    const specs = this.resolveSpecs(dto.specs, dto.technicalSpecs);
    const extraSpecs = this.resolveSpecs(dto.extraSpecs, dto.extraAttributes);

    // Validar specs
    this.validateSpecs(specs, 'specs');
    this.validateSpecs(extraSpecs, 'extraSpecs');

    // Compatibilidad: toda creación de producto debe quedar asociada a una Lista.
    // Si se envía listaId se valida su existencia; si falta, se asigna LISTA-GENERAL
    // (fallback explícito y documentado para registros legados).  [decisiones 8/14]
    // La Lista también expone defaultVisibility: si no viene dto.isVisible explícito,
    // el producto nuevo hereda la visibilidad por defecto de su Lista.
    const lista = await this.resolveLista(dto.listaId);

    // ACL: crear producto exige `edit_products` sobre la Lista destino (checklist 29/30).
    if (ctx) await this.acl.assertListaAccess(lista.id, ctx, 'edit_products');

    // Bloqueo: si la Lista está pendiente de eliminación, no permitir crear producto
        if (await this.isListaPendingDeletion(lista.id)) {
      throw new ConflictException({
        code: 'LISTA_PENDIENTE_ELIMINACION',
        message: 'La Lista está pendiente de eliminación y no permite cambios.',
      });
    }

    const product = await this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        listaId: lista.id,
        technicalSpecs: this.prepareSpecsForStorage(specs),
        extraAttributes: this.prepareSpecsForStorage(extraSpecs),
        ...(dto.documents !== undefined && { documents: dto.documents }),
        lifecycleStatus: 'DRAFT',
        // Un producto nuevo SIEMPRE nace en DRAFT (isActive=false, isVisible=false).
        // Los campos legacy isActive/isVisible/publishStatus/publishAt/unpublishAt se
        // ignoran/normalizan para conservar el estado inicial canónico (no generan legacy).
        isActive: false,
        isVisible: false,
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });

    if (dto.prices && dto.prices.length > 0) {
      await this.upsertPrices(product.id, lista.id, dto.prices);
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto, ctx?: AccessContext) {
    // El estado del producto se gestiona vía FSM (POST /api/products/:id/transition).
    // Esta guarda explícita cubre llamadas directas al servicio (sin DTO whitelist).
    const stateKeys = ['isActive', 'isVisible', 'publishStatus', 'publishAt', 'unpublishAt'];
    if (stateKeys.some((key) => (dto as any)[key] !== undefined)) {
      throw new BadRequestException('El estado del producto se gestiona vía POST /transition');
    }

    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // ACL: editar producto exige `edit_products` sobre el producto/Lista (checklist 29/30).
    // assertProductAccess evalúa restricción explícita por producto + Lista dueña.
    if (ctx && product.listaId) {
      await this.acl.assertProductAccess(id, ctx, 'edit_products');
    }
    // Bloqueo: si la Lista del producto está pendiente de eliminación, no permitir actualizar
    if (product.listaId) {
            if (await this.isListaPendingDeletion(product.listaId)) {
        throw new ConflictException({
          code: 'LISTA_PENDIENTE_ELIMINACION',
          message: 'La Lista está pendiente de eliminación y no permite cambios.',
        });
      }
      // Permiso Super Admin bypass
      if (!this.acl.isListasAdmin(ctx?.roles)) {
        await this.acl.assertListaAccess(product.listaId, ctx, 'manage');
      }
    }

    // Si se reasigna listaId, se autoriza además sobre la nueva Lista.
    let listaId: string | null = product.listaId ?? null;
    if (dto.listaId !== undefined) {
      const newLista = await this.resolveLista(dto.listaId);
      if (ctx && newLista.id !== product.listaId) {
        await this.acl.assertListaAccess(newLista.id, ctx, 'edit_products');
      }
      listaId = newLista.id;
    }

    if (dto.sku && dto.sku !== product.sku) {
      const existing = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (existing) throw new ConflictException('Ya existe un producto con ese SKU');
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Categoría no encontrada');
    }

    if (dto.brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
      if (!brand) throw new NotFoundException('Marca no encontrada');
    }

    await this.validatePriceLists(dto.prices);

    // Resolver y validar specs tipados (nuevo formato) con fallback a legacy
    const specs = this.resolveSpecs(dto.specs, dto.technicalSpecs);
    const extraSpecs = this.resolveSpecs(dto.extraSpecs, dto.extraAttributes);

    // Validar specs si se proporcionan
    if (dto.specs !== undefined || dto.technicalSpecs !== undefined) {
      this.validateSpecs(specs, 'specs');
    }
    if (dto.extraSpecs !== undefined || dto.extraAttributes !== undefined) {
      this.validateSpecs(extraSpecs, 'extraSpecs');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.sku && { sku: dto.sku }),
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.categoryId && { categoryId: dto.categoryId }),
        ...(dto.brandId && { brandId: dto.brandId }),
        ...(dto.listaId !== undefined && { listaId }),
        ...(dto.specs !== undefined || dto.technicalSpecs !== undefined
          ? { technicalSpecs: this.prepareSpecsForStorage(specs) }
          : {}),
        ...(dto.extraSpecs !== undefined || dto.extraAttributes !== undefined
          ? { extraAttributes: this.prepareSpecsForStorage(extraSpecs) }
          : {}),
        ...(dto.documents !== undefined && { documents: dto.documents }),
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
      },
    });

    if (dto.prices && dto.prices.length > 0) {
      await this.upsertPrices(id, listaId, dto.prices);
    }

    return updated;
  }

  /**
   * Despublica un producto (endpoint legacy delegado a la FSM): UNPUBLISH → DRAFT
   * con razón obligatoria (audit 'unpublish').
   */
  async unpublish(id: string, dto: UnpublishProductDto, ctx?: AccessContext) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // Bloqueo: si la Lista del producto está pendiente de eliminación, no permitir despublicar
    if (product.listaId) {
            if (await this.isListaPendingDeletion(product.listaId)) {
        throw new ConflictException({
          code: 'LISTA_PENDIENTE_ELIMINACION',
          message: 'La Lista está pendiente de eliminación y no permite cambios.',
        });
      }
      // Permiso Super Admin bypass
      if (!this.acl.isListasAdmin(ctx?.roles)) {
        await this.acl.assertListaAccess(product.listaId, ctx, 'manage');
      }
    }

    return this.transition(id, { event: 'UNPUBLISH', reason: dto.reason }, ctx);
  }

  /**
   * Adaptador legacy: alterna visibilidad traduciendo al contrato canónico.
   */
  async toggleVisibility(id: string, ctx?: AccessContext) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const status = this.effectiveLifecycleStatus(product);
    if (status === 'DRAFT') {
      return this.transition(id, { event: 'PUBLISH' }, ctx);
    }
    if (status === 'PUBLISHED') {
      return this.transition(id, { event: 'UNPUBLISH' }, ctx);
    }
    throw new BadRequestException(
      `No se puede alternar la visibilidad en estado ${status}`,
    );
  }

  /**
   * Checklist previo a publicación (documentado):
   *  (a) Lista destino activa y no archivada.
   *  (b) Producto activo (isActive).
   *  (c) Al menos 1 precio vigente (validFrom nulo o <= now y validUntil nulo o futuro) en la Lista.
   *  (d) Al menos 1 imagen.
   *  (e) Stock: si existe registro de stock, exige availableQty > 0.
   *      Si NO existe registro de stock, NO se bloquea (decisión documentada).
   * Devuelve la lista de TODOS los requisitos fallidos (mensaje 400 detallado).
   */
  private async validatePublishRequirements(product: {
    id: string;
    listaId: string | null;
    isActive: boolean;
  }): Promise<string[]> {
    const failures: string[] = [];
    const now = new Date();

    // (a) Lista destino activa y no archivada.
    let lista = null;
    if (product.listaId) {
      lista = await this.prisma.lista.findUnique({ where: { id: product.listaId } });
    }
    if (!lista || !lista.isActive || lista.archivedAt) {
      failures.push('La lista destino no está activa o está archivada');
    }

    // (c) Al menos 1 precio vigente en la Lista.
    // Los precios importados se crean con `listaId: null` y se vinculan vía
    // `priceListId` (PriceList no tiene relación FK con Lista). Si no hay precio
    // con el listaId de la lista, se hace fallback al precio vigente global del
    // producto para que la publicación no se bloquee por este artefacto.
    // Se mantiene la regla de fondo: el precio debe existir y ser vigente
    // (validFrom <= hoy <= validUntil, límites abiertos con null).
    const vigenciaFilter = {
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      ],
    };
    let priceCount = await this.prisma.price.count({
      where: {
        productId: product.id,
        ...(product.listaId ? { listaId: product.listaId } : {}),
        ...vigenciaFilter,
      },
    });
    if (priceCount === 0 && product.listaId) {
      priceCount = await this.prisma.price.count({
        where: {
          productId: product.id,
          ...vigenciaFilter,
        },
      });
    }
    if (priceCount === 0) {
      failures.push('El producto no tiene al menos un precio vigente en su lista');
    }

    // (d) Al menos 1 imagen.
    const imageCount = await this.prisma.productImage.count({ where: { productId: product.id } });
    if (imageCount === 0) {
      failures.push('El producto no tiene al menos una imagen');
    }

    // (e) Stock: solo bloquea si existe registro de stock con availableQty <= 0.
    const stock = await this.prisma.stock.findUnique({ where: { productId: product.id } });
    if (stock && stock.availableQty <= 0) {
      failures.push('El producto tiene stock registrado pero sin unidades disponibles (availableQty <= 0)');
    }

    return failures;
  }

  /**
   * Adaptador legacy de publicación/programación (obsoleto, se conserva transitoriamente):
   * - Si `publishAt` es futura: el producto permanece en DRAFT y solo se persiste `publishAt`
   *   (el scheduler aplicará PUBLISH al vencer la fecha).
   * - Si no hay `publishAt` futura: ejecuta la transición canónica PUBLISH (DRAFT → PUBLISHED).
   * - `unpublishAt` se ignora (no existe auto-despublicación).
   */
  async publish(id: string, dto: PublishProductDto, ctx?: AccessContext) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const status = this.effectiveLifecycleStatus(product);

    // Cancelación explícita de una publicación programada.
    // Solo válida en DRAFT con publishAt futura activa. No ejecuta transiciones
    // canónicas ni scheduler; conserva el contrato de Borrador.
    if (dto.publishAt === null) {
      if (status !== 'DRAFT') {
        throw new ConflictException('Solo se puede cancelar una programación en un producto en Borrador.');
      }
      const currentPublishAt = product.publishAt ? new Date(product.publishAt) : null;
      if (!currentPublishAt || currentPublishAt <= new Date()) {
        throw new ConflictException('El producto no tiene una publicación programada activa.');
      }

      const updated = await this.prisma.product.update({
        where: { id },
        data: {
          lifecycleStatus: 'DRAFT',
          isActive: false,
          isVisible: false,
          publishStatus: 'borrador',
          publishAt: null,
          unpublishAt: null,
          publishedAt: null,
          publishedById: null,
          unpublishReason: null,
        },
      });
      await this.audit.log({
        userId: ctx?.userId,
        action: 'cancel_schedule_publish',
        entity: 'Product',
        entityId: id,
        oldValues: { lifecycleStatus: status, publishAt: currentPublishAt },
        newValues: { lifecycleStatus: status, publishAt: null, isActive: false, isVisible: false },
      });
      return updated;
    }

    if (status === 'PUBLISHED') {
      throw new ConflictException('El producto ya está publicado');
    }
    if (status === 'ARCHIVED') {
      throw new BadRequestException('No se puede publicar un producto archivado');
    }

    // Bloqueo: si la Lista del producto está pendiente de eliminación, no permitir publicar
    if (product.listaId) {
            if (await this.isListaPendingDeletion(product.listaId)) {
        throw new ConflictException({
          code: 'LISTA_PENDIENTE_ELIMINACION',
          message: 'La Lista está pendiente de eliminación y no permite cambios.',
        });
      }
      // Permiso Super Admin bypass
      if (!this.acl.isListasAdmin(ctx?.roles)) {
        await this.acl.assertListaAccess(product.listaId, ctx, 'manage');
      }
    }

    const publishAt = dto.publishAt ? new Date(dto.publishAt) : null;
    const isFuturePublish = !!publishAt && publishAt > new Date();

    if (!isFuturePublish) {
      return this.transition(id, { event: 'PUBLISH' }, ctx);
    }

    // Programación sobre DRAFT: persiste estado canónico DRAFT completo con publishAt.
    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        lifecycleStatus: 'DRAFT',
        isActive: false,
        isVisible: false,
        publishStatus: 'borrador',
        publishAt,
        unpublishAt: null,
        publishedAt: null,
        unpublishReason: null,
      },
    });
    await this.audit.log({
      userId: ctx?.userId,
      action: 'schedule_publish',
      entity: 'Product',
      entityId: id,
      oldValues: { lifecycleStatus: status, publishAt: product.publishAt ?? null },
      newValues: { lifecycleStatus: status, publishAt, isActive: false, isVisible: false },
    });
    return updated;
  }


  /**
   * Estado FSM efectivo de un producto. Fuente de verdad: `lifecycleStatus`.
   * Fallback a mapeo desde columnas legacy para datos pre-backfill (tests/legacy).
   */
  private effectiveLifecycleStatus(product: {
    lifecycleStatus?: string | null;
    publishStatus?: string | null;
    isActive?: boolean;
    isVisible?: boolean;
    publishAt?: Date | null;
  }): LifecycleStatus {
    const stored = product.lifecycleStatus;
    if (stored) {
      if (LIFECYCLE_STATUSES.includes(stored as LifecycleStatus)) {
        return stored as LifecycleStatus;
      }
      const normalized = this.normalizeLegacyStored(stored);
      if (normalized) return normalized;
    }
    return this.mapLegacyToLifecycle(product);
  }

  /** Normaliza estados legacy almacenados (sin migración de datos) al canónico. */
  private normalizeLegacyStored(status: string): LifecycleStatus | null {
    switch (status.toUpperCase()) {
      case 'READY':
      case 'SCHEDULED':
      case 'HIDDEN':
        return 'DRAFT';
      case 'DISCONTINUED':
        return 'ARCHIVED';
      default:
        return null;
    }
  }

  private mapLegacyToLifecycle(product: {
    publishStatus?: string | null;
    publishAt?: Date | null;
  }): LifecycleStatus {
    const ps = product.publishStatus;
    if (ps === 'archivado') return 'ARCHIVED';
    if (ps === 'publicado') return 'PUBLISHED';
    // 'listo' (READY/SCHEDULED) y 'borrador' → DRAFT.
    return 'DRAFT';
  }

  /** Snapshot de las columnas de estado (lifecycle + espejo legacy) para auditoría. */
  private lifecycleSnapshot(product: {
    lifecycleStatus?: string | null;
    isActive?: boolean;
    isVisible?: boolean;
    publishStatus?: string | null;
    publishAt?: Date | null;
    unpublishAt?: Date | null;
    publishedAt?: Date | null;
    unpublishReason?: string | null;
  }) {
    return this.statePick(product);
  }

  /** Selecciona solo las claves de estado presentes en un objeto (omite undefined). */
  private statePick(source: Record<string, unknown> | null | undefined): Record<string, unknown> {
    const keys = [
      'lifecycleStatus',
      'isActive',
      'isVisible',
      'publishStatus',
      'publishAt',
      'unpublishAt',
      'publishedAt',
      'unpublishReason',
    ];
    const out: Record<string, unknown> = {};
    if (!source) return out;
    for (const key of keys) {
      if (source[key] !== undefined) out[key] = source[key];
    }
    return out;
  }

  /**
   * Dual-write: calcula los campos legacy que espejan el estado destino de la FSM.
   * Mapa espejo (contrato fijado para los 3 estados canónicos):
   *  PUBLISH → isActive=true, isVisible=true, publishStatus='publicado', publishedAt=now
   *  UNPUBLISH → isActive=false, isVisible=false, publishStatus='borrador'
   *  ARCHIVE → isActive=false, isVisible=false, publishStatus='archivado'
   *  RESTORE → isActive=false, isVisible=false, publishStatus='borrador'
   */
  private buildTransitionData(
    event: LifecycleEvent,
    product: { publishedAt?: Date | null; publishStatus?: string | null },
    dto: TransitionProductDto,
    ctx?: AccessContext,
  ): Prisma.ProductUncheckedUpdateInput {
    const now = new Date();

    switch (event) {
      case 'PUBLISH': // DRAFT → PUBLISHED
        return {
          lifecycleStatus: 'PUBLISHED',
          isActive: true,
          isVisible: true,
          publishStatus: 'publicado',
          publishedAt: product.publishedAt ?? now,
          publishAt: null,
          unpublishAt: null,
          unpublishReason: null,
          publishedById: ctx?.userId ?? null,
        };
      case 'UNPUBLISH': // PUBLISHED → DRAFT (elimina programación futura; reason como auditoría)
        return {
          lifecycleStatus: 'DRAFT',
          isActive: false,
          isVisible: false,
          publishStatus: 'borrador',
          publishAt: null,
          publishedAt: null,
          unpublishAt: null,
          unpublishReason: dto.reason?.trim() ? dto.reason : null,
        };
      case 'ARCHIVE': // DRAFT|PUBLISHED → ARCHIVED (elimina publishAt; motivo+confirm obligatorios)
        return {
          lifecycleStatus: 'ARCHIVED',
          isActive: false,
          isVisible: false,
          publishStatus: 'archivado',
          publishAt: null,
          publishedAt: null,
          unpublishAt: null,
          unpublishReason: dto.reason?.trim() ? dto.reason : null,
        };
      case 'RESTORE': // ARCHIVED → DRAFT (nunca publica automáticamente)
        return {
          lifecycleStatus: 'DRAFT',
          isActive: false,
          isVisible: false,
          publishStatus: 'borrador',
          publishAt: null,
          publishedAt: null,
          unpublishAt: null,
          unpublishReason: dto.reason?.trim() ? dto.reason : null,
        };
      default:
        throw new BadRequestException(`Evento FSM sin datos de espejo: ${event}`);
    }
  }

  /** ¿El contexto tiene nivel ACL suficiente sobre el producto? (sin lanzar errores). */
  private async hasAclLevel(productId: string, ctx: AccessContext, level: string): Promise<boolean> {
    if (this.acl.isListasAdmin(ctx.roles)) return true;
    try {
      await this.acl.assertProductAccess(productId, ctx, level);
      return true;
    } catch {
      return false;
    }
  }

  private async checkProductListaBlocked(productId: string, ctx: AccessContext): Promise<boolean> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.listaId) return false;

    if (this.acl.isListasAdmin(ctx.roles)) return false;

    await this.acl.assertListaAccess(product.listaId, ctx, 'manage');

        if (await this.isListaPendingDeletion(product.listaId)) {
      throw new ConflictException({
        code: 'LISTA_PENDIENTE_ELIMINACION',
        message: 'La Lista está pendiente de eliminación y no permite cambios.',
      });
    }
    return false;
  }

  /**
   * Acciones FSM permitidas para un producto según su estado actual, RBAC del
   * usuario (roles) y nivel ACL efectivo. No lanza errores: es informativo
   * para que la UI muestre solo acciones válidas.
   */
  async allowedActions(
    product: { id: string; lifecycleStatus?: string | null; publishStatus?: string | null; isActive?: boolean; isVisible?: boolean; publishAt?: Date | null },
    ctx?: AccessContext,
  ): Promise<LifecycleEvent[]> {
    if (!ctx || !ctx.roles?.length) return [];
    const status = this.effectiveLifecycleStatus(product);
    const allowed: LifecycleEvent[] = [];

    for (const [event, rule] of Object.entries(TRANSITION_RULES)) {
      if (!rule) continue;
      if (!rule.from.includes(status)) continue;
      if (!rule.guard.roles.some((r) => ctx.roles.includes(r))) continue;
      if (!(await this.hasAclLevel(product.id, ctx, rule.guard.aclLevel))) continue;
      allowed.push(event as LifecycleEvent);
    }

    return allowed;
  }

  /**
   * Ejecuta un evento de la FSM sobre un producto. Fuente única de verdad para
   * el ciclo de vida. Guardas en orden: RBAC → ACL → reason/confirm/publishAt →
   * transición válida → checklist (PUBLISH) → dual-write + auditoría.
   */
  async transition(id: string, dto: TransitionProductDto, ctx?: AccessContext) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // Bloqueo: si la Lista del producto está pendiente de eliminación, no permitir transitar
    if (product.listaId) {
            if (await this.isListaPendingDeletion(product.listaId)) {
        throw new ConflictException({
          code: 'LISTA_PENDIENTE_ELIMINACION',
          message: 'La Lista está pendiente de eliminación y no permite cambios.',
        });
      }
      // Permiso Super Admin bypass
      if (!this.acl.isListasAdmin(ctx?.roles)) {
        await this.acl.assertListaAccess(product.listaId, ctx, 'manage');
      }
    }

    return this.doTransition(id, dto, ctx, false);
  }

  /**
   * Scheduler P6 — tick del cron cada minuto.
   * Publica los productos en DRAFT cuyo publishAt ya venció, aplicando
   * internamente la transición canónica PUBLISH (re-valida el checklist).
   * Idempotencia: la query candidata es condicional (lifecycleStatus + fecha) y
   * cada transición re-chequea el estado actual antes de escribir (doTransition →
   * rule.from). El lock en memoria descarta ticks solapados. NO existe
   * auto-despublicación (unpublishAt se conserva como columna sin uso).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleLifecycleTick(): Promise<SchedulerTickReport> {
    const runAt = new Date();
    if (this.lifecycleTickRunning) {
      this.logger.warn('[scheduler] tick anterior aún en curso; se descarta este tick');
      return { runAt, skipped: true, publishOk: 0, publishFailed: [] };
    }
    this.lifecycleTickRunning = true;
    try {
      const publishes = await this.processScheduledPublishes();
      return { runAt, skipped: false, ...publishes };
    } finally {
      this.lifecycleTickRunning = false;
    }
  }

  /**
   * Publica los productos programados (DRAFT con publishAt vencido) aplicando
   * la transición canónica PUBLISH. `doTransition` re-valida el checklist: si
   * falla, NO cambia estado y se cuenta en el reporte con los motivos.
   */
  async processScheduledPublishes(): Promise<{
    publishOk: number;
    publishFailed: Array<{ id: string; reasons: string }>;
  }> {
    const now = new Date();
    const due = (await this.prisma.product.findMany({
      where: { lifecycleStatus: 'DRAFT', publishAt: { lte: now } },
      select: { id: true, sku: true, name: true },
    })) ?? [];

    let publishOk = 0;
    const publishFailed: Array<{ id: string; reasons: string }> = [];

    for (const product of due) {
      try {
        await this.doTransition(product.id, { event: 'PUBLISH' }, undefined, true);
        publishOk += 1;
      } catch (error) {
        const reasons = error instanceof Error ? error.message : 'Error interno';
        publishFailed.push({ id: product.id, reasons });
        this.logger.warn(
          `[scheduler] publicación programada de "${product.name}" (${product.sku}): ${reasons}`,
        );
      }
    }

    return { publishOk, publishFailed };
  }

  private async doTransition(
    id: string,
    dto: TransitionProductDto,
    ctx?: AccessContext,
    skipHumanAccessChecks = false,
  ) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const event = dto.event;
    const rule = TRANSITION_RULES[event];

    if (!rule) {
      throw new BadRequestException(`Evento FSM inválido: ${event}`);
    }

    const status = this.effectiveLifecycleStatus(product);

    // Guarda RBAC (roles con el permiso del evento).
    // Se omite cuando el scheduler o proceso interno invoca la transición
    // sin contexto de usuario humano (skipHumanAccessChecks=true).
    if (!skipHumanAccessChecks && ctx && !rule.guard.roles.some((r) => ctx.roles.includes(r))) {
      throw new ForbiddenException(`No tienes permisos para ejecutar el evento ${event}`);
    }

    // Guarda ACL (nivel sobre el producto/Lista). Skip si listaId null.
    // Se omite cuando skipHumanAccessChecks=true (ruta interna del scheduler).
    if (!skipHumanAccessChecks && ctx && product.listaId) {
      await this.acl.assertProductAccess(id, ctx, rule.guard.aclLevel);
    }

    // Guardas de datos: reason / confirm.
    if (rule.guard.reasonRequired && !dto.reason?.trim()) {
      throw new BadRequestException(`El evento ${event} requiere un motivo (reason)`);
    }
    if (rule.guard.confirmRequired && dto.confirm !== true) {
      throw new BadRequestException(`El evento ${event} requiere confirmación (confirm: true)`);
    }

    // Transición válida según estado actual.
    if (!rule.from.includes(status)) {
      throw new BadRequestException(
        `No se puede pasar de ${status} a ${rule.to} con el evento ${event}`,
      );
    }
    // Checklist de publicación (P5): solo PUBLISH valida requisitos comerciales.
    if (event === 'PUBLISH') {
      const failures = await this.validatePublishRequirements(product);
      if (failures.length > 0) {
        const detail = failures.map((f, i) => `${i + 1}) ${f}`).join('; ');
        throw new BadRequestException(`No se puede publicar. Requisitos incumplidos: ${detail}`);
      }
    }

    const data = this.buildTransitionData(event, product, dto, ctx);
    const oldValues = this.lifecycleSnapshot(product);

    const updated = await this.prisma.product.update({ where: { id }, data });

    await this.audit.log({
      userId: ctx?.userId,
      action: EVENT_AUDIT_ACTION[event],
      entity: 'Product',
      entityId: id,
      oldValues,
      // Los valores realmente escritos (data) prevalecen sobre la fila devuelta.
      newValues: { ...this.statePick(updated), ...this.statePick(data) },
    });

    const allowed = ctx ? await this.allowedActions(updated, ctx) : undefined;
    return allowed ? { ...updated, allowedActions: allowed } : updated;
  }
  async schedulePublication(
    id: string,
    dto: SchedulePublicationDto,
    ctx: AccessContext,
  ): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (product.listaId) {
      if (await this.isListaPendingDeletion(product.listaId)) {
        throw new ConflictException({
          code: 'LISTA_PENDIENTE_ELIMINACION',
          message: 'La Lista esta pendiente de eliminacion y no permite cambios.',
        });
      }
      if (!this.acl.isListasAdmin(ctx.roles)) {
        await this.acl.assertListaAccess(product.listaId, ctx, 'manage');
      }
    }
    const status = this.effectiveLifecycleStatus(product);
    if (status === 'PUBLISHED') {
      throw new ConflictException('El producto ya esta publicado');
    }
    if (status === 'ARCHIVED') {
      throw new BadRequestException('No se puede publicar un producto archivado');
    }
    if (status !== 'DRAFT') {
      throw new BadRequestException(`No se puede programar la publicacion en estado ${status}`);
    }
    if (!dto.publishAt) {
      throw new BadRequestException('Se requiere publishAt');
    }
    const publishAt = new Date(dto.publishAt);
    if (Number.isNaN(publishAt.getTime())) {
      throw new BadRequestException('publishAt no es una fecha ISO valida');
    }
    if (publishAt <= new Date()) {
      throw new BadRequestException('publishAt debe ser una fecha futura');
    }
    const previous = product.publishAt ? new Date(product.publishAt) : null;
    // La FSM es la fuente de verdad de isActive/isVisible/lifecycleStatus/publishStatus.
    // Este helper solo persiste publishAt, sin escribir directamente isActive/isVisible.
    const updated = await this.persistScheduledPublishAt(id, publishAt, ctx);
    await this.audit.log({
      userId: ctx.userId,
      action: 'schedule_publish',
      entity: 'Product',
      entityId: id,
      oldValues: { lifecycleStatus: status, publishAt: previous },
      newValues: { lifecycleStatus: status, publishAt, publishStatus: product.publishStatus ?? 'borrador' },
      result: 'SUCCESS',
    });
    return updated;
  }
  /**
   * Cancela una programacion de publicacion pendiente en DRAFT.
   * Solo elimina publishAt; NO despublica ni toca isActive/isVisible (derivados de FSM).
   */
  async cancelScheduledPublication(
    id: string,
    ctx: AccessContext,
  ): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (product.listaId) {
      if (await this.isListaPendingDeletion(product.listaId)) {
        throw new ConflictException({
          code: 'LISTA_PENDIENTE_ELIMINACION',
          message: 'La Lista esta pendiente de eliminacion y no permite cambios.',
        });
      }
      if (!this.acl.isListasAdmin(ctx.roles)) {
        await this.acl.assertListaAccess(product.listaId, ctx, 'manage');
      }
    }
    const status = this.effectiveLifecycleStatus(product);
    if (status !== 'DRAFT') {
      throw new ConflictException('Solo se puede cancelar una programacion en un producto en Borrador.');
    }
    const current = product.publishAt ? new Date(product.publishAt) : null;
    if (!current || current <= new Date()) {
      throw new ConflictException('El producto no tiene una publicacion programada activa.');
    }
    const updated = await this.prisma.product.update({
      where: { id },
      data: { publishAt: null },
    });
    await this.audit.log({
      userId: ctx.userId,
      action: 'cancel_schedule_publish',
      entity: 'Product',
      entityId: id,
      oldValues: { lifecycleStatus: status, publishAt: current },
      newValues: { lifecycleStatus: status, publishAt: null },
      result: 'SUCCESS',
    });
    return updated;
  }
  /**
   * Helper canonico de programacion: persiste unicamente publishAt (y publishedAt: null
   * al programar) preservando isActive/isVisible/lifecycleStatus/publishStatus de la FSM.
   * Reprogramar reemplaza la fecha pendiente.
   */
  private async persistScheduledPublishAt(
    id: string,
    publishAt: Date,
    ctx: AccessContext,
  ): Promise<Product> {
    return this.prisma.product.update({
      where: { id },
      data: {
        publishAt,
        publishedAt: null,
      },
    });
  }
  /**
   * Bulk de transiciones: procesa producto a producto (sin transacción global).
   * Los fallos de un producto NO bloquean el resto. Devuelve
   * { applied, rejected } (el interceptor global lo envuelve en { data }).
   */
  async bulkTransition(ids: string[], dto: TransitionProductDto, ctx?: AccessContext) {
    const applied: { id: string; lifecycleStatus: string }[] = [];
    const rejected: { id: string; reason: string }[] = [];

    for (const id of ids) {
      try {
        const result = await this.transition(id, dto, ctx);
        applied.push({ id, lifecycleStatus: result.lifecycleStatus });
      } catch (error) {
        rejected.push({
          id,
          reason: error instanceof Error ? error.message : 'Error interno',
        });
      }
    }

    return { applied, rejected };
  }

  /**
   * Lista productos programados (publishStatus 'listo') con publishAt en el rango
   * [from, to]. Si no vienen from/to, usa [now, now+7 días]. También aplica lazy unpublish.
   */
  async findPublishScheduled(from?: string, to?: string) {
    const now = new Date();
    const fromDate = from ? new Date(from) : now;
    const toDate = to ? new Date(to) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const products = (await this.prisma.product.findMany({
      where: {
        lifecycleStatus: 'DRAFT',
        publishAt: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        publishAt: true,
        lista: { select: { id: true, name: true, code: true } },
      },
      orderBy: { publishAt: 'asc' },
    })) ?? [];

    return { data: products };
  }

  /**
   * Borrado físico (P4): roles `products:write` (Super Admin / Admin Comercial),
   * ACL `manage` sobre el producto/Lista, confirmación explícita (confirm: true)
   * y clave maestra OBLIGATORIA si el producto tiene datos asociados (precios,
   * imágenes, stock, auditoría u órdenes de compra que lo referencien).
   * El evento DELETE es válido desde cualquier estado FSM (comportamiento actual
   * conservado). Se audita 'delete' con oldValues ANTES del borrado físico.
   */
  async remove(id: string, dto?: DeleteProductDto, ctx?: AccessContext) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // Guarda RBAC: borrado físico exige `products:write` (Super Admin/Admin Comercial).
    if (ctx && !ctx.roles?.some((r) => PRODUCTS_WRITE_ROLES.includes(r))) {
      throw new ForbiddenException('No tienes permisos para eliminar productos');
    }

    // Guarda ACL: nivel `manage` sobre el producto/Lista (checklist 29/30).
    if (ctx && product.listaId) {
      await this.acl.assertProductAccess(id, ctx, 'manage');
    }

    // Bloqueo: si la Lista del producto está pendiente de eliminación, no permitir borrar
    if (product.listaId) {
            if (await this.isListaPendingDeletion(product.listaId)) {
        throw new ConflictException({
          code: 'LISTA_PENDIENTE_ELIMINACION',
          message: 'La Lista está pendiente de eliminación y no permite cambios.',
        });
      }
      // Permiso Super Admin bypass
      if (!this.acl.isListasAdmin(ctx?.roles)) {
        await this.acl.assertListaAccess(product.listaId, ctx, 'manage');
      }
    }

    // Guarda de confirmación: el borrado físico es destructivo e irreversible.
    if (dto?.confirm !== true) {
      throw new BadRequestException('Debes confirmar el borrado físico con confirm: true');
    }

    // Datos asociados → exige la clave maestra (patrón Listas/removeLista).
    const [priceCount, imageCount, stock, auditCount] = await Promise.all([
      this.prisma.price.count({ where: { productId: id } }),
      this.prisma.productImage.count({ where: { productId: id } }),
      this.prisma.stock.findUnique({ where: { productId: id } }),
      this.prisma.auditLog.count({ where: { entity: 'Product', entityId: id } }),
    ]);

    // Auditoría ANTES del borrado físico: deja constancia del producto eliminado.
    await this.audit.log({
      userId: ctx?.userId,
      action: 'delete',
      entity: 'Product',
      entityId: id,
      oldValues: {
        sku: product.sku,
        name: product.name,
        lifecycleStatus: product.lifecycleStatus ?? null,
        isActive: product.isActive,
        isVisible: product.isVisible,
        publishStatus: product.publishStatus ?? null,
      },
    });

    const images = await this.prisma.productImage.findMany({ where: { productId: id } });

    await this.prisma.price.deleteMany({ where: { productId: id } });
    await this.prisma.productImage.deleteMany({ where: { productId: id } });
    await this.prisma.product.delete({ where: { id } });

    for (const image of images) {
      await this.files.deleteByUrl(image.url);
    }

    return { message: 'Producto eliminado exitosamente' };
  }


  /**
   * Sube una imagen para un producto y registra la fila ProductImage.
   * Valida tipo (jpeg/png/webp/gif) y tamaño máximo (8 MB).
   */
  async uploadImage(
    productId: string,
    file: Express.Multer.File,
    isPrimary = false,
    ctx?: AccessContext,
  ) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // Subir imagen exige `edit_products` sobre el producto (checklist 29/30).
    if (ctx && product.listaId) {
      await this.acl.assertProductAccess(productId, ctx, 'edit_products');
    }

    if (!file) {
      throw new BadRequestException('Archivo requerido en el campo "file"');
    }

    if (!ALLOWED_IMAGE_MIMETYPES[file.mimetype]) {
      throw new BadRequestException('Tipo de archivo no permitido. Use JPEG, PNG, WEBP o GIF.');
    }

    if (file.size > MAX_IMAGE_SIZE) {
      throw new BadRequestException('El archivo excede el tamaño máximo de 8MB');
    }

    const { url } = await this.files.store(file.buffer, file.mimetype);

    if (isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.productImage.create({
      data: {
        productId,
        url,
        alt: file.originalname || null,
        isPrimary,
        sortOrder: 0,
      },
    });
  }

  /**
   * Elimina una imagen: borra el registro y los bytes almacenados.
   */
  async deleteImage(imageId: string, ctx?: AccessContext) {
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('Imagen no encontrada');

    // Eliminar imagen exige `edit_products` sobre el producto dueño (checklist 29/30).
    if (ctx && image.productId) {
      await this.acl.assertProductAccess(image.productId, ctx, 'edit_products');
    }

    await this.files.deleteByUrl(image.url);

    await this.prisma.productImage.delete({ where: { id: imageId } });
    return { message: 'Imagen eliminada exitosamente' };
  }

  /**
   * Actualiza metadatos de una imagen (alt y/o isPrimary).
   * Si isPrimary: true, desmarca primero cualquier otra imagen principal del
   * mismo producto (updateMany isPrimary=false) y marca esta (transacción).
   * 404 si la imagen no existe. Audita con entity 'ProductImage', action 'update'.
   */
  async updateImage(
    imageId: string,
    dto: { alt?: string; isPrimary?: boolean },
    ctx?: AccessContext,
  ) {
    const image = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException('Imagen no encontrada');

    // Actualizar imagen exige `edit_products` sobre el producto dueño (checklist 29/30).
    if (ctx) {
      await this.acl.assertProductAccess(image.productId, ctx, 'edit_products');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary === true) {
        await tx.productImage.updateMany({
          where: { productId: image.productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.productImage.update({
        where: { id: imageId },
        data: {
          ...(dto.alt !== undefined && { alt: dto.alt }),
          ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
        },
      });
    });

    await this.audit.log({
      userId: ctx?.userId,
      action: 'update',
      entity: 'ProductImage',
      entityId: imageId,
      oldValues: {
        productId: image.productId,
        url: image.url,
        alt: image.alt,
        isPrimary: image.isPrimary,
        sortOrder: image.sortOrder,
      },
      newValues: {
        productId: image.productId,
        url: result.url,
        alt: result.alt,
        isPrimary: result.isPrimary,
        sortOrder: result.sortOrder,
      },
    });

    return result;
  }

  /**
   * Resuelve la Lista a la que pertenece un producto.
   * Si se envía listaId, valida su existencia; si falta, asigna LISTA-GENERAL (fallback documentado).
   * Retorna también defaultVisibility para propagarla al crear productos sin isVisible explícito.
   * [decisiones 8/14]
   */
  private async resolveLista(listaId?: string): Promise<{ id: string; defaultVisibility: boolean }> {
    if (listaId) {
      const lista = await this.prisma.lista.findUnique({
        where: { id: listaId },
        select: { id: true, defaultVisibility: true },
      });
      if (!lista) throw new NotFoundException('Lista no encontrada');
      return lista;
    }

    const defaultLista = await this.prisma.lista.findUnique({
      where: { code: 'LISTA-GENERAL' },
      select: { id: true, defaultVisibility: true },
    });
    if (!defaultLista) throw new NotFoundException('Lista por defecto (LISTA-GENERAL) no encontrada');
    return defaultLista;
  }

  /**
   * Valida que todos los priceListId existan en BD.
   */
  private async validatePriceLists(prices?: PriceInputDto[]): Promise<void> {
    if (!prices || prices.length === 0) return;

    const ids = [...new Set(prices.map((p) => p.priceListId))];
    const found = await this.prisma.priceList.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((pl) => pl.id));
    const missing = ids.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      throw new NotFoundException(
        `Listas de precios no encontradas: ${missing.join(', ')}`,
      );
    }
  }

  /**
   * Upsert individual por (productId, priceListId) dentro de una transacción.
   * No borra precios no enviados para no perder datos.
   * Asocia el precio a la misma Lista del producto (invariante Price.listaId == Product.listaId).
   */
  private async upsertPrices(
    productId: string,
    listaId: string | null | undefined,
    prices: PriceInputDto[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const price of prices) {
        const validFrom = price.validFrom ? new Date(price.validFrom) : undefined;
        const validUntil = price.validUntil ? new Date(price.validUntil) : undefined;

        await tx.price.upsert({
          where: { productId_priceListId: { productId, priceListId: price.priceListId } },
          update: {
            value: price.value,
            ...(price.currency && { currency: price.currency }),
            ...(validFrom && { validFrom }),
            ...(validUntil && { validUntil }),
            ...(listaId ? { listaId } : {}),
          },
          create: {
            productId,
            priceListId: price.priceListId,
            ...(listaId ? { listaId } : {}),
            value: price.value,
            currency: price.currency ?? 'COP',
            ...(validFrom && { validFrom }),
            ...(validUntil && { validUntil }),
          },
        });
      }
    });
  }

  /**
   * Genera un nombre breve y determinístico a partir de una descripción técnica.
   * Se usa SOLO cuando no hay un `name` explícito en la fila de importación.
   * Función pura: no consulta la BD, no usa I/O ni servicios externos.
   * - No añade el SKU/referencia al resultado.
   * - No inventa atributos: solo resume texto presente en la descripción.
   * - Corta antes de frases de ficha técnica secundaria; nunca parte palabras;
   *   nunca supera los 120 caracteres.
   */
  private deriveNameFromDescription(description: string): string | null {
    const HEADER_ARTIFACTS = ['TITLE HIKVISION TURBO'];
    const CUT_PHRASES = [
      'Compatible',
      'Admite',
      'Soporta',
      'Clasificación',
      'Compresión',
      'Entradas',
      'Capacidad',
      'Tecnología',
      'Protección',
      'Grabación',
    ];
    const MIN_USEFUL_BEFORE = 12;
    const MAX_LENGTH = 120;

    // 1-2. Normalizar espacios, tabs y saltos de línea a un único espacio;
    // preserva el contenido técnico (SKU, unidades, resoluciones, tecnologías).
    const normalized = normalizeText(description);
    if (!normalized) return null;

    // 3. Quitar artefactos de encabezado/separador (aislados o incrustados).
    let candidate = normalized;
    for (const artifact of HEADER_ARTIFACTS) {
      candidate = candidate
        .replace(new RegExp(this.escapeRegExp(artifact), 'gi'), ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // 4. Rechazar si tras la limpieza queda vacío o sin letras/números.
    if (!candidate || !/[a-zA-Z0-9]/.test(candidate)) return null;

    // 5. Primer fragmento comercial útil: cortar antes de la primera frase de
    // ficha técnica (case-insensitive). Solo se usa el corte si deja un
    // fragmento descriptivo útil (>= 12 caracteres).
    const lower = candidate.toLowerCase();
    let cutIndex = -1;
    for (const phrase of CUT_PHRASES) {
      const idx = lower.indexOf(phrase.toLowerCase());
      if (idx !== -1 && (cutIndex === -1 || idx < cutIndex)) cutIndex = idx;
    }
    let nameCandidate = candidate;
    if (cutIndex !== -1) {
      const before = candidate.slice(0, cutIndex).trim();
      if (before.length >= MIN_USEFUL_BEFORE) nameCandidate = before;
    }

    // 6. Limitar a 120 caracteres sin partir palabras.
    if (nameCandidate.length > MAX_LENGTH) {
      const slice = nameCandidate.slice(0, MAX_LENGTH);
      const lastBreak = Math.max(
        slice.lastIndexOf(' '),
        slice.lastIndexOf(','),
        slice.lastIndexOf(';'),
        slice.lastIndexOf('.'),
      );
      nameCandidate = lastBreak > 0 ? slice.slice(0, lastBreak) : slice;
    }

    // 7. trim final y limpiar puntuación/conectores incompletos al final.
    nameCandidate = nameCandidate.trim().replace(/[\s,;.\-–—]+$/, '').trim();

    // 8. null si quedó vacío o inválido.
    if (!nameCandidate || !/[a-zA-Z0-9]/.test(nameCandidate)) return null;
    return nameCandidate;
  }

  /** Escapa metacaracteres de regex para usar un literal en `new RegExp`. */
  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async importFromExcel(file: Buffer) {
    if (!file) {
      throw new BadRequestException('No se proporcionó archivo');
    }

    // Mitigación ReDoS xlsx (GHSA-5pgg-2g8v-p4x9): límite 10MB ya en excel-adapter; aquí también
    if (file.length > 10 * 1024 * 1024) {
      throw new BadRequestException('Archivo excede 10MB');
    }

    const workbook = XLSX.read(file, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    let rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
    // Mitigación Prototype Pollution (GHSA-4r6h-8v6p-xvw6): sanitizar keys peligrosas
    rows = rows.map((r) => {
      const clean = Object.create(null) as Record<string, unknown>;
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
        if (['__proto__', 'constructor', 'prototype'].includes(k)) continue;
        clean[k] = v;
      }
      return clean;
    });

    if (rows.length === 0) {
      throw new BadRequestException('El archivo está vacío');
    }

    const results = {
      total: rows.length,
      created: 0,
      skipped: 0,
      errors: [] as { row: number; sku: string; error: string }[],
    };

    // Get existing categories and brands for name-to-id mapping
    const categories = await this.prisma.category.findMany();
    const brands = await this.prisma.brand.findMany();

    // Fallback explícito documentado: LISTA-GENERAL (lista semilla) para productos importados.
    const defaultLista = await this.prisma.lista.findUnique({
      where: { code: 'LISTA-GENERAL' },
      select: { id: true },
    });
    const defaultListaId = defaultLista?.id ?? null;

    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
    const brandMap = new Map(brands.map(b => [b.name.toLowerCase(), b.id]));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as any;
      const rowNum = i + 2; // Excel row number (1-based + header)

      try {
        // Map Excel columns to product fields
        // Expected columns: SKU, Nombre, Descripción, Categoría, Marca.
        // REFERENCIA/SKU se persiste SOLO como `sku`; nunca se concatena a `name`.
        const sku = String(row['SKU'] || row['sku'] || row['Código'] || row['codigo'] || '').trim();

        // rawName: SOLO la columna de nombre explícita. Si está vacía, no se usa.
        const rawName = String(row['Nombre'] || row['nombre'] || row['Name'] || row['name'] || '').trim();

        // rawDescription: columna de descripción (fuente íntegra de `description`).
        const rawDescription = String(row['Descripción'] || row['descripcion'] || row['Description'] || row['description'] || '').trim();

        // name: prevalece el nombre explícito (solo se normalizan espacios). Si no
        // existe un nombre útil, se deriva un nombre breve desde la descripción.
        // El SKU/referencia NUNCA se concatena al nombre.
        const name = rawName
          ? normalizeText(rawName)
          : rawDescription
            ? (this.deriveNameFromDescription(rawDescription) ?? '')
            : '';

        // description: se conserva completa, normalizando espacios; NO se reemplaza
        // por el nombre generado ni por el SKU.
        const description = rawDescription ? normalizeText(rawDescription) : '';
        const categoryName = String(row['Categoría'] || row['categoria'] || row['Category'] || row['category'] || '').trim();
        const brandName = String(row['Marca'] || row['marca'] || row['Brand'] || row['brand'] || '').trim();

        // Validate required fields
        if (!sku) {
          results.errors.push({ row: rowNum, sku: 'N/A', error: 'SKU vacío' });
          results.skipped++;
          continue;
        }

        if (!name) {
          results.errors.push({ row: rowNum, sku, error: 'Nombre vacío' });
          results.skipped++;
          continue;
        }

        // Find or create category
        let categoryId = categoryMap.get(categoryName.toLowerCase());
        if (!categoryId && categoryName) {
          const newCategory = await this.prisma.category.create({
            data: {
              name: categoryName,
              slug: categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              isActive: true,
            },
          });
          categoryId = newCategory.id;
          categoryMap.set(categoryName.toLowerCase(), categoryId);
        }

        if (!categoryId) {
          results.errors.push({ row: rowNum, sku, error: 'Categoría no especificada' });
          results.skipped++;
          continue;
        }

        // Find or create brand
        let brandId = brandMap.get(brandName.toLowerCase());
        if (!brandId && brandName) {
          const newBrand = await this.prisma.brand.create({
            data: {
              name: brandName,
              slug: brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              isActive: true,
            },
          });
          brandId = newBrand.id;
          brandMap.set(brandName.toLowerCase(), brandId);
        }

        if (!brandId) {
          results.errors.push({ row: rowNum, sku, error: 'Marca no especificada' });
          results.skipped++;
          continue;
        }

        // Check if SKU already exists
        const existingProduct = await this.prisma.product.findUnique({ where: { sku } });
        if (existingProduct) {
          results.errors.push({ row: rowNum, sku, error: 'SKU ya existe' });
          results.skipped++;
          continue;
        }

         await this.prisma.product.create({
           data: {
             sku,
             name,
             description: description || null,
             categoryId,
             brandId,
             listaId: defaultListaId,
             lifecycleStatus: 'DRAFT',
             isActive: false,
             isVisible: false,
           },
         });

        results.created++;
      } catch (error) {
        results.errors.push({
          row: rowNum,
          sku: row['SKU'] || row['sku'] || 'N/A',
          error: error.message || 'Error desconocido',
        });
        results.skipped++;
      }
    }

    return results;
  }

  /**
   * Verifica si la Lista del producto est\u00E1 pendiente de eliminaci\u00F3n (PENDING_DELETION).
   * Accede a la columna real `deletionStatus` que el cliente Prisma generado
   * en este entorno a\u00FAn no tipa (prisma generate no ejecutado); el cast estrecho
   * refleja la columna real definida en schema.prisma.
   */

  /**
   * Programacion masiva de publicacion (productIds explicitos).
   * Reutiliza schedulePublication por producto y agrega resultados por producto.
   */
  async schedulePublicationBulk(
    ids: string[],
    dto: BulkSchedulePublicationDto,
    ctx: AccessContext,
  ): Promise<{
    processed: number;
    succeeded: number;
    skipped: number;
    failed: number;
    results: Array<{
      productId: string;
      sku?: string;
      status: "SUCCESS" | "SKIPPED" | "ERROR";
      code?: string;
      message: string;
    }>;
  }> {
    const results: Array<{
      productId: string;
      sku?: string;
      status: "SUCCESS" | "SKIPPED" | "ERROR";
      code?: string;
      message: string;
    }> = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const productId of ids) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sku: true, listaId: true, publishStatus: true, lifecycleStatus: true },
      });
      if (!product) {
        failed++;
        results.push({
          productId,
          status: "ERROR",
          code: "PRODUCT_NOT_FOUND",
          message: "Producto no encontrado",
        });
        continue;
      }
      if (await this.isListaPendingDeletion(product.listaId)) {
        skipped++;
        results.push({
          productId,
          sku: product.sku,
          status: "SKIPPED",
          code: "LISTA_PENDIENTE_ELIMINACION",
          message: "La lista esta pendiente de eliminacion y no permite cambios.",
        });
        continue;
      }
      const status = this.effectiveLifecycleStatus(product);
      if (status !== "DRAFT") {
        skipped++;
        results.push({
          productId,
          sku: product.sku,
          status: "SKIPPED",
          code: "NOT_ELIGIBLE",
          message: "Estado " + status + " no permite programar publicacion",
        });
        continue;
      }
      try {
        await this.schedulePublication(productId, { publishAt: dto.publishAt }, ctx);
        succeeded++;
        results.push({
          productId,
          sku: product.sku,
          status: "SUCCESS",
          message: "Publicacion programada",
        });
      } catch (error) {
        failed++;
        results.push({
          productId,
          sku: product.sku,
          status: "ERROR",
          code: "SCHEDULE_FAILED",
          message: error instanceof Error ? error.message : "Error interno",
        });
      }
    }
    const agg: "SUCCESS" | "WARNING" | "ERROR" =
      succeeded > 0 && (skipped > 0 || failed > 0) ? "WARNING" :
      failed > 0 && succeeded === 0 ? "ERROR" : "SUCCESS";
    await this.audit.log({
      userId: ctx.userId,
      action: "schedule_publish_bulk",
      entity: "Product",
      entityId: ids.join(","),
      newValues: { publishAt: dto.publishAt, succeeded, skipped, failed },
      result: agg,
    });
    return { processed: ids.length, succeeded, skipped, failed, results };
  }

  /**
   * Cancelacion masiva de publicacion programada (productIds explicitos).
   * No despublica productos ya publicados; solo anula programacion pendiente en DRAFT.
   */
  async cancelPublicationBulk(
    ids: string[],
    ctx: AccessContext,
  ): Promise<{
    processed: number;
    succeeded: number;
    skipped: number;
    failed: number;
    results: Array<{
      productId: string;
      sku?: string;
      status: "SUCCESS" | "SKIPPED" | "ERROR";
      code?: string;
      message: string;
    }>;
  }> {
    const results: Array<{
      productId: string;
      sku?: string;
      status: "SUCCESS" | "SKIPPED" | "ERROR";
      code?: string;
      message: string;
    }> = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const productId of ids) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sku: true, listaId: true, lifecycleStatus: true, publishAt: true },
      });
      if (!product) {
        failed++;
        results.push({ productId, status: "ERROR", code: "PRODUCT_NOT_FOUND", message: "Producto no encontrado" });
        continue;
      }
      if (await this.isListaPendingDeletion(product.listaId)) {
        skipped++;
        results.push({ productId, sku: product.sku, status: "SKIPPED", code: "LISTA_PENDIENTE_ELIMINACION", message: "La lista esta pendiente de eliminacion y no permite cambios." });
        continue;
      }
      try {
        await this.cancelScheduledPublication(productId, ctx);
        succeeded++;
        results.push({ productId, sku: product.sku, status: "SUCCESS", message: "Programacion cancelada" });
      } catch (error) {
        skipped++;
        results.push({ productId, sku: product.sku, status: "SKIPPED", code: "NOT_ACTIVE_SCHEDULE", message: error instanceof Error ? error.message : "Sin programacion activa" });
      }
    }
    const agg: "SUCCESS" | "WARNING" | "ERROR" =
      succeeded > 0 && (skipped > 0 || failed > 0) ? "WARNING" :
      failed > 0 && succeeded === 0 ? "ERROR" : "SUCCESS";
    await this.audit.log({
      userId: ctx.userId,
      action: "cancel_schedule_publish_bulk",
      entity: "Product",
      entityId: ids.join(","),
      newValues: { succeeded, skipped, failed },
      result: agg,
    });
    return { processed: ids.length, succeeded, skipped, failed, results };
  }

  /** Resultado consolidado de una operacion sobre una Lista completa. */
  async publishListaProducts(
    listaId: string,
    ctx: AccessContext,
  ): Promise<ListaPublicationBatchResult> {
    await this.assertListaPublishable(listaId, ctx);
    const products = (await this.prisma.product.findMany({
      where: { listaId },
      select: { id: true, sku: true },
    })) ?? [];
    const results: ListaPublicationBatchResult['results'] = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const p of products) {
      const product = await this.prisma.product.findUnique({ where: { id: p.id } });
      if (!product) { failed++; results.push({ productId: p.id, sku: p.sku, status: 'ERROR', code: 'PRODUCT_NOT_FOUND', message: 'Producto no encontrado' }); continue; }
      const status = this.effectiveLifecycleStatus(product);
      if (status !== 'DRAFT') {
        skipped++;
        results.push({ productId: p.id, sku: p.sku, status: 'SKIPPED', code: 'NOT_ELIGIBLE', message: `Estado ${status} no permite publicar` });
        continue;
      }
      try {
        await this.doTransition(p.id, { event: 'PUBLISH' }, ctx, false);
        succeeded++;
        results.push({ productId: p.id, sku: p.sku, status: 'SUCCESS', message: 'Publicado' });
      } catch (error) {
        if (error instanceof ConflictException || error instanceof BadRequestException) {
          skipped++;
          results.push({ productId: p.id, sku: p.sku, status: 'SKIPPED', code: 'NOT_ELIGIBLE', message: error.message });
        } else {
          failed++;
          results.push({ productId: p.id, sku: p.sku, status: 'ERROR', code: 'PUBLISH_FAILED', message: error instanceof Error ? error.message : 'Error interno' });
        }
      }
    }
    const result = this.aggregateResult(succeeded, skipped, failed);
    await this.audit.log({
      userId: ctx.userId,
      action: 'publicar_lista',
      entity: 'LISTA',
      entityId: listaId,
      newValues: { processed: products.length, succeeded, skipped, failed },
      result,
    });
    return { listaId, processed: products.length, succeeded, skipped, failed, results };
  }

  /** Programa la publicacion de una Lista completa (solo productos elegibles). */
  async scheduleListaProducts(
    listaId: string,
    dto: SchedulePublicationDto,
    ctx: AccessContext,
  ): Promise<ListaPublicationBatchResult> {
    await this.assertListaPublishable(listaId, ctx);
    const products = (await this.prisma.product.findMany({
      where: { listaId },
      select: { id: true, sku: true },
    })) ?? [];
    const results: ListaPublicationBatchResult['results'] = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const p of products) {
      const product = await this.prisma.product.findUnique({ where: { id: p.id } });
      if (!product) { failed++; results.push({ productId: p.id, sku: p.sku, status: 'ERROR', code: 'PRODUCT_NOT_FOUND', message: 'Producto no encontrado' }); continue; }
      const status = this.effectiveLifecycleStatus(product);
      if (status !== 'DRAFT') {
        skipped++;
        results.push({ productId: p.id, sku: p.sku, status: 'SKIPPED', code: 'NOT_ELIGIBLE', message: `Estado ${status} no permite programar` });
        continue;
      }
      try {
        await this.schedulePublication(p.id, dto, ctx);
        succeeded++;
        results.push({ productId: p.id, sku: p.sku, status: 'SUCCESS', message: 'Programada' });
      } catch (error) {
        if (error instanceof ConflictException || error instanceof BadRequestException) {
          skipped++;
          results.push({ productId: p.id, sku: p.sku, status: 'SKIPPED', code: 'NOT_ELIGIBLE', message: error.message });
        } else {
          failed++;
          results.push({ productId: p.id, sku: p.sku, status: 'ERROR', code: 'SCHEDULE_FAILED', message: error instanceof Error ? error.message : 'Error interno' });
        }
      }
    }
    const result = this.aggregateResult(succeeded, skipped, failed);
    await this.audit.log({
      userId: ctx.userId,
      action: 'schedule_lista',
      entity: 'LISTA',
      entityId: listaId,
      newValues: { publishAt: dto.publishAt, processed: products.length, succeeded, skipped, failed },
      result,
    });
    return { listaId, processed: products.length, succeeded, skipped, failed, results };
  }

  /** Cancela programaciones pendientes de productos de una Lista (no despublica publicados). */
  async cancelListaSchedules(
    listaId: string,
    ctx: AccessContext,
  ): Promise<ListaPublicationBatchResult> {
    await this.assertListaPublishable(listaId, ctx);
    const products = (await this.prisma.product.findMany({
      where: { listaId, publishAt: { not: null } },
      select: { id: true, sku: true },
    })) ?? [];
    if (products.length === 0) {
      await this.audit.log({
        userId: ctx.userId,
        action: 'cancel_schedule_lista',
        entity: 'LISTA',
        entityId: listaId,
        newValues: { processed: 0, succeeded: 0, skipped: 0, failed: 0 },
        result: 'SUCCESS',
      });
      return { listaId, processed: 0, succeeded: 0, skipped: 0, failed: 0, results: [] };
    }
    const results: ListaPublicationBatchResult['results'] = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    for (const p of products) {
      try {
        await this.cancelScheduledPublication(p.id, ctx);
        succeeded++;
        results.push({ productId: p.id, sku: p.sku, status: 'SUCCESS', message: 'Programacion cancelada' });
      } catch (error) {
        if (error instanceof ConflictException) {
          skipped++;
          results.push({ productId: p.id, sku: p.sku, status: 'SKIPPED', code: 'NOT_ACTIVE_SCHEDULE', message: error.message });
        } else {
          failed++;
          results.push({ productId: p.id, sku: p.sku, status: 'ERROR', code: 'CANCEL_FAILED', message: error instanceof Error ? error.message : 'Error interno' });
        }
      }
    }
    const result = this.aggregateResult(succeeded, skipped, failed);
    await this.audit.log({
      userId: ctx.userId,
      action: 'cancel_schedule_lista',
      entity: 'LISTA',
      entityId: listaId,
      newValues: { processed: products.length, succeeded, skipped, failed },
      result,
    });
    return { listaId, processed: products.length, succeeded, skipped, failed, results };
  }

  /** Autorizacion y estado de una Lista para operaciones de publicacion. */
  private async assertListaPublishable(listaId: string, ctx: AccessContext): Promise<void> {
    if (!ctx.userId) throw new ForbiddenException('Usuario no autenticado');
    const lista = await this.prisma.lista.findUnique({
      where: { id: listaId },
      select: { id: true, isActive: true, archivedAt: true },
    });
    if (!lista || !lista.isActive || lista.archivedAt) throw new NotFoundException('Lista no encontrada');
    if (await this.isListaPendingDeletion(listaId)) {
      throw new ConflictException({
        code: 'LISTA_PENDIENTE_ELIMINACION',
        message: 'La Lista esta pendiente de eliminacion y no permite cambios.',
      });
    }
    if (!this.acl.isListasAdmin(ctx.roles)) {
      await this.acl.assertListaAccess(listaId, ctx, 'manage');
    }
  }

  /** Clasifica el resultado agregado de un lote. */
  private aggregateResult(
    succeeded: number,
    skipped: number,
    failed: number,
  ): 'SUCCESS' | 'WARNING' | 'ERROR' {
    if (succeeded === 0) return 'ERROR';
    if (skipped > 0 || failed > 0) return 'WARNING';
    return 'SUCCESS';
  }
  private async isListaPendingDeletion(listaId: string | null): Promise<boolean> {
    if (!listaId) return false;
    const row = (await this.prisma.lista.findUnique({
      where: { id: listaId },
    })) as unknown as { deletionStatus: string | null } | null;
    return row?.deletionStatus === "PENDING_DELETION";
  }
}
