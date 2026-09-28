import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { accessRequestSchema } from './pages/request-access.schema'
import { shouldRedirectOn401 } from '../../services/api'

// Validation schema tests — import the real schema from the module the
// component uses, so drift between the component's schema and this suite
// is impossible.
describe('Access Request Validation Schema', () => {
  it('accepts valid access request data', () => {
    const validData = {
      companyName: 'Constructora Andina S.A.S.',
      nit: '900123456-7',
      contactName: 'Juan Pérez',
      email: 'juan@constructora.com',
      phone: '(6) 123 4567',
      customerType: 'INSTALLER' as const,
    }
    expect(() => accessRequestSchema.parse(validData)).not.toThrow()
  })

  it('rejects companyName exceeding 120 characters', () => {
    const invalidData = {
      companyName: 'A'.repeat(121),
      nit: '900123456-7',
      contactName: 'Juan Pérez',
      email: 'juan@constructora.com',
      phone: '(6) 123 4567',
      customerType: 'INSTALLER' as const,
    }
    expect(() => accessRequestSchema.parse(invalidData)).toThrow()
  })

  it('rejects invalid NIT format', () => {
    const testCases = [
      'invalid-nit',
      '123', // too short
      '123456789012345', // too long
      'abc123456', // contains letters
    ]
    testCases.forEach((nit) => {
      const invalidData = {
        companyName: 'Constructora Andina S.A.S.',
        nit,
        contactName: 'Juan Pérez',
        email: 'juan@constructora.com',
        phone: '(6) 123 4567',
        customerType: 'INSTALLER' as const,
      }
      expect(() => accessRequestSchema.parse(invalidData)).toThrow()
    })
  })

  it('accepts valid NIT formats', () => {
    const validNits = [
      '12345-6',
      '123456789012',
      '900123456-7',
    ]
    validNits.forEach((nit) => {
      const validData = {
        companyName: 'Constructora Andina S.A.S.',
        nit,
        contactName: 'Juan Pérez',
        email: 'juan@constructora.com',
        phone: '(6) 123 4567',
        customerType: 'INSTALLER' as const,
      }
      expect(() => accessRequestSchema.parse(validData)).not.toThrow()
    })
  })

  it('rejects contactName exceeding 80 characters', () => {
    const invalidData = {
      companyName: 'Constructora Andina S.A.S.',
      nit: '900123456-7',
      contactName: 'A'.repeat(81),
      email: 'juan@constructora.com',
      phone: '(6) 123 4567',
      customerType: 'INSTALLER' as const,
    }
    expect(() => accessRequestSchema.parse(invalidData)).toThrow()
  })

  it('rejects invalid email format', () => {
    const invalidEmails = ['notanemail', 'missing@domain', '@nodomain.com']
    invalidEmails.forEach((email) => {
      const invalidData = {
        companyName: 'Constructora Andina S.A.S.',
        nit: '900123456-7',
        contactName: 'Juan Pérez',
        email,
        phone: '(6) 123 4567',
        customerType: 'INSTALLER' as const,
      }
      expect(() => accessRequestSchema.parse(invalidData)).toThrow()
    })
  })

  it('rejects email exceeding 120 characters', () => {
    const invalidData = {
      companyName: 'Constructora Andina S.A.S.',
      nit: '900123456-7',
      contactName: 'Juan Pérez',
      email: 'a'.repeat(110) + '@example.com',
      phone: '(6) 123 4567',
      customerType: 'INSTALLER' as const,
    }
    expect(() => accessRequestSchema.parse(invalidData)).toThrow()
  })

  it('rejects invalid phone format', () => {
    const invalidPhones = ['123', '!@#$%', 'a'.repeat(21)]
    invalidPhones.forEach((phone) => {
      const invalidData = {
        companyName: 'Constructora Andina S.A.S.',
        nit: '900123456-7',
        contactName: 'Juan Pérez',
        email: 'juan@constructora.com',
        phone,
        customerType: 'INSTALLER' as const,
      }
      expect(() => accessRequestSchema.parse(invalidData)).toThrow()
    })
  })

  it('accepts valid phone formats', () => {
    const validPhones = ['(6) 123 4567', '+57 1 234 5678', '60123456789']
    validPhones.forEach((phone) => {
      const validData = {
        companyName: 'Constructora Andina S.A.S.',
        nit: '900123456-7',
        contactName: 'Juan Pérez',
        email: 'juan@constructora.com',
        phone,
        customerType: 'INSTALLER' as const,
      }
      expect(() => accessRequestSchema.parse(validData)).not.toThrow()
    })
  })

  it('rejects invalid customerType', () => {
    const invalidData = {
      companyName: 'Constructora Andina S.A.S.',
      nit: '900123456-7',
      contactName: 'Juan Pérez',
      email: 'juan@constructora.com',
      phone: '(6) 123 4567',
      customerType: 'INVALID_TYPE',
    }
    expect(() => accessRequestSchema.parse(invalidData)).toThrow()
  })

  it('accepts all valid customerTypes', () => {
    const validTypes = ['INSTALLER', 'DISTRIBUTOR', 'END_COMPANY']
    validTypes.forEach((type) => {
      const validData = {
        companyName: 'Constructora Andina S.A.S.',
        nit: '900123456-7',
        contactName: 'Juan Pérez',
        email: 'juan@constructora.com',
        phone: '(6) 123 4567',
        customerType: type,
      }
      expect(() => accessRequestSchema.parse(validData)).not.toThrow()
    })
  })

  it('allows optional website field', () => {
    const validData = {
      companyName: 'Constructora Andina S.A.S.',
      nit: '900123456-7',
      contactName: 'Juan Pérez',
      email: 'juan@constructora.com',
      phone: '(6) 123 4567',
      customerType: 'INSTALLER' as const,
      website: 'https://example.com',
    }
    expect(() => accessRequestSchema.parse(validData)).not.toThrow()
  })
})

// Exercises the real guard used by the axios response interceptor
describe('API 401 Redirect Logic', () => {
  it('should not redirect on 401 when path starts with /tienda', () => {
    const shouldRedirect = shouldRedirectOn401('/tienda/solicitar-acceso')
    expect(shouldRedirect).toBe(false)
  })

  it('should not redirect on 401 when path is /tienda', () => {
    const shouldRedirect = shouldRedirectOn401('/tienda')
    expect(shouldRedirect).toBe(false)
  })

  it('should redirect on 401 when path does not include /login or /tienda', () => {
    const shouldRedirect = shouldRedirectOn401('/dashboard')
    expect(shouldRedirect).toBe(true)
  })

  it('should not redirect on 401 when path includes /login', () => {
    const shouldRedirect = shouldRedirectOn401('/login')
    expect(shouldRedirect).toBe(false)
  })

  it('should not redirect on 401 when path is /tienda/login', () => {
    const shouldRedirect = shouldRedirectOn401('/tienda/login')
    expect(shouldRedirect).toBe(false)
  })
})

// --- Real component rendering below, via Testing Library ---

vi.mock('../../services/access-requests.service', () => ({
  submitAccessRequest: vi.fn(),
}))

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>(
    '../../services/api'
  )
  return {
    ...actual,
    default: { post: vi.fn(), get: vi.fn() },
  }
})

import RequestAccess from './pages/RequestAccess'
import ClientLogin from './pages/ClientLogin'
import { submitAccessRequest } from '../../services/access-requests.service'
import api from '../../services/api'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

async function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Nombre de la empresa'), {
    target: { value: 'Constructora Andina S.A.S.' },
  })
  fireEvent.change(screen.getByLabelText('NIT'), {
    target: { value: '900123456-7' },
  })
  fireEvent.change(screen.getByLabelText('Nombre de contacto'), {
    target: { value: 'Juan Pérez' },
  })
  fireEvent.change(screen.getByLabelText('Correo corporativo'), {
    target: { value: 'juan@constructora.com' },
  })
  fireEvent.change(screen.getByLabelText('Teléfono'), {
    target: { value: '(6) 123 4567' },
  })
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'INSTALLER' },
  })
}

describe('Honeypot Protection', () => {
  it('renders the hidden website field, unfilled by a real user', () => {
    renderWithRouter(<RequestAccess />)

    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement
    expect(honeypot).not.toBeNull()
    expect(honeypot.style.display).toBe('none')
    expect(honeypot.tabIndex).toBe(-1)
    expect(honeypot.getAttribute('aria-hidden')).toBe('true')
    expect(honeypot.value).toBe('')
  })
})

describe('RequestAccess page', () => {
  beforeEach(() => {
    vi.mocked(submitAccessRequest).mockReset()
  })

  it('shows the success state after a valid submission', async () => {
    vi.mocked(submitAccessRequest).mockResolvedValue({ received: true })
    renderWithRouter(<RequestAccess />)

    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    await waitFor(() => {
      expect(screen.getByText('Solicitud enviada')).toBeInTheDocument()
    })
    expect(submitAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: 'Constructora Andina S.A.S.',
        nit: '900123456-7',
        email: 'juan@constructora.com',
      })
    )
  })

  it('shows the rate-limited message on a 429 response', async () => {
    vi.mocked(submitAccessRequest).mockRejectedValue({
      response: { status: 429 },
    })
    renderWithRouter(<RequestAccess />)

    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    await waitFor(() => {
      expect(
        screen.getByText('Demasiadas solicitudes, intenta más tarde')
      ).toBeInTheDocument()
    })
  })

  it('shows a generic error message on any other failure', async () => {
    vi.mocked(submitAccessRequest).mockRejectedValue(new Error('network down'))
    renderWithRouter(<RequestAccess />)

    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    await waitFor(() => {
      expect(
        screen.getByText('Hubo un error al enviar tu solicitud. Intenta de nuevo.')
      ).toBeInTheDocument()
    })
  })
})

describe('ClientLogin page', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockClear()
  })

  it('does not call the staff auth endpoint on submit; shows the coming-soon message', async () => {
    renderWithRouter(<ClientLogin />)

    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'cliente@empresa.com' },
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'whatever' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => {
      expect(
        screen.getByText('El portal de clientes estará disponible pronto.')
      ).toBeInTheDocument()
    })
    expect(api.post).not.toHaveBeenCalled()
  })
})
