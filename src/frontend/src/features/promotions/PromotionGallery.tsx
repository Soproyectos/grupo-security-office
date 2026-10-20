import { useRef, useState } from 'react'
import { promotionDate, type Promotion } from './promotions.service'

export default function PromotionGallery({ promotions }: { promotions: Promotion[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  if (!promotions.length) return <p className="mt-4 rounded-xl bg-white p-6 text-sm">No hay promociones vigentes publicadas para ti en este momento.</p>
  const index = Math.max(0, promotions.findIndex(p => p.id === selectedId))
  const selected = promotions[index]
  if (!selected) return null
  const move = (step: number) => setSelectedId(promotions[(index + step + promotions.length) % promotions.length]?.id ?? selected.id)
  return <div className="mt-5 space-y-4">
    <div className="grid overflow-hidden rounded-xl border border-[var(--color-border)] bg-white lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="relative flex min-h-64 items-center justify-center bg-neutral-100 p-4 sm:p-6">
        {selected.flyer ? <button type="button" aria-label={`Ampliar flyer: ${selected.title}`} onClick={() => dialog.current?.showModal()} className="w-full rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]">
          <img src={selected.flyer} alt={`Flyer: ${selected.title}`} className="mx-auto max-h-[55vh] w-full object-contain" />
        </button> : <div className="max-w-sm p-8 text-center"><p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-primary)]">Aviso comercial</p><p className="mt-4 text-2xl font-condensed font-semibold">{selected.title}</p></div>}
        <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm">{index + 1} / {promotions.length}</span>
      </div>
      <div className="flex min-w-0 flex-col justify-center p-5 sm:p-8" aria-live="polite">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">Promoción vigente</span>
        <h3 className="mt-3 break-words text-2xl font-condensed font-semibold">{selected.title}</h3>
        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-text-secondary)]">{selected.message}</p>
        <p className="mt-6 border-t border-[var(--color-border)] pt-4 text-xs">Vigente hasta {promotionDate(selected.endsAt)} · hora Colombia</p>
        {selected.flyer && <button type="button" onClick={() => dialog.current?.showModal()} className="mt-5 self-start rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">Ampliar flyer</button>}
      </div>
    </div>
    {promotions.length > 1 && <div className="flex items-center justify-between gap-3">
      <button type="button" aria-label="Promoción anterior" onClick={() => move(-1)} className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold">← Anterior</button>
      <span className="text-xs text-[var(--color-text-secondary)]">Elige una promoción</span>
      <button type="button" aria-label="Promoción siguiente" onClick={() => move(1)} className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold">Siguiente →</button>
    </div>}
    <ul aria-label="Galería de promociones" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {promotions.map((promotion, position) => <li key={promotion.id} className="min-w-0"><button type="button" aria-pressed={promotion.id === selected.id} onClick={() => setSelectedId(promotion.id)} className={`h-full w-full overflow-hidden rounded-xl border-2 bg-white text-left transition-colors ${promotion.id === selected.id ? 'border-[var(--color-primary)]' : 'border-transparent hover:border-neutral-300'}`}>
        {promotion.flyer ? <img src={promotion.flyer} alt="" className="h-28 w-full bg-neutral-100 object-contain p-2" /> : <div className="flex h-28 items-center justify-center bg-neutral-100 text-sm text-neutral-500">Aviso comercial</div>}
        <div className="p-3"><span className="text-xs text-neutral-500">Promoción {position + 1}</span><p className="mt-1 break-words text-sm font-semibold">{promotion.title}</p></div>
      </button></li>)}
    </ul>
    <dialog ref={dialog} aria-label={`Flyer: ${selected.title}`} className="m-auto max-w-none overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/60">
      {selected.flyer && <div className="relative"><img src={selected.flyer} alt={`Flyer: ${selected.title}`} className="max-h-[85vh] max-w-[calc(100vw_-_3rem)] object-contain" /><button type="button" aria-label="Cerrar flyer ampliado" onClick={() => dialog.current?.close()} className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-neutral-800 bg-white text-xl text-neutral-900 shadow-md">×</button></div>}
    </dialog>
  </div>
}

