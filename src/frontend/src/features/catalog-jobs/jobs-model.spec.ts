import { describe, expect, it } from 'vitest'
import {
  isJobActive,
  progressLabel,
  scanRetryKey,
  shouldPoll,
  stateLabel,
} from './jobs-model'

/**
 * CAT-07 frontend — modelo PURO (sin red): etiquetas honestas del estado y
 * reglas de visibilidad/avance. Reflejan la semántica probada del servidor,
 * incluida la ENMIENDA 2026-10-19: revocar todas las concesiones antes del
 * disparo produce `CANCELLED` con `error: 'permission-revoked'`.
 */
describe('jobs-model (CAT-07 frontend)', () => {
  it('solo QUEUED/RUNNING son trabajos activos (y por tanto cancelables/polineables)', () => {
    expect(isJobActive({ state: 'QUEUED' })).toBe(true)
    expect(isJobActive({ state: 'RUNNING' })).toBe(true)
    for (const state of ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED', 'EXPIRED']) {
      expect(isJobActive({ state })).toBe(false)
    }
  })

  it('el progreso muestra los contadores DERIVADOS del servidor tal cual', () => {
    expect(progressLabel({ progressDone: 3, progressTotal: 12 })).toBe('3/12')
    expect(progressLabel({ progressDone: 0, progressTotal: 0 })).toBe('0/0')
  })

  it('stateLabel nombra la revocación real como lo que es (enmienda 2026-10-19)', () => {
    expect(stateLabel({ state: 'CANCELLED', error: 'permission-revoked' })).toBe(
      'Cancelado: se retiraron los permisos antes de ejecutar',
    )
    expect(stateLabel({ state: 'CANCELLED', error: 'cancelled-by-user' })).toBe('Cancelado por el usuario')
    expect(stateLabel({ state: 'RUNNING', error: null })).toBe('En ejecución')
    // desconocido → se muestra crudo (nunca se inventa una traducción).
    expect(stateLabel({ state: 'EXPIRED', error: null })).toBe('Expirado')
  })

  it('shouldPoll: solo mientras hay algo vivo que refrescar', () => {
    expect(shouldPoll([{ state: 'COMPLETED' }, { state: 'RUNNING' }])).toBe(true)
    expect(shouldPoll([{ state: 'COMPLETED' }])).toBe(false)
    expect(shouldPoll([])).toBe(false)
  })

  it('scanRetryKey es determinista dentro de la hora (re-pulsar no duplica)', () => {
    const t = 1_763_500_000_000
    expect(scanRetryKey('l-1', t)).toBe(scanRetryKey('l-1', t + 59_999))
    expect(scanRetryKey('l-1', t)).not.toBe(scanRetryKey('l-1', t + 3_600_000))
    expect(scanRetryKey('l-2', t)).not.toBe(scanRetryKey('l-1', t))
  })
})
