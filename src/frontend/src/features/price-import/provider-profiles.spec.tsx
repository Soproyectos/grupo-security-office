/**
 * IMP-07B (07B) frontend — perfiles de proveedor: permisos de visibilidad,
 * validación en cliente y mensajes de reconocimiento. Sin jsdom: render
 * estático + utilidades puras (patrón de preview.spec).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { canManageListas, hasPermission } from '../../lib/rbac'
import ProviderProfilesSection from './ProviderProfilesSection'
import {
  canEditProviderProfiles,
  canManageProviderProfiles,
  hasFormErrors,
  parseHeaders,
  recognitionMessage,
  summarizeResolution,
  validateProfileForm,
} from './provider-profiles.utils'
import type { ProviderProfileInput, ProviderRecognition, ResolvedReference } from '../../services/price-import.service'

vi.mock('../../lib/rbac', () => ({ hasPermission: vi.fn(() => false), canManageListas: vi.fn(() => false) }))
vi.mock('../../services/price-import.service', () => ({
  listProviderProfiles: vi.fn(async () => []),
  createProviderProfile: vi.fn(),
  updateProviderProfile: vi.fn(),
  deleteProviderProfile: vi.fn(),
  setProviderEquivalences: vi.fn(),
  recognizeProviderProfile: vi.fn(),
  resolveProviderReferences: vi.fn(),
}))

const base: ProviderProfileInput = {
  providerName: 'Hikvision',
  sheet: 'PRECIOS',
  headerRow: 1,
  thousandsSeparator: '.',
  decimalSeparator: ',',
  currency: 'COP',
  tariffs: ['DPP_ORO_IVA'],
  expectedColumns: ['REFERENCIA', 'DPP_ORO_IVA'],
}

describe('IMP-07B frontend — permisos', () => {
  beforeEach(() => {
    vi.mocked(hasPermission).mockReset().mockReturnValue(false)
    vi.mocked(canManageListas).mockReset().mockReturnValue(false)
  })

  it('sin `providers:read` la sección no se muestra', () => {
    expect(canManageProviderProfiles()).toBe(false)
    expect(renderToStaticMarkup(<ProviderProfilesSection />)).toBe('')
  })

  it('con `providers:read` se muestra la sección y el reconocimiento', () => {
    vi.mocked(hasPermission).mockImplementation((permission) => permission === 'providers:read')
    expect(canEditProviderProfiles()).toBe(false)
    const html = renderToStaticMarkup(<ProviderProfilesSection />)
    expect(html).toContain('Perfiles de proveedor')
    expect(html).toContain('Reconocer proveedor')
    expect(html).toContain('Crear perfil')
  })

  it('con `providers:write` se habilitan crear/guardar', () => {
    vi.mocked(hasPermission).mockImplementation((permission) => permission === 'providers:write')
    expect(canEditProviderProfiles()).toBe(true)
  })

  it('la capa legada `canManageListas` habilita la gestión', () => {
    vi.mocked(canManageListas).mockReturnValue(true)
    expect(canManageProviderProfiles()).toBe(true)
    expect(canEditProviderProfiles()).toBe(true)
  })
})

describe('IMP-07B frontend — validación en cliente (misma regla que el servidor)', () => {
  it('un perfil correcto no tiene errores', () => {
    expect(hasFormErrors(validateProfileForm(base))).toBe(false)
  })

  it('señala proveedor, hoja, fila, separadores, tarifas y encabezados', () => {
    const errors = validateProfileForm({
      ...base,
      providerName: '  ',
      sheet: '',
      headerRow: 0,
      thousandsSeparator: ',',
      decimalSeparator: ',',
      tariffs: [],
      expectedColumns: [' '],
    })
    expect(Object.keys(errors).sort()).toEqual(['expectedColumns', 'headerRow', 'providerName', 'separators', 'sheet', 'tariffs'])
  })

  it('parseHeaders limpia espacios y descarta vacíos', () => {
    expect(parseHeaders(' REFERENCIA , , DPP_ORO_IVA ')).toEqual(['REFERENCIA', 'DPP_ORO_IVA'])
  })
})

describe('IMP-07B frontend — mensajes de reconocimiento (casos 1 y 2)', () => {
  const rec = (over: Partial<ProviderRecognition>): ProviderRecognition => ({
    found: true, profileId: 'p1', providerName: 'Hikvision', version: 3,
    matches: true, requiresReview: false, expectedColumns: ['REFERENCIA'], ...over,
  })

  it('mismo proveedor y encabezado → no hay que mapear de nuevo', () => {
    const message = recognitionMessage(rec({}))
    expect(message.tone).toBe('ok')
    expect(message.message).toContain('no hay que mapear de nuevo')
  })

  it('proveedor nuevo o encabezado cambiado → revisar', () => {
    expect(recognitionMessage(rec({ found: false, profileId: null, version: null, matches: false, requiresReview: true })).tone).toBe('review')
    const changed = recognitionMessage(rec({ matches: false, requiresReview: true }))
    expect(changed.tone).toBe('review')
    expect(changed.message).toContain('cambió')
  })
})

describe('IMP-07B frontend — resumen de resolución', () => {
  it('cuenta resueltas y pendientes; las ambiguas no se adivinan', () => {
    const resolution: ResolvedReference[] = [
      { externalRef: 'A', productId: 'p1', status: 'resolved' },
      { externalRef: 'B', productId: null, status: 'pending' },
      { externalRef: 'C', productId: null, status: 'pending' },
    ]
    expect(summarizeResolution(resolution)).toEqual({ resolved: 1, pending: 2, pendingRefs: ['B', 'C'] })
  })
})
