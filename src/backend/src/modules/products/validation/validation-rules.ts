/**
 * CAT-05 `backend-reglas` — motor puro de validación con reglas versionadas.
 * Sin Nest ni Prisma: recibe el estado ya ensamblado y devuelve incidencias.
 * Reglas duras del contrato (§3.2-§3.3):
 *  - el PDF (ficha técnica) ausente es SIEMPRE `warning`: ninguna regla, ni de
 *    categoría, puede convertirlo en bloqueo (CLAMP);
 *  - el hook `CATEGORY_RULES` llega VACIO: el contenido de atributos por
 *    categoría es la decisión externa `campos-categoria` (no se inventa);
 *  - stock nunca bloquea (política ERP pendiente).
 * El informe se vincula a la REVISION (D4): obsoleto si cambia la revisión de
 * trabajo, la `rulesVersion` o si editar creó otra revisión.
 */

export const RULES_VERSION = 'cat05-r1'

export type IssueSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  code: string
  severity: IssueSeverity
  field?: string
  section: 'identidad' | 'multimedia' | 'documentos' | 'oferta' | 'atributos' | 'general'
  message: string
  fix: string
}

/** Estado ensamblado para las reglas (lo prepara la capa de servicio). */
export interface FileMeta {
  exists: boolean
  /** `detectedKind` por firma mágica (CAT-04): IMAGE|PDF|ZIP|UNKNOWN|null. */
  detectedKind: string | null
}

export interface ProductValidationInput {
  productId: string
  revisionId: string
  name: string
  catalogName: string | null
  brandId: string | null
  catalogBrand: string | null
  categoryActive: boolean
  categorySlug: string | null
  images: { url: string; isPrimary: boolean }[]
  resources: { kind: string; url: string; requiresLicense: boolean }[]
  /** Metadatos por id de archivo propio (`/api/files/<id>`). */
  files: Record<string, FileMeta>
  lista: { isActive: boolean; archived: boolean; pendingDeletion: boolean; expired: boolean } | null
  prices: { valueOk: boolean; expired: boolean }[]
  /** Espera una oferta pública: `catalogPublished` o lifecycle PUBLISHED. */
  expectsPublication: boolean
  stockZero: boolean
}

export interface ValidationResult {
  issues: ValidationIssue[]
  status: 'CON_PROBLEMAS' | 'LISTA_PARA_PUBLICAR'
  rulesVersion: string
}

const PLACEHOLDER_RE = /^(sin (marca|nombre|datos?|d)|n\/?a|s\/d|pendiente|provisional|por definir|tbd|x+)$/i
const FILE_URL_RE = /^\/api\/files\/(.+)$/

const isBlank = (v: string | null | undefined): boolean => !v || !v.trim()
const isPlaceholder = (v: string | null | undefined): boolean => !!v && PLACEHOLDER_RE.test(v.trim().toLowerCase())

/** Códigos que NUNCA pueden ser error (regla 2 de la ficha: PDF ausente solo aviso). */
const FORCED_WARNING_CODES: ReadonlySet<string> = new Set(['docs.datasheet_missing'])

// ─── Hook de categorías (D-1 `campos-categoria`: contenido externo) ────────
export type CategoryRule = (input: ProductValidationInput) => ValidationIssue[]
/** Vacío hasta que el coordinador acuerde los atributos por categoría. */
export const CATEGORY_RULES: Record<string, CategoryRule[]> = {}

// ─── Reglas base (name_useful / category_valid / brand_present) ────────────

export function runValidation(input: ProductValidationInput): ValidationResult {
  const issues: ValidationIssue[] = []

  // base.name_useful
  const displayName = (input.catalogName ?? input.name ?? '').trim()
  if (isBlank(displayName) || isPlaceholder(displayName)) {
    issues.push({
      code: 'base.name_useful',
      severity: 'error',
      field: 'name',
      section: 'identidad',
      message: 'El nombre de la ficha está vacío o es un valor provisional.',
      fix: 'Escribe un nombre útil en Información general o en el Nombre de ficha.',
    })
  }

  // base.category_valid
  if (!input.categoryActive) {
    issues.push({
      code: 'base.category_valid',
      severity: 'error',
      field: 'categoryId',
      section: 'identidad',
      message: 'La categoría del producto no existe o está inactiva.',
      fix: 'Asigna una categoría activa en Identidad.',
    })
  }

  // base.brand_present
  if (!input.brandId && (isBlank(input.catalogBrand) || isPlaceholder(input.catalogBrand))) {
    issues.push({
      code: 'base.brand_present',
      severity: 'error',
      field: 'brand',
      section: 'identidad',
      message: 'El producto no tiene marca y la ficha repite un valor provisional o vacío.',
      fix: 'Asigna la marca del producto (o escríbela en Marca de la ficha).',
    })
  }

  // ─── multimedia ───────────────────────────────────────────────────────────
  if (input.images.length === 0 || !input.images.some((img) => img.isPrimary)) {
    issues.push({
      code: 'media.primary_image',
      severity: 'error',
      field: 'images',
      section: 'multimedia',
      message: 'No hay imagen principal: la ficha no se puede mostrar decentemente.',
      fix: 'Sube una imagen y márcala como principal en Fotos.',
    })
  }

  const fileIssuesFor = (url: string, kind: 'imagen' | 'archivo', expectedKind: string | null): ValidationIssue | null => {
    const m = FILE_URL_RE.exec(url)
    if (!m) {
      if (/^https?:\/\//i.test(url)) {
        return {
          code: 'media.external_unverified',
          severity: 'warning',
          field: kind === 'imagen' ? 'images' : 'resources',
          section: kind === 'imagen' ? 'multimedia' : 'documentos',
          message: `El enlace externo de un ${kind} no se puede verificar (no se descargan URLs arbitrarias).`,
          fix: 'Prefiere subir el archivo al almacén propio para poder verificarlo.',
        }
      }
      return null
    }
    const meta = input.files[m[1]]
    if (!meta || !meta.exists) {
      return {
        code: 'media.file_exists',
        severity: 'error',
        field: kind === 'imagen' ? 'images' : 'resources',
        section: kind === 'imagen' ? 'multimedia' : 'documentos',
        message: `La URL escrita no demuestra que exista el ${kind}: el archivo no está en el almacén.`,
        fix: 'Vuelve a subir el archivo o corrige la URL.',
      }
    }
    if (expectedKind && meta.detectedKind !== expectedKind) {
      return {
        code: 'media.file_exists',
        severity: 'error',
        field: kind === 'imagen' ? 'images' : 'resources',
        section: kind === 'imagen' ? 'multimedia' : 'documentos',
        message: `El contenido real del ${kind} no es el esperado (detectado: ${meta.detectedKind ?? 'desconocido'}).`,
        fix: 'Sustituye el archivo por uno válido.',
      }
    }
    return null
  }

  for (const img of input.images) {
    const issue = fileIssuesFor(img.url, 'imagen', 'IMAGE')
    if (issue) issues.push(issue)
  }
  for (const res of input.resources) {
    const issue = fileIssuesFor(res.url, 'archivo', null)
    if (issue) issues.push(issue)
  }

  // docs.datasheet_missing — SIEMPRE warning (CLAMP abajo lo garantiza).
  if (!input.resources.some((r) => r.kind === 'DATASHEET')) {
    issues.push({
      code: 'docs.datasheet_missing',
      severity: 'warning',
      field: 'resources',
      section: 'documentos',
      message: 'Sin ficha técnica (PDF): alerta informativa — no bloquea publicar.',
      fix: 'Añade un documento de tipo «Ficha técnica» cuando esté disponible.',
    })
  }

  // ─── oferta ───────────────────────────────────────────────────────────────
  // El canal/destinatario de la «tarifa pública» NO se evalúa (decisión externa
  // D-2); aquí solo la coherencia lista-precio propia del producto.
  const listaOk = !!input.lista && input.lista.isActive && !input.lista.archived && !input.lista.pendingDeletion && !input.lista.expired
  const priceOk = input.prices.some((p) => p.valueOk && !p.expired)
  if (input.expectsPublication) {
    if (input.lista && !listaOk) {
      issues.push({
        code: 'offer.lista_valid',
        severity: 'error',
        field: 'listaId',
        section: 'oferta',
        message: 'La oferta pública no está vigente: el producto publicado necesita una Lista activa, no archivada y en vigencia.',
        fix: 'Revisa la Lista del producto (activa, sin archivado/eliminación, vigencia).',
      })
    }
    if (!priceOk) {
      issues.push({
        code: 'offer.price_valid',
        severity: 'error',
        field: 'prices',
        section: 'oferta',
        message: 'Sin precio válido en su Lista (falta, es inválido o venció).',
        fix: 'Carga o corrige el precio del producto en su Lista.',
      })
    }
  } else if (input.lista && !listaOk) {
    issues.push({
      code: 'offer.lista_valid',
      severity: 'warning',
      field: 'listaId',
      section: 'oferta',
      message: 'La Lista propia no está vigente (inactiva, archivada, en eliminación o vencida).',
      fix: 'Activa o corrige la Lista antes de publicar.',
    })
  }

  // ─── atributos por categoría (hook D-1; vacío = cero efectos) ─────────────
  for (const rule of input.categorySlug ? CATEGORY_RULES[input.categorySlug] ?? [] : []) {
    for (const issue of rule(input)) {
      issues.push(clamp(issue))
    }
  }

  // ─── stock: solo informativos (política pendiente D-3) ────────────────────
  if (input.stockZero) {
    issues.push({
      code: 'stock.zero_info',
      severity: 'info',
      field: 'stock',
      section: 'oferta',
      message: 'Stock en cero: se mostrará como «Agotado»; no bloquea nada (política de venta pendiente de ERP).',
      fix: 'Nada que corregir en la ficha; reponer stock si aplica.',
    })
  }

  const clamped = issues.map(clamp)
  const status = clamped.some((i) => i.severity === 'error') ? 'CON_PROBLEMAS' : 'LISTA_PARA_PUBLICAR'
  return { issues: clamped, status, rulesVersion: RULES_VERSION }
}

/** Regla dura: el PDF ausente jamás es bloqueo, pase lo que diga una regla. */
function clamp(issue: ValidationIssue): ValidationIssue {
  if (FORCED_WARNING_CODES.has(issue.code) && issue.severity === 'error') {
    return { ...issue, severity: 'warning' }
  }
  return issue
}

/** ¿El informe guardado sigue vigente para la revisión y reglas actuales? */
export function isStaleReport(
  report: { rulesVersion: string | null; revisionId: string } | null,
  current: { rulesVersion: string; currentRevisionId: string | null },
): boolean {
  if (!report || !report.rulesVersion) return true
  if (report.rulesVersion !== current.rulesVersion) return true
  if (!current.currentRevisionId || report.revisionId !== current.currentRevisionId) return true
  return false
}
