import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PortalAccountsSection from '../components/PortalAccountsSection'
import { currentTariffValue, INACTIVE_TARIFF } from '../components/AdminAccountRow'
import ZonesAdminSection, { searchMunicipalities } from '../components/ZonesAdminSection'
import { whatsappUrl } from '../../quotes/lib/whatsapp'

const auth = vi.hoisted(() => ({ roles: [] as string[], actions: [] as string[] }))
// Zustand en render de servidor lee el estado inicial: se simula el selector con los roles de cada prueba.
vi.mock('../../../stores/auth.store', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ user: { roles: auth.roles } }) }))
// Las acciones de panel que la persona tiene asignadas (Super Admin las tiene todas).
vi.mock('../../users/access', () => ({
  useHasAssignedAction: (actions: readonly string[]) => auth.roles.includes('Super Admin') || actions.some(a => auth.actions.includes(a)),
}))

function seeded(seed: Record<string, unknown>) {
  const client = new QueryClient()
  for (const [key, value] of Object.entries(seed)) client.setQueryData([key], value)
  return client
}

/** The «Solicitudes» tab of Comercial. */
function render(roles: string[], seed: Record<string, unknown>, actions: string[] = [], filter?: string) {
  auth.roles = roles
  auth.actions = actions
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: seeded(seed) }, createElement(PortalAccountsSection, { initialFilter: filter })))
}

/** The «Zonas» tab of Comercial. */
function renderZones(seed: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: seeded(seed) }, createElement(ZonesAdminSection)))
}

const pereira = { code: '66001', name: 'Pereira', departmentCode: '66', department: 'Risaralda' }
const account = {
  id: 'a1', email: 'ana@acme.co', contactName: 'Ana Pérez', companyName: 'Acme SAS', state: 'ACTIVE', createdAt: '2026-11-01T00:00:00Z',
  city: pereira, advisorId: 'v1', advisor: { id: 'v1', name: 'Vera Asesora' }, customerId: null, customer: null,
}
const pending = { ...account, id: 'a2', email: 'luis@x.co', companyName: 'Pendiente SAS', state: 'PENDING', advisorId: null, advisor: null }
const linked = {
  ...account, id: 'a3', companyName: 'Suspendida SAS', state: 'SUSPENDED', customerId: 'c1',
  customer: { id: 'c1', code: 'CL-0001', name: 'Acme Ltda', ownerId: 'v1', portalTierId: 't1', portalTier: { id: 't1', name: 'Oro', isActive: true, priceListId: 'l1' } },
}
const seed = {
  'portal-admin-accounts': [account, pending, linked],
  'portal-tariff-options': [{ id: 'l1', name: 'Detalle', code: 'DET', currency: 'COP' }, { id: 'l2', name: 'Instaladores', code: 'INST', currency: 'COP' }],
  'portal-admin-price-lists': [{ id: 'l1', name: 'Detalle', isActive: true }],
  'portal-admin-mappings': [{ id: 'm1', type: 'FINAL_CUSTOMER', priceListId: 'l1', priceList: { id: 'l1', name: 'Detalle', isActive: true } }],
  'portal-admin-advisors': [{ id: 'v1', name: 'Vera Asesora', zone: 'Eje Cafetero' }, { id: 'v2', name: 'Raúl Asesor', zone: null }],
  'portal-admin-zones': [
    { id: 'z1', name: 'Eje Cafetero', isActive: true, usersCount: 2, cities: [{ code: '66001', name: 'Pereira', department: 'Risaralda' }] },
    { id: 'z2', name: 'Costa', isActive: false, usersCount: 0, cities: [] },
  ],
  'portal-admin-municipalities': [pereira, { code: '05001', name: 'Medellín', departmentCode: '05', department: 'Antioquia' }],
}

describe('PortalAccountsSection (pestaña Solicitudes de Comercial)', () => {
  it('Super Admin: pinta ciudad, asesor, cliente y tarifa de la empresa, y la cola «Sin asesor»', () => {
    const html = render(['Super Admin'], seed)
    expect(html).toContain('Solicitudes del portal')
    expect(html).not.toContain('role="tablist"')
    expect(html).toContain('Acme SAS')
    expect(html).toContain('1 por revisar')
    expect(html).toContain('Ciudad: Pereira · Risaralda')
    expect(html).toContain('Asesor: Vera Asesora')
    expect(html).toContain('Asesor: Sin asesor')
    expect(html).toContain('1 sin asesor')
    expect(html).toContain('<option value="NO_ADVISOR">Sin asesor (1)</option>')
    expect(html).toContain('Vinculado a Acme Ltda (CL-0001)')
    expect(html).toContain('Tarifa: Oro')
    expect(html).toContain('Tarifa: Tarifa general')
    expect(html).not.toContain('tarifa de la empresa')
    expect(html).toContain('Aprobar cuenta') // la cuenta pendiente llega abierta
    expect(html).toContain('Asigna un asesor antes de activar')
  })

  it('la tarifa se puede elegir aunque la cuenta no tenga cliente vinculado', () => {
    const html = render(['Super Admin'], { ...seed, 'portal-admin-accounts': [pending] })
    expect(html).not.toContain('Primero vincula la cuenta a un cliente.')
    expect(html).toContain('Es la tarifa con la que esta cuenta ve sus precios.')
    expect(html).not.toMatch(/<select id="tier-a2"[^>]*\sdisabled=""/)
  })

  describe('selector «Tarifa»: elige entre las tarifas activas', () => {
    const open = (extra: Record<string, unknown> = {}, tier?: unknown) => render(['Super Admin'], { ...seed, 'portal-admin-accounts': [{ ...pending, ...(tier ? { tier, tierId: (tier as { id: string }).id } : {}) }], ...extra })

    it('lista «Tarifa general (nombre)» y las tarifas activas por nombre, sin mostrar niveles', () => {
      const html = open()
      expect(html).toMatch(/<select id="tier-a2"[^>]*>/)
      expect(html).toContain('<option value="" selected="">Tarifa general (Detalle)</option>')
      expect(html).toContain('<option value="l1">Detalle</option>')
      expect(html).toContain('<option value="l2">Instaladores</option>')
      expect(html).not.toContain('Aún no hay tarifas activas')
    })

    it('marca la tarifa a la que apunta el nivel actual de la cuenta', () => {
      const html = open({}, { id: 't9', name: 'Instaladores', isActive: true, priceListId: 'l2' })
      expect(html).toContain('<option value="l2" selected="">Instaladores</option>')
      expect(html).not.toContain('(inactiva)')
    })

    it('si el nivel actual apunta a una tarifa inactiva o desconocida, lo muestra como «(inactiva)» deshabilitado', () => {
      const html = open({}, { id: 't9', name: 'Antigua', isActive: true, priceListId: 'l-vieja' })
      expect(html).toContain(`<option value="${INACTIVE_TARIFF}" disabled="" selected="">Antigua (inactiva)</option>`)
    })

    it('sin tarifas activas deja solo «Tarifa general» y explica dónde crearlas', () => {
      const html = open({ 'portal-tariff-options': [] })
      expect(html).toContain('<option value="" selected="">Tarifa general (Detalle)</option>')
      expect(html).not.toContain('<option value="l1">')
      expect(html).toContain('Aún no hay tarifas activas. Créalas en Biblioteca &gt; Maestros &gt; Tarifas.')
    })

    it('mientras las tarifas cargan no afirma que no haya ninguna y bloquea el selector', () => {
      const { 'portal-tariff-options': _omit, ...withoutOptions } = seed
      const html = render(['Super Admin'], { ...withoutOptions, 'portal-admin-accounts': [pending] })
      expect(html).not.toContain('Aún no hay tarifas activas')
      expect(html).toMatch(/<select id="tier-a2"[^>]*\sdisabled=""/)
    })

    it('un asesor con «gestionar» elige tarifa; sin ese panel no hay selector', () => {
      expect(render(['Vendedor'], seed, ['portalAccounts:read', 'portalAccounts:manage'])).toContain('Pendiente SAS')
      const manage = render(['Vendedor'], { ...seed, 'portal-admin-accounts': [pending] }, ['portalAccounts:read', 'portalAccounts:manage'])
      expect(manage).toContain('<option value="l2">Instaladores</option>')
      const readOnly = render(['Vendedor'], { ...seed, 'portal-admin-accounts': [pending] }, ['portalAccounts:read'])
      expect(readOnly).not.toContain('Guardar tarifa')
    })

    it('currentTariffValue: general, tarifa activa o inactiva', () => {
      const options = [{ id: 'l1', name: 'Detalle', code: 'DET', currency: 'COP' }]
      const base = { ...pending } as never
      expect(currentTariffValue(base, options)).toBe('')
      expect(currentTariffValue({ ...pending, tier: { id: 't', name: 'A', isActive: true, priceListId: 'l1' } } as never, options)).toBe('l1')
      expect(currentTariffValue({ ...pending, tier: { id: 't', name: 'A', isActive: false, priceListId: 'l1' } } as never, options)).toBe(INACTIVE_TARIFF)
      expect(currentTariffValue({ ...pending, tier: { id: 't', name: 'A', isActive: true, priceListId: null } } as never, options)).toBe(INACTIVE_TARIFF)
      expect(currentTariffValue({ ...pending, tier: { id: 't', name: 'A', isActive: true, priceListId: 'l1' } } as never, undefined)).toBe(INACTIVE_TARIFF)
    })
  })

  it('si el cliente vinculado tiene su propia tarifa, se avisa que esa es la que se aplica', () => {
    const linkedPending = { ...pending, customerId: 'c9', customer: { id: 'c9', code: 'CL-0009', name: 'Acme Ltda', portalTierId: 't1', portalTier: { id: 't1', name: 'Oro', isActive: true } } }
    const html = render(['Super Admin'], { ...seed, 'portal-admin-accounts': [linkedPending] })
    expect(html).toContain('El cliente vinculado ya tiene su propia tarifa (Oro): esa es la que se aplica.')
  })

  it('quien puede asignar elige entre los asesores disponibles con su zona', () => {
    const html = render(['Super Admin'], { ...seed, 'portal-admin-accounts': [pending] })
    expect(html).toContain('Elige un asesor')
    expect(html).toContain('Vera Asesora · Eje Cafetero')
    expect(html).toContain('Raúl Asesor')
  })

  it('las zonas viven en su propia pestaña de Comercial, sin barra de pestañas dentro del contenido', () => {
    const zones = renderZones(seed)
    expect(zones).toContain('Zonas de asesores')
    expect(zones).toContain('1 ciudad · 2 asesores')
    expect(zones).toContain('Pereira · Risaralda')
    expect(zones).toContain('Inactiva')
    expect(zones).not.toContain('role="tablist"')
    expect(render(['Super Admin'], seed)).not.toContain('Zonas de asesores')
  })

  it('«Sin asesor» es un filtro con contador y solo lista las cuentas sin asesor', () => {
    const all = render(['Super Admin'], seed)
    expect(all).toContain('Sin asesor (1)')
    expect(all).toContain('Suspendida SAS')
    const html = render(['Super Admin'], seed, [], 'NO_ADVISOR')
    expect(html).toMatch(/<option value="NO_ADVISOR" selected="">Sin asesor \(1\)<\/option>/)
    expect(html).toContain('Pendiente SAS')
    expect(html).not.toContain('Suspendida SAS')
  })

  it('el filtro «Sin asesor» sin cuentas pendientes de asesor explica cuándo aparecerán', () => {
    const html = render(['Super Admin'], { ...seed, 'portal-admin-accounts': [account] }, [], 'NO_ADVISOR')
    expect(html).toContain('No hay cuentas esperando asesor')
  })

  it('con listas vacías muestra guías, no una pantalla en blanco', () => {
    const empty = { ...seed, 'portal-admin-accounts': [], 'portal-tariff-options': [], 'portal-admin-zones': [] }
    expect(render(['Super Admin'], empty)).toContain('Todavía no hay clientes registrados')
    expect(renderZones(empty)).toContain('Todavía no hay zonas')
  })

  it('un asesor solo con «ver y gestionar» ve sus cuentas pero no asigna asesor ni ve zonas, niveles ni tarifa general', () => {
    const html = render(['Vendedor'], seed, ['portalAccounts:read', 'portalAccounts:manage'])
    expect(html).toContain('Acme SAS')
    expect(html).toContain('Gestionar')
    expect(html).not.toContain('Elige un asesor')
    expect(html).not.toContain('NO_ADVISOR')
    expect(html).not.toContain('Sin asesor (')
  })

  it('un supervisor que solo asigna ve la cola «Sin asesor» pero no las acciones de gestión', () => {
    const html = render(['Supervisor'], { ...seed, 'portal-admin-accounts': [pending] }, ['portalAccounts:read', 'portalAccounts:assign'])
    expect(html).toContain('<option value="NO_ADVISOR">Sin asesor (1)</option>')
    expect(html).toContain('Asignar asesor')
    expect(html).not.toContain('Aprobar cuenta')
    expect(html).not.toContain('Suspender cuenta')
  })

  it('sin el panel de lectura solo ve el aviso', () => {
    expect(render(['Operador'], seed)).toContain('No tienes asignadas las solicitudes del portal')
  })
})

describe('ayudas de zonas y contacto', () => {
  const all = [pereira, { code: '05001', name: 'Medellín', departmentCode: '05', department: 'Antioquia' }, { code: '05002', name: 'Abejorral', departmentCode: '05', department: 'Antioquia' }]

  it('la búsqueda de ciudades ignora tildes, no repite las ya elegidas y pide 2 letras', () => {
    expect(searchMunicipalities(all, 'medellin', new Set()).map(m => m.code)).toEqual(['05001'])
    expect(searchMunicipalities(all, 'antioquia', new Set(['05001'])).map(m => m.code)).toEqual(['05002'])
    expect(searchMunicipalities(all, 'm', new Set())).toEqual([])
  })

  it('whatsappUrl deja solo dígitos, agrega 57 a celulares de 10 dígitos y rechaza números cortos', () => {
    expect(whatsappUrl('300 123-4567')).toBe('https://wa.me/573001234567')
    expect(whatsappUrl('+57 300 123 4567')).toBe('https://wa.me/573001234567')
    expect(whatsappUrl('12345')).toBeNull()
    expect(whatsappUrl(null)).toBeNull()
  })
})
