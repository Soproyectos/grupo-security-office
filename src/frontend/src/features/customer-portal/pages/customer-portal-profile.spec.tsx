import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CustomerAccountPage, { CustomerPortalShell } from './CustomerAccountPage'
import CompleteProfilePage from './CompleteProfilePage'
import DeleteAccountForm from '../components/DeleteAccountForm'
import ChangePasswordForm from '../components/ChangePasswordForm'
import ChangeEmailForm from '../components/ChangeEmailForm'
import CreatePasswordForm from '../components/CreatePasswordForm'
import LinkedAccountsSection from '../components/LinkedAccountsSection'

/** Static render of the profile flow: redirect when incomplete, complete-profile form, delete-account section. */

const sessionMock = vi.hoisted(() => ({ isPending: false, isError: false, data: undefined as unknown }))
const mutationMock = vi.hoisted(() => ({ isPending: false, isError: false, mutate: vi.fn() }))

vi.mock('../hooks/useCustomerPortal', () => ({
  useCustomerPortalSession: () => sessionMock,
  useCustomerPortalLogout: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
}))
vi.mock('../hooks/usePortalQuotes', () => ({ useMunicipalities: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }) }))
vi.mock('../hooks/usePortalProfile', () => ({
  useDeletePortalAccount: () => mutationMock,
  useUpdatePortalProfile: () => mutationMock,
  useChangePortalPassword: () => mutationMock,
  useChangePortalEmail: () => mutationMock,
  useCreatePortalPassword: () => mutationMock,
  useRefreshPortalSession: () => vi.fn(),
}))

function renderPortal(path: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          { path: '/clientes', element: createElement(CustomerPortalShell) },
          createElement(Route, { index: true, element: createElement(CustomerAccountPage) }),
          createElement(Route, { path: 'perfil', element: createElement(CustomerAccountPage, { profile: true }) }),
          createElement(Route, { path: 'completar-perfil', element: createElement(CompleteProfilePage) }),
        ),
      ),
    ),
  )
}

const base = { id: 'a1', email: 'ana@example.com', contactName: 'Ana', type: 'FINAL_CUSTOMER' }

beforeEach(() => {
  sessionMock.data = { ...base, companyName: 'ACME', profileComplete: true, privacyAcceptedAt: '2026-11-01T10:00:00Z' }
})

describe('completar perfil', () => {
  it('redirige a completar datos cuando el perfil está incompleto', () => {
    sessionMock.data = { ...base, companyName: '', profileComplete: false, privacyAcceptedAt: null }
    expect(renderPortal('/clientes')).not.toContain('<main')
  })

  it('muestra los campos, la explicación y la casilla de política si falta', () => {
    sessionMock.data = { ...base, companyName: '', profileComplete: false, privacyAcceptedAt: null }
    const markup = renderPortal('/clientes/completar-perfil')

    expect(markup).toContain('Completa tus datos</h1>')
    expect(markup).toContain('Con estos datos podrás ver el catálogo')
    for (const name of ['companyName', 'documentId', 'phone', 'acceptPrivacy']) expect(markup).toContain(`name="${name}"`)
    expect(markup).toContain('Guardar mis datos')
  })

  it('no repite la casilla si ya aceptó la política', () => {
    sessionMock.data = { ...base, companyName: 'ACME', profileComplete: false, privacyAcceptedAt: '2026-11-01T10:00:00Z' }
    expect(renderPortal('/clientes/completar-perfil')).not.toContain('name="acceptPrivacy"')
  })
})

describe('mis datos', () => {
  it('abre Datos por defecto y enlaza las otras dos secciones', () => {
    const markup = renderPortal('/clientes/perfil')
    expect(markup).toContain('href="/clientes/completar-perfil"')
    expect(markup).toContain('aria-label="Secciones de Mis datos"')
    expect(markup).toContain('href="/clientes/perfil?seccion=seguridad"')
    expect(markup).toContain('href="/clientes/perfil?seccion=cuentas-vinculadas"')
    expect(markup).not.toContain('Eliminar mi cuenta</button>')
  })

  it('explica que el borrado es inmediato y ya no habla de solicitudes', () => {
    const markup = renderPortal('/clientes/perfil?seccion=seguridad')
    expect(markup).toContain('Se borrará tu cuenta y tus datos de acceso de inmediato.')
    expect(markup).toContain('los conserva la empresa')
    expect(markup).not.toContain('Solicitaste eliminar')
  })
})

describe('contraseña y correo en mis datos', () => {
  const full = { ...base, companyName: 'ACME', profileComplete: true, privacyAcceptedAt: '2026-11-01T10:00:00Z' }
  it('con contraseña muestra cambiar contraseña, cambiar correo y eliminar, en ese orden', () => {
    sessionMock.data = { ...full, hasPassword: true }
    const markup = renderPortal('/clientes/perfil?seccion=seguridad')
    expect(markup).not.toContain('Datos de tu cuenta</h2>')
    expect(markup).not.toContain('Cuentas vinculadas</h2>')
    const order = ['Cambiar contraseña</h2>', 'Cambiar correo</h2>', 'Eliminar mi cuenta</h2>'].map((text) => markup.indexOf(text))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(markup).not.toContain('Entraste con Google')
  })

  it('con Google ofrece crear contraseña (opcional) y no los formularios de cambio, en orden', () => {
    sessionMock.data = { ...full, hasPassword: false }
    const markup = renderPortal('/clientes/perfil?seccion=seguridad')
    expect(markup).not.toContain('Cambiar contraseña')
    expect(markup).not.toContain('Cambiar correo')
    expect(markup).not.toContain('Entraste con Google')
    const order = ['Crear contraseña (opcional)</h2>', 'Eliminar mi cuenta</h2>'].map((text) => markup.indexOf(text))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('muestra el aviso cuando la URL trae ?email=cambiado', () => {
    sessionMock.data = { ...full, hasPassword: true }
    const markup = renderPortal('/clientes/perfil?email=cambiado')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('Tu correo se actualizó.')
    expect(markup).toContain('Cambiar correo</h2>')
    expect(renderPortal('/clientes/perfil')).not.toContain('Tu correo se actualizó.')
  })
})

describe('formularios de cambio', () => {
  const account = { ...base, hasPassword: true } as never
  it('contraseña: campos, etiquetas, lista de requisitos y botón', () => {
    const markup = renderToStaticMarkup(createElement(ChangePasswordForm, { account }))
    for (const label of ['Contraseña actual', 'Contraseña nueva', 'Confirmar contraseña nueva']) expect(markup).toContain(label)
    for (const name of ['currentPassword', 'newPassword', 'confirmPassword']) expect(markup).toContain('name="' + name + '"')
    expect(markup).toContain('Tu contraseña debe tener:')
    expect(markup).toContain('>Cambiar contraseña</button>')
    expect(markup).toContain('autoComplete="new-password"')
  })
  it('correo: muestra el correo actual, campos y botón', () => {
    const markup = renderToStaticMarkup(createElement(ChangeEmailForm, { account }))
    expect(markup).toContain('ana@example.com')
    expect(markup).toContain('Correo nuevo')
    expect(markup).toContain('name="newEmail"')
    expect(markup).toContain('type="email"')
    expect(markup).toContain('autoComplete="off"')
    expect(markup).toContain('Contraseña actual')
    expect(markup).toContain('>Enviar enlace al correo nuevo</button>')
  })
})

describe('confirmar eliminación', () => {
  const render = (account: unknown) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(DeleteAccountForm, { account: account as never, onCancel: () => undefined })))

  it('pide la contraseña con botón Mostrar cuando la cuenta tiene una', () => {
    const markup = render({ ...base, hasPassword: true })
    expect(markup).toContain('Escribe tu contraseña para confirmar')
    expect(markup).toContain('type="password"')
    expect(markup).toContain('Mostrar')
    expect(markup).not.toContain('name="confirmEmail"')
    expect(markup).toContain('Eliminar definitivamente')
    expect(markup).toMatch(/<button type="submit" disabled=""[^>]*>Eliminar definitivamente/)
  })

  it('pide el correo cuando la cuenta entró con Google', () => {
    const markup = render({ ...base, hasPassword: false })
    expect(markup).toContain('Escribe tu correo para confirmar')
    expect(markup).toContain('name="confirmEmail"')
    expect(markup).toContain('autoComplete="off"')
    expect(markup).not.toContain('type="password"')
  })
})

describe('completar perfil sin contraseña', () => {
  const states = [
    { ...base, companyName: '', profileComplete: false, privacyAcceptedAt: null, hasPassword: false },
    { ...base, companyName: 'ACME', profileComplete: false, privacyAcceptedAt: '2026-11-01T10:00:00Z', hasPassword: false },
    { ...base, companyName: '', profileComplete: false, privacyAcceptedAt: null, hasPassword: true },
    { ...base, companyName: '', profileComplete: false, privacyAcceptedAt: null },
  ]
  it('nunca muestra campos ni textos de contraseña', () => {
    for (const data of states) {
      sessionMock.data = data
      const markup = renderPortal('/clientes/completar-perfil')
      expect(markup).toContain('Completa tus datos</h1>')
      expect(markup).toContain('name="companyName"')
      expect(markup).not.toContain('type="password"')
      for (const text of ['Crea una contraseña', 'Crea tu contraseña', 'Confirmar contraseña', 'Con una contraseña podrás', 'Tu contraseña debe tener']) expect(markup).not.toContain(text)
    }
  })
  it('el shell manda a completar solo cuando profileComplete es false', () => {
    sessionMock.data = { ...base, companyName: '', profileComplete: false, privacyAcceptedAt: null, hasPassword: false }
    expect(renderPortal('/clientes')).not.toContain('<main')
    sessionMock.data = { ...base, companyName: 'ACME', profileComplete: true, privacyAcceptedAt: '2026-11-01T10:00:00Z', hasPassword: false }
    expect(renderPortal('/clientes')).toContain('<main')
  })
})

describe('crear contraseña (opcional)', () => {
  it('muestra campos, lista de requisitos, botón y la línea de Google', () => {
    const markup = renderToStaticMarkup(createElement(CreatePasswordForm, { account: { ...base, hasPassword: false } as never }))
    expect(markup).toContain('Crear contraseña (opcional)</h2>')
    expect(markup).toContain('Con una contraseña podrás entrar también con tu correo y cambiar tu contraseña aquí. Tu correo de Google no cambia.')
    for (const label of ['Contraseña nueva', 'Confirmar contraseña']) expect(markup).toContain(label)
    for (const name of ['newPassword', 'confirmPassword']) expect(markup).toContain('name="' + name + '"')
    expect(markup).toContain('autoComplete="new-password"')
    expect(markup).toContain('Tu contraseña debe tener:')
    expect(markup).toContain('>Crear contraseña</button>')
    expect(markup).toContain('Tu correo lo administra Google.')
    expect(markup).not.toContain('role="alert"')
  })
})

describe('cuentas vinculadas', () => {
  const full = { ...base, companyName: 'ACME', profileComplete: true, privacyAcceptedAt: '2026-11-01T10:00:00Z' }
  const section = (account: object) => renderToStaticMarkup(createElement(LinkedAccountsSection, { account: account as never }))
  it('no vinculada con contraseña: solo lectura y línea de unión automática', () => {
    const markup = section({ ...full, hasPassword: true, linkedProviders: ['credential'] })
    expect(markup).toContain('No vinculada')
    expect(markup).toContain('Si entras con Google usando este mismo correo (ana@example.com), tu cuenta se une sola.')
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('Vincular Google')
  })
  it('vinculada: solo muestra el estado, sin botones ni texto extra', () => {
    const markup = section({ ...full, hasPassword: true, linkedProviders: ['credential', 'google'] })
    expect(markup).toContain('>Vinculada<')
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('se une sola')
  })
  it('sin contraseña: muestra el estado, sin botón ni línea de unión', () => {
    const markup = section({ ...full, hasPassword: false, linkedProviders: ['google'] })
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('se une sola')
  })
  it('abre Cuentas vinculadas directamente y solo muestra su contenido', () => {
    sessionMock.data = { ...full, hasPassword: true }
    const markup = renderPortal('/clientes/perfil?seccion=cuentas-vinculadas')
    expect(markup).toContain('Cuentas vinculadas</h2>')
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/clientes\/perfil\?seccion=cuentas-vinculadas"[^>]*>Cuentas vinculadas<\/a>/)
    expect(markup).not.toContain('Datos de tu cuenta</h2>')
    expect(markup).not.toContain('Cambiar contraseña</h2>')
  })
  it('ya no muestra avisos de ?google=', () => {
    sessionMock.data = { ...full, hasPassword: true }
    expect(renderPortal('/clientes/perfil?google=vinculada')).not.toContain('Vinculamos tu cuenta')
    expect(renderPortal('/clientes/perfil?google=error')).not.toContain('No pudimos vincular')
  })
})
