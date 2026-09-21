import { useMemo } from 'react'
import { useAuthStore } from '../../../stores/auth.store'
import { composeDashboard } from '../registry/compose'
import type { DashboardBlock } from '../registry/types'

/**
 * Compositor del dashboard.
 *
 * Recorre el catálogo de bloques, se queda con los que el usuario tiene
 * permitidos, resuelve el alcance y los ordena. No contiene ninguna decisión
 * por rol: toda la visibilidad vive en el registro y en los permisos del JWT.
 *
 * Añadir un bloque es una entrada en `registry/blocks.ts`, nunca un `if` aquí.
 */
export default function DashboardComposer({
  fallback,
}: {
  /** Panel a mostrar mientras el catálogo no tenga bloques implementados. */
  fallback: React.ReactNode
}) {
  const user = useAuthStore((state) => state.user)

  const composed = useMemo(
    () =>
      composeDashboard({
        roles: user?.roles ?? [],
        permissions: user?.permissions ?? [],
      }),
    [user?.roles, user?.permissions],
  )

  if (composed.isEmpty) {
    return <EmptyDashboard />
  }

  // Durante las fases 3, 4 y 6 el catálogo declara más bloques de los que
  // tienen componente. Mientras no haya ninguno implementado, se sirve el panel
  // anterior para no dejar al usuario con una pantalla en blanco.
  if (composed.kpis.length === 0 && composed.panels.length === 0) {
    return <>{fallback}</>
  }

  return (
    <div className="space-y-6">
      {composed.kpis.length > 0 && (
        <section aria-label="Indicadores del panel">
          <h2 className="mb-4 text-lg font-bold text-[var(--color-text-primary)]">
            Indicadores
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {composed.kpis.map((block) => (
              <BlockRenderer key={block.id} block={block} />
            ))}
          </div>
        </section>
      )}

      {composed.panels.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {composed.panels.map((block) => (
            <div
              key={block.id}
              className={block.span === 'full' ? 'lg:col-span-2' : undefined}
            >
              <BlockRenderer block={block} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Renderiza un bloque inyectándole el alcance que resolvió el compositor. */
function BlockRenderer({ block }: { block: DashboardBlock }) {
  const Component = block.component

  if (!Component) return null

  return <Component scope={block.scope} />
}

/**
 * Un usuario sin ningún bloque concedido no ve una pantalla rota, sino una
 * explicación de qué hacer. Ocurre con un rol recién creado al que todavía no
 * se le asignó ningún paquete.
 */
function EmptyDashboard() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-10 text-center">
      <h1 className="text-xl font-bold text-[var(--color-text-primary)]">
        Tu panel aún no tiene contenido asignado
      </h1>

      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-secondary)]">
        Tu cuenta no tiene ningún bloque de dashboard habilitado. Solicita a un
        administrador que te asigne los paneles que necesitas para tu trabajo.
      </p>
    </div>
  )
}
