import { useEffect, useRef, useState } from 'react'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Modal } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import { hasPermission, useHasPermission } from '../../lib/rbac'
import { cancelScheduledPublish, schedulePublish, transitionProduct } from '../../services/product-detail.service'
import type { Product } from '../products/types/product.types'
import { effectiveLifecycleStatus, fromDatetimeLocal, hasActiveScheduling, toDatetimeLocal } from '../products/lib/lifecycle'
import { sheetKeys } from '../products/sheet/sheet.service'
import { fetchValidationReport, validateProduct, validationKeys } from '../catalog-validation/validation-api'
import { summarizeValidation } from '../catalog-validation/validation-model'
import { ValidationPanel } from '../catalog-validation/ValidationPanel'
import { ProductPublicationSection } from './ProductPublicationPanel'
import { PUBLISH_STEP_COUNT, buildPublishSteps, type PublishStep, type PublishStepContext } from './publication-model'

type PublicationAction = 'PUBLISH' | 'UNPUBLISH' | 'SCHEDULE' | 'CANCEL'
class PublicationFeedbackError extends Error {}

export interface LibraryPublicationSectionProps {
  product: Product
  disabled?: boolean
  /** Abre una sección del editor para corregir un requisito. Omitir si la persona no puede editar la ficha. */
  onGoToSection?: (sectionId: string) => void
}

const summaryClass = 'cursor-pointer text-sm font-medium text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary-focus-ring)]'
const stepCircle = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold'
const stateBadge = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'
const STATE_STYLE: Record<PublishStep['status'], { label: string; badge: string; circle: string }> = {
  done: { label: 'Listo', badge: 'bg-emerald-50 text-emerald-700', circle: 'bg-emerald-50 text-emerald-700' },
  active: { label: 'Pendiente', badge: 'bg-amber-50 text-amber-800', circle: 'bg-[var(--color-primary)] text-[var(--color-text-inverse)]' },
  blocked: { label: 'Bloqueado', badge: 'bg-neutral-100 text-neutral-600', circle: 'bg-neutral-100 text-neutral-500' },
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function PublishStepsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="divide-y divide-neutral-200 border-y border-neutral-200">
      <span className="sr-only">Cargando los pasos para publicar…</span>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex gap-3 py-4" aria-hidden="true">
          <span className="h-8 w-8 shrink-0 rounded-full bg-neutral-100 motion-safe:animate-pulse" />
          <div className="flex-1 space-y-2 pt-1">
            <span className="block h-3.5 w-40 max-w-full rounded bg-neutral-100 motion-safe:animate-pulse" />
            <span className="block h-3 w-64 max-w-full rounded bg-neutral-100 motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Publication controls shared by the complete editor and the review page.
 * Permission assignment and server-provided actions remain the authority.
 */
export function LibraryPublicationSection({ product, disabled = false, onGoToSection }: LibraryPublicationSectionProps) {
  const canPublish = useHasPermission('products:publish')
  const pricesPending = useIsMutating({ mutationKey: ['product-prices-write', product.id] }) > 0
  const changesPending = disabled || pricesPending
  const disabledRef = useRef(changesPending)
  disabledRef.current = changesPending
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<'schedule' | 'unpublish' | 'cancel' | null>(null)
  const [when, setWhen] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const announcedStep = useRef<number | null>(null)
  const status = effectiveLifecycleStatus(product)
  const allowed = product.allowedActions ?? []
  const scheduled = hasActiveScheduling(product)
  const canPublishNow = allowed.includes('PUBLISH')
  // The steps replace the summary only for a draft that the person may publish.
  const stepsMode = status === 'DRAFT' && canPublishNow

  const report = useQuery({
    queryKey: validationKeys.report(product.id),
    queryFn: () => fetchValidationReport(product.id),
    enabled: canPublish,
    refetchOnWindowFocus: false,
  })
  const check = useMutation({
    mutationFn: () => validateProduct(product.id),
    onSuccess: (value) => queryClient.setQueryData(validationKeys.report(product.id), value),
  })
  const action = useMutation({
    mutationKey: ['product-publication-write', product.id],
    mutationFn: async (command: PublicationAction) => {
      if (disabledRef.current || !hasPermission('products:publish')) throw new PublicationFeedbackError('Guarda los cambios y comprueba tu acceso antes de continuar.')
      if (command === 'CANCEL') return cancelScheduledPublish(product.id)
      if (command === 'UNPUBLISH') return transitionProduct(product.id, { event: 'UNPUBLISH' })
      // Every publish request checks the current working revision before sending
      // the transition; the server still applies its final publication gate.
      if (command === 'SCHEDULE' && (!when || !Number.isFinite(new Date(when).getTime()) || new Date(when).getTime() <= Date.now())) {
        throw new PublicationFeedbackError('Selecciona una fecha y hora futura.')
      }
      const fresh = await validateProduct(product.id)
      queryClient.setQueryData(validationKeys.report(product.id), fresh)
      if (disabledRef.current) throw new PublicationFeedbackError('La ficha tiene nuevos cambios sin guardar. Guárdalos antes de publicar.')
      if (fresh.status !== 'LISTA_PARA_PUBLICAR' || summarizeValidation(fresh).blocking) {
        throw new PublicationFeedbackError('La ficha tiene requisitos pendientes. Revisa los detalles que aparecen debajo.')
      }
      if (!hasPermission('products:publish')) throw new PublicationFeedbackError('Tu acceso a Publicación cambió. Comprueba tu asignación.')
      return command === 'SCHEDULE'
        ? schedulePublish(product.id, { publishAt: fromDatetimeLocal(when) })
        : transitionProduct(product.id, { event: 'PUBLISH' })
    },
    onSuccess: (_value, command) => {
      setDialog(null)
      setNotice(command === 'PUBLISH' ? 'Producto publicado.' : command === 'UNPUBLISH' ? 'Producto despublicado.' : command === 'CANCEL' ? 'Programación cancelada.' : 'Publicación programada.')
      for (const queryKey of [
        ['product', product.id], ['products'], ['publication-board'], ['publication-history', product.id],
        sheetKeys.revisions(product.id), validationKeys.report(product.id),
      ]) void queryClient.invalidateQueries({ queryKey })
    },
  })
  const busy = action.isPending || check.isPending
  const blocked = changesPending || busy

  const reportData = report.data
  const reportLoading = report.isPending === true
  const checkState: PublishStepContext['check'] = !reportData
    ? (report.isError ? 'unavailable' : 'none')
    : reportData.stale ? 'stale' : 'current'
  const steps: PublishStep[] | null = stepsMode
    ? buildPublishSteps(reportData?.issues ?? [], { check: checkState, unsavedChanges: disabled, pricesPending })
    : null
  const activeStep = steps?.find((step) => step.status === 'active') ?? null
  const activeNumber = activeStep?.number ?? null
  const activeTitle = activeStep?.title ?? null

  // Announces the step only when it changes, so a screen reader hears the new step once.
  useEffect(() => {
    if (activeNumber === null || activeTitle === null) {
      announcedStep.current = null
      return
    }
    if (announcedStep.current !== null && announcedStep.current !== activeNumber) {
      setAnnouncement(`Paso ${activeNumber} de ${PUBLISH_STEP_COUNT}: ${activeTitle}.`)
    }
    announcedStep.current = activeNumber
  }, [activeNumber, activeTitle])

  if (!canPublish) return null

  const openDialog = (value: typeof dialog) => {
    action.reset()
    setLocalError(null)
    setNotice(null)
    if (value === 'schedule') setWhen(product.publishAt ? toDatetimeLocal(product.publishAt) : '')
    setDialog(value)
  }
  const submit = (command: PublicationAction) => {
    setLocalError(null)
    setNotice(null)
    action.mutate(command)
  }
  const error = localError ?? (action.error instanceof PublicationFeedbackError ? action.error.message : action.error ? getApiErrorMessage(action.error, 'No se pudo completar la acción.') : null)
  const checkError = check.isError ? `${getApiErrorMessage(check.error, 'No se pudo comprobar la ficha.')} Vuelve a intentarlo.` : null
  const loadError = report.isError ? 'No se pudieron cargar los requisitos. Recarga la página para intentarlo de nuevo.' : null

  const summary = summarizeValidation(reportData)
  const statusLine = status === 'PUBLISHED'
    ? 'Publicado: visible en la tienda. Guardar una edición no publica una nueva revisión.'
    : scheduled && product.publishAt
      ? `Programado para el ${new Date(product.publishAt).toLocaleString('es-CO')}. Se publicará solo en esa fecha.`
      : canPublishNow
        ? 'Borrador: todavía no se ve en la tienda. Comprobaremos los requisitos al publicar.'
        : 'Este producto no se puede publicar en su estado actual. Si está archivado, restáuralo desde «Archivar o quitar».'

  const renderStep = (step: PublishStep) => {
    const isActive = step.status === 'active'
    const isBlocked = step.status === 'blocked'
    const style = STATE_STYLE[step.status]
    const fixSection = step.missing.find((item) => item.fixSection)?.fixSection ?? null
    return (
      <li
        key={step.id}
        aria-current={isActive ? 'step' : undefined}
        aria-disabled={isBlocked ? 'true' : undefined}
        className="flex gap-3 py-4 motion-safe:transition-colors motion-safe:duration-200"
      >
        <span aria-hidden="true" className={`${stepCircle} ${style.circle}`}>
          {step.status === 'done' ? <CheckIcon /> : step.number}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`text-sm font-semibold ${isBlocked ? 'text-neutral-500' : 'text-neutral-800'}`}>{step.title}</h4>
            <span className={`${stateBadge} ${style.badge}`}>{style.label}</span>
          </div>
          {step.status === 'done' && <p className="text-sm text-neutral-600">{step.doneSummary}</p>}
          {isBlocked && <p className="text-sm text-neutral-500">{`Completa el paso ${activeNumber} para continuar`}</p>}
          {isActive && (
            <>
              {step.missing.length > 0 ? (
                <ul className="space-y-1">
                  {step.missing.map((item, index) => <li key={`${index}-${item.text}`} className="text-sm text-neutral-700">{item.text}</li>)}
                </ul>
              ) : (
                step.id === 'review' && <p className="text-sm text-neutral-600">Todo está listo para publicar.</p>
              )}
              {step.notices.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-neutral-600">Avisos que no impiden publicar</p>
                  <ul className="space-y-1">
                    {step.notices.map((text, index) => <li key={`${index}-${text}`} className="text-sm text-neutral-600">{text}</li>)}
                  </ul>
                </div>
              )}
              {((fixSection && onGoToSection) || step.id === 'review') && (
                <div className="flex flex-wrap gap-2">
                  {fixSection && onGoToSection && (
                    <Button variant="secondary" className="min-h-11" onClick={() => onGoToSection(fixSection)}>Ir a corregir</Button>
                  )}
                  {step.id === 'review' && (
                    <>
                      <Button className="min-h-11" disabled={blocked} loading={action.isPending && action.variables === 'PUBLISH'} onClick={() => submit('PUBLISH')}>Publicar</Button>
                      <Button variant="secondary" className="min-h-11" disabled={blocked} onClick={() => openDialog('schedule')}>{scheduled ? 'Reprogramar' : 'Programar'}</Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-6" data-testid="library-publication-controls">
      {changesPending && <Alert variant="warning">{pricesPending ? 'Espera a que termine el cambio de precios antes de gestionar la publicación.' : 'Guarda o descarta los cambios de la ficha antes de gestionar su publicación.'}</Alert>}
      {notice && <div role="status"><Alert variant="success">{notice}</Alert></div>}
      {error && <Alert variant="error">{error}</Alert>}
      {steps && (checkError ?? loadError) && <Alert variant="error">{checkError ?? loadError}</Alert>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-neutral-600">{statusLine}</p>
        <div className="flex flex-wrap gap-2">
          {steps && (
            <Button variant="secondary" className="min-h-11" loading={check.isPending} onClick={() => check.mutate()}>
              {reportData ? 'Volver a validar' : 'Validar ficha'}
            </Button>
          )}
          {scheduled && <Button variant="secondary" className="min-h-11" disabled={blocked} onClick={() => openDialog('cancel')}>Cancelar programación</Button>}
          {allowed.includes('UNPUBLISH') && <Button variant="secondary" className="min-h-11" disabled={blocked} onClick={() => openDialog('unpublish')}>Despublicar</Button>}
        </div>
      </div>

      {steps ? (
        reportLoading ? <PublishStepsSkeleton /> : (
          <>
            <p className="sr-only" aria-live="polite">{announcement}</p>
            <ol aria-label="Pasos para publicar" className="divide-y divide-neutral-200 border-y border-neutral-200">
              {steps.map(renderStep)}
            </ol>
          </>
        )
      ) : reportLoading ? (
        <div role="status" aria-busy="true" className="py-2">
          <span className="sr-only">Cargando requisitos…</span>
          <span className="block h-4 w-48 max-w-full rounded bg-neutral-100 motion-safe:animate-pulse" aria-hidden="true" />
        </div>
      ) : (
        <details open={status !== 'PUBLISHED' || Boolean(error || report.isError || check.isError || reportData?.stale || summary.errors)} className="border-t border-neutral-200 pt-4">
          <summary className={summaryClass}>{summary.label}</summary>
          <div className="mt-3">
            {changesPending ? <p className="text-sm text-neutral-600">El informe corresponde a los últimos datos guardados. Guarda tus cambios para revisarlos.</p> : <ValidationPanel report={reportData ?? null} canEditSheet={false} validating={busy} error={checkError ?? loadError} onValidate={() => check.mutate()} />}
          </div>
        </details>
      )}

      <details className="border-t border-neutral-200 pt-4">
        <summary className={summaryClass}>Historial de publicación</summary>
        <div className="mt-4"><ProductPublicationSection productId={product.id} /></div>
      </details>
      <Modal open={dialog !== null} title={dialog === 'schedule' ? scheduled ? 'Reprogramar publicación' : 'Programar publicación' : dialog === 'cancel' ? 'Cancelar programación' : 'Despublicar producto'} onClose={() => { if (!busy) setDialog(null) }} footer={<><Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Volver</Button><Button variant={dialog === 'unpublish' ? 'danger' : 'primary'} disabled={blocked} loading={action.isPending} onClick={() => submit(dialog === 'schedule' ? 'SCHEDULE' : dialog === 'cancel' ? 'CANCEL' : 'UNPUBLISH')}>{dialog === 'schedule' ? 'Guardar programación' : dialog === 'cancel' ? 'Cancelar programación' : 'Despublicar'}</Button></>}>
        <div className="space-y-4">
          {dialog === 'schedule' ? <><p className="text-sm text-neutral-600">Elige cuándo se publicará la revisión. La hora corresponde a la zona de este navegador: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p><label className="block text-sm font-medium text-neutral-700" htmlFor="library-publication-date">Fecha y hora</label><input id="library-publication-date" type="datetime-local" value={when} disabled={busy} onChange={(event) => { setWhen(event.target.value); action.reset() }} className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]" /></> : <p className="text-sm text-neutral-600">{dialog === 'cancel' ? 'El producto seguirá en Borrador y no se publicará en la fecha programada.' : 'El producto dejará de estar publicado. Sus datos y archivos se conservan.'}</p>}
          {error && <Alert variant="error">{error}</Alert>}
        </div>
      </Modal>
    </div>
  )
}
