import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Table } from '../components/ui'
import CustomerStatusBadge from '../features/customers/components/CustomerStatusBadge'
import CustomerFormModal from '../features/customers/components/CustomerFormModal'
import { useCustomers } from '../features/customers/hooks/useCustomers'
import { useCustomerMutations } from '../features/customers/hooks/useCustomerMutations'
import { fetchUsers } from '../services/users.service'
import { useAuthStore } from '../stores/auth.store'
import { ROLES } from '../lib/roles'
import {
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_SOURCE_LABELS,
  type Customer,
  type CustomerFilters,
  type CustomerPayload,
  type CustomerStatus,
} from '../features/customers/types/customer.types'

const PAGE_SIZE = 20

const OWNER_COLUMN_ROLES: string[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN_COMERCIAL,
  ROLES.SUPERVISOR,
]

function formatDocument(customer: Customer): string {
  if (!customer.documentId) return '-'
  return customer.documentType
    ? `${customer.documentType} ${customer.documentId}`
    : customer.documentId
}

export default function CustomersPage({ personal = false }: { personal?: boolean }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | undefined>()
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)

  const currentUser = useAuthStore((state) => state.user)
  const showOwnerColumn = useMemo(
    () => !personal && OWNER_COLUMN_ROLES.some((r) => currentUser?.roles?.includes(r)),
    [currentUser, personal]
  )

  const filters: CustomerFilters = useMemo(
    () => ({ search: search || undefined, status: statusFilter, ownerId: personal ? currentUser?.id : undefined }),
    [search, statusFilter, personal, currentUser?.id]
  )

  const { customers, total, totalPages, isLoading, error } = useCustomers({
    filters,
    page,
    pageSize: PAGE_SIZE,
  })
  const { create, update, convert, remove } = useCustomerMutations()

  // Nombres de responsables para la columna "Responsable" (solo roles que ven
  // más de su propia cartera). Si la consulta falla, la columna muestra '—'.
  const ownersQuery = useQuery({
    queryKey: ['users', 'owners'],
    queryFn: () => fetchUsers(),
    enabled: showOwnerColumn,
    retry: false,
  })
  const ownerNames = useMemo(() => {
    const map = new Map<string, string>()
    ownersQuery.data?.forEach((u) => map.set(u.id, u.name || u.email))
    return map
  }, [ownersQuery.data])

  const submitting = create.isPending || update.isPending

  const handleSubmit = async (payload: CustomerPayload) => {
    if (editing) {
      await update.mutateAsync({ id: editing.id, payload })
    } else {
      await create.mutateAsync(payload)
    }
  }

  const handleConvert = (customer: Customer) => {
    if (window.confirm(`¿Convertir a "${customer.name}" de lead a cliente?`)) {
      convert.mutate(customer.id)
    }
  }

  const handleDelete = (customer: Customer) => {
    if (window.confirm(`¿Desactivar "${customer.name}"? Esta acción se puede revertir desde backend.`)) {
      remove.mutate(customer.id)
    }
  }

  const columns = useMemo(() => {
    const cols = [
      {
        key: 'code',
        header: 'Código',
        render: (c: Customer) => (
          <span className="font-mono text-xs text-neutral-500">{c.code}</span>
        ),
      },
      {
        key: 'name',
        header: 'Nombre',
        render: (c: Customer) => (
          <div className="min-w-0">
            <p className="font-medium text-neutral-800 truncate">{c.name}</p>
            {c.source && (
              <p className="text-xs text-neutral-400">
                {CUSTOMER_SOURCE_LABELS[c.source]}
                {c.sourceDetail ? ` · ${c.sourceDetail}` : ''}
              </p>
            )}
          </div>
        ),
      },
      { key: 'document', header: 'Documento', render: formatDocument },
      {
        key: 'contact',
        header: 'Contacto',
        render: (c: Customer) => (
          <div className="text-xs text-neutral-600">
            {c.email && <p className="truncate">{c.email}</p>}
            {c.phone && <p>{c.phone}</p>}
            {!c.email && !c.phone && <span className="text-neutral-400">-</span>}
          </div>
        ),
      },
      { key: 'city', header: 'Ciudad', render: (c: Customer) => c.city ?? '-' },
      {
        key: 'status',
        header: 'Estado',
        render: (c: Customer) => <CustomerStatusBadge status={c.status} />,
      },
    ]

    if (showOwnerColumn) {
      cols.push({
        key: 'owner',
        header: 'Responsable',
        render: (c: Customer) =>
          c.ownerId ? ownerNames.get(c.ownerId) ?? '—' : '—',
      })
    }

    cols.push({
      key: 'actions',
      header: 'Acciones',
      render: (c: Customer) => (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="px-2 py-1 text-xs"
            onClick={(event) => {
              event.stopPropagation()
              setEditing(c)
              setModalOpen(true)
            }}
          >
            Editar
          </Button>
          {c.status === 'LEAD' && (
            <Button
              type="button"
              variant="ghost"
              className="px-2 py-1 text-xs"
              disabled={convert.isPending}
              onClick={(event) => {
                event.stopPropagation()
                handleConvert(c)
              }}
            >
              Convertir
            </Button>
          )}
          {!personal && <Button
            type="button"
            variant="ghost"
            className="px-2 py-1 text-xs text-[var(--color-error)]"
            disabled={remove.isPending}
            onClick={(event) => {
              event.stopPropagation()
              handleDelete(c)
            }}
          >
            Eliminar
          </Button>}
        </div>
      ),
    })

    return cols
  }, [showOwnerColumn, ownerNames, convert.isPending, remove.isPending, personal]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-condensed font-semibold text-neutral-800">
            {personal ? 'Mis clientes y leads' : 'Clientes y leads'}
          </h1>
          <p className="text-sm text-neutral-500">
            {total} registro{total === 1 ? '' : 's'} en tu alcance
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
        >
          Nuevo cliente/lead
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            aria-hidden="true"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
            </svg>
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Buscar por nombre, código, documento, email o ciudad"
            aria-label="Buscar clientes"
            className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 pl-10 pr-4 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
          />
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filtrar por estado"
      >
        <button
          type="button"
          onClick={() => {
            setStatusFilter(undefined)
            setPage(1)
          }}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
            !statusFilter
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]'
              : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          Todos
        </button>
        {CUSTOMER_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => {
              setStatusFilter(status)
              setPage(1)
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
              statusFilter === status
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]'
                : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {CUSTOMER_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-[var(--color-error)]">
          No se pudieron cargar los clientes. Intenta de nuevo.
        </p>
      )}

      <Table
        columns={columns}
        data={customers}
        isLoading={isLoading}
        emptyMessage="No hay clientes ni leads con estos filtros"
        keyExtractor={(c) => c.id}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <CustomerFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        customer={editing}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
      />
    </div>
  )
}
