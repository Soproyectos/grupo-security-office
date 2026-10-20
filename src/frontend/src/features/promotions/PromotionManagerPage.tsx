import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { hasAssignedAction, useOwnUserAccess } from '../users/access'
import { extractBackendMessage } from '../quotes/hooks/useQuoteMutations'
import { fetchManagedPromotions, publishPromotion, publishDraftPromotion, withdrawPromotion, promotionDate, promotionStatus, promotionLocalTimeToIso, editPromotion, uploadPromotionFlyer, removePromotionFlyer, promotionInputTime, type ManagedPromotion } from './promotions.service'

function promotionErrorMessage(err: unknown): string {
  return err instanceof Error && !('response' in err) ? err.message : extractBackendMessage(err)
}

export default function PromotionManagerPage() {
  const user = useAuthStore(state => state.user)
  const { access, status } = useOwnUserAccess()
  const grants = access?.grants ?? []
  const can = (action: string) => hasAssignedAction({ roles: user?.roles, grants, status }, [action])
  const canRead = can('commercialPromotions:read')
  const canCreate = can('commercialPromotions:create')
  const canEdit = can('commercialPromotions:edit')
  const canPublish = can('commercialPromotions:publish')
  const canWithdraw = can('commercialPromotions:withdraw')
  const allowed = canCreate || canEdit || canPublish || canWithdraw
  const globalCreate = user?.roles.includes('Super Admin') || grants.some(grant => grant.actionId === 'commercialPromotions:create' && grant.scope === 'global')
  const client = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [flyer, setFlyer] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = useQuery({ queryKey: ['promotions', 'manage', user?.id], queryFn: fetchManagedPromotions, enabled: canRead })
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['promotions', 'manage'] })
    void client.invalidateQueries({ queryKey: ['sales', 'promotions'] })
  }
  const publish = useMutation({ mutationFn: publishPromotion, onSuccess: refresh })
  const withdraw = useMutation({ mutationFn: withdrawPromotion, onSuccess: () => { refresh(); setNotice('Aviso retirado de las promociones.'); },
    onError: err => setError(promotionErrorMessage(err)) })
  // COM-08: preparar no publica — el borrador se activa con una acción explícita.
  const publishDraft = useMutation({ mutationFn: publishDraftPromotion,
    onSuccess: () => { refresh(); setNotice('Aviso publicado: ya se muestra a sus destinatarios durante la vigencia.'); },
    onError: err => setError(promotionErrorMessage(err)) })
  if (status === 'loading') return <p role="status">Cargando tus accesos…</p>
  if (!allowed) return <p role="status">No tienes permiso para gestionar avisos.</p>

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const payload = { title: title.trim(), message: message.trim(),
        startsAt: promotionLocalTimeToIso(String(form.get('promotion-start') ?? '')),
        endsAt: promotionLocalTimeToIso(String(form.get('promotion-end') ?? '')) }
      const saved = editing ? await editPromotion(editing, payload) : await publish.mutateAsync(payload)
      // Retain the saved ID if image upload fails, so retry edits instead of duplicating the notice.
      setEditing(saved.id)
      if (flyer) await uploadPromotionFlyer(saved.id, flyer)
      refresh()
      setEditing(null); setFlyer(null)
      setNotice(editing
        ? 'Aviso actualizado.'
        : 'Aviso guardado como borrador. Pulsa «Publicar aviso» para mostrarlo a sus destinatarios.')
      setTitle(''); setMessage(''); setStartsAt(''); setEndsAt('')
    } catch (err) { setError(promotionErrorMessage(err)) } finally { setBusy(false) }
  }
  const startEdit = (promotion: ManagedPromotion) => {
    setEditing(promotion.id); setTitle(promotion.title); setMessage(promotion.message)
    setStartsAt(promotionInputTime(promotion.startsAt)); setEndsAt(promotionInputTime(promotion.endsAt))
    setFlyer(null); setNotice(null); setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold">Promociones para vendedores</h1>
        <p className="mt-1 text-sm">Los avisos aparecen destacados durante su vigencia cada vez que el vendedor entra o recarga su espacio.</p></div>
      {(canCreate || (editing && canEdit)) && <Card>
        <form onSubmit={submit} className="space-y-4">
          <h2 className="text-lg font-semibold">{editing ? 'Editar aviso' : 'Preparar aviso (borrador)'}</h2>
          <p className="text-sm">Destinatarios: {editing ? 'se conservan los del aviso original' : globalCreate ? 'todos los vendedores' : 'los vendedores de tu equipo'}.</p>
          <Input label="Título de la promoción" name="promotion-title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={120} />
          <div><label htmlFor="promotion-message" className="block text-sm font-medium">Promoción y condiciones</label>
            <textarea id="promotion-message" value={message} onChange={e => setMessage(e.target.value)} required maxLength={2000} rows={4}
              className="mt-2 w-full rounded-lg border border-neutral-300 p-3 text-sm" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Inicio (hora Colombia)" name="promotion-start" type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} required />
            <Input label="Fin (hora Colombia)" name="promotion-end" type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} required />
          </div>
          <div><label htmlFor="promotion-flyer" className="block text-sm font-medium">Flyer (PNG, JPEG o WebP · máximo 2 MB)</label>
            <input key={editing ?? 'new'} id="promotion-flyer" type="file" accept="image/png,image/jpeg,image/webp"
              onChange={e => { const file = e.target.files?.[0] ?? null; if (file && file.size > 2 * 1024 * 1024) { setError('El flyer debe pesar máximo 2 MB'); e.target.value = ''; setFlyer(null) } else setFlyer(file) }} />
          </div>
          <Button type="submit" loading={busy}>{editing ? 'Guardar cambios' : 'Guardar borrador'}</Button>
          {editing && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditing(null); setTitle(''); setMessage(''); setStartsAt(''); setEndsAt(''); setFlyer(null) }}>Cancelar edición</Button>}
        </form>
      </Card>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}
      <section aria-labelledby="published-promotions">
        <h2 id="published-promotions" className="mb-3 text-lg font-semibold">Avisos preparados y publicados</h2>
        {query.isPending ? <p>Cargando avisos…</p> : query.isError ? <p role="alert">{promotionErrorMessage(query.error)}</p>
          : !query.data.length ? <p>Todavía no hay avisos publicados.</p>
          : <ul className="space-y-3">{query.data.map(promotion => (
            <li key={promotion.id}><Card>
              <h3 className="font-semibold">{promotion.title}</h3><p className="mt-1 text-sm">{promotionStatus(promotion)}</p>
              {promotion.flyer && <img src={promotion.flyer} alt={`Flyer: ${promotion.title}`} className="mt-3 max-h-80 w-full object-contain" />}
              {canEdit && <Button type="button" variant="secondary" disabled={busy} onClick={() => startEdit(promotion)}>Editar aviso y flyer</Button>}
              {canEdit && promotion.flyer && <Button type="button" variant="secondary" disabled={busy} onClick={async () => { setBusy(true); try { await removePromotionFlyer(promotion.id); refresh() } catch (err) { setError(promotionErrorMessage(err)) } finally { setBusy(false) } }}>Quitar flyer</Button>}
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{promotion.message}</p>
              <p className="mt-2 text-xs">{promotionDate(promotion.startsAt)} — {promotionDate(promotion.endsAt)} · {promotion.audience === 'GLOBAL' ? 'Todos los vendedores' : 'Equipo del supervisor'}</p>
              {promotion.publishedAt === null && canPublish
                ? <Button type="button" className="mt-3" disabled={publishDraft.isPending} onClick={() => { setError(null); setNotice(null); publishDraft.mutate(promotion.id) }}>Publicar aviso</Button>
                : !promotion.isActive ? <p className="mt-2 text-sm">Retirada</p>
                : canWithdraw && promotion.publishedAt !== null ? <Button type="button" variant="secondary" className="mt-3" disabled={withdraw.isPending} onClick={() => { setError(null); setNotice(null); withdraw.mutate(promotion.id) }}>Retirar aviso</Button> : null}
            </Card></li>
          ))}</ul>}
      </section>
    </div>
  )
}
