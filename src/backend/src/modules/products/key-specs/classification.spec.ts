/**
 * Classification tree: subcategories hang from root categories only, and the
 * visible path is built from the tree. A product without subcategory has no path.
 */
import {
  classificationPath,
  validateSubcategoryParent,
  type CategoryRef,
  type Subcategory,
} from './classification'

const root: CategoryRef = { id: 'cat-cabling', name: 'Cableado', slug: 'cableado', parentId: null }
const child: CategoryRef = { id: 'cat-cabling-legacy', name: 'Cableado antiguo', slug: 'cableado-antiguo', parentId: 'cat-cabling' }
const categoriesById: ReadonlyMap<string, CategoryRef> = new Map([root, child].map((c) => [c.id, c]))

const subcategory = (over: Partial<Subcategory> = {}): Subcategory => ({
  id: 'sub-connectors',
  categoryId: root.id,
  name: 'Conectores y jacks',
  slug: 'conectores-y-jacks',
  sortOrder: 1,
  isActive: true,
  ...over,
})

describe('validateSubcategoryParent', () => {
  it('a root category is accepted', () => {
    expect(validateSubcategoryParent(subcategory(), categoriesById)).toEqual([])
  })

  it('a category that has a parent -> category_not_root', () => {
    const r = validateSubcategoryParent(subcategory({ categoryId: child.id }), categoriesById)
    expect(r.map((i) => i.code)).toEqual(['category_not_root'])
  })

  it('an unknown category -> category_missing', () => {
    const r = validateSubcategoryParent(subcategory({ categoryId: 'cat-gone' }), categoriesById)
    expect(r.map((i) => i.code)).toEqual(['category_missing'])
  })
})

describe('classificationPath', () => {
  it('a product without subcategory ("Por clasificar") has no path', () => {
    expect(classificationPath(null, categoriesById)).toEqual([])
  })

  it('builds Category > Subcategory from the tree, not from stored text', () => {
    expect(classificationPath(subcategory(), categoriesById)).toEqual([
      { label: 'Cableado', slug: 'cableado' },
      { label: 'Conectores y jacks', slug: 'conectores-y-jacks' },
    ])
  })

  it('an unresolvable category yields no path instead of a half path', () => {
    expect(classificationPath(subcategory({ categoryId: 'cat-gone' }), categoriesById)).toEqual([])
  })

  it('a category that is not a root yields no path (R3-001), the same case validateSubcategoryParent rejects', () => {
    const misplaced = subcategory({ categoryId: child.id })
    expect(validateSubcategoryParent(misplaced, categoriesById).map((i) => i.code)).toEqual(['category_not_root'])
    expect(classificationPath(misplaced, categoriesById)).toEqual([])
  })
})
