export type ProductGlyphKind =
  | 'camera'
  | 'recorder'
  | 'gate'
  | 'solar'
  | 'battery'
  | 'power'
  | 'storage'
  | 'lock'
  | 'box'

/** Icon family of a category, read from its slug. Unknown slugs get a box. */
export function productGlyphKind(categorySlug: string | null | undefined): ProductGlyphKind {
  const slug = (categorySlug ?? '').toLowerCase()

  if (/camara/.test(slug)) return 'camera'
  if (/dvr|nvr|xvr|grabador/.test(slug)) return 'recorder'
  if (/motor|puerta|barrera|herraje/.test(slug)) return 'gate'
  if (/solar/.test(slug)) return 'solar'
  if (/bateria/.test(slug)) return 'battery'
  if (/ups|energia|regulador|variador|transformador|protector|cerco|fuente/.test(slug)) return 'power'
  if (/almacen|disco/.test(slug)) return 'storage'
  if (/cerradura|acceso|lector|biometric/.test(slug)) return 'lock'
  return 'box'
}
