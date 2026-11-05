import { useQuery } from '@tanstack/react-query'
import { Button } from '../../components/ui'
import { extractBackendMessage } from '../quotes/hooks/useQuoteMutations'
import CampaignSection from './CampaignSection'
import { campaignsKey, fetchCampaigns } from './marketing-api'
import { useMarketingPermissions } from './marketing-access'

/** Page «Banners»: two selection cards, banners de inicio (carrusel de /tienda) and pop-up. */
export default function BannersTab() {
  const { permissions } = useMarketingPermissions()
  const query = useQuery({ queryKey: campaignsKey, queryFn: fetchCampaigns, enabled: permissions.read })

  if (!permissions.read) return <p role="status">No tienes permiso para ver los banners.</p>
  if (query.isPending) return <p role="status">Cargando banners…</p>
  if (query.isError) {
    return (
      <div role="alert" className="space-y-2 text-sm text-[var(--color-error)]">
        <p>{extractBackendMessage(query.error)}</p>
        <Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => void query.refetch()}>Reintentar</Button>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Banners</h2>
      <p className="text-sm text-[var(--color-text-secondary)]">Elige qué quieres cambiar. Al crear o editar se abre un panel a la derecha.</p>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <CampaignSection kind="HERO" campaigns={query.data} permissions={permissions} />
        <CampaignSection kind="POPUP" campaigns={query.data} permissions={permissions} />
      </div>
    </div>
  )
}
