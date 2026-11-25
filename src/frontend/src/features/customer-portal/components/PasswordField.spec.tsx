import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import PasswordField from './PasswordField'
import PasswordChecklist from './PasswordChecklist'

describe('PasswordField', () => {
  const markup = renderToStaticMarkup(createElement(PasswordField, { id: 'pw', label: 'Contraseña', error: 'Falta la contraseña' }))

  it('pinta etiqueta asociada, campo oculto y botón Mostrar accesible', () => {
    expect(markup).toContain('for="pw"')
    expect(markup).toContain('id="pw"')
    expect(markup).toContain('type="password"')
    expect(markup).toContain('type="button"')
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).toContain('aria-controls="pw"')
    expect(markup).toContain('>Mostrar</button>')
    expect(markup).toContain('min-h-11')
  })

  it('enlaza el error con role=alert', () => {
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('aria-describedby="pw-error"')
    expect(markup).toContain('aria-invalid="true"')
  })
})

describe('PasswordChecklist', () => {
  it('dice en texto qué está cumplido y qué falta, con aria-live', () => {
    const markup = renderToStaticMarkup(createElement(PasswordChecklist, { password: 'abc' }))
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('Cumplido: </span>Una letra minúscula')
    expect(markup).toContain('Falta: </span>Una letra mayúscula')
    expect(markup).toContain('Falta: </span>Entre 12 y 128 caracteres')
  })
})
