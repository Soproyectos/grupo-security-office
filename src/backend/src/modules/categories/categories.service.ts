import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../prisma/biblioteca/generated/client';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { LibraryAuditService, type LibraryActor } from '../library-audit/library-audit.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { publicCatalogVisibility } from '../products/public-catalog-visibility';
import { effectiveIdentity, loadActiveRevisionContents } from '../products/public-revision-lens';
import { ClassificationService } from '../products/classification/classification.service';
import { buildUsageReport, findNameCollision, impactConfirmationRequired, nameTaken } from '../masters/master-rules';
import type { ClassificationDb } from '../products/classification/classification.types';

type MenuCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  imageUrl: string | null;
  iconUrl: string | null;
  isFeatured: boolean;
  sortOrder: number;
  isActive?: boolean;
};

export type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  iconUrl: string | null;
  isFeatured: boolean;
  sortOrder: number;
  /** Productos públicos de la categoría y de todas sus descendientes activas. */
  productCount: number;
  /** Solo los nodos de Subcategory incluyen su identidad persistida. */
  subcategoryId?: string;
  /** Slug de Subcategory cuando el nodo se fusiona con una categoría legacy. */
  subcategorySlug?: string;
  children: MenuCategory[];
};

@Injectable()
export class CategoriesService {
  constructor(private readonly library: BibliotecaPrismaService, private readonly audit: LibraryAuditService) {}

  private get prisma() { return this.library.client; }
  private readonly classification = new ClassificationService();

  /** Editor selector: root categories with their active subcategories. */
  async classificationTree() {
    return { data: await this.classification.tree(this.prisma as unknown as ClassificationDb) };
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { products: true, children: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      data: categories.map((c) => ({
        ...c,
        productCount: c._count.products,
        childrenCount: c._count.children,
      })),
    };
  }

  async findTree() {
    const categories = await this.prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return { data: this.buildTree(categories) };
  }

  async findMenu() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        imageUrl: true,
        iconUrl: true,
        isFeatured: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Una sola lectura de productos públicos y una de contenidos de revisión para todo el menú.
    const productDb = this.prisma as unknown as {
      product: { findMany: (args: unknown) => Promise<Array<{ categoryId: string | null; subcategoryId: string | null; publicRevisionId: string | null }>> };
    };
    const products = await productDb.product.findMany({
      where: publicCatalogVisibility(Prisma.JsonNull),
      select: { categoryId: true, subcategoryId: true, publicRevisionId: true },
    });
    const contents = await loadActiveRevisionContents(this.prisma, products.map((product) => product.publicRevisionId));
    const counts = this.publishedCountsByCategory(categories, products, contents);
    const tree = this.buildMenuTree(categories, counts);

    const db = this.prisma as unknown as {
      subcategory?: { findMany?: (args: unknown) => Promise<Array<{
        id: string; categoryId: string; name: string; slug: string; sortOrder: number;
        legacyCategoryId: string | null;
      }>> };
    };
    const findSubcategories = db.subcategory?.findMany;
    if (findSubcategories && tree.length) {
      const rows = (await findSubcategories.call(db.subcategory, {
        where: { isActive: true, categoryId: { in: tree.map((root) => root.id) } },
        select: { id: true, categoryId: true, name: true, slug: true, sortOrder: true, legacyCategoryId: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })) ?? [];

      if (rows.length) {
        // Raíz de cada categoría activa, para contar por familia de la subcategoría.
        const byId = new Map(categories.map((category) => [category.id, category]));
        const rootOf = (id: string): string | null => {
          const seen = new Set<string>();
          let current: string | null = id;
          while (current && byId.has(current) && !seen.has(current)) {
            seen.add(current);
            const parentId: string | null = byId.get(current)!.parentId;
            if (!parentId) return current;
            current = parentId;
          }
          return null;
        };
        const countsBySubcategory = new Map<string, number>();
        for (const product of products) {
          const categoryId = effectiveIdentity(product, contents, 'categoryId', product.categoryId);
          const subcategoryId = effectiveIdentity(product, contents, 'subcategoryId', product.subcategoryId);
          if (!categoryId || !subcategoryId) continue;
          const root = rootOf(categoryId);
          if (!root) continue;
          const key = `${root}|${subcategoryId}`;
          countsBySubcategory.set(key, (countsBySubcategory.get(key) ?? 0) + 1);
        }
        const findNode = (nodes: MenuCategory[], match: (node: MenuCategory) => boolean): MenuCategory | undefined => {
          for (const node of nodes) {
            if (match(node)) return node;
            const nested = findNode(node.children, match);
            if (nested) return nested;
          }
          return undefined;
        };
        for (const root of tree) {
          const rootRows = rows
            .filter((row) => row.categoryId === root.id)
            .map((row) => ({ row, count: countsBySubcategory.get(`${root.id}|${row.id}`) ?? 0 }))
            .filter((entry) => entry.count > 0);
          if (!rootRows.length) continue;
          for (const { row, count } of rootRows) {
            const node = (row.legacyCategoryId ? findNode(root.children, (n) => n.id === row.legacyCategoryId) : undefined)
              ?? findNode(root.children, (n) => n.slug === row.slug);
            if (node) {
              node.subcategoryId = row.id;
              node.subcategorySlug = row.slug;
              node.name = row.name;
              node.productCount = count;
            } else {
              root.children.push({
                id: row.id,
                subcategoryId: row.id,
                subcategorySlug: row.slug,
                name: row.name,
                slug: row.slug,
                imageUrl: null,
                iconUrl: null,
                isFeatured: false,
                sortOrder: row.sortOrder,
                productCount: count,
                children: [],
              });
            }
          }
          root.children.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        }
      }
    }

    return { data: tree };
  }

  /**
   * Cuenta los productos públicos por su categoría efectiva: la categoría
   * fijada en la revisión publicada cuando existe, con fallback a la columna
   * operativa para productos legados. Los conteos se acumulan hacia ancestros.
   */
  private publishedCountsByCategory(
    categories: MenuCategoryRecord[],
    products: Array<{ categoryId: string | null; subcategoryId: string | null; publicRevisionId: string | null }>,
    contents: Awaited<ReturnType<typeof loadActiveRevisionContents>>,
  ): Map<string, number> {
    const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
    const totals = new Map<string, number>();

    for (const product of products) {
      const seen = new Set<string>();
      let current: string | null = effectiveIdentity(product, contents, 'categoryId', product.categoryId);
      while (current !== null && parentOf.has(current) && !seen.has(current)) {
        seen.add(current);
        totals.set(current, (totals.get(current) ?? 0) + 1);
        current = parentOf.get(current) ?? null;
      }
    }

    return totals;
  }

  /**
   * Ensambla el árbol de categorías de forma recursiva, soportando
   * profundidad arbitraria. El orden lo resuelve Prisma en la consulta
   * (orderBy); esta función solo conserva el orden y anida los hijos.
   */
  private buildTree(nodes: any[], parentId: string | null = null): any[] {
    return nodes
      .filter((n) => n.parentId === parentId)
      .map((n) => ({
        ...n,
        children: this.buildTree(nodes, n.id),
      }));
  }

  private buildMenuTree(
    nodes: MenuCategoryRecord[],
    counts: Map<string, number>,
    parentId: string | null = null,
    depth = 1,
  ): MenuCategory[] {
    if (depth > 3) return [];

    return nodes
      .filter((node) => node.parentId === parentId && node.isActive !== false)
      .map((node) => ({
        id: node.id,
        name: node.name,
        slug: node.slug,
        imageUrl: node.imageUrl,
        iconUrl: node.iconUrl,
        isFeatured: node.isFeatured,
        sortOrder: node.sortOrder,
        productCount: counts.get(node.id) ?? 0,
        children: depth < 3 ? this.buildMenuTree(nodes, counts, node.id, depth + 1) : [],
      }));
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        _count: { select: { products: true } },
      },
    });

    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  async create(dto: CreateCategoryDto, actor?: LibraryActor) {
    return this.library.writeTransaction(async (tx) => {
    const existing = await tx.category.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException('Ya existe una categoría con ese slug');

    await this.validateParent(null, dto.parentId, tx);
    await this.assertNameFree(tx, dto.name, dto.parentId ?? null);

    const category = await tx.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        slug: dto.slug,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
      },
    });

    await this.audit.append(tx, { actor, action: 'CATEGORY_CREATED', entityType: 'Category', entityId: category.id, summary: { fields: Object.keys(dto) } });
    return category;
    });
  }

  async update(id: string, dto: UpdateCategoryDto, actor?: LibraryActor) {
    return this.library.writeTransaction(async (tx) => {
    const category = await tx.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    if (dto.slug && dto.slug !== category.slug) {
      const existing = await tx.category.findUnique({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException('Ya existe una categoría con ese slug');
    }

    await this.validateParent(id, dto.parentId, tx);

    const targetParentId = dto.parentId !== undefined ? dto.parentId : category.parentId;
    if (dto.name !== undefined || dto.parentId !== undefined) {
      await this.assertNameFree(tx, dto.name ?? category.name, targetParentId ?? null, id);
    }
    if (dto.parentId !== undefined && (dto.parentId || null) !== (category.parentId ?? null) && !dto.confirmImpact) {
      const usage = await this.usageOf(tx, id);
      if (usage.counts.products + usage.counts.children + usage.counts.subcategories > 0) {
        throw impactConfirmationRequired(
          'Cambiar la categoría padre afecta productos y subcategorías asociados. Confirma el impacto para continuar.',
          { ...usage.counts, fromParentId: category.parentId ?? null, toParentId: dto.parentId || null },
        );
      }
    }

    const updated = await tx.category.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.slug && { slug: dto.slug }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId || null }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
      },
    });

    await this.audit.append(tx, { actor, action: 'CATEGORY_UPDATED', entityType: 'Category', entityId: id, summary: { fields: Object.keys(dto) } });
    return updated;
    });
  }

  /** Dependencies of a category and whether it can be deleted. */
  async usage(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return this.usageOf(this.prisma, id);
  }

  private async usageOf(db: Pick<Prisma.TransactionClient, 'category' | 'product'> & { subcategory?: any }, id: string) {
    const [products, children, subcategories] = await Promise.all([
      db.product.count({ where: { categoryId: id } }),
      db.category.count({ where: { parentId: id } }),
      typeof db.subcategory?.count === 'function' ? (db.subcategory.count({ where: { categoryId: id } }) as Promise<number>) : Promise.resolve(0),
    ]);
    return buildUsageReport(id, { products, children, subcategories }, [
      { key: 'products', code: 'HAS_PRODUCTS', message: (n) => `tiene ${n} producto(s)` },
      { key: 'children', code: 'HAS_CHILDREN', message: (n) => `tiene ${n} categoría(s) hija(s)` },
      { key: 'subcategories', code: 'HAS_SUBCATEGORIES', message: (n) => `tiene ${n} subcategoría(s)` },
    ]);
  }

  /** Activates or deactivates; never touches products, prices or history. */
  async setActive(id: string, isActive: boolean, actor?: LibraryActor) {
    return this.library.writeTransaction(async (tx) => {
      const category = await tx.category.findUnique({ where: { id } });
      if (!category) throw new NotFoundException('Categoría no encontrada');
      const updated = await tx.category.update({ where: { id }, data: { isActive } });
      await this.audit.append(tx, { actor, action: 'CATEGORY_ACTIVE_CHANGED', entityType: 'Category', entityId: id, summary: { isActive } });
      return updated;
    });
  }

  async remove(id: string, actor?: LibraryActor) {
    return this.library.writeTransaction(async (tx) => {
    const category = await tx.category.findUnique({ where: { id }, select: { id: true } });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    const usage = await this.usageOf(tx, id);
    if (usage.counts.products > 0) {
      throw new ConflictException({ code: 'DELETE_BLOCKED', message: 'No se puede eliminar una categoría con productos', usage });
    }
    if (usage.counts.children > 0 || usage.counts.subcategories > 0) {
      throw new ConflictException({ code: 'DELETE_BLOCKED', message: 'No se puede eliminar una categoría con subcategorías', usage });
    }

    await tx.category.delete({ where: { id } });
    await this.audit.append(tx, { actor, action: 'CATEGORY_DELETED', entityType: 'Category', entityId: id, summary: {} });
    return { message: 'Categoría eliminada exitosamente' };
    });
  }

  /** 409 when a sibling (same parent) already has an equivalent name (case/accent-insensitive). */
  private async assertNameFree(tx: Pick<Prisma.TransactionClient, 'category'>, name: string, parentId: string | null, selfId?: string) {
    const siblings = await tx.category.findMany({ where: { parentId }, select: { id: true, name: true } });
    const clash = findNameCollision(name, siblings, selfId);
    if (clash) throw nameTaken('una categoría', clash);
  }

  /**
   * Valida que un parentId sea asignable sin romper la jerarquía:
   *  1. parentId no puede ser la propia categoría (parentId === nodeId).
   *  2. El nuevo padre no puede ser descendiente del nodo (evita ciclos
   *     tipo A -> B -> A): se sube por la cadena de padres del nuevo padre
   *     y si en algún nivel aparece el nodo, es porque el padre es un
   *     descendiente de él.
   * Mantiene además la validación de existencia del padre.
   */
  private async validateParent(nodeId: string | null, parentId: string | undefined, prisma: Pick<Prisma.TransactionClient, 'category'>): Promise<void> {
    if (!parentId) return;

    if (parentId === nodeId) {
      throw new BadRequestException('Una categoría no puede ser su propio padre');
    }

    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Categoría padre no encontrada');

    if (!nodeId) return;

    let current = parent.parentId;
    const visited = new Set<string>();
    while (current) {
      if (current === nodeId) {
        throw new BadRequestException(
          'La categoría padre no puede ser descendiente de esta categoría (evita ciclos en la jerarquía)',
        );
      }
      if (visited.has(current)) break;
      visited.add(current);
      const ancestor = await prisma.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = ancestor?.parentId ?? null;
    }
  }
}
