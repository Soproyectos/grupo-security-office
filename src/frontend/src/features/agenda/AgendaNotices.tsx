/**
 * Small, stateless notices of the agenda page (kept apart so they can be
 * rendered and asserted without opening the page's dialog).
 */

/** Shown when the server cut the list at its cap (`X-Total-Truncated: true`). */
export function AgendaTruncatedNotice({ limit }: { limit?: number | null }) {
  const shown = new Intl.NumberFormat('es-CO').format(limit ?? 1000)
  return (
    <p
      role="status"
      className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-bg-subtle)] px-3 py-2 text-sm text-neutral-800"
    >
      Se muestran las primeras {shown} tareas; las más recientes no aparecen. Usa los filtros para acotar la búsqueda.
    </p>
  )
}

/**
 * Guidance when nothing is listed. The wording tells apart: a person with no
 * team, a team with no tasks, filters that hide everything and a first use.
 */
export function AgendaEmptyState({
  teamView,
  noTeam,
  hasRowsInScope,
  canCreate,
}: {
  teamView: boolean
  /** Team view, and the directory is empty (or only the person themself). */
  noTeam: boolean
  /** There are activities in this scope, but the current filters hide them. */
  hasRowsInScope: boolean
  canCreate: boolean
}) {
  let text: string
  if (teamView && noTeam) {
    text = 'Todavía no tienes personas a tu cargo. Cuando alguien quede en tu equipo, sus tareas aparecerán aquí.'
  } else if (hasRowsInScope) {
    text = 'Ninguna tarea coincide con los filtros. Cambia el tipo o el estado para ver más.'
  } else if (teamView) {
    text = 'Tu equipo todavía no tiene tareas. Aparecerán aquí cuando alguien programe una llamada, visita o seguimiento.'
  } else {
    text = canCreate
      ? 'Todavía no tienes tareas. Pulsa «Crear actividad» para programar una llamada, visita o seguimiento.'
      : 'Todavía no tienes tareas en tu agenda.'
  }
  return (
    <p role="status" className="rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-3 text-sm text-neutral-600">
      {text}
    </p>
  )
}
