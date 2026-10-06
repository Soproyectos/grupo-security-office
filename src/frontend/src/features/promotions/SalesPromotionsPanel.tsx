import PromotionGallery from './PromotionGallery'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth.store'
import { fetchCurrentPromotions, type Promotion } from './promotions.service'

export function PromotionNotices({ promotions }: { promotions: Promotion[] }) { return <PromotionGallery promotions={promotions} /> }

export default function SalesPromotionsPanel({ showPanel = false }: { showPanel?: boolean }) {
  const userId = useAuthStore(state => state.user?.id)
  const query = useQuery({
    queryKey: ['sales', 'promotions', userId],
    queryFn: fetchCurrentPromotions,
    enabled: !!userId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  })
  const popupPromotion = query.data?.find(promotion => !!promotion.flyer)
  const dialog = useRef<HTMLDialogElement>(null)
  const openedFor = useRef<string | null>(null)
  useEffect(() => {
    if (userId && query.isSuccess && popupPromotion && openedFor.current !== userId) {
      openedFor.current = userId
      dialog.current?.showModal()
    }
  }, [userId, query.isSuccess, popupPromotion])
  return (
    <>
    <dialog ref={dialog} aria-label={popupPromotion?.title ?? 'Promoción vigente'}
      className="m-auto max-w-none overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/60">
      {popupPromotion?.flyer && <div className="relative">
        <img src={popupPromotion.flyer} alt={popupPromotion.title}
          className="block h-auto w-auto max-h-[85vh] max-w-[calc(100vw_-_3rem)] object-contain" />
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar promoción"
          className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-neutral-800 bg-white text-neutral-900 shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>}
    </dialog>
    {showPanel && <section aria-labelledby="sales-promotions-heading"
      className="mb-6 rounded-xl border border-[var(--color-border)] border-t-4 border-t-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="sales-promotions-heading" className="text-xl font-semibold">Promociones vigentes</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Ten presentes estas promociones al conversar con tus clientes.</p></div>
        <button type="button" className="text-sm font-semibold underline disabled:opacity-50" disabled={!popupPromotion} onClick={() => dialog.current?.showModal()}>Ver flyer</button>
        <Link to="/sales/quotes" className="text-sm font-semibold text-[var(--color-primary)]">Ir a mis cotizaciones</Link>
      </div>
      {query.isPending ? <p aria-busy="true" className="mt-3 text-sm">Consultando promociones vigentes…</p>
        : query.isError ? <div className="mt-3"><p role="alert">No se pudieron consultar las promociones vigentes.</p>
          <button type="button" className="mt-2 underline" onClick={() => void query.refetch()}>Reintentar</button></div>
        : <PromotionNotices promotions={query.data} />}
    </section>}
    </>
  )
}
