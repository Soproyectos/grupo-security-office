import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserAccessPanel } from './UserAccessAssignments'
import { accessActionNotice, userAccessKey } from '../access'
import {
  UserAccessServiceError,
  type AccessPackage,
  type UserAccessState,
} from '../../../services/users.service'
import { useAuthStore } from '../../../stores/auth.store'
import UserAccessAssignments from './UserAccessAssignments'

/**
 * El repo no tiene entorno DOM ni @testing-library: el panel se afirma en
 * render de servidor con la caché de react-query SEMBRADA (mismo patrón que
 * AgendaCalendarPage.spec.tsx). Los clicks viven en el recorrido HTTP real
 * (e2e sobre 5180/3001) y en la spec de `features/users/access.ts`
 * (`applyPackageInCache`/`revokePackageInCache` con la API mockeada).
 */

const TARGET = { id: 'user-1', name: 'Vendedor de prueba' }

function packageOf(over: Partial<AccessPackage> & { id: string; name: string }): AccessPackage {
  return { selections: [], applied: false, sourceId: null, ...over }
}

function accessState(partial: Partial<UserAccessState> = {}): UserAccessState {
  return {
    catalogVersion: 'panels-20261019-3',
    accessVersion: 7,
    grants: [],
    sources: [
      {
        id: 'src-1',
        kind: 'template',
        templateId: 'vendedor',
        catalogVersion: 'panels-20261019-3',
        grantedById: 'admin-1',
        reason: 'template-applied',
      },
    ],
    packages: [
      packageOf({
        id: 'vendedor',
        name: 'Vendedor',
        applied: true,
        sourceId: 'src-1',
        selections: [
          { actionId: 'customers:read', scope: 'own' },
          { actionId: 'customers:edit', scope: 'own' },
          { actionId: 'products:read', scope: 'global' },
        ],
      }),
      packageOf({
        id: 'supervisor-comercial',
        name: 'Supervisor comercial',
        selections: [{ actionId: 'teamInsights:read', scope: 'team' }],
      }),
      packageOf({
        id: 'gestion-comercial',
        name: 'Gestión comercial',
        selections: [{ actionId: 'customers:reassign', scope: 'team' }],
      }),
      packageOf({ id: 'gestion-listas-precios', name: 'Gestión de listas y precios', selections: [{ actionId: 'listas:read', scope: 'global' }] }),
      packageOf({ id: 'biblioteca-productos', name: 'Biblioteca de productos', selections: [{ actionId: 'products:read', scope: 'global' }] }),
      packageOf({ id: 'publicacion-catalogo', name: 'Publicación del catálogo', selections: [{ actionId: 'products:publish', scope: 'global' }] }),
    ],
    actions: [
      { id: 'customers:read', label: 'Consultar clientes', purpose: 'Consultar cartera', allowedScopes: ['own', 'team', 'global'], dependencies: [], enabled: true },
      { id: 'listas:read', label: 'Consultar listas', purpose: 'Consultar una lista', allowedScopes: ['list'], dependencies: [], enabled: true },
    ],
    ...partial,
  }
}

function render(client: QueryClient) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <UserAccessPanel user={TARGET} />
    </QueryClientProvider>,
  )
}

function seeded(state: UserAccessState) {
  const client = new QueryClient()
  client.setQueryData(userAccessKey(TARGET.id), state)
  return client
}

function loginSuperAdmin() {
  const session = {
    isAuthenticated: true,
    user: {
      id: 'admin-1',
      name: 'Super Admin de prueba',
      email: 'admin@example.invalid',
      roles: ['Super Admin'],
      permissions: [],
    },
  }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}

beforeEach(() => {
  loginSuperAdmin()
})

describe('UserAccessPanel — paquetes con acciones concretas (ficha regla 1)', () => {
  it('agrupa los seis paquetes por panel y muestra acciones y alcances del servidor', () => {
    const html = render(seeded(accessState()))

    expect(html).toContain('Vendedor')
    expect(html).toContain('Supervisor comercial')
    expect(html).toContain('Gestión comercial')
    expect(html).toContain('Comercial')
    expect(html).toContain('Catálogo y precios')
    expect(html).toContain('Gestión de listas y precios')
    expect(html).toContain('Biblioteca de productos')
    expect(html).toContain('Publicación del catálogo')
    // Selecciones concretas y versionadas, no un «habilitar acceso» genérico.
    expect(html).toContain('customers:edit')
    expect(html).toContain('alcance Propio')
    expect(html).toContain('Consultar clientes')
    expect(html).toContain('teamInsights:read')
    expect(html).toContain('alcance Equipo')
    expect(html).toContain('panels-20261019-3')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('Asignar paquete')
  })

  it('muestra el estado applied y la fuente del paquete aplicado', () => {
    const html = render(seeded(accessState()))

    expect(html).toContain('Aplicado')
    expect(html).toContain('Fuente: paquete (template-applied)')
    expect(html).toContain('Sin aplicar')
    expect(html).toContain('Paquete asignado')
    expect(html).toContain('Asignar paquete')
  })

  it('sin concesiones el panel sigue mostrando el catálogo de paquetes (sin migración silenciosa)', () => {
    const html = render(
      seeded(
        accessState({
          grants: [],
          sources: [],
          packages: accessState().packages.map((pkg) => ({ ...pkg, applied: false, sourceId: null })),
        }),
      ),
    )

    expect(html).toContain('Asignar paquete')
    expect(html).not.toContain('Paquete asignado')
    expect(html).toContain('Versión de concesiones: 7')
  })

  it('expone la versión OCC que los botones envían al servidor', () => {
    const html = render(seeded(accessState({ accessVersion: 12 })))

    expect(html).toContain('Versión de concesiones: 12')
  })

  it('presenta acciones individuales agrupadas como checklist', () => {
    const html = render(seeded(accessState()))

    expect(html).toContain('Acciones individuales')
    expect(html).toContain('Guardar acciones individuales')
    expect(html).toContain('Consultar clientes')
    expect(html).toContain('customers:read')
    expect(html).toContain('Vendedor')
    expect(html).toContain('type="checkbox"')
  })

  it('expone la revocación completa de una fuente manual', () => {
    const base = accessState()
    const html = render(seeded(accessState({
      sources: [...base.sources, {
        id: 'manual-1', kind: 'manual', templateId: null, catalogVersion: 'panels-20261019-3', grantedById: 'admin-1', reason: 'manual-assignment',
      }],
      grants: [{ sourceId: 'manual-1', actionId: 'customers:read', scope: 'own' }],
    })))

    expect(html).toContain('Retirar asignación manual')
  })
})

describe('accessActionNotice — avisos de 409 (versión) y 400/403/404', () => {
  it('el 409 es un aviso de versión con el mensaje del servidor', () => {
    const notice = accessActionNotice(
      new UserAccessServiceError('conflict', 'Las concesiones cambiaron; recargue.', 409, 'access-version-conflict'),
    )

    expect(notice).toEqual({ tone: 'conflict', message: 'Las concesiones cambiaron; recargue.' })
  })

  it('el resto de errores usa el mensaje tipado del service', () => {
    const notice = accessActionNotice(new UserAccessServiceError('invalid', 'La acción está deshabilitada.', 400))

    expect(notice).toEqual({ tone: 'error', message: 'La acción está deshabilitada.' })
  })

  it('sin error no hay aviso', () => {
    expect(accessActionNotice(null)).toBeNull()
    expect(accessActionNotice(undefined)).toBeNull()
  })
})

describe('UserAccessAssignments — selector de destino por query (?usuario=)', () => {
  it('ofrece elegir usuario antes de mostrar paquetes', () => {
    const client = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/users/access']}>
          <UserAccessAssignments />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('Asignación de paquetes de acceso')
    expect(html).toContain('Buscar usuario')
    expect(html).not.toContain('Paquete asignado')
  })

  it('con ?usuario= monta el panel de ese usuario y sus paquetes', () => {
    const client = new QueryClient()
    client.setQueryData(['users', 'access-selector', ''], [
      {
        id: TARGET.id,
        name: TARGET.name,
        email: 'vendedor@example.invalid',
        isActive: true,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        supervisorId: null,
        roles: [],
      },
    ])
    client.setQueryData(userAccessKey(TARGET.id), accessState())

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/users/access?usuario=${TARGET.id}`]}>
          <UserAccessAssignments />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(html).toContain('Vendedor de prueba')
    expect(html).toContain('Paquete asignado')
  })
})
