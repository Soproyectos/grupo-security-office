import { z } from 'zod'

export const accessRequestSchema = z.object({
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
  customerType: z.enum(['INSTALLER', 'DISTRIBUTOR', 'END_COMPANY'], {
    error: 'Selecciona un tipo de cliente válido',
  }),
  website: z.string().optional(),
})

export type AccessRequestFormData = z.infer<typeof accessRequestSchema>
