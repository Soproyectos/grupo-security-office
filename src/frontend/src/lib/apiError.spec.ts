import { describe, expect, it } from 'vitest'
import { getApiErrorFeedback, getApiErrorMessage } from './apiError'

const apiError = (data: unknown) => ({ response: { data } })

describe('getApiErrorFeedback', () => {
  it('returns the string hints sent by the API', () => {
    const error = apiError({ message: 'La contraseña no cumple la política de seguridad.', feedback: ['Debe tener al menos 12 caracteres.', 7] })

    expect(getApiErrorFeedback(error)).toEqual(['Debe tener al menos 12 caracteres.'])
    expect(getApiErrorMessage(error)).toBe('La contraseña no cumple la política de seguridad.')
  })

  it('returns an empty list when there is no feedback', () => {
    expect(getApiErrorFeedback(apiError({ message: 'x' }))).toEqual([])
    expect(getApiErrorFeedback(new Error('network'))).toEqual([])
    expect(getApiErrorFeedback(undefined)).toEqual([])
  })
})
