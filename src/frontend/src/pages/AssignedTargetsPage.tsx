import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Input, Modal, Select, Table } from '../components/ui'
import {
  SALES_TARGET_CURRENCIES,
  dedupeTargets,
  fetchMemberInvoiced,
  fetchSalesTargets,
  salesTargetErrorMessage,
  targetPeriodLabel,
  targetsCanEdit,
  upsertSalesTargetInCache,
  type SalesTargetCurrency,
  type SalesTargetRow,
  type SalesTargetUpsertPayload,
} from '../services/dashboard-insights.service'
import { fetchUsers } from '../services/users.service'
import { useAuthStore } from '../stores/auth.store'

/**
 * COM-04 frontend — metas por integrante/periodo con trazabilidad del
 * responsable (`setBy`). Conecta `GET`/`POST /api/commercial/sales-targets`
 * SIN cambiar reglas desde el navegador: el servidor es la autoridad del
 * alcance (403 pintado con su mensaje) y la fuente de la meta.
 *
 * Meta ≠ avance (regla 3): la meta es `SalesTarget.amount` (dato fijado por
 * upsert); el avance facturado se deriva de la fuente real
 * `/dashboard/team/:userId` (mes en curso) y se pinta en una COLUMNA SEPARADA
 * — jamás se mezclan ni se calcula uno del otro.
 */

/** Formato es-CO determinista para el spec (sin depender de ICU del runtime). */
function formatMoney(amount: string): string {
  const [intPart, decimals] = amount.split('.')
  const withDots = (intPart ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decimals ? `${withDots},${decimals}` : withDots
}

/** Aviso de error de la página de metas: el mensaje del servidor si existe. */
export function TargetsErrorAlert({ error }: { error: unknown }) {
  if (!error) return null
  return <Alert variant="error">{salesTargetErrorMessage(error)}</Alert>
}

/**
 * Avance facturado del mes en curso para el integrante (fuente real separada).
 * Sin dato (error/403 fuera de jerarquía) se pinta «—»: no se inventa avance.
 */
export function MemberInvoicedCell({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ['member-invoiced', userId],
    queryFn: () => fetchMemberInvoiced(userId),
    retry: false,
    staleTime: 60_000,
  })

  if (query.isError || !query.data) {
    return <span className="text-neutral-400">—</span>
  }

  return (
    <span className="font-mono text-xs" title="Avance facturado del mes en curso (fuente: pedidos facturados)">
      {formatMoney(query.data.amount)} {query.data.currency}
      {query.data.mixedCurrency && <span className="text-amber-600" title="Incluye ventas en otra moneda">*</span>}
    </span>
  )
}

export interface TargetFormValues {
  userId: string
  period: string
  amount: string
  currency: SalesTargetCurrency | ''
  notes: string
}

export interface AssignedTargetsFormModalProps {
  open: boolean
  onClose: () => void
  members: Array<{ id: string; name: string | null; email: string | null }>
  initialValues?: TargetFormValues
  onSubmit: (payload: SalesTargetUpsertPayload) => void
  isSubmitting: boolean
  error?: unknown
}

function TargetForm({
  members,
  initialValues,
  onSubmit,
  isSubmitting,
}: Omit<AssignedTargetsFormModalProps, 'open' | 'onClose' | 'error'>) {
  const [userId, setUserId] = useState(initialValues?.userId ?? '')
  const [period, setPeriod] = useState(initialValues?.period ?? '')
  const [amount, setAmount] = useState(initialValues?.amount ?? '')
  const [currency, setCurrency] = useState<SalesTargetCurrency | ''>(initialValues?.currency ?? '')
  const [notes, setNotes] = useState(initialValues?.notes ?? '')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!userId || !period || !amount || !currency) return
    onSubmit({
      userId,
      period,
      amount,
      currency,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Select
        label="Integrante"
        name="userId"
        required
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        placeholder="Selecciona un integrante"
        options={members.map((m) => ({ value: m.id, label: m.name || m.email || m.id }))}
      />
      <Input
        label="Periodo (YYYY-MM)"
        name="period"
        required
        pattern="^\d{4}-(0[1-9]|1[0-2])$"
        title="Periodo con formato YYYY-MM (mes Bogotá)"
        placeholder="2026-10"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      />
      <Input
        label="Monto de la meta"
        name="amount"
        required
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Select
        label="Moneda"
        name="currency"
        required
        value={currency}
        onChange={(e) => setCurrency(e.target.value as SalesTargetCurrency)}
        placeholder="Moneda"
        options={SALES_TARGET_CURRENCIES.map((c) => ({ value: c, label: c }))}
      />
      <Input
        label="Notas (opcional)"
        name="notes"
        maxLength={500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
          Guardar meta
        </Button>
      </div>
    </form>
  )
}

export function AssignedTargetsFormModal({
  open,
  onClose,
  members,
  initialValues,
  onSubmit,
  isSubmitting,
  error,
}: AssignedTargetsFormModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={initialValues ? 'Editar meta' : 'Fijar meta'}>
      <TargetsErrorAlert error={error ?? null} />
      {/* `key` resetea el estado del formulario al abrir (editar ↔ nueva). */}
      <TargetForm
        key={open ? `${initialValues?.userId ?? 'nuevo'}:${initialValues?.period ?? ''}` : 'cerrado'}
        members={members}
        initialValues={initialValues}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
      />
    </Modal>
  )
}

export default function AssignedTargetsPage() {
  const currentUser = useAuthStore((state) => state.user)
  const canEdit = targetsCanEdit(currentUser)
  const client = useQueryClient()

  const [memberFilter, setMemberFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SalesTargetRow | null>(null)
  const [submitError, setSubmitError] = useState<unknown>(null)

  const targetsQuery = useQuery({
    queryKey: ['sales-targets', memberFilter],
    queryFn: () => fetchSalesTargets(memberFilter ? { userId: memberFilter } : {}),
    retry: false,
  })

  const rows = useMemo(() => dedupeTargets(targetsQuery.data ?? []), [targetsQuery.data])

  // Directorio de integrantes para los selectores (F3-heredado: `fetchUsers` se
  // consume sin gating de concesiones — el endpoint lo decide el servidor).
  const usersQuery = useQuery({
    queryKey: ['users', 'targets-directory'],
    queryFn: () => fetchUsers(),
    enabled: canEdit,
    retry: false,
    staleTime: 60_000,
  })

  const memberOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string | null; email: string | null }>()
    for (const u of usersQuery.data ?? []) byId.set(u.id, { id: u.id, name: u.name, email: u.email })
    for (const row of rows) {
      if (row.user && !byId.has(row.user.id)) byId.set(row.user.id, row.user)
    }
    return [...byId.values()]
  }, [usersQuery.data, rows])

  const upsert = useMutation({
    mutationFn: (payload: SalesTargetUpsertPayload) => upsertSalesTargetInCache(client, payload),
    onSuccess: () => {
      setSubmitError(null)
      setModalOpen(false)
      setEditing(null)
    },
    onError: (error) => setSubmitError(error),
  })

  const openNew = () => {
    setEditing(null)
    setSubmitError(null)
    setModalOpen(true)
  }

  const openEdit = (row: SalesTargetRow) => {
    setEditing(row)
    setSubmitError(null)
    setModalOpen(true)
  }

  const handleSubmit = (payload: SalesTargetUpsertPayload) => {
    upsert.mutate(payload)
  }

  const initialValues: TargetFormValues | undefined = editing
    ? {
        userId: editing.userId,
        period: targetPeriodLabel(editing.period),
        amount: editing.amount,
        currency: editing.currency as SalesTargetCurrency,
        notes: editing.notes ?? '',
      }
    : undefined

  const nameOf = (userId: string, fallback: SalesTargetRow['user']) =>
    fallback?.name ?? fallback?.email ?? userId

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-condensed font-semibold text-neutral-800">
            Metas por integrante
          </h1>
          <p className="text-sm text-neutral-500">
            {rows.length} meta{rows.length === 1 ? '' : 's'} en tu alcance · el avance facturado es
            una medida separada (mes en curso)
          </p>
        </div>
        {canEdit && (
          <Button type="button" onClick={openNew}>
            Fijar meta
          </Button>
        )}
      </div>

      {canEdit && (
        <div className="max-w-sm">
          <Select
            label="Filtrar por integrante"
            name="memberFilter"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            placeholder="Todos (en mi alcance)"
            options={memberOptions.map((m) => ({ value: m.id, label: m.name || m.email || m.id }))}
          />
        </div>
      )}

      <TargetsErrorAlert error={targetsQuery.isError ? targetsQuery.error : null} />

      <Table
        columns={[
          {
            key: 'member',
            header: 'Integrante',
            render: (row: SalesTargetRow) => (
              <span className="font-medium text-neutral-800">
                {nameOf(row.userId, row.user)}
              </span>
            ),
          },
          {
            key: 'period',
            header: 'Periodo',
            render: (row: SalesTargetRow) => (
              <span className="font-mono text-xs">{targetPeriodLabel(row.period)}</span>
            ),
          },
          {
            key: 'target',
            header: 'Meta',
            render: (row: SalesTargetRow) => (
              <span className="font-mono text-xs">
                {formatMoney(row.amount)} {row.currency}
              </span>
            ),
          },
          {
            key: 'invoiced',
            header: 'Avance facturado',
            render: (row: SalesTargetRow) => <MemberInvoicedCell userId={row.userId} />,
          },
          {
            key: 'setBy',
            header: 'Confirmado por',
            render: (row: SalesTargetRow) =>
              row.setBy?.name ?? row.setBy?.id ?? '—',
          },
          ...(canEdit
            ? [
                {
                  key: 'actions',
                  header: 'Acciones',
                  render: (row: SalesTargetRow) => (
                    <Button
                      type="button"
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      onClick={() => openEdit(row)}
                    >
                      Editar
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
        data={rows}
        isLoading={targetsQuery.isPending}
        emptyMessage="No hay metas en tu alcance"
        keyExtractor={(row: SalesTargetRow) => `${row.userId}|${targetPeriodLabel(row.period)}`}
      />

      <AssignedTargetsFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        members={memberOptions}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        isSubmitting={upsert.isPending}
        error={submitError}
      />
    </div>
  )
}
