import { describe, expect, it } from 'vitest'
import {
  IDLE_PHOTO_REMOVAL,
  photoRemovalPhase,
  photoRemovalReducer,
  type PhotoRemovalState,
} from './product-photo-removal'

const confirming = (imageId: string): PhotoRemovalState => ({ phase: 'confirming', imageId })
const deleting = (imageId: string): PhotoRemovalState => ({ phase: 'deleting', imageId })
const failed = (imageId: string): PhotoRemovalState => ({ phase: 'failed', imageId })

describe('photoRemovalReducer', () => {
  it('abrir la confirmación de una foto la pone en confirming', () => {
    expect(photoRemovalReducer(IDLE_PHOTO_REMOVAL, { type: 'open', imageId: 'a' })).toEqual(confirming('a'))
  })

  it('abrir otra foto cierra la confirmación anterior: solo una a la vez', () => {
    expect(photoRemovalReducer(confirming('a'), { type: 'open', imageId: 'b' })).toEqual(confirming('b'))
  })

  it('cancelar vuelve a reposo desde la confirmación y desde un fallo', () => {
    expect(photoRemovalReducer(confirming('a'), { type: 'cancel' })).toEqual(IDLE_PHOTO_REMOVAL)
    expect(photoRemovalReducer(failed('a'), { type: 'cancel' })).toEqual(IDLE_PHOTO_REMOVAL)
  })

  it('confirmar la misma foto la pasa a deleting', () => {
    expect(photoRemovalReducer(confirming('a'), { type: 'confirm', imageId: 'a' })).toEqual(deleting('a'))
  })

  it('confirmar otra foto no cambia nada', () => {
    expect(photoRemovalReducer(confirming('a'), { type: 'confirm', imageId: 'b' })).toEqual(confirming('a'))
  })

  it('mientras se borra no se puede cancelar ni abrir otra foto', () => {
    expect(photoRemovalReducer(deleting('a'), { type: 'cancel' })).toEqual(deleting('a'))
    expect(photoRemovalReducer(deleting('a'), { type: 'open', imageId: 'b' })).toEqual(deleting('a'))
  })

  it('un borrado correcto vuelve a reposo', () => {
    expect(photoRemovalReducer(deleting('a'), { type: 'succeeded' })).toEqual(IDLE_PHOTO_REMOVAL)
  })

  it('un borrado fallido deja la misma foto en failed para reintentar', () => {
    expect(photoRemovalReducer(deleting('a'), { type: 'failed' })).toEqual(failed('a'))
  })

  it('Reintentar (confirmar desde failed) vuelve a deleting', () => {
    expect(photoRemovalReducer(failed('a'), { type: 'confirm', imageId: 'a' })).toEqual(deleting('a'))
  })

  it('abrir otra foto tras un fallo cierra el error de la anterior', () => {
    expect(photoRemovalReducer(failed('a'), { type: 'open', imageId: 'b' })).toEqual(confirming('b'))
  })

  it('las respuestas del servidor sin borrado en curso no cambian el estado', () => {
    expect(photoRemovalReducer(IDLE_PHOTO_REMOVAL, { type: 'succeeded' })).toEqual(IDLE_PHOTO_REMOVAL)
    expect(photoRemovalReducer(IDLE_PHOTO_REMOVAL, { type: 'failed' })).toEqual(IDLE_PHOTO_REMOVAL)
    expect(photoRemovalReducer(confirming('a'), { type: 'failed' })).toEqual(confirming('a'))
  })
})

describe('photoRemovalPhase', () => {
  it('solo la foto en curso ve su fase; las demás están en reposo', () => {
    expect(photoRemovalPhase(deleting('a'), 'a')).toBe('deleting')
    expect(photoRemovalPhase(deleting('a'), 'b')).toBe('idle')
    expect(photoRemovalPhase(IDLE_PHOTO_REMOVAL, 'a')).toBe('idle')
  })
})
