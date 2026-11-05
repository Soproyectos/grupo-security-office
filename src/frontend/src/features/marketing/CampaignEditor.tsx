import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, FieldHelp, helpId, Input } from '../../components/ui'
import { extractBackendMessage } from '../quotes/hooks/useQuoteMutations'
import {
  campaignKey,
  campaignsKey,
  createCampaign,
  deleteCampaign,
  publishCampaign,
  removeCampaignImage,
  unpublishCampaign,
  updateCampaign,
  uploadCampaignImage,
  type CampaignDetail,
} from './marketing-api'
import type { MarketingPermissions } from './marketing-access'
import { MeasureGuide, type PreviewProps } from './CampaignPreview'
import {
  ACCEPTED_IMAGE_ATTR,
  CAMPAIGN_IMAGE_RULES,
  CONFLICT_NOTICE,
  MAX_ALT_LENGTH,
  MAX_LINK_LENGTH,
  MAX_NAME_LENGTH,
  SLOTS_BY_KIND,
  campaignStatus,
  checkImageSelection,
  isRevisionConflict,
  isoToLocalInput,
  localInputToIso,
  type CampaignFit,
  type CampaignKind,
  type CampaignSlot,
} from './marketing-rules'

const FIELD_CLASS = 'w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] disabled:cursor-not-allowed disabled:bg-neutral-100'
const BUTTON_CLASS = 'min-h-[44px]'

const IMAGE_HELP: Record<CampaignSlot, string> = {
  desktop: 'Es la imagen principal: se ve en computador y tablet (pantallas de 768 px o más). Si no subes la de móvil, también se usa en celulares.',
  mobile: 'Se ve en celulares (pantallas menores de 768 px). Es opcional: si no la subes, el móvil usa la de escritorio.',
  image: 'Es la imagen de la ventana emergente que aparece sobre la tienda. Se muestra completa, sin recortes.',
}

const MOBILE_FRAMING_HELP = 'Aplica a la imagen de móvil. Si no subes imagen de móvil, el móvil usa la de escritorio y estos valores se ignoran: se usan los de escritorio.'

const SLOT_FIELD = { desktop: 'imageDesktop', mobile: 'imageMobile', image: 'image' } as const

function errorText(error: unknown): string {
  return error instanceof Error && !('response' in error) ? error.message : extractBackendMessage(error)
}

interface FormValues {
  name: string
  alt: string
  linkUrl: string
  position: string
  startsAt: string
  endsAt: string
  fit: CampaignFit
  focusX: number
  focusY: number
  fitMobile: CampaignFit
  focusMobileX: number
  focusMobileY: number
}

function valuesFrom(detail: CampaignDetail | null): FormValues {
  const draft = detail?.draft
  return {
    name: draft?.name ?? '',
    alt: draft?.alt ?? '',
    linkUrl: draft?.linkUrl ?? '',
    position: String(draft?.position ?? 0),
    startsAt: isoToLocalInput(draft?.startsAt),
    endsAt: isoToLocalInput(draft?.endsAt),
    fit: draft?.fit ?? 'cover',
    focusX: draft?.focusX ?? 50,
    focusY: draft?.focusY ?? 50,
    // Campaigns saved before the mobile framing existed inherit the desktop values.
    fitMobile: draft?.fitMobile ?? draft?.fit ?? 'cover',
    focusMobileX: draft?.focusMobileX ?? draft?.focusX ?? 50,
    focusMobileY: draft?.focusMobileY ?? draft?.focusY ?? 50,
  }
}

interface EditorProps {
  kind: CampaignKind
  /** Saved campaign with its draft, or null while preparing a new one. */
  detail: CampaignDetail | null
  permissions: MarketingPermissions
  onSaved: (detail: CampaignDetail) => void
  /** Asks to leave the editor (the parent may confirm first when there are unsaved changes). */
  onClose: () => void
  /** The draft was deleted: leave without asking. Falls back to `onClose`. */
  onDeleted?: () => void
  /** Reports whether the form has unsaved changes, new drafts included. */
  onDirtyChange?: (dirty: boolean) => void
  /** Reloads the campaign from the server (after a revision conflict). */
  onReload: () => Promise<void>
  /** Receives the live preview data (draft images plus the form's current fit, focus and alt); null on unmount. */
  onPreviewChange?: (preview: PreviewProps | null) => void
  /** Which framing block (desktop or mobile) is open at first. */
  initialFramingDevice?: 'desktop' | 'mobile'
}

/**
 * Form of one banner or pop-up draft. Mounted with a key per campaign so its
 * fields start from the saved draft; the revision always comes from `detail`.
 */
export default function CampaignEditor({ kind, detail, permissions, onSaved, onClose, onDeleted, onDirtyChange, onReload, onPreviewChange, initialFramingDevice = 'desktop' }: EditorProps) {
  const client = useQueryClient()
  const isHero = kind === 'HERO'
  const prefix = kind === 'HERO' ? 'hero' : 'popup'
  const [values, setValues] = useState<FormValues>(() => valuesFrom(detail))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [framingDevice, setFramingDevice] = useState<'desktop' | 'mobile'>(initialFramingDevice)

  const editable = detail ? permissions.edit : permissions.create
  const saved = valuesFrom(detail)
  const dirty = !!detail && (Object.keys(saved) as Array<keyof FormValues>).some((key) => saved[key] !== values[key])
  const unsaved = (Object.keys(saved) as Array<keyof FormValues>).some((key) => saved[key] !== values[key])
  const status = detail ? campaignStatus(detail) : null
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    onDirtyChange?.(unsaved)
    return () => onDirtyChange?.(false)
  }, [unsaved, onDirtyChange])

  const draftDesktop = detail?.draft.imageDesktop ?? null
  const draftMobile = detail?.draft.imageMobile ?? null
  const draftImage = detail?.draft.image ?? null
  useEffect(() => {
    onPreviewChange?.({
      kind, alt: values.alt || values.name, fit: values.fit, focusX: values.focusX, focusY: values.focusY,
      fitMobile: values.fitMobile, focusMobileX: values.focusMobileX, focusMobileY: values.focusMobileY,
      imageDesktop: draftDesktop, imageMobile: draftMobile, image: draftImage,
    })
  }, [kind, values.alt, values.name, values.fit, values.focusX, values.focusY, values.fitMobile, values.focusMobileX, values.focusMobileY, draftDesktop, draftMobile, draftImage, onPreviewChange])
  useEffect(() => () => onPreviewChange?.(null), [onPreviewChange])

  const refreshList = () => void client.invalidateQueries({ queryKey: campaignsKey })
  const accept = (next: CampaignDetail) => {
    client.setQueryData(campaignKey(next.id), next)
    refreshList()
    onSaved(next)
  }

  async function run(label: string, operation: 'edit' | 'other', action: () => Promise<void>) {
    setBusy(label)
    setError(null)
    setConflict(false)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      if (isRevisionConflict(err, operation)) setConflict(true)
      else setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editable) return
    void run('save', 'edit', async () => {
      const position = Number.parseInt(values.position, 10)
      if (isHero && (!Number.isInteger(position) || position < 0 || position > 999)) throw new Error('El orden debe ser un número entero entre 0 y 999')
      const fields = {
        name: values.name.trim(),
        alt: values.alt.trim(),
        linkUrl: values.linkUrl.trim() || null,
        startsAt: localInputToIso(values.startsAt),
        endsAt: localInputToIso(values.endsAt),
        ...(isHero && { position, fit: values.fit, focusX: values.focusX, focusY: values.focusY, fitMobile: values.fitMobile, focusMobileX: values.focusMobileX, focusMobileY: values.focusMobileY }),
      }
      if (!fields.name) throw new Error('Escribe un nombre interno para reconocerlo en la lista')
      if (detail) {
        accept(await updateCampaign(detail.id, { ...fields, revision: detail.revision }))
        setNotice('Cambios guardados en el borrador. No se ven en la tienda hasta publicar.')
      } else {
        accept(await createCampaign({ ...fields, kind }))
        setNotice('Borrador creado. Ahora puedes subir las imágenes.')
      }
    })
  }

  const chooseImage = (slot: CampaignSlot) => (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file || !detail) return
    void run(`upload-${slot}`, 'other', async () => {
      try {
        const problem = await checkImageSelection(file, slot)
        if (problem) throw new Error(problem)
        accept(await uploadCampaignImage(detail.id, slot, file))
        setNotice('Imagen subida al borrador.')
      } finally {
        input.value = ''
      }
    })
  }

  const removeImage = (slot: CampaignSlot) => {
    if (!detail) return
    void run(`remove-${slot}`, 'other', async () => {
      accept(await removeCampaignImage(detail.id, slot))
      setNotice('Imagen quitada del borrador.')
    })
  }

  const publish = () => {
    if (!detail) return
    void run('publish', 'other', async () => {
      accept(await publishCampaign(detail.id, detail.revision))
      setNotice('Publicado: ya puede verse en la tienda durante su vigencia.')
    })
  }

  const unpublish = () => {
    if (!detail) return
    void run('unpublish', 'other', async () => {
      accept(await unpublishCampaign(detail.id))
      setNotice('Retirado de la tienda. El borrador se conserva.')
    })
  }

  const remove = () => {
    if (!detail) return
    if (!window.confirm('¿Eliminar este borrador? No se puede deshacer.')) return
    void run('delete', 'other', async () => {
      await deleteCampaign(detail.id)
      client.removeQueries({ queryKey: campaignKey(detail.id) })
      refreshList()
      ;(onDeleted ?? onClose)()
    })
  }

  const draft = detail?.draft
  const noun = isHero ? 'banner' : 'pop-up'
  const reloadAfterConflict = async () => {
    setBusy('reload')
    try {
      await onReload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-label={detail ? `Editar ${noun}` : `Nuevo ${noun}`}>
      {status && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status.tone}>{status.label}</Badge>
          {status.extra && <Badge variant="warning">{status.extra}</Badge>}
        </div>
      )}
      {!editable && (
        <p role="status" className="text-sm text-[var(--color-text-secondary)]">
          {detail ? `Solo puedes ver este ${noun}: tu cuenta no tiene permiso para editarlo.` : `Tu cuenta no tiene permiso para crear ${isHero ? 'banners' : 'pop-ups'}.`}
        </p>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Input label="Nombre interno" id={`${prefix}-name`} value={values.name} maxLength={MAX_NAME_LENGTH} disabled={!editable || !!busy}
            aria-describedby={helpId(`${prefix}-name`)} onChange={(e) => set('name', e.target.value)} className="min-h-[44px]" required />
          <FieldHelp forId={`${prefix}-name`}>Solo lo ves tú y tu equipo, para reconocer este {noun} en la lista. No se muestra en la tienda. Ej.: Promo Black Friday.</FieldHelp>
        </div>
        <div className="space-y-1.5">
          <Input label="Texto alternativo (obligatorio para publicar)" id={`${prefix}-alt`} value={values.alt} maxLength={MAX_ALT_LENGTH} disabled={!editable || !!busy}
            aria-describedby={helpId(`${prefix}-alt`)} onChange={(e) => set('alt', e.target.value)} className="min-h-[44px]" />
          <FieldHelp forId={`${prefix}-alt`}>Describe la imagen con palabras. Lo leen los lectores de pantalla para personas con discapacidad visual y se muestra si la imagen no carga. Obligatorio para publicar. Ej.: Cámara de seguridad Hikvision en oferta.</FieldHelp>
        </div>
        <div className="space-y-1.5">
          <Input label="Enlace (opcional)" id={`${prefix}-link`} value={values.linkUrl} maxLength={MAX_LINK_LENGTH} disabled={!editable || !!busy}
            aria-describedby={helpId(`${prefix}-link`)} placeholder="/catalogo o https://…" onChange={(e) => set('linkUrl', e.target.value)} className="min-h-[44px]" />
          <FieldHelp forId={`${prefix}-link`}>A dónde lleva al hacer clic en la imagen. Puede ser una página de la tienda (/catalogo) o una dirección completa (https://…). Si lo dejas vacío, la imagen no es clicable.</FieldHelp>
        </div>
        {isHero && (
          <div className="space-y-1.5">
            <Input label="Orden (menor primero)" id={`${prefix}-position`} type="number" min={0} max={999} value={values.position} disabled={!editable || !!busy}
              aria-describedby={helpId(`${prefix}-position`)} onChange={(e) => set('position', e.target.value)} className="min-h-[44px]" />
            <FieldHelp forId={`${prefix}-position`}>Define en qué posición sale este banner cuando hay varios: el número menor sale primero. Ej.: 1 sale antes que 2.</FieldHelp>
          </div>
        )}
        <div className="space-y-1.5">
          <Input label="Inicio (hora Colombia, opcional)" id={`${prefix}-starts`} type="datetime-local" value={values.startsAt} disabled={!editable || !!busy}
            aria-describedby={helpId(`${prefix}-starts`)} onChange={(e) => set('startsAt', e.target.value)} className="min-h-[44px]" />
          <FieldHelp forId={`${prefix}-starts`}>Fecha y hora (hora de Colombia) desde la que se muestra. Opcional: sin fechas, se muestra mientras esté publicado.</FieldHelp>
        </div>
        <div className="space-y-1.5">
          <Input label="Fin (hora Colombia, opcional)" id={`${prefix}-ends`} type="datetime-local" value={values.endsAt} disabled={!editable || !!busy}
            aria-describedby={helpId(`${prefix}-ends`)} onChange={(e) => set('endsAt', e.target.value)} className="min-h-[44px]" />
          <FieldHelp forId={`${prefix}-ends`}>Fecha y hora (hora de Colombia) en la que deja de mostrarse. Opcional: sin fechas, se muestra mientras esté publicado.</FieldHelp>
        </div>
      </div>

      {isHero && (
        <fieldset className="space-y-4" disabled={!editable || !!busy}>
          <legend className="mb-1 text-sm font-medium">Encuadre en el marco</legend>
          <div role="group" aria-label="Encuadre de qué pantalla" className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)]">
            {(['desktop', 'mobile'] as const).map((device) => (
              <button key={device} type="button" aria-pressed={framingDevice === device} onClick={() => setFramingDevice(device)}
                className={`min-h-[44px] px-4 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${framingDevice === device ? 'bg-neutral-800 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}>
                {device === 'desktop' ? 'Escritorio' : 'Móvil'}
              </button>
            ))}
          </div>
          {framingDevice === 'mobile' && !draftMobile && (
            <p role="status" className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
              Todavía no hay imagen de móvil: en celulares se usa la de escritorio y se aplica el encuadre de escritorio. Estos valores solo cuentan cuando subas la imagen de móvil.
            </p>
          )}
          {framingDevice === 'desktop' ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor={`${prefix}-fit`} className="block text-sm font-medium text-neutral-800">Ajuste de la imagen</label>
                <select id={`${prefix}-fit`} aria-describedby={helpId(`${prefix}-fit`)} className={FIELD_CLASS} value={values.fit} onChange={(e) => set('fit', e.target.value as CampaignFit)}>
                  <option value="cover">Cubrir el marco (recorta lo que sobre)</option>
                  <option value="contain">Mostrar completa (puede dejar bordes)</option>
                </select>
                <FieldHelp forId={`${prefix}-fit`}>Cubrir el marco: la imagen llena todo el espacio y puede recortar los bordes. Mostrar completa: la imagen se ve entera y pueden quedar bandas vacías a los lados o arriba y abajo.</FieldHelp>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${prefix}-focus-x`} className="block text-sm font-medium text-neutral-800">Foco horizontal: {values.focusX} %</label>
                <input id={`${prefix}-focus-x`} type="range" min={0} max={100} value={values.focusX} aria-describedby={helpId(`${prefix}-focus-x`)} className="min-h-[44px] w-full" onChange={(e) => set('focusX', Number(e.target.value))} />
                <FieldHelp forId={`${prefix}-focus-x`}>Cuando la imagen se recorta para llenar el marco, elige qué parte se queda visible de izquierda a derecha. 0 % = lado izquierdo, 50 % = centro, 100 % = lado derecho. Solo se nota si la imagen se recorta.</FieldHelp>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${prefix}-focus-y`} className="block text-sm font-medium text-neutral-800">Foco vertical: {values.focusY} %</label>
                <input id={`${prefix}-focus-y`} type="range" min={0} max={100} value={values.focusY} aria-describedby={helpId(`${prefix}-focus-y`)} className="min-h-[44px] w-full" onChange={(e) => set('focusY', Number(e.target.value))} />
                <FieldHelp forId={`${prefix}-focus-y`}>Igual, pero de arriba a abajo: 0 % = arriba, 50 % = centro, 100 % = abajo. Solo se nota si la imagen se recorta.</FieldHelp>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor={`${prefix}-fit-mobile`} className="block text-sm font-medium text-neutral-800">Ajuste de la imagen (móvil)</label>
                <select id={`${prefix}-fit-mobile`} aria-describedby={helpId(`${prefix}-fit-mobile`)} className={FIELD_CLASS} value={values.fitMobile} onChange={(e) => set('fitMobile', e.target.value as CampaignFit)}>
                  <option value="cover">Cubrir el marco (recorta lo que sobre)</option>
                  <option value="contain">Mostrar completa (puede dejar bordes)</option>
                </select>
                <FieldHelp forId={`${prefix}-fit-mobile`}>{MOBILE_FRAMING_HELP} Cubrir el marco llena todo el espacio y puede recortar; Mostrar completa deja ver la imagen entera con posibles bandas vacías.</FieldHelp>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${prefix}-focus-x-mobile`} className="block text-sm font-medium text-neutral-800">Foco horizontal (móvil): {values.focusMobileX} %</label>
                <input id={`${prefix}-focus-x-mobile`} type="range" min={0} max={100} value={values.focusMobileX} aria-describedby={helpId(`${prefix}-focus-x-mobile`)} className="min-h-[44px] w-full" onChange={(e) => set('focusMobileX', Number(e.target.value))} />
                <FieldHelp forId={`${prefix}-focus-x-mobile`}>{MOBILE_FRAMING_HELP} 0 % = lado izquierdo, 50 % = centro, 100 % = lado derecho. Solo se nota si la imagen se recorta.</FieldHelp>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${prefix}-focus-y-mobile`} className="block text-sm font-medium text-neutral-800">Foco vertical (móvil): {values.focusMobileY} %</label>
                <input id={`${prefix}-focus-y-mobile`} type="range" min={0} max={100} value={values.focusMobileY} aria-describedby={helpId(`${prefix}-focus-y-mobile`)} className="min-h-[44px] w-full" onChange={(e) => set('focusMobileY', Number(e.target.value))} />
                <FieldHelp forId={`${prefix}-focus-y-mobile`}>{MOBILE_FRAMING_HELP} 0 % = arriba, 50 % = centro, 100 % = abajo. Solo se nota si la imagen se recorta.</FieldHelp>
              </div>
            </>
          )}
        </fieldset>
      )}

      <div className="space-y-5">
        <div className="space-y-4">
          {SLOTS_BY_KIND[kind].map((slot) => {
            const rule = CAMPAIGN_IMAGE_RULES[slot]
            const current = draft ? draft[SLOT_FIELD[slot]] : null
            const inputId = `${prefix}-file-${slot}`
            return (
              <div key={slot} className="space-y-1.5 rounded-lg border border-[var(--color-border)] p-3">
                <label htmlFor={inputId} className="block text-sm font-medium">
                  {isHero ? `Imagen de ${rule.title.toLowerCase()}${slot === 'mobile' ? ' (opcional)' : ''}` : 'Imagen del pop-up'}
                </label>
                <FieldHelp forId={inputId}>{IMAGE_HELP[slot]}</FieldHelp>
                <MeasureGuide slot={slot} />
                {permissions.images && detail ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input id={inputId} aria-describedby={helpId(inputId)} type="file" accept={ACCEPTED_IMAGE_ATTR} disabled={!!busy} onChange={chooseImage(slot)}
                      className="min-h-[44px] max-w-full text-sm file:mr-3 file:min-h-[44px] file:rounded-lg file:border file:border-[var(--color-border)] file:bg-[var(--color-bg-primary)] file:px-4 file:text-sm" />
                    {current && <Button type="button" variant="secondary" className={BUTTON_CLASS} disabled={!!busy} onClick={() => removeImage(slot)}>Quitar imagen</Button>}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {!permissions.images ? 'Tu cuenta no tiene permiso para subir imágenes.' : 'Guarda el borrador para poder subir la imagen.'}
                  </p>
                )}
                {busy === `upload-${slot}` && <p role="status" className="text-xs">Subiendo imagen…</p>}
              </div>
            )
          })}
        </div>
      </div>

      {notice && <p role="status" className="text-sm text-[var(--color-success)]">{notice}</p>}
      {error && <p role="alert" className="text-sm text-[var(--color-error)]">{error}</p>}
      {conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-error)]/30 p-3 text-sm text-[var(--color-error)]">
          <span>{CONFLICT_NOTICE}</span>
          <Button type="button" variant="secondary" className={BUTTON_CLASS} loading={busy === 'reload'} onClick={() => void reloadAfterConflict()}>Recargar</Button>
        </div>
      )}
      {dirty && detail && permissions.publish && (
        <p className="text-xs text-[var(--color-text-secondary)]">Hay cambios sin guardar: guárdalos antes de publicar.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {editable && <Button type="submit" className={BUTTON_CLASS} loading={busy === 'save'} disabled={!!busy}>{detail ? 'Guardar cambios' : 'Guardar borrador'}</Button>}
        {detail && permissions.publish && (detail.status === 'DRAFT' || detail.hasUnpublishedChanges) && (
          <Button type="button" className={BUTTON_CLASS} loading={busy === 'publish'} disabled={!!busy || dirty} onClick={publish}>
            {detail.status === 'DRAFT' ? 'Publicar' : 'Publicar cambios'}
          </Button>
        )}
        {detail && permissions.publish && detail.status === 'PUBLISHED' && (
          <Button type="button" variant="secondary" className={BUTTON_CLASS} loading={busy === 'unpublish'} disabled={!!busy} onClick={unpublish}>Retirar de la tienda</Button>
        )}
        {detail && permissions.delete && detail.status === 'DRAFT' && (
          <Button type="button" variant="danger" className={BUTTON_CLASS} loading={busy === 'delete'} disabled={!!busy} onClick={remove}>Eliminar borrador</Button>
        )}
        <Button type="button" variant="ghost" className={BUTTON_CLASS} disabled={!!busy} onClick={onClose}>Cerrar</Button>
      </div>
    </form>
  )
}
