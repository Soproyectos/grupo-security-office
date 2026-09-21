import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { canViewUsers, hasRole } from '../lib/rbac'
import { ROLES } from '../lib/roles'
import { getApiErrorMessage } from '../lib/apiError'
import {
  updateUserSupervisor,
} from '../services/users.service'
import {
  fetchRoles,
  fetchRole,
  createRole,
  updateRole,
  deleteRole,
  type Role,
  type RolePayload,
} from '../services/roles.service'
import { Modal } from '../components/ui'
import DashboardGrants from '../features/users/components/DashboardGrants'

interface User {
  id: string
  name: string
  email: string
  isActive: boolean
  supervisorId?: string | null
  roles: { id: string; name: string }[]
}

const PERMISSION_GROUPS: { label: string; permissions: string[] }[] = [
  { label: 'Productos', permissions: ['products:read', 'products:write', 'products:delete'] },
  { label: 'Categorías', permissions: ['categories:read', 'categories:write'] },
  { label: 'Marcas', permissions: ['brands:read', 'brands:write'] },
  { label: 'Precios', permissions: ['prices:read', 'prices:write'] },
  { label: 'Usuarios', permissions: ['users:read', 'users:write', 'users:manage'] },
  { label: 'Auditoría', permissions: ['audit:read'] },
  { label: 'Publicación', permissions: ['publish:manage'] },
]

type MatrixRule =
  | { kind: 'permission'; permission: string }
  | { kind: 'roles'; roles: string[] }

const ACCESS_MATRIX: { section: string; rule?: MatrixRule }[] = [
  { section: 'Dashboard: Indicadores', rule: { kind: 'permission', permission: 'products:read' } },
  { section: 'Dashboard: Últimos productos', rule: { kind: 'permission', permission: 'products:read' } },
  { section: 'Dashboard: Pendientes publicación', rule: { kind: 'permission', permission: 'publish:manage' } },
  { section: 'Dashboard: Usuarios', rule: { kind: 'roles', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN_COMERCIAL] } },
  { section: 'Dashboard: Auditoría', rule: { kind: 'roles', roles: [ROLES.SUPER_ADMIN, ROLES.SUPERVISOR, ROLES.ADMIN_COMERCIAL] } },
  { section: 'Menú: Productos', rule: { kind: 'permission', permission: 'products:read' } },
  { section: 'Menú: Listas', rule: { kind: 'roles', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN_COMERCIAL] } },
  { section: 'Menú: Asignaciones', rule: { kind: 'roles', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN_COMERCIAL] } },
  { section: 'Menú: Proveedores', rule: { kind: 'permission', permission: 'products:read' } },
  { section: 'Menú: Órdenes de Compra', rule: { kind: 'permission', permission: 'products:read' } },
  { section: 'Menú: Panel de Compras', rule: { kind: 'permission', permission: 'products:read' } },
  { section: 'Menú: Configuración', rule: { kind: 'permission', permission: 'categories:read' } },
  { section: 'Menú: Usuarios', rule: { kind: 'roles', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN_COMERCIAL] } },
  { section: 'Menú: Auditoría', rule: { kind: 'roles', roles: [ROLES.SUPER_ADMIN, ROLES.SUPERVISOR, ROLES.ADMIN_COMERCIAL] } },
  { section: 'Acceso a categorías del catálogo' },
]

function matrixHasAccess(role: Role, rule?: MatrixRule): boolean {
  if (!rule) return false
  if (rule.kind === 'permission') return role.permissions.includes(rule.permission)
  return rule.roles.includes(role.name)
}

function groupedPermissionLabels(permissions: string[]): string[] {
  return PERMISSION_GROUPS.filter((g) => g.permissions.some((p) => permissions.includes(p))).map(
    (g) => g.label
  )
}

export default function UsersPage() {
  // Panel de concesiones de dashboard (fase 5): sólo Super Admin.
  const [grantsUser, setGrantsUser] = useState<User | null>(null)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => new Set())
  const [activeTab, setActiveTab] = useState<'usuarios' | 'roles'>('usuarios')

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', search],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('take', '100')
      if (search) params.set('search', search)
      const res = await api.get(`/users?${params}`)
      return res.data
    },
  })

  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: fetchRoles,
    enabled: hasRole(ROLES.SUPER_ADMIN),
  })

  const toggleActive = useMutation({
    mutationFn: (user: User) =>
      api.put(`/users/${user.id}`, { isActive: !user.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkDeleteUsers = () => {
    const count = selectedUserIds.size
    if (count === 0) return
    if (!window.confirm(`¿Eliminar ${count} usuario(s) seleccionado(s)? Esta acción no se puede deshacer.`)) return
    void Promise.allSettled(Array.from(selectedUserIds).map((id) => deleteUser.mutateAsync(id))).then(() => {
      setSelectedUserIds(new Set())
    })
  }

  if (!canViewUsers()) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-gray-500 font-medium">No tienes permisos para ver esta sección</p>
      </div>
    )
  }

  const canManageRoles = hasRole(ROLES.SUPER_ADMIN)
  const canAssignSupervisor = hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN_COMERCIAL)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-security-700">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona los usuarios internos del sistema</p>
        </div>
        {hasRole(ROLES.SUPER_ADMIN) && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-security-500 text-white rounded-lg font-semibold hover:bg-security-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo Usuario
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('usuarios')}
          className={`px-4 py-2.5 -mb-px border-b-2 text-sm font-semibold transition-colors ${
            activeTab === 'usuarios'
              ? 'border-security-600 text-security-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Usuarios
        </button>
        {canManageRoles && (
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-2.5 -mb-px border-b-2 text-sm font-semibold transition-colors ${
              activeTab === 'roles'
                ? 'border-security-600 text-security-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Roles y Permisos
          </button>
        )}
      </div>

      {activeTab === 'roles' && canManageRoles ? (
        <RolesManagementSection />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por nombre o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              />
            </div>
          </div>

          {hasRole(ROLES.SUPER_ADMIN) && selectedUserIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200">
              <span className="text-sm font-medium text-neutral-600">{selectedUserIds.size} seleccionado(s)</span>
              <button
                onClick={() => setSelectedUserIds(new Set())}
                className="text-sm text-neutral-500 hover:text-neutral-800 underline underline-offset-2"
              >
                Limpiar selección
              </button>
              <div className="ml-auto">
                <button
                  onClick={bulkDeleteUsers}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold text-sm transition-colors"
                >
                  Eliminar seleccionados
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-100 rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-100 rounded w-1/2 mb-2"></div>
                      <div className="h-3 bg-gray-100 rounded w-1/3"></div>
                    </div>
                  </div>
                </div>
              ))
            ) : users?.data?.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p className="text-gray-500 font-medium">No hay usuarios</p>
              </div>
            ) : (
              users?.data?.map((user: User) => (
                <div key={user.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-shadow">
                  <div className="flex items-center gap-3">
                    {hasRole(ROLES.SUPER_ADMIN) && (
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(user.id)}
                        onChange={() => toggleSelectUser(user.id)}
                        aria-label={`Seleccionar ${user.name}`}
                        className="h-4 w-4 accent-security-600 cursor-pointer"
                      />
                    )}
                    <div className="w-12 h-12 bg-security-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-security-700">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{user.name}</h3>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Supervisor:{' '}
                      <span className="text-gray-700">
                        {user.supervisorId
                          ? (users?.data?.find((u: User) => u.id === user.supervisorId)?.name ?? '— Sin asignar —')
                          : '— Sin asignar —'}
                      </span>
                    </p>
                    {canAssignSupervisor && (
                      <SupervisorSelect user={user} users={users?.data ?? []} />
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex gap-1.5 flex-wrap">
                      {user.roles?.map((role) => (
                        <span key={role.id} className="px-2 py-1 text-xs font-medium bg-security-100 text-security-700 rounded">
                          {role.name}
                        </span>
                      ))}
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {user.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  {hasRole(ROLES.SUPER_ADMIN) && (
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="text-xs text-security-600 hover:text-security-800 font-medium"
                        >
                          Editar
                        </button>

                        <button
                          onClick={() => setGrantsUser(user)}
                          className="text-xs text-security-600 hover:text-security-800 font-medium"
                        >
                          Paneles
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleActive.mutate(user)}
                          disabled={toggleActive.isPending}
                          className={`text-xs font-medium px-2 py-1 rounded ${
                            user.isActive
                              ? 'text-amber-600 hover:bg-amber-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {user.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar usuario ${user.name}?`)) deleteUser.mutate(user.id)
                          }}
                          className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {showCreateModal && (
            <UserModal
              roles={rolesData || []}
              onClose={() => setShowCreateModal(false)}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['users'] })
                setShowCreateModal(false)
              }}
            />
          )}

          {grantsUser && (
            <Modal
              open
              onClose={() => setGrantsUser(null)}
              title={`Paneles de ${grantsUser.name}`}
              size="lg"
            >
              <DashboardGrants userId={grantsUser.id} />
            </Modal>
          )}

          {editingUser && (
            <UserModal
              user={editingUser}
              roles={rolesData || []}
              onClose={() => setEditingUser(null)}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['users'] })
                setEditingUser(null)
              }}
            />
          )}
        </>
      )}
          </div>
  )
}

function SupervisorSelect({ user, users }: { user: User; users: User[] }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (supervisorId: string | null) => updateUserSupervisor(user.id, supervisorId),
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err) => {
      setError(getApiErrorMessage(err, 'No se pudo asignar el supervisor'))
    },
  })

  return (
    <div className="mt-1.5">
      <select
        value={user.supervisorId ?? ''}
        disabled={mutation.isPending}
        onChange={(e) => {
          setError(null)
          mutation.mutate(e.target.value === '' ? null : e.target.value)
        }}
        aria-label={`Supervisor de ${user.name}`}
        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary bg-white disabled:opacity-50"
      >
        <option value="">— Sin asignar —</option>
        {users
          .filter((u) => u.id !== user.id)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
      </select>
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function UserModal({ user, roles, onClose, onSuccess }: { user?: User; roles: Role[]; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    roleIds: user?.roles?.map(r => r.id) || [] as string[],
    isActive: user?.isActive ?? true,
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        isActive: data.isActive,
        roleIds: data.roleIds,
      }
      if (data.password) payload.password = data.password
      return user ? api.put(`/users/${user.id}`, payload) : api.post('/users', payload)
    },
    onSuccess,
  })

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 bg-security-700 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">{user ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
            <button onClick={onClose} className="p-2 text-security-200 hover:text-white hover:bg-security-600 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {user ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              {...(!user ? { required: true, minLength: 8 } : { minLength: 8 })}
              placeholder={user ? '••••••••' : 'Mínimo 8 caracteres'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Roles</label>
            <div className="space-y-2">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.roleIds.includes(role.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setForm({ ...form, roleIds: [...form.roleIds, role.id] })
                      } else {
                        setForm({ ...form, roleIds: form.roleIds.filter(id => id !== role.id) })
                      }
                    }}
                    className="w-4 h-4 text-security-600 border-gray-300 rounded focus:ring-brand-primary/30"
                  />
                  <span className="text-sm text-gray-700">{role.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-4 h-4 text-security-600 border-gray-300 rounded focus:ring-brand-primary/30"
              />
              <span className="text-sm font-medium text-gray-700">Usuario activo</span>
            </label>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending} className="px-4 py-2.5 bg-security-500 text-white rounded-lg hover:bg-security-600 disabled:opacity-50 font-semibold transition-colors">
              {mutation.isPending ? 'Guardando...' : user ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RolesManagementSection() {
  const queryClient = useQueryClient()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [usersRole, setUsersRole] = useState<Role | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: fetchRoles,
  })

  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setActionError(null)
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'No se pudo eliminar el rol'))
    },
  })

  const handleDelete = (role: Role) => {
    setActionError(null)
    if (!window.confirm(`¿Eliminar el rol "${role.name}"? Esta acción no se puede deshacer.`)) return
    deleteRoleMutation.mutate(role.id)
  }

  const closeRoleModal = () => {
    setShowCreateModal(false)
    setEditingRole(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-security-700">Roles y Permisos</h2>
          <p className="text-sm text-gray-500 mt-1">Gestiona los roles y los permisos que definen el acceso al sistema</p>
        </div>
        <button
          onClick={() => {
            setActionError(null)
            setEditingRole(null)
            setShowCreateModal(true)
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-security-500 text-white rounded-lg font-semibold hover:bg-security-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Rol
        </button>
      </div>

      {actionError && (
        <div className="flex items-start gap-3 p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm" role="alert">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="p-0.5 rounded hover:bg-red-100 transition-colors" aria-label="Cerrar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-3"></div>
              <div className="h-3 bg-gray-100 rounded w-2/3 mb-4"></div>
              <div className="h-3 bg-gray-100 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : roles?.length === 0 ? (
        <div className="col-span-full text-center py-12 bg-white rounded-xl border border-gray-200">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-500 font-medium">No hay roles configurados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(roles ?? []).map((role) => (
            <div key={role.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{role.name}</h3>
                  {role.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{role.description}</p>
                  )}
                </div>
                <span className="px-2 py-1 text-xs font-medium bg-security-100 text-security-700 rounded whitespace-nowrap">
                  {role.userCount ?? 0} usuarios
                </span>
              </div>
              <div className="mt-3 flex gap-1.5 flex-wrap">
                {groupedPermissionLabels(role.permissions).map((label) => {
                  const group = PERMISSION_GROUPS.find((g) => g.label === label)
                  const perms = group?.permissions.filter((p) => role.permissions.includes(p)) ?? []
                  return (
                    <span
                      key={label}
                      title={perms.join(', ')}
                      className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded"
                    >
                      {label}
                    </span>
                  )
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                <button
                  onClick={() => {
                    setActionError(null)
                    setEditingRole(role)
                  }}
                  className="text-xs text-security-600 hover:text-security-800 font-medium"
                >
                  Editar
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUsersRole(role)}
                    className="text-xs font-medium px-2 py-1 rounded text-security-600 hover:bg-security-50"
                  >
                    Usuarios
                  </button>
                  <button
                    onClick={() => handleDelete(role)}
                    disabled={deleteRoleMutation.isPending}
                    className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-security-700">Acceso por sección</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Visibilidad de cada sección según los permisos configurados en cada rol
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-5 py-3 font-semibold text-gray-700">Sección</th>
              {roles?.map((role) => (
                <th key={role.id} className="px-4 py-3 font-semibold text-gray-700 text-center whitespace-nowrap">
                  {role.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ACCESS_MATRIX.map((row) => {
              if (!row.rule) {
                return (
                  <tr key={row.section}>
                    <td className="px-5 py-3 text-gray-700 font-medium">{row.section}</td>
                    <td colSpan={roles?.length ?? 1} className="px-4 py-3 text-center">
                      <Link
                        to="/commercial/assignments"
                        className="text-xs font-medium text-security-600 hover:text-security-800 underline underline-offset-2"
                      >
                        Gestionar en Asignaciones →
                      </Link>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={row.section}>
                  <td className="px-5 py-3 text-gray-700">{row.section}</td>
                  {roles?.map((role) => (
                    <td key={role.id} className="px-4 py-3 text-center">
                      {matrixHasAccess(role, row.rule) ? (
                        <span className="text-emerald-600 font-bold">✔</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <RoleModal
          onClose={closeRoleModal}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['roles'] })
            closeRoleModal()
          }}
        />
      )}

      {editingRole && (
        <RoleModal
          role={editingRole}
          onClose={closeRoleModal}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['roles'] })
            closeRoleModal()
          }}
        />
      )}

      {usersRole && <RoleUsersModal role={usersRole} onClose={() => setUsersRole(null)} />}
    </div>
  )
}

function RoleModal({ role, onClose, onSuccess }: { role?: Role; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: role?.name || '',
    description: role?.description || '',
    permissions: role?.permissions ?? [] as string[],
  })
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload: RolePayload = {
        name: data.name.trim(),
        permissions: data.permissions,
      }
      if (data.description.trim()) payload.description = data.description.trim()
      return role ? updateRole(role.id, payload) : createRole(payload)
    },
    onSuccess,
    onError: (err) => setFormError(getApiErrorMessage(err, 'No se pudo guardar el rol')),
  })

  const togglePermission = (permission: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 bg-security-700 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">{role ? 'Editar Rol' : 'Nuevo Rol'}</h2>
            <button onClick={onClose} className="p-2 text-security-200 hover:text-white hover:bg-security-600 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Permisos</label>
            <div className="space-y-4">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{group.label}</p>
                  <div className="space-y-2">
                    {group.permissions.map((permission) => (
                      <label key={permission} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(permission)}
                          onChange={() => togglePermission(permission)}
                          className="w-4 h-4 text-security-600 border-gray-300 rounded focus:ring-brand-primary/30"
                        />
                        <span className="text-sm text-gray-700">{permission}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {formError && <div className="text-sm text-red-600">{formError}</div>}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending} className="px-4 py-2.5 bg-security-500 text-white rounded-lg hover:bg-security-600 disabled:opacity-50 font-semibold transition-colors">
              {mutation.isPending ? 'Guardando...' : role ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RoleUsersModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['roles', role.id],
    queryFn: () => fetchRole(role.id),
  })

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 bg-security-700 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Usuarios del rol</h2>
            <button onClick={onClose} className="p-2 text-security-200 hover:text-white hover:bg-security-600 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-500 mb-4">
            <span className="font-semibold text-gray-700">{role.name}</span> — usuarios asignados a este rol
          </p>
          {isLoading ? (
            <p className="text-sm text-gray-500 text-center py-8">Cargando usuarios...</p>
          ) : error ? (
            <div className="text-sm text-red-600" role="alert">
              {getApiErrorMessage(error, 'No se pudieron cargar los usuarios del rol')}
            </div>
          ) : !detail?.users?.length ? (
            <p className="text-sm text-gray-500 text-center py-8">Sin usuarios asignados</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {detail.users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-9 h-9 bg-security-100 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-security-700">
                      {u.name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end pt-4 border-t border-gray-200 mt-4">
            <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}