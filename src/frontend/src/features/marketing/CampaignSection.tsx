import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Drawer } from '../../components/ui'
import { extractBackendMessage } from '../quotes/hooks/useQuoteMutations'
import CampaignEditor from './CampaignEditor'
import CampaignPreview, { type PreviewProps } from './CampaignPreview'
import { campaignKey, campaignsKey, fetchCampaign, type CampaignDetail, type CampaignSummary } from './marketing-api'
import { canLeave } from './unsaved-guard'
import type { MarketingPermissions } from './marketing-access'
import { MAX_PUBLISHED, campaignStatus, validityText, type CampaignKind } from './marketing-rules'

const COPY: Record<CampaignKind, {
  id: string
  title: string
  noun: string
  help: string
  newLabel: string
  emptyCreate: string
  emptyView: string
}> = {
  HERO: {
    id: 'banners-hero',
    title: 'Banners de inicio',
    noun: 'banner',
    help: 'Carrusel de imágenes que se ve arriba, en la portada de la tienda. Se muestran por orden.',
    newLabel: 'Nuevo banner',
    emptyCreate: 'Aún no hay banners. Crea el primero.',
    emptyView: 'Aún no hay banners.',
  },
  POPUP: {
    id: 'banners-popup',
    title: 'Pop-up',
    noun: 'pop-up',
    help: 'Una sola imagen que aparece como ventana emergente sobre la tienda.',
    newLabel: 'Nuevo pop-up',
    emptyCreate: 'Aún no hay pop-ups. Crea el primero.',
    emptyView: 'Aún no hay pop-ups.',
  },
}

interface SectionProps {
  kind: CampaignKind
  campaigns: CampaignSummary[]
  permissions: MarketingPermissions
}

/** One selection card of the Banners page: its list, and the side drawer with the editor of the chosen piece. */
export default function CampaignSection({ kind, campaigns, permissions }: SectionProps) {
  const client = useQueryClient()
  const copy = COPY[kind]
  const [selected, setSelected] = useState<string | 'new' | null>(null)
  // Bumped only on open, close and reload: creating a draft keeps the editor mounted.
  const [editorKey, setEditorKey] = useState(0)
  const selectedId = selected && selected !== 'new' ? selected : null
  // The editor reports unsaved changes here; closing asks before discarding them.
  const dirtyRef = useRef(false)
  // Live preview data reported by the editor; shown beside the drawer, over the dimmed page.
  const [preview, setPreview] = useState<PreviewProps | null>(null)
  const detailQuery = useQuery({
    queryKey: campaignKey(selectedId ?? 'none'),
    queryFn: () => fetchCampaign(selectedId as string),
    enabled: !!selectedId,
  })
  const items = campaigns.filter((campaign) => campaign.kind === kind).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'es'))

  const open = (id: string | 'new') => {
    setSelected(id)
    setEditorKey((value) => value + 1)
  }
  const close = () => {
    dirtyRef.current = false
    setSelected(null)
    setEditorKey((value) => value + 1)
  }
  const requestClose = () => {
    if (canLeave(dirtyRef.current, (message) => window.confirm(message))) close()
  }
  const reload = async () => {
    await client.invalidateQueries({ queryKey: campaignsKey })
    if (selectedId) await client.invalidateQueries({ queryKey: campaignKey(selectedId) })
    setEditorKey((value) => value + 1)
  }
  const saved = (detail: CampaignDetail) => setSelected(detail.id)

  const detail = selectedId ? detailQuery.data ?? null : null
  const editorReady = selected === 'new' || (selectedId && detail)
  const published = items.filter((item) => item.status === 'PUBLISHED').length
  const drawerTitle = selected === 'new' ? copy.newLabel : `${permissions.edit ? 'Editar' : 'Ver'} ${copy.noun}`

  return (
    <section aria-labelledby={`${copy.id}-title`}>
    <Card className="space-y-4">
      <div className="space-y-1">
        <h2 id={`${copy.id}-title`} className="text-lg font-semibold">{copy.title}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">{copy.help}</p>
        <p className="text-sm font-medium" data-testid={`${copy.id}-count`}>
          Publicados: {published} de {MAX_PUBLISHED[kind]} {MAX_PUBLISHED[kind] === 1 ? 'permitido' : 'permitidos'}
        </p>
      </div>
      {permissions.create && (
        <Button type="button" className="min-h-[44px]" onClick={() => open('new')}>{copy.newLabel}</Button>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-text-secondary)]">
          {permissions.create ? copy.emptyCreate : copy.emptyView}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const status = campaignStatus(item)
            return (
              <li key={item.id}>
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] p-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="break-words text-sm font-semibold">
                      {kind === 'HERO' && <span className="mr-2 text-xs font-normal text-[var(--color-text-secondary)]">Orden {item.position}</span>}
                      {item.name}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">{validityText(item.startsAt, item.endsAt)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={status.tone}>{status.label}</Badge>
                      {status.extra && <Badge variant="warning">{status.extra}</Badge>}
                    </div>
                  </div>
                  <Button type="button" variant="secondary" className="min-h-[44px]" aria-label={`${permissions.edit ? 'Editar' : 'Ver'} ${item.name}`} onClick={() => open(item.id)}>
                    {permissions.edit ? 'Editar' : 'Ver'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Drawer open={!!selected} onClose={requestClose} title={drawerTitle} aside={editorReady && preview ? <CampaignPreview {...preview} /> : undefined}>
        {selectedId && detailQuery.isPending && <p role="status" className="text-sm">Cargando…</p>}
        {selectedId && detailQuery.isError && (
          <div role="alert" className="space-y-2 text-sm text-[var(--color-error)]">
            <p>{extractBackendMessage(detailQuery.error)}</p>
            <Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => void detailQuery.refetch()}>Reintentar</Button>
          </div>
        )}
        {editorReady && (
          <CampaignEditor
            key={`${kind}-${editorKey}`}
            kind={kind}
            detail={detail}
            permissions={permissions}
            onSaved={saved}
            onClose={requestClose}
            onDeleted={close}
            onReload={reload}
            onDirtyChange={(value) => { dirtyRef.current = value }}
            onPreviewChange={setPreview}
          />
        )}
      </Drawer>
    </Card>
    </section>
  )
}
