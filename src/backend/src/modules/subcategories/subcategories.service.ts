import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { LibraryAuditService, type LibraryActor } from '../library-audit/library-audit.service';
import { buildUsageReport, deleteBlocked, findNameCollision, impactConfirmationRequired, nameTaken } from '../masters/master-rules';
import { CreateSubcategoryDto, ListSubcategoriesQueryDto, UpdateSubcategoryDto } from './dto/subcategory.dto';

type Db = Pick<PrismaClient, 'subcategory' | 'category' | 'product' | 'subcategorySpec'>;

const slugOf = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Master catalog of subcategories (second level of the library classification). Renaming keeps the id and every
 * relation; deactivating never deletes products, prices or history; deleting is only possible when unused.
 */
@Injectable()
export class SubcategoriesService {
  constructor(private readonly library: BibliotecaPrismaService, private readonly audit: LibraryAuditService) {}

  private get db(): Db {
    const client = this.library.client as unknown as Db;
    if (typeof client.subcategory?.findMany !== 'function') {
      throw new ServiceUnavailableException({ code: 'SUBCATEGORY_UNSUPPORTED', message: 'Este almacén de biblioteca aún no admite subcategorías.' });
    }
    return client;
  }

  private write<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    void this.db; // fail early when the library schema has no subcategories
    return this.library.writeTransaction((tx) => work(tx as unknown as Db));
  }

  private event(tx: Db, actor: LibraryActor | undefined, action: string, entityId: string, summary: Prisma.InputJsonObject) {
    return this.audit.append(tx as never, { actor, action, entityType: 'Subcategory', entityId, summary });
  }

  async list(query: ListSubcategoriesQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const q = query.q?.trim();
    const where: Prisma.SubcategoryWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: slugOf(q) || q.toLowerCase() } },
              { searchTerms: { has: q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const db = this.db;
    const [total, rows] = await Promise.all([
      db.subcategory.count({ where }),
      db.subcategory.findMany({
        where,
        include: { category: { select: { id: true, name: true } }, _count: { select: { products: true } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(({ _count, ...row }) => ({ ...row, productCount: _count.products })),
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const row = await this.db.subcategory.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } }, _count: { select: { products: true } } },
    });
    if (!row) throw new NotFoundException('Subcategoría no encontrada');
    const { _count, ...rest } = row;
    return { ...rest, productCount: _count.products };
  }

  async create(dto: CreateSubcategoryDto, actor?: LibraryActor) {
    return this.write(async (tx) => {
      await this.assertValidParent(tx, dto.categoryId);
      const name = dto.name.trim();
      const slug = dto.slug ?? slugOf(name);
      if (!slug) throw new ConflictException({ code: 'SLUG_INVALID', message: 'No se pudo derivar un slug del nombre.' });
      await this.assertUniqueIn(tx, dto.categoryId, name, slug);

      const row = await tx.subcategory.create({
        data: {
          categoryId: dto.categoryId,
          name,
          slug,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
          searchTerms: dto.searchTerms ?? [],
        },
      });
      await this.event(tx, actor, 'SUBCATEGORY_CREATED', row.id, { categoryId: row.categoryId, slug: row.slug });
      return row;
    });
  }

  async update(id: string, dto: UpdateSubcategoryDto, actor?: LibraryActor) {
    return this.write(async (tx) => {
      const current = await tx.subcategory.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Subcategoría no encontrada');

      const targetCategoryId = dto.categoryId ?? current.categoryId;
      const parentChanged = targetCategoryId !== current.categoryId;
      const name = dto.name !== undefined ? dto.name.trim() : current.name;
      const slug = dto.slug ?? current.slug;

      if (parentChanged) await this.assertValidParent(tx, targetCategoryId);
      if (parentChanged || dto.name !== undefined || dto.slug !== undefined) {
        await this.assertUniqueIn(tx, targetCategoryId, name, slug, id);
      }

      let movedProducts = 0;
      if (parentChanged) {
        const usage = await this.usageOf(tx, id);
        const impact = { ...usage.counts, fromCategoryId: current.categoryId, toCategoryId: targetCategoryId };
        if ((impact.products > 0 || impact.templateEntries > 0) && !dto.confirmImpact) {
          throw impactConfirmationRequired(
            'Mover la subcategoría a otra categoría afecta productos y moldes asociados. Confirma el impacto para continuar.',
            impact,
          );
        }
        // Products keep their subcategory; their derived category follows the subcategory's new parent.
        const legacy = current.legacyCategoryId
          ? await tx.category.findUnique({ where: { id: current.legacyCategoryId }, select: { id: true } })
          : null;
        const derived = legacy ? legacy.id : targetCategoryId;
        if (impact.products > 0) {
          movedProducts = (await tx.product.updateMany({ where: { subcategoryId: id, NOT: { categoryId: derived } }, data: { categoryId: derived } })).count;
        }
      }

      const row = await tx.subcategory.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name }),
          ...(dto.slug !== undefined && { slug }),
          ...(parentChanged && { categoryId: targetCategoryId }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.searchTerms !== undefined && { searchTerms: dto.searchTerms }),
        },
      });
      await this.event(tx, actor, 'SUBCATEGORY_UPDATED', id, {
        fields: Object.keys(dto).filter((k) => k !== 'confirmImpact'),
        ...(parentChanged ? { fromCategoryId: current.categoryId, toCategoryId: targetCategoryId, movedProducts } : {}),
      });
      return row;
    });
  }

  /** Activation never touches products, prices or history; an inactive subcategory just stops receiving assignments. */
  async setActive(id: string, isActive: boolean, actor?: LibraryActor) {
    return this.write(async (tx) => {
      const current = await tx.subcategory.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Subcategoría no encontrada');
      const row = await tx.subcategory.update({ where: { id }, data: { isActive } });
      await this.event(tx, actor, 'SUBCATEGORY_ACTIVE_CHANGED', id, { isActive });
      return row;
    });
  }

  async usage(id: string) {
    const db = this.db;
    const row = await db.subcategory.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Subcategoría no encontrada');
    return this.usageOf(db, id);
  }

  async remove(id: string, actor?: LibraryActor) {
    return this.write(async (tx) => {
      const current = await tx.subcategory.findUnique({ where: { id }, select: { id: true } });
      if (!current) throw new NotFoundException('Subcategoría no encontrada');
      const usage = await this.usageOf(tx, id);
      if (!usage.canDelete) throw deleteBlocked('la subcategoría', usage);
      await tx.subcategory.delete({ where: { id } });
      await this.event(tx, actor, 'SUBCATEGORY_DELETED', id, {});
      return { message: 'Subcategoría eliminada exitosamente' };
    });
  }

  private async usageOf(db: Db, id: string) {
    const hasSpecs = typeof db.subcategorySpec?.count === 'function';
    const [products, templateEntries, approvedTemplateEntries] = await Promise.all([
      db.product.count({ where: { subcategoryId: id } }),
      hasSpecs ? db.subcategorySpec.count({ where: { subcategoryId: id } }) : Promise.resolve(0),
      hasSpecs ? db.subcategorySpec.count({ where: { subcategoryId: id, status: 'APPROVED' } }) : Promise.resolve(0),
    ]);
    return buildUsageReport(id, { products, templateEntries, approvedTemplateEntries }, [
      { key: 'products', code: 'HAS_PRODUCTS', message: (n) => `tiene ${n} producto(s)` },
      { key: 'templateEntries', code: 'HAS_TEMPLATE', message: (n) => `tiene ${n} dato(s) en su molde` },
    ]);
  }

  /** A subcategory must hang from an existing, active ROOT category. */
  private async assertValidParent(tx: Db, categoryId: string) {
    const category = await tx.category.findUnique({ where: { id: categoryId }, select: { id: true, parentId: true, isActive: true } });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    if (category.parentId) {
      throw new ConflictException({ code: 'CATEGORY_NOT_ROOT', message: 'Las subcategorías solo cuelgan de categorías principales.' });
    }
    if (!category.isActive) {
      throw new ConflictException({ code: 'CATEGORY_INACTIVE', message: 'La categoría está inactiva: actívala antes de agregarle subcategorías.' });
    }
  }

  /** Unique slug and unique normalized name within the category. */
  private async assertUniqueIn(tx: Db, categoryId: string, name: string, slug: string, selfId?: string) {
    const siblings = await tx.subcategory.findMany({ where: { categoryId }, select: { id: true, name: true, slug: true } });
    const bySlug = siblings.find((s) => s.id !== selfId && s.slug === slug);
    if (bySlug) {
      throw new ConflictException({ code: 'SLUG_DUPLICATED', message: 'Ya existe una subcategoría con ese slug en la categoría.', existing: { id: bySlug.id, name: bySlug.name } });
    }
    const clash = findNameCollision(name, siblings, selfId);
    if (clash) throw nameTaken('una subcategoría en esta categoría', clash);
  }
}
