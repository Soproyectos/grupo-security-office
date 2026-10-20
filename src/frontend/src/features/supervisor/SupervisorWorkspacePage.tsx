import AssignedReportsPage from '../../pages/AssignedReportsPage'

/**
 * La vista anterior mostraba vendedores, metas, facturas y pendientes
 * inventados en estado local. El resumen del equipo usa ahora el informe
 * respaldado por API, que presenta la fuente manual de facturas y los datos
 * de equipo solo cuando el servidor los autoriza.
 */
export default function SupervisorWorkspacePage() {
  return <AssignedReportsPage />
}
