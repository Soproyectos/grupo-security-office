import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ClientLoginPage from './ClientLoginPage'
import AccessRequestPage from './AccessRequestPage'

/**
 * Static render (the repo has no DOM environment) of the two client access
 * pages inside the common storefront chrome: one <main>, one <h1>, the common
 * header and footer, and the form markup (fields, constraints, links).
 */

function render(page: typeof ClientLoginPage, path: string): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(page)),
    ),
  )
}

function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

describe.each([
  ['inicio de sesión', ClientLoginPage, '/clientes/login', 'Inicia sesión'],
  ['registro', AccessRequestPage, '/clientes/registro', 'Crea tu cuenta'],
])('página de %s dentro de la plantilla común', (_name, page, path, title) => {
  const markup = render(page, path)

  it('tiene un solo <main> y un solo <h1>', () => {
    expect(occurrences(markup, '<main')).toBe(1)
    expect(occurrences(markup, '<h1')).toBe(1)
    expect(markup).toContain(`${title}</h1>`)
  })

  it('muestra la cabecera común, el pie y el botón de WhatsApp', () => {
    expect(markup).toContain('aria-label="Grupo Security, inicio"')
    expect(markup).toContain('aria-controls="category-mega-menu"')
    expect(markup).toContain('<footer')
    expect(markup).toContain('aria-label="Escríbenos por WhatsApp"')
  })

  it('no muestra el buscador en la cabecera: el regreso es «Volver a la tienda»', () => {
    expect(markup).not.toContain('aria-label="Buscar productos"')
    expect(markup).not.toContain('placeholder="¿Qué estás buscando?"')
  })

  it('no conserva colores sueltos y mantiene el enlace de regreso', () => {
    expect(markup).not.toContain('slate-')
    expect(markup).not.toContain('#CE0203')
    expect(markup).not.toContain('--color-primary')
    expect(markup).toContain('← Volver a la tienda')
  })
})

describe('formulario de inicio de sesión', () => {
  const markup = render(ClientLoginPage, '/clientes/login')

  it('conserva los campos y el enlace al registro', () => {
    expect(markup).toContain('type="email"')
    expect(markup).toContain('autoComplete="email"')
    expect(markup).toContain('type="password"')
    expect(markup).toContain('>Ingresar</button>')
    expect(markup).toContain('href="/clientes/registro"')
  })
})

describe('formulario de registro', () => {
  const markup = render(AccessRequestPage, '/clientes/registro')

  it('conserva los campos, sus restricciones y el enlace al inicio de sesión', () => {
    for (const name of ['contactName', 'companyName', 'email', 'documentId', 'phone', 'password', 'confirm']) {
      expect(markup).toContain(`name="${name}"`)
    }
    expect(markup).toContain('minLength="12"')
    expect(markup).toContain('>Crear mi cuenta</button>')
    expect(markup).toContain('href="/clientes/login"')
  })

  it('pide la casilla de política con enlace, y deshabilita Google hasta marcarla', () => {
    expect(markup).toContain('name="acceptPrivacy"')
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('href="/politica-de-privacidad"')
    expect(markup).toContain('política de tratamiento de datos')
    expect(markup).toMatch(/<button type="button" disabled=""[^>]*aria-describedby="google-signin-hint"/)
    expect(markup).toContain('primero marca la casilla de la política de tratamiento de datos')
  })

  it('muestra la lista de requisitos de la clave y el botón Mostrar en ambas claves', () => {
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('Falta: </span>Un símbolo')
    expect(markup).toContain('aria-controls="signup-password"')
    expect(markup).toContain('aria-controls="signup-confirm"')
  })
})

describe('formulario de inicio de sesión: clave', () => {
  it('usa el campo con botón Mostrar', () => {
    const markup = render(ClientLoginPage, '/clientes/login')
    expect(markup).toContain('aria-controls="login-password"')
    expect(markup).toMatch(/aria-label="Mostrar [^"]+"/)
  })
})

describe('aviso de cuenta eliminada', () => {
  it('se muestra con ?deleted=1 y no aparece sin él', () => {
    const withNotice = render(ClientLoginPage, '/clientes/login?deleted=1')
    expect(withNotice).toContain('role="status"')
    expect(withNotice).toContain('Tu cuenta fue eliminada. Puedes crear una nueva cuando quieras.')
    expect(render(ClientLoginPage, '/clientes/login')).not.toContain('Tu cuenta fue eliminada')
  })
})
