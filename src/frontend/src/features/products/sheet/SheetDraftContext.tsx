import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { RenderFichaSection } from './FichaSection'
import type { SheetSaveOptions } from './editor-save'
import {
  savePayloadWithVersion,
  snapshot,
  toForm,
  validateForm,
  type ProductSheetApi,
  type ProductSheetPayload,
  type SheetConflict,
  type SheetErrors,
  type SheetForm,
} from './sheet-form'
import type { ValidationState } from './sheet-revisions'

export interface ProductSheetEditorProps {
  sheet: ProductSheetApi
  /** Product lifecycle in the store; the public sheet only exists for PUBLISHED products. */
  lifecycleStatus?: string | null
  saving: boolean
  saveError: string | null
  saved: boolean
  /** CAT-03 (H2): 409 `sheet-version-conflict` — la ficha cambió en el servidor. */
  conflict?: SheetConflict | null
  /** CAT-03 (regla 5): estado de validación (revisiones CAT-02). Informativo. */
  validation?: ValidationState | null
  /** Descarta el borrador local y recarga la versión vigente del servidor. */
  onReload?: () => void
  /** CAT-04 (D5): subida verificada de un documento (rellena URL + archivo). */
  onUploadAsset?: (file: File) => Promise<{ url: string }>
  /** Resolves true when the sheet was saved; false (or nothing) when it was not. */
  onSave: (payload: ProductSheetPayload) => Promise<boolean> | void
  onDirtyChange?: (dirty: boolean) => void
  /** The page already renders one navigation for every block of the Ficha tab. */
  hideNav?: boolean
  /** Rendered inside a page that owns the primary action: static save bar and a secondary button. */
  embedded?: boolean
  /** Embedded only: the page renders each block as its own section of its index. */
  renderSection?: RenderFichaSection
  /** Embedded only: false hides the sticky save bar (e.g. while another section is open). */
  saveBarVisible?: boolean
}

/** Everything a block reads or writes. One draft and one payload, owned by the provider. */
export interface SheetDraft {
  sheet: ProductSheetApi
  lifecycleStatus: string | null | undefined
  form: SheetForm
  set: <K extends keyof SheetForm>(key: K, value: SheetForm[K]) => void
  /** Validation messages, shown only after the first submit attempt. */
  errors: SheetErrors
  errorCount: number
  showErrors: boolean
  dirty: boolean
  saving: boolean
  saveError: string | null
  saved: boolean
  conflict: SheetConflict | null
  validation: ValidationState | null
  onReload?: () => void
  onUploadAsset?: (file: File) => Promise<{ url: string }>
  /**
   * Validates and saves the sheet. Resolves true only when it was saved.
   * Without options (the form's own submit) it always saves. With options, a clean draft is saved only
   * when `force` is set or when `syncName` carries the product name.
   */
  handleSubmit: (e: { preventDefault: () => void }, options?: SheetSaveOptions) => Promise<boolean>
  hideNav: boolean
  embedded: boolean
  saveBarVisible: boolean
  /** Options for FichaSection: flat inside a host page, plus the host's renderer when embedded. */
  sectionProps: { flat: boolean; renderSection?: RenderFichaSection }
}

export type SheetDraftProviderProps = ProductSheetEditorProps & { children: ReactNode }

const SheetDraftContext = createContext<SheetDraft | null>(null)

/** The saved copy a draft is measured against: its version stamp and the form it was built from. */
export interface DraftBase {
  updatedAt: string
  initial: SheetForm
}

/**
 * Returns the base the draft should use for `sheet`. The same base (same reference) while the saved
 * copy has the same `updatedAt`, so unsaved edits survive re-renders; a new base built from the saved copy
 * once it changes (after a successful save or a reload).
 */
export function nextDraftBase(current: DraftBase, sheet: ProductSheetApi): DraftBase {
  if (current.updatedAt === sheet.updatedAt) return current
  return { updatedAt: sheet.updatedAt, initial: toForm(sheet) }
}

/** Owns the sheet draft: form state, baseline, dirty flag, validation and submit. */
export function SheetDraftProvider({ children, ...props }: SheetDraftProviderProps) {
  const {
    sheet,
    lifecycleStatus,
    saving,
    saveError,
    saved,
    conflict = null,
    validation = null,
    onReload,
    onUploadAsset,
    onSave,
    onDirtyChange,
    hideNav = false,
    embedded = false,
    renderSection,
    saveBarVisible = true,
  } = props

  const [base, setBase] = useState<DraftBase>(() => ({ updatedAt: sheet.updatedAt, initial: toForm(sheet) }))
  const [form, setForm] = useState<SheetForm>(base.initial)
  const [showErrors, setShowErrors] = useState(false)

  // The saved copy changed: restart the draft from it. Done during render (not in an effect) so the
  // draft never shows a stale frame, and the blocks below keep their mounted state (no remount, no key).
  const current = nextDraftBase(base, sheet)
  if (current !== base) {
    setBase(current)
    setForm(current.initial)
    setShowErrors(false)
  }

  const baseline = useMemo(() => snapshot(current.initial), [current.initial])

  const dirty = snapshot(form) !== baseline
  const allErrors = useMemo(() => validateForm(form), [form])
  const errors: SheetErrors = showErrors ? allErrors : {}
  const errorCount = Object.keys(allErrors).length

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const set = <K extends keyof SheetForm>(key: K, value: SheetForm[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: { preventDefault: () => void }, options?: SheetSaveOptions): Promise<boolean> => {
    e.preventDefault()
    if (errorCount > 0) {
      setShowErrors(true)
      return false
    }
    // Nothing to send: a clean draft is not saved unless forced or the product name must be synced.
    if (options && !dirty && !options.force && options.syncName === undefined) return true
    // The product name, when it changed, becomes the store name of the sheet.
    const toSave = options?.syncName === undefined ? form : { ...form, name: options.syncName }
    // CAT-03 (H2): el PUT lleva la versión que este cliente leyó; si otro
    // guardado la adelantó, el servidor responde 409 sin escribir (se conserva
    // el borrador local y se muestra la versión vigente).
    return (await onSave(savePayloadWithVersion(toSave, sheet))) === true
  }

  const value: SheetDraft = {
    sheet,
    lifecycleStatus,
    form,
    set,
    errors,
    errorCount,
    showErrors,
    dirty,
    saving,
    saveError,
    saved,
    conflict,
    validation,
    onReload,
    onUploadAsset,
    handleSubmit,
    hideNav,
    embedded,
    saveBarVisible,
    sectionProps: { flat: embedded, renderSection: embedded ? renderSection : undefined },
  }

  return <SheetDraftContext.Provider value={value}>{children}</SheetDraftContext.Provider>
}

/** Reads the sheet draft. Must be called inside a SheetDraftProvider. */
export function useSheetDraft(): SheetDraft {
  const draft = useContext(SheetDraftContext)
  if (!draft) {
    throw new Error('useSheetDraft() must be used inside <SheetDraftProvider>: sheet blocks need the draft of their editor.')
  }
  return draft
}

/** Reads the sheet draft when there is one; null outside a provider (sheet not loaded or not allowed). */
// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalSheetDraft(): SheetDraft | null {
  return useContext(SheetDraftContext)
}
