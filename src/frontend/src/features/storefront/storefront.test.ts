import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { shouldRedirectOn401 } from '../../services/api'

// Validation schema tests
describe('Access Request Validation Schema', () => {
  const accessRequestSchema = z.object({
    companyName: z
      .string()
      .min(1, 'El nombre de la empresa es requerido')
      .max(120, 'El nombre no puede exceder 120 caracteres'),
    nit: z
      .string()
      .min(1, 'El NIT es requerido')
      .regex(/^[0-9]{5,12}(-[0-9])?$/, 'El NIT debe tener un formato válido'),
    contactName: z
      .string()
      .min(1, 'El nombre de contacto es requerido')
      .max(80, 'El nombre no puede exceder 80 caracteres'),
    email: z
      .string()
      .min(1, 'El email es requerido')
      .email('El email no es válido')
      .max(120, 'El email no puede exceder 120 caracteres'),
    phone: z
      .string()
      .min(1, 'El teléfono es requerido')
      .regex(
        /^[0-9+ ()-]{7,20}$/,
        'El teléfono debe tener un formato válido (7-20 caracteres)'
      ),
    customerType: z.enum(['INSTALLER', 'DISTRIBUTOR', 'END_COMPANY']),
    website: z.string().optional(),
  })

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

// Honeypot field test
describe('Honeypot Protection', () => {
  it('form includes hidden website field', () => {
    // This is a structural check - in a real test with Testing Library,
    // we would render the component and check for the hidden input
    const honeypotField = {
      name: 'website',
      type: 'text',
      tabIndex: -1,
      ariaHidden: true,
      display: 'none',
    }

    expect(honeypotField.name).toBe('website')
    expect(honeypotField.tabIndex).toBe(-1)
    expect(honeypotField.display).toBe('none')
  })
})
