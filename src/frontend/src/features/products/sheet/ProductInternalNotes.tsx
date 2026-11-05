import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button } from '../../../components/ui'
import { useHasPermission } from '../../../lib/rbac'
import { LIMITS } from './sheet-form'
import {
  createInternalNote,
  fetchInternalNotes,
  internalNoteKeys,
  updateInternalNote,
  type InternalNoteApi,
} from './sheet.service'

const BLOCKED_MESSAGE = 'Guarda o descarta los cambios de la ficha pública antes de editar las notas.'
const NO_ACCESS_MESSAGE = 'No tienes acceso a las notas internas.'

const dateFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

/** Formats an ISO date for the note header; falls back to the raw value when it is not a date. */
export function formatNoteDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
}

interface ApiErrorShape { response?: { status?: number; data?: { code?: string } } }
const errorStatus = (error: unknown) => (error as ApiErrorShape | null)?.response?.status
const errorCode = (error: unknown) => (error as ApiErrorShape | null)?.response?.data?.code

/** Plain-Spanish message for a failed write; never exposes internal codes. */
export function noteErrorMessage(error: unknown): string {
  const status = errorStatus(error)
  const code = errorCode(error)
  if (status === 403) return code === 'INTERNAL_NOTE_NOT_AUTHOR' ? 'Solo quien escribió la nota puede editarla.' : NO_ACCESS_MESSAGE
  if (status === 404) return 'La nota ya no existe. Recarga las notas para ver la lista actual.'
  if (status === 400) {
    if (code === 'INTERNAL_NOTE_EMPTY') return 'Escribe el texto de la nota.'
    if (code === 'INTERNAL_NOTE_TOO_LONG') return `La nota no puede superar ${LIMITS.internalNotes} caracteres.`
  }
  return 'No se pudo guardar la nota.'
}

const CONFLICT_MESSAGE = 'La nota cambió mientras la editabas. Recárgala para guardar tu texto sobre la versión vigente.'

/** Textarea with a persistent label, a character counter and automatic focus on mount. */
function NoteField({ id, label, value, onChange, disabled }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  return <div className="space-y-1">
    <label htmlFor={id} className="block text-sm font-medium text-neutral-700">{label}</label>
    <textarea id={id} ref={ref} rows={5} maxLength={LIMITS.internalNotes} value={value} disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-neutral-300 bg-white p-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]" />
    <p className="text-right text-xs tabular-nums text-neutral-600">{value.length} / {LIMITS.internalNotes}</p>
  </div>
}

/** One note: author, dates and text; the author also gets an edit button. */
export function InternalNoteCard({ note, blocked, onEdit }: {
  note: InternalNoteApi
  blocked: boolean
  onEdit: () => void
}) {
  return <li className="rounded-lg border border-neutral-300 bg-white p-4" data-testid="internal-note">
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900">{note.authorName}</p>
        <p className="text-xs text-neutral-600">
          <time dateTime={note.createdAt}>{formatNoteDate(note.createdAt)}</time>
          {note.updatedAt && <> · Editada <time dateTime={note.updatedAt}>{formatNoteDate(note.updatedAt)}</time></>}
        </p>
      </div>
      {note.canEdit && <Button variant="secondary" className="min-h-[44px]" disabled={blocked} onClick={onEdit}>Editar</Button>}
    </div>
    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-800">{note.text}</p>
  </li>
}

/**
 * Internal notes of a product: every note, newest first, each in its own box.
 * Anyone with access can write a note; only the author can edit it.
 * `defaultEditing` opens the new-note field; `defaultEditingNoteId` opens that note in edit mode (SSR tests).
 */
export function ProductInternalNotes({ productId, blocked = false, onDirtyChange, defaultEditing = false, defaultEditingNoteId = null }: {
  productId: string
  blocked?: boolean
  onDirtyChange: (dirty: boolean) => void
  defaultEditing?: boolean
  defaultEditingNoteId?: string | null
}) {
  const client = useQueryClient()
  const canWrite = useHasPermission('products:write')
  const canReadNotes = useHasPermission('products:notes')
  const allowed = canWrite && canReadNotes
  const listKey = internalNoteKeys.list(productId)
  const query = useQuery({
    queryKey: listKey,
    queryFn: () => fetchInternalNotes(productId),
    enabled: allowed,
    refetchOnWindowFocus: false,
    retry: false,
    // A failed load stays visible with its own retry button instead of silently refetching on remount.
    retryOnMount: false,
  })
  const notes = query.data ?? []

  const [composing, setComposing] = useState(defaultEditing)
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(defaultEditingNoteId)
  const [editText, setEditText] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const editingNote = editingId ? notes.find((note) => note.id === editingId) : undefined
  const editValue = editText ?? editingNote?.text ?? ''
  const editDirty = editingNote !== undefined && editText !== null && editText !== editingNote.text

  const refreshAfterWrite = () => {
    void client.invalidateQueries({ queryKey: listKey })
    void client.invalidateQueries({ queryKey: ['product-audit', productId] })
  }

  const create = useMutation({
    mutationFn: () => createInternalNote(productId, newText.trim()),
    onSuccess: (created) => {
      client.setQueryData<InternalNoteApi[]>(listKey, (old) => [created, ...(old ?? [])])
      setNewText('')
      setComposing(false)
      setNotice('Nota guardada.')
      refreshAfterWrite()
    },
  })
  const update = useMutation({
    mutationFn: () => {
      if (!editingNote) throw new Error('missing-note')
      return updateInternalNote(productId, editingNote.id, editValue.trim(), editingNote.version)
    },
    onSuccess: (saved) => {
      client.setQueryData<InternalNoteApi[]>(listKey, (old) => (old ?? []).map((note) => (note.id === saved.id ? saved : note)))
      setEditingId(null)
      setEditText(null)
      setNotice('Cambios guardados.')
      refreshAfterWrite()
    },
  })

  const dirty = (composing && newText.length > 0) || editDirty
  const busy = create.isPending || update.isPending
  useEffect(() => {
    onDirtyChange(dirty || busy)
    return () => onDirtyChange(false)
  }, [dirty, busy, onDirtyChange])

  if (!allowed) return null
  if (query.isLoading) {
    return <div role="status" className="space-y-3">
      <p className="text-sm text-neutral-600">Cargando notas internas…</p>
      <div aria-hidden="true" className="h-20 animate-pulse rounded-lg bg-neutral-200" />
    </div>
  }
  if (query.isError) {
    if (errorStatus(query.error) === 403) return <p className="text-sm text-neutral-700">{NO_ACCESS_MESSAGE}</p>
    return <div className="space-y-3">
      <Alert variant="error">No se pudieron cargar las notas internas.</Alert>
      <Button variant="secondary" className="min-h-[44px]" onClick={() => void query.refetch()}>Reintentar</Button>
    </div>
  }

  const conflict = update.isError && errorStatus(update.error) === 409
  const startCompose = () => { create.reset(); setNotice(null); setComposing(true) }
  const cancelCompose = () => { create.reset(); setNewText(''); setComposing(false) }
  const startEdit = (note: InternalNoteApi) => { update.reset(); setNotice(null); setEditingId(note.id); setEditText(note.text) }
  const cancelEdit = () => { update.reset(); setEditingId(null); setEditText(null) }
  /** Reloads the list while keeping the typed text; the next save uses the fresh version. */
  const reloadKeepingText = () => { update.reset(); void query.refetch() }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-neutral-600">Son privadas: nunca aparecen en la tienda.</p>
      <Button className="min-h-[44px]" disabled={blocked || composing} onClick={startCompose}>Escribir nota</Button>
    </div>
    {blocked && <p role="status" className="text-sm text-amber-700">{BLOCKED_MESSAGE}</p>}
    {notice && <div role="status"><Alert variant="success">{notice}</Alert></div>}

    {composing && <form className="space-y-3 rounded-lg border border-neutral-300 bg-white p-4"
      onSubmit={(event) => { event.preventDefault(); if (newText.trim() && !blocked) create.mutate() }}>
      <NoteField id="internal-note-new" label="Nueva nota" value={newText} disabled={create.isPending}
        onChange={(value) => { setNewText(value); create.reset() }} />
      {create.isError && <div role="alert"><Alert variant="error">{noteErrorMessage(create.error)}</Alert></div>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-[44px]" disabled={!newText.trim() || blocked} loading={create.isPending}>Guardar nota</Button>
        <Button type="button" variant="secondary" className="min-h-[44px]" disabled={create.isPending} onClick={cancelCompose}>Cancelar</Button>
      </div>
    </form>}

    {notes.length === 0
      ? <p className="text-sm text-neutral-600">Aún no hay notas para este producto.</p>
      : <ul className="space-y-3">
        {notes.map((note) => note.id === editingId
          ? <li key={note.id} className="rounded-lg border border-neutral-300 bg-white p-4" data-testid="internal-note-editing">
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (editValue.trim() && !blocked) update.mutate() }}>
              <p className="text-sm font-medium text-neutral-900">{note.authorName}</p>
              <NoteField id={`internal-note-edit-${note.id}`} label="Texto de la nota" value={editValue} disabled={update.isPending}
                onChange={(value) => { setEditText(value); update.reset() }} />
              {update.isError && <div role="alert"><Alert variant="error">{conflict ? CONFLICT_MESSAGE : noteErrorMessage(update.error)}</Alert></div>}
              {conflict && <Button type="button" variant="secondary" className="min-h-[44px]" onClick={reloadKeepingText}>Recargar nota conservando mi texto</Button>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="min-h-[44px]" disabled={!editValue.trim() || !editDirty || blocked} loading={update.isPending}>Guardar cambios</Button>
                <Button type="button" variant="secondary" className="min-h-[44px]" disabled={update.isPending} onClick={cancelEdit}>Cancelar</Button>
              </div>
            </form>
          </li>
          : <InternalNoteCard key={note.id} note={note} blocked={blocked} onEdit={() => startEdit(note)} />)}
      </ul>}
  </div>
}
