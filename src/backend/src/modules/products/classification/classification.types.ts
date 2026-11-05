/**
 * Product classification contract (library structure, doc sections 2.1, 4.1, 4.2).
 * `subcategoryId` is the classification truth; `categoryId` is the derived
 * compatibility field (subcategory.legacyCategoryId ?? subcategory.categoryId).
 */

export type ClassificationStatus = 'complete' | 'incomplete';

export type ClassificationIssueCode =
  | 'CLASSIFICATION_CONFLICT'
  | 'CATEGORY_NOT_FOUND'
  | 'CATEGORY_REQUIRED'
  | 'CATEGORY_DEPTH_INVALID'
  | 'SUBCATEGORY_NOT_FOUND'
  | 'SUBCATEGORY_INACTIVE'
  | 'SUBCATEGORY_PARENT_INVALID'
  | 'SUBCATEGORY_UNSUPPORTED'
  | 'SUBCATEGORY_MISSING'
  | 'BRAND_MISSING'
  | 'CATEGORY_NEEDS_CONFIRMATION'
  | 'BRAND_NEEDS_CONFIRMATION';

export interface ClassificationIssueItem {
  code: ClassificationIssueCode;
  message: string;
  /** Blocking issues reject the write; non-blocking ones only mark the draft "incomplete". */
  blocking: boolean;
}

/**
 * What a caller knows. `undefined` = "not provided" (unchanged); explicit `null` = "clear it".
 * Clearing the category also clears the subcategory (a subcategory cannot outlive its category).
 */
export interface ClassificationInput {
  categoryId?: string | null;
  subcategoryId?: string | null;
  brandId?: string | null;
}

/** Stored state of the product being changed. */
export interface CurrentClassification {
  categoryId: string | null;
  subcategoryId?: string | null;
  brandId?: string | null;
}

/** What a draft still lacks. `subcategory` covers a missing category too. */
export type ClassificationMissing = 'brand' | 'subcategory';

export interface ClassificationResult {
  categoryId: string | null;
  subcategoryId: string | null;
  status: ClassificationStatus;
  /** Parts still missing (empty when complete), e.g. ['brand', 'subcategory']. */
  missing: ClassificationMissing[];
  issues: ClassificationIssueItem[];
  /** False when the client has no Subcategory model (dedicated library schema): never write `subcategoryId`. */
  subcategorySupported: boolean;
}

/**
 * Raised by importers when a brand/category label does not exist. NOTHING is created: the row
 * continues as an unclassified draft and a person confirms (creates or maps) the label later.
 */
export interface NeedsConfirmationIssue {
  code: 'CATEGORY_NEEDS_CONFIRMATION' | 'BRAND_NEEDS_CONFIRMATION';
  /** The unresolved text exactly as received (trimmed). */
  label: string;
  message: string;
}

export interface ExistingMatch<T> {
  /** The existing record, or null when the label is empty or unknown. */
  entity: T | null;
  /** Set only when a non-empty label matched nothing. */
  issue: NeedsConfirmationIssue | null;
}

export interface ClassificationConflict {
  productId: string;
  sku: string;
  categoryId: string;
  subcategoryId: string;
  expectedCategoryId: string;
}

export interface ClassificationTreeNode {
  id: string;
  name: string;
  slug: string;
  subcategories: Array<{ id: string; name: string; slug: string }>;
}

/** Structural subset of the Prisma client / transaction client used here. */
export interface ClassificationDb {
  category: { findUnique(args: any): Promise<any>; findMany(args: any): Promise<any[]>; findFirst?(args: any): Promise<any> };
  brand?: { findFirst(args: any): Promise<any> };
  subcategory?: { findUnique(args: any): Promise<any>; findFirst(args: any): Promise<any> };
  product: { findMany(args: any): Promise<any[]> };
}
