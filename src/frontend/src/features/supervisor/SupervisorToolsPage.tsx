import TeamWorkflowPage from './TeamWorkflowPage'

/** Compatibilidad con las rutas antiguas; delega en el flujo persistido del API. */
export default function SupervisorToolsPage({ kind }: { kind: 'agenda' | 'requests' }) {
  return <TeamWorkflowPage kind={kind} />
}
