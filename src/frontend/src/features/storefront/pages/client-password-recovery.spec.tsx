import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import ClientForgotPasswordPage from './ClientForgotPasswordPage'
import ClientLoginPage from './ClientLoginPage'
import ClientResetPasswordPage from './ClientResetPasswordPage'
import PasswordResetSuccessPage from './PasswordResetSuccessPage'

function renderPage(page: ReactNode, path: string) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('recuperación de contraseña de clientes', () => {
  it('enlaza a la solicitud desde el inicio de sesión del portal', () => {
    const markup = renderPage(<ClientLoginPage />, '/clientes/login')

    expect(markup).toContain('href="/clientes/recuperar"')
    expect(markup).toContain('Entrar con Google')
  })

  it('asocia el campo de correo con su etiqueta', () => {
    const markup = renderPage(<ClientForgotPasswordPage />, '/clientes/recuperar')

    expect(markup).toContain('for="recovery-email"')
    expect(markup).toContain('id="recovery-email"')
  })

  it('muestra confirmaciones distintas para la solicitud y el cambio de contraseña', () => {
    const requested = renderPage(<PasswordResetSuccessPage stage="requested" />, '/clientes/recuperar/exitoso')
    const reset = renderPage(<PasswordResetSuccessPage />, '/clientes/recuperar/satisfecho')

    expect(requested).toContain('Si el correo corresponde a una cuenta habilitada')
    expect(requested).not.toContain('Contraseña actualizada')
    expect(reset).toContain('Ya puedes iniciar sesión con tu nueva contraseña')
  })

  it('ofrece solicitar otro enlace cuando falta parte del enlace', () => {
    const markup = renderPage(<ClientResetPasswordPage />, '/clientes/restablecer')

    expect(markup).toContain('El enlace de recuperación está incompleto')
    expect(markup).toContain('href="/clientes/recuperar"')
    expect(markup).not.toContain('type="password"')
  })

  it('presenta los requisitos y la confirmación cuando el enlace está completo', () => {
    const path = '/clientes/restablecer?token=token-ficticio-de-better-auth'
    const markup = renderPage(<ClientResetPasswordPage />, path)

    expect(markup).toContain('Entre 12 y 128 caracteres')
    expect(markup).toContain('aria-describedby="recovery-password-rules"')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('aria-controls="recovery-password"')
    expect(markup).toContain('for="recovery-password-confirmation"')
  })

  it('ofrece otro enlace cuando el servidor marca el token como inválido o vencido', () => {
    const path = '/clientes/restablecer?error=INVALID_TOKEN'
    const markup = renderPage(<ClientResetPasswordPage />, path)

    expect(markup).toContain('El enlace de recuperación ya no es válido')
    expect(markup).toContain('href="/clientes/recuperar"')
  })
})
