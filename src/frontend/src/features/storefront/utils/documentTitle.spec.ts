import { describe, expect, it } from 'vitest'
import { HOME_TITLE, applyDocumentTitle, pageTitle } from './documentTitle'

describe('pageTitle', () => {
  it('formatea el nombre de la página con la marca', () => {
    expect(pageTitle('Camaras Turbo')).toBe('Camaras Turbo | Grupo Security')
  })

  it('recorta espacios y cae al título de inicio cuando no hay nombre', () => {
    expect(pageTitle('  Catálogo  ')).toBe('Catálogo | Grupo Security')
    expect(pageTitle('')).toBe(HOME_TITLE)
    expect(pageTitle(null)).toBe(HOME_TITLE)
    expect(pageTitle(undefined)).toBe(HOME_TITLE)
  })

  it('no menciona el panel de administración', () => {
    expect(HOME_TITLE).not.toContain('Panel de Administración')
  })
})

describe('applyDocumentTitle', () => {
  it('asigna el título y lo restaura al limpiar', () => {
    const target = { title: 'Grupo Security - Panel de Administración' }

    const restore = applyDocumentTitle(target, 'Catálogo | Grupo Security')
    expect(target.title).toBe('Catálogo | Grupo Security')

    restore()
    expect(target.title).toBe('Grupo Security - Panel de Administración')
  })

  it('encadena títulos anidados en orden inverso', () => {
    const target = { title: 'base' }

    const restoreA = applyDocumentTitle(target, 'a')
    const restoreB = applyDocumentTitle(target, 'b')
    restoreB()
    expect(target.title).toBe('a')
    restoreA()
    expect(target.title).toBe('base')
  })
})
