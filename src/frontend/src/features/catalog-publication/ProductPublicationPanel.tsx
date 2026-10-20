import { useQuery } from '@tanstack/react-query'
import { Alert } from '../../components/ui'
import { fetchPublicationHistory } from './publication-api'
import { describePublicationEvent, type PublicationEventView } from './publication-model'

/** Presentacional: historial de publicación del producto (lo que el servidor registró). */
export function ProductPublicationPanel({ events, lines }: { events: PublicationEventView[] | null; lines: string[] | null }) {
  return (
    <div className="space-y-2" data-testid="publication-history-panel">
      {lines?.length ? (
        <Alert variant="warning">
          <span className="block font-medium">Último intento bloqueado por la validación:</span>
          <ul className="list-disc pl-4 text-xs">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {events === null ? (
        <p className="text-sm text-neutral-400">Cargando historial…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-neutral-400" data-testid="history-empty">Sin historial de publicación todavía.</p>
      ) : (
        <ul className="space-y-1">
          {events.map((ev, i) => (
            <li key={`${ev.action}-${ev.createdAt}-${i}`} className="text-xs text-neutral-600">
              {describePublicationEvent(ev)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Contenedor conectado al endpoint de historial (CAT-06 `frontend`). Las
 * acciones de publicar/retirar/programar viven en sus pestañas (mismo servicio
 * de servidor); aquí solo se CONSULTA lo que ese servicio registró.
 */
export function ProductPublicationSection({ productId }: { productId: string }) {
  const query = useQuery({
    queryKey: ['publication-history', productId],
    queryFn: () => fetchPublicationHistory(productId),
    refetchOnWindowFocus: false,
  })
  return (
    <section className="border border-neutral-200 rounded-xl p-5 space-y-3" aria-label="Historial de publicación">
      <div>
        <h3 className="text-base font-semibold text-neutral-800">Historial de publicación</h3>
        <p className="text-xs text-neutral-500 mt-0.5">
            Quién publicó/retiró/programó, qué revisión exacta y el resultado — incluido cada bloqueo (nunca se pierde en silencio).
        </p>
      </div>
      {query.isError && (
        <Alert variant="error">No se pudo cargar el historial: puede que el producto no esté en tu alcance.</Alert>
      )}
      <ProductPublicationPanel events={query.data ?? (query.isSuccess ? [] : null)} lines={null} />
    </section>
  )
}
