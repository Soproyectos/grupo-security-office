import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { validateSubcategoryParent, type CategoryRef, type Subcategory } from '../key-specs/classification';
import type {
  ClassificationConflict,
  ClassificationDb,
  ClassificationInput,
  ClassificationMissing,
  ExistingMatch,
  NeedsConfirmationIssue,
  ClassificationIssueCode,
  ClassificationIssueItem,
  ClassificationResult,
  ClassificationTreeNode,
  CurrentClassification,
} from './classification.types';

function slugOf(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const blocking = (code: ClassificationIssueCode, message: string): ClassificationIssueItem => ({ code, message, blocking: true });
const incomplete = (code: ClassificationIssueCode, message: string): ClassificationIssueItem => ({ code, message, blocking: false });

/**
 * Single place that decides the classification of a product (decisions F1):
 *  - `subcategoryId` is the truth; `categoryId` is derived from it, never written independently.
 *  - A legacy caller that only knows a child category gets its subcategory derived.
 *  - Nothing is ever created here (no implicit brands, categories or subcategories).
 *  - A product may stay a draft without brand and/or subcategory ("por clasificar"): those are
 *    non-blocking `incomplete` issues, never replaced by a placeholder.
 * Stateless: every method receives the client or transaction to read from.
 */
@Injectable()
export class ClassificationService {
  /** Pure DB lookup, no writes. Never throws for business issues: they are returned in `issues`. */
  async resolve(db: ClassificationDb, input: ClassificationInput, current?: CurrentClassification): Promise<ClassificationResult> {
    const supported = typeof db.subcategory?.findUnique === 'function';
    const issues: ClassificationIssueItem[] = [];
    let categoryId: string | null = current?.categoryId ?? null;
    let subcategoryId: string | null = current?.subcategoryId ?? null;
    const brandId = input.brandId !== undefined ? input.brandId : current?.brandId ?? null;

    if (!supported) {
      // Dedicated library schema without Subcategory: category-only behaviour, as before.
      if (input.subcategoryId) issues.push(blocking('SUBCATEGORY_UNSUPPORTED', 'Este almacén de biblioteca aún no admite subcategorías.'));
      if (input.categoryId === null) categoryId = null;
      else if (input.categoryId) categoryId = input.categoryId;
      return this.finish(categoryId, subcategoryId, brandId, issues, false);
    }

    if (input.categoryId === null && !input.subcategoryId) {
      // Explicit "clear the category": its subcategory goes with it.
      categoryId = null;
      subcategoryId = null;
    } else if (input.subcategoryId) {
      const sub = await db.subcategory!.findUnique({
        where: { id: input.subcategoryId },
        include: { category: { select: { id: true, name: true, slug: true, parentId: true } } },
      });
      if (!sub) {
        issues.push(blocking('SUBCATEGORY_NOT_FOUND', 'La subcategoría no existe.'));
      } else if (!sub.isActive && current?.subcategoryId !== sub.id) {
        issues.push(blocking('SUBCATEGORY_INACTIVE', 'La subcategoría está inactiva y no puede asignarse.'));
      } else {
        const refs = new Map<string, CategoryRef>();
        if (sub.category) refs.set(sub.category.id, sub.category);
        const parentIssues = validateSubcategoryParent(sub as Subcategory, refs);
        if (parentIssues.length) {
          issues.push(blocking('SUBCATEGORY_PARENT_INVALID', parentIssues[0].message));
        } else {
          const derived = await this.deriveCategoryId(db, sub);
          if (input.categoryId && input.categoryId !== derived) {
            issues.push(blocking('CLASSIFICATION_CONFLICT', 'La categoría indicada no corresponde a la subcategoría.'));
          } else {
            categoryId = derived;
            subcategoryId = sub.id;
          }
        }
      }
    } else if (input.subcategoryId === null) {
      // Explicit "clear the subcategory"; a given category is still validated and kept as is.
      subcategoryId = null;
      if (input.categoryId) {
        const category = await this.loadCategory(db, input.categoryId, issues);
        if (category) categoryId = category.id;
      }
    } else if (input.categoryId) {
      // Same category as stored: the stored subcategory stays. Otherwise derive from the category.
      if (!(current?.subcategoryId && input.categoryId === current.categoryId)) {
        const category = await this.loadCategory(db, input.categoryId, issues);
        if (category) {
          categoryId = category.id;
          subcategoryId = null;
          if (category.parentId) {
            const match = await db.subcategory!.findFirst({ where: { legacyCategoryId: category.id } });
            if (match?.isActive) subcategoryId = match.id;
          }
        }
      }
    }

    return this.finish(categoryId, subcategoryId, brandId, issues, true);
  }

  /** Same as `resolve`, but rejects (400/404 with a stable `code`) when the combination cannot be stored. */
  async assertWritable(db: ClassificationDb, input: ClassificationInput, current?: CurrentClassification): Promise<ClassificationResult> {
    const result = await this.resolve(db, input, current);
    const first = result.issues.find((issue) => issue.blocking);
    if (!first) return result;
    const body = { code: first.code, message: first.message, issues: result.issues.filter((issue) => issue.blocking) };
    if (first.code === 'CATEGORY_NOT_FOUND') throw new NotFoundException(body);
    throw new BadRequestException(body);
  }

  /** Stored classification of a product (null when the product does not exist). */
  async loadCurrent(db: ClassificationDb, productId: string): Promise<CurrentClassification | null> {
    const rows = await db.product.findMany({
      where: { id: productId },
      select: { categoryId: true, brandId: true, ...(db.subcategory ? { subcategoryId: true } : {}) },
      take: 1,
    });
    return rows[0] ? { categoryId: rows[0].categoryId ?? null, subcategoryId: rows[0].subcategoryId ?? null, brandId: rows[0].brandId } : null;
  }

  /** Prisma `data` fragment for a resolved classification (omits `subcategoryId` when the client cannot store it). */
  toData(result: ClassificationResult): { categoryId: string | null; subcategoryId?: string | null } {
    return {
      categoryId: result.categoryId,
      ...(result.subcategorySupported ? { subcategoryId: result.subcategoryId } : {}),
    };
  }

  /**
   * Importer gate (lookup only, never creates): an existing brand by case-insensitive name or slug.
   * Empty label -> no entity and no issue; unknown label -> no entity and a BRAND_NEEDS_CONFIRMATION issue.
   * `cache` (keyed by the normalized label) avoids repeating the query within one import run.
   */
  async resolveExistingBrand(db: ClassificationDb, label: string | null | undefined, cache?: Map<string, any>): Promise<ExistingMatch<{ id: string; name: string; slug: string }>> {
    const text = (label ?? '').trim();
    if (!text) return { entity: null, issue: null };
    const entity = await this.lookupByLabel(db.brand as any, text, undefined, cache, 'brand');
    return entity
      ? { entity, issue: null }
      : { entity: null, issue: this.needsConfirmation('BRAND_NEEDS_CONFIRMATION', text, 'La marca no existe: el producto queda por clasificar hasta que una persona la confirme.') };
  }

  /**
   * Importer gate (lookup only, never creates): an existing category by case-insensitive name or slug.
   * With `parentLabel` the match must be a child of the existing category with that label.
   */
  async resolveExistingCategory(db: ClassificationDb, label: string | null | undefined, options: { parentLabel?: string | null } = {}, cache?: Map<string, any>): Promise<ExistingMatch<{ id: string; name: string; slug: string; parentId: string | null }>> {
    const text = (label ?? '').trim();
    if (!text) return { entity: null, issue: null };
    const parentText = (options.parentLabel ?? '').trim();
    const shown = parentText ? `${parentText} > ${text}` : text;
    let parentId: string | null | undefined;
    if (parentText) {
      const parent = await this.lookupByLabel(db.category as any, parentText, null, cache, 'category');
      if (!parent) return { entity: null, issue: this.needsConfirmation('CATEGORY_NEEDS_CONFIRMATION', shown, 'La categoría no existe: el producto queda por clasificar hasta que una persona la confirme.') };
      parentId = parent.id;
    }
    const entity = await this.lookupByLabel(db.category as any, text, parentId, cache, 'category');
    return entity
      ? { entity, issue: null }
      : { entity: null, issue: this.needsConfirmation('CATEGORY_NEEDS_CONFIRMATION', shown, 'La categoría no existe: el producto queda por clasificar hasta que una persona la confirme.') };
  }

  private needsConfirmation(code: NeedsConfirmationIssue['code'], label: string, message: string): NeedsConfirmationIssue {
    return { code, label, message };
  }

  /** `parentId`: undefined = any level, null = root categories only, string = children of that category. */
  private async lookupByLabel(model: { findFirst?(args: any): Promise<any> } | undefined, label: string, parentId: string | null | undefined, cache: Map<string, any> | undefined, kind: string): Promise<any | null> {
    if (!model || typeof model.findFirst !== 'function') return null;
    const key = `${kind}|${parentId === undefined ? '*' : parentId ?? 'root'}|${label.toLocaleLowerCase('es')}`;
    if (cache?.has(key)) return cache.get(key);
    const slug = slugOf(label);
    const found = await model.findFirst({
      where: {
        OR: [{ name: { equals: label, mode: 'insensitive' } }, ...(slug ? [{ slug }] : [])],
        ...(parentId === undefined ? {} : { parentId }),
      },
      orderBy: { id: 'asc' },
    });
    const entity = found ?? null;
    cache?.set(key, entity);
    return entity;
  }

  /** Read-only drift report: products whose categoryId disagrees with their subcategory. Never fixes anything. */
  async listConflicts(db: ClassificationDb, options: { limit?: number } = {}): Promise<ClassificationConflict[]> {
    if (!db.subcategory) return [];
    const limit = Math.min(Math.max(options.limit ?? 500, 1), 5000);
    const conflicts: ClassificationConflict[] = [];
    const expectedBySubcategory = new Map<string, string>();
    let cursor: string | undefined;
    while (conflicts.length < limit) {
      const page = await db.product.findMany({
        where: { subcategoryId: { not: null } },
        select: { id: true, sku: true, categoryId: true, subcategoryId: true, subcategory: { select: { id: true, categoryId: true, legacyCategoryId: true } } },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!page.length) break;
      for (const row of page) {
        const sub = row.subcategory;
        if (!sub) continue;
        let expected = expectedBySubcategory.get(sub.id);
        if (!expected) {
          expected = await this.deriveCategoryId(db, sub);
          expectedBySubcategory.set(sub.id, expected);
        }
        if (row.categoryId !== expected && conflicts.length < limit) {
          conflicts.push({ productId: row.id, sku: row.sku, categoryId: row.categoryId, subcategoryId: row.subcategoryId, expectedCategoryId: expected });
        }
      }
      cursor = page[page.length - 1].id;
    }
    return conflicts;
  }

  /** Root categories with their active subcategories (editor selector). */
  async tree(db: ClassificationDb): Promise<ClassificationTreeNode[]> {
    const roots = await db.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, slug: true,
        ...(db.subcategory ? { subcategories: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true } } } : {}),
      },
    });
    return roots.map((root) => ({ id: root.id, name: root.name, slug: root.slug, subcategories: root.subcategories ?? [] }));
  }

  /** categoryId derived from a subcategory: its legacy child category when it still exists, else the root. */
  private async deriveCategoryId(db: ClassificationDb, sub: { categoryId: string; legacyCategoryId?: string | null }): Promise<string> {
    if (!sub.legacyCategoryId) return sub.categoryId;
    const legacy = await db.category.findUnique({ where: { id: sub.legacyCategoryId }, select: { id: true } });
    return legacy ? legacy.id : sub.categoryId;
  }

  private async loadCategory(db: ClassificationDb, id: string, issues: ClassificationIssueItem[]) {
    const category = await db.category.findUnique({ where: { id }, select: { id: true, parentId: true, parent: { select: { parentId: true } } } });
    if (!category) {
      issues.push(blocking('CATEGORY_NOT_FOUND', 'Categoría no encontrada.'));
      return null;
    }
    if (category.parentId && category.parent?.parentId) {
      issues.push(blocking('CATEGORY_DEPTH_INVALID', 'La jerarquía de categorías admite únicamente categoría principal y subcategoría.'));
      return null;
    }
    return category as { id: string; parentId: string | null };
  }

  private finish(categoryId: string | null, subcategoryId: string | null, brandId: string | null, issues: ClassificationIssueItem[], supported: boolean): ClassificationResult {
    const missing: ClassificationMissing[] = [];
    if (!brandId) {
      missing.push('brand');
      issues.push(incomplete('BRAND_MISSING', 'Producto por clasificar: falta la marca.'));
    }
    if (!subcategoryId) {
      missing.push('subcategory');
      issues.push(incomplete('SUBCATEGORY_MISSING', 'Producto por clasificar: falta la subcategoría.'));
    }
    const hasBlocking = issues.some((issue) => issue.blocking);
    return {
      categoryId,
      subcategoryId,
      status: !hasBlocking && subcategoryId && brandId ? 'complete' : 'incomplete',
      missing,
      issues,
      subcategorySupported: supported,
    };
  }
}
