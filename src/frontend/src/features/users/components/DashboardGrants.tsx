import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../services/api'
import { PACKS, blocksInPack } from '../../dashboard/registry/blocks'
import { blockPermission, packPermission, type PackId } from '../../dashboard/registry/types'
import { StatusPill } from '../../../components/ui'
import {
  selectionFromGrants,
  packSelectionState,
  togglePackInSelection,
  toggleBlockInSelection,
  togglePermissionInSelection,
} from '../lib/grant-selection'

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
 * Permisos de configuración de tienda que se pueden conceder por usuario.
 *
 * `read` permite abrir la página `/storefront`; `write` permite editarla. Se
 * conceden por la misma vía que los paneles y sólo el Super Admin puede hacerlo.
 */
const STOREFRONT_PERMISSIONS = [
  {
    permission: 'storefront:read',
    title: 'Ver la configuración',
    description: 'Abrir los ajustes de la tienda sin poder guardarlos',
  },
  {
    permission: 'storefront:write',
    title: 'Editar la configuración',
    description: 'Cambiar teléfonos, correo, horarios y mensajes',
  },
]

/**
 * Concesiones por usuario (fase 5): paneles del dashboard y configuración de
 * tienda.
 *
 * Modelo híbrido: el Super Admin marca **paquetes** y, si hace falta, despliega
 * y elige **bloques sueltos**. La casilla del paquete tiene tres estados —vacía,
 * parcial y completa— como el selector de carpetas de un explorador de archivos.
 *
 * La distinción importa por dentro: marcar el paquete guarda el paquete, que
 * crecerá solo cuando se añadan bloques nuevos al catálogo; marcar piezas
 * sueltas guarda esas piezas, que quedan congeladas. Es la diferencia entre
 * "que vea lo de ventas" y "le habilité estos dos informes".
 *
 * Los permisos de tienda no tienen paquete ni piezas: son dos casillas sueltas
 * que comparten este mismo borrador y este mismo botón de guardar, porque el
 * endpoint sustituye el conjunto entero y mandarlo en dos listas obligaría a
 * coordinarlas para no perder la otra.
 *
 * La lógica de selección vive en `../lib/grant-selection`, donde es testeable:
 * el repo no tiene entorno DOM ni @testing-library, así que no se puede montar
 * el componente y pulsar sus casillas en un spec.
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
  const selected = useMemo(() => draft ?? selectionFromGrants(data ?? []), [draft, data])

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

  const togglePack = (packId: PackId) => setDraft(togglePackInSelection(selected, packId))

  const toggleBlock = (packId: PackId, blockId: string) =>
    setDraft(toggleBlockInSelection(selected, packId, blockId))

  const toggleStorefront = (permission: string) =>
    setDraft(togglePermissionInSelection(selected, permission))

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
          const { state, count } = packSelectionState(selected, pack.id)
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
                      if (next.has(pack.id)) {
                        next.delete(pack.id)
                      } else {
                        next.add(pack.id)
                      }
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

      <div>
        <h3 className="text-panel-title text-ink-900">Configuración de tienda</h3>
        <p className="mt-1 text-caption text-ink-500">
          Permisos sobre los datos de contacto que muestra la tienda pública.
        </p>
      </div>

      <div className="divide-y divide-surface-100 overflow-hidden rounded-panel border border-surface-200">
        {STOREFRONT_PERMISSIONS.map(({ permission, title, description }) => (
          <div key={permission} className="px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={selected.has(permission)}
                onChange={() => toggleStorefront(permission)}
                className="h-4 w-4 rounded border-surface-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <span className="text-body-sm font-semibold text-ink-900">{title}</span>
              <span className="text-micro text-ink-400">{description}</span>
            </label>
          </div>
        ))}
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
