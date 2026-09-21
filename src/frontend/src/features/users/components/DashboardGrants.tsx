import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../services/api'
import { PACKS, blocksInPack } from '../../dashboard/registry/blocks'
import { blockPermission, packPermission, type PackId } from '../../dashboard/registry/types'
import { StatusPill } from '../../../components/ui'

interface GrantedPermission {
  permission: string
  effect: string
  reason: string | null
}

const fetchGrants = async (userId: string): Promise<GrantedPermission[]> => {
  const res = await api.get(`/users/${userId}/dashboard-permissions`)
  return res.data.granted ?? []
}

/**
 * Concesiones de dashboard por usuario (fase 5).
 *
 * Modelo híbrido: el Super Admin marca **paquetes** y, si hace falta, despliega
 * y elige **bloques sueltos**. La casilla del paquete tiene tres estados —vacía,
 * parcial y completa— como el selector de carpetas de un explorador de archivos.
 *
 * La distinción importa por dentro: marcar el paquete guarda el paquete, que
 * crecerá solo cuando se añadan bloques nuevos al catálogo; marcar piezas
 * sueltas guarda esas piezas, que quedan congeladas. Es la diferencia entre
 * "que vea lo de ventas" y "le habilité estos dos informes".
 */
export default function DashboardGrants({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Set<PackId>>(new Set())
  const [draft, setDraft] = useState<Set<string> | null>(null)
  const [reason, setReason] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['users', userId, 'dashboard-permissions'],
    queryFn: () => fetchGrants(userId),
  })

  // El borrador arranca desde lo guardado y sólo existe mientras se edita.
  const selected = useMemo(
    () => draft ?? new Set((data ?? []).map((g) => g.permission)),
    [draft, data],
  )

  const mutation = useMutation({
    mutationFn: (permissions: string[]) =>
      api.put(`/users/${userId}/dashboard-permissions`, {
        permissions,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', userId, 'dashboard-permissions'] })
      setDraft(null)
      setReason('')
    },
  })

  const update = (fn: (next: Set<string>) => void) => {
    const next = new Set(selected)
    fn(next)
    setDraft(next)
  }

  /** Estado de la casilla del paquete, contando paquete completo y piezas. */
  const packState = (packId: PackId) => {
    if (selected.has(packPermission(packId))) {
      return { state: 'all' as const, count: blocksInPack(packId).length }
    }

    const count = blocksInPack(packId).filter((b) =>
      selected.has(blockPermission(b.id)),
    ).length

    return {
      state: count === 0 ? ('none' as const) : ('partial' as const),
      count,
    }
  }

  const togglePack = (packId: PackId) => {
    const { state } = packState(packId)

    update((next) => {
      // Al marcar el paquete se limpian sus piezas sueltas: conservarlas sería
      // redundante y haría que al desmarcar el paquete quedaran restos.
      blocksInPack(packId).forEach((b) => next.delete(blockPermission(b.id)))

      if (state === 'all') {
        next.delete(packPermission(packId))
      } else {
        next.add(packPermission(packId))
      }
    })
  }

  const toggleBlock = (packId: PackId, blockId: string) => {
    update((next) => {
      // Tocar una pieza degrada el paquete a piezas: se expande a sus bloques
      // y se quita el permiso de paquete, para que lo guardado refleje la
      // selección exacta y no crezca sola.
      if (next.has(packPermission(packId))) {
        next.delete(packPermission(packId))
        blocksInPack(packId).forEach((b) => next.add(blockPermission(b.id)))
      }

      const perm = blockPermission(blockId)
      next.has(perm) ? next.delete(perm) : next.add(perm)
    })
  }

  if (isLoading) {
    return <p className="text-caption text-ink-400">Cargando concesiones…</p>
  }

  if (error) {
    return (
      <p role="alert" className="text-caption text-[var(--color-error)]">
        No se pudieron cargar las concesiones.
      </p>
    )
  }

  const hasChanges = draft !== null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-panel-title text-ink-900">Paneles extra</h3>
        <p className="mt-1 text-caption text-ink-500">
          Bloques que este usuario verá <strong>además</strong> de los que le dan
          sus roles. Marca un paquete completo o despliégalo para elegir piezas.
        </p>
      </div>

      <div className="divide-y divide-surface-100 overflow-hidden rounded-panel border border-surface-200">
        {PACKS.map((pack) => {
          const { state, count } = packState(pack.id)
          const total = blocksInPack(pack.id).length
          const isOpen = expanded.has(pack.id)

          return (
            <div key={pack.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      next.has(pack.id) ? next.delete(pack.id) : next.add(pack.id)
                      return next
                    })
                  }
                  className="shrink-0 text-ink-400 hover:text-ink-700"
                  aria-label={isOpen ? `Contraer ${pack.title}` : `Desplegar ${pack.title}`}
                  aria-expanded={isOpen}
                >
                  {isOpen ? '▾' : '▸'}
                </button>

                <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={state === 'all'}
                    ref={(el) => {
                      // El estado "parcial" no es un valor de `checked`: es una
                      // propiedad aparte del elemento, y sólo puede fijarse por
                      // referencia.
                      if (el) el.indeterminate = state === 'partial'
                    }}
                    onChange={() => togglePack(pack.id)}
                    className="h-4 w-4 rounded border-surface-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                  />

                  <span className="text-body-sm font-semibold text-ink-900">{pack.title}</span>
                  <span className="text-micro text-ink-400">{pack.description}</span>
                </label>

                <StatusPill tone={state === 'all' ? 'success' : state === 'partial' ? 'warning' : 'neutral'}>
                  {count} de {total}
                </StatusPill>
              </div>

              {isOpen && (
                <ul className="bg-surface-50 px-4 pb-3 pl-12">
                  {blocksInPack(pack.id).map((block) => {
                    const checked =
                      selected.has(packPermission(pack.id)) ||
                      selected.has(blockPermission(block.id))

                    return (
                      <li key={block.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 py-1.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBlock(pack.id, block.id)}
                            className="h-3.5 w-3.5 rounded border-surface-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                          />
                          <span className="text-caption text-ink-700">{block.title}</span>
                          <span className="text-micro text-ink-400">
                            {block.kind === 'kpi' ? 'indicador' : 'panel'}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {hasChanges && (
        <div className="flex flex-col gap-3 rounded-panel border border-surface-200 bg-surface-50 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-semibold text-ink-700">
              Motivo (queda en auditoría)
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej.: necesita seguimiento de ventas para el reporte mensual"
              className="rounded-control border border-surface-300 px-3 py-2 text-body-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate([...selected])}
              className="rounded-control bg-[var(--color-primary)] px-4 py-2 text-body-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
            >
              {mutation.isPending ? 'Guardando…' : 'Guardar concesiones'}
            </button>

            <button
              type="button"
              onClick={() => {
                setDraft(null)
                setReason('')
              }}
              className="rounded-control px-4 py-2 text-body-sm font-medium text-ink-600 hover:text-ink-900"
            >
              Descartar
            </button>
          </div>

          {mutation.isError && (
            <p role="alert" className="text-caption text-[var(--color-error)]">
              No se pudieron guardar las concesiones.
            </p>
          )}
        </div>
      )}

      {mutation.isSuccess && !hasChanges && (
        <p className="text-caption text-[var(--color-success)]">
          Concesiones guardadas. Se aplican la próxima vez que el usuario inicie sesión.
        </p>
      )}
    </div>
  )
}
