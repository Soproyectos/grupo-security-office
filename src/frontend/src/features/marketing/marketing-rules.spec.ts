import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_IMAGE_RULES,
  campaignStatus,
  isRevisionConflict,
  isoToLocalInput,
  localInputToIso,
  measureGuideText,
  previewImageStyle,
  validateImageDimensions,
  validateImageFile,
} from './marketing-rules'

describe('medidas de las imágenes (espejo del servidor)', () => {
  it('replica las cifras aprobadas', () => {
    expect(CAMPAIGN_IMAGE_RULES.desktop).toMatchObject({ minWidth: 1000, minRatio: 2.0, maxRatio: 2.6, recommended: { width: 1200, height: 520 } })
    expect(CAMPAIGN_IMAGE_RULES.mobile).toMatchObject({ minWidth: 600, minRatio: 1.2, maxRatio: 1.5, recommended: { width: 900, height: 675 } })
    expect(CAMPAIGN_IMAGE_RULES.image).toMatchObject({ minWidth: 600, minRatio: 0.6, maxRatio: 1.8, recommended: { width: 900, height: 900 } })
  })

  it('la guía de escritorio nombra todas sus cifras', () => {
    expect(measureGuideText('desktop')).toBe('1200 × 520 px recomendado · ancho mínimo 1000 px · proporción entre 2.0 y 2.6 · máximo 3 MB · PNG, JPEG o WebP')
    expect(measureGuideText('mobile')).toContain('900 × 675 px')
    expect(measureGuideText('image')).toContain('900 × 900 px')
  })
})

describe('validateImageFile', () => {
  it('acepta PNG, JPEG y WebP hasta 3 MB', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(validateImageFile({ type, size: 3 * 1024 * 1024 })).toBeNull()
  })
  it('rechaza otros tipos', () => {
    expect(validateImageFile({ type: 'image/gif', size: 100 })).toBe('El archivo debe ser una imagen PNG, JPEG o WebP.')
    expect(validateImageFile({ type: '', size: 100 })).toContain('PNG, JPEG o WebP')
  })
  it('rechaza lo que pesa más de 3 MB e indica el peso', () => {
    expect(validateImageFile({ type: 'image/png', size: 3 * 1024 * 1024 + 1 })).toBe('La imagen pesa 3,0 MB; el máximo es 3 MB.')
    expect(validateImageFile({ type: 'image/png', size: 5 * 1024 * 1024 })).toBe('La imagen pesa 5,0 MB; el máximo es 3 MB.')
  })
})

describe('validateImageDimensions', () => {
  it('acepta la medida recomendada de cada espacio', () => {
    expect(validateImageDimensions({ width: 1200, height: 520 }, 'desktop')).toBeNull()
    expect(validateImageDimensions({ width: 900, height: 675 }, 'mobile')).toBeNull()
    expect(validateImageDimensions({ width: 900, height: 900 }, 'image')).toBeNull()
  })
  it('acepta los extremos de ancho y proporción', () => {
    expect(validateImageDimensions({ width: 1000, height: 500 }, 'desktop')).toBeNull() // 2.0
    expect(validateImageDimensions({ width: 1300, height: 500 }, 'desktop')).toBeNull() // 2.6
    expect(validateImageDimensions({ width: 600, height: 500 }, 'mobile')).toBeNull() // 1.2
    expect(validateImageDimensions({ width: 600, height: 1000 }, 'image')).toBeNull() // 0.6
  })
  it('rechaza el ancho menor al mínimo con la medida encontrada y la esperada', () => {
    expect(validateImageDimensions({ width: 900, height: 400 }, 'desktop')).toBe(
      'La imagen mide 900 × 400 px; el ancho mínimo es 1000 px, para el banner de escritorio sube una de 1200 × 520 px aproximadamente.',
    )
  })
  it('rechaza proporciones fuera de rango', () => {
    expect(validateImageDimensions({ width: 1200, height: 1200 }, 'desktop')).toContain('proporción 1.00:1')
    expect(validateImageDimensions({ width: 1200, height: 1200 }, 'desktop')).toContain('proporción entre 2.0 y 2.6')
    expect(validateImageDimensions({ width: 1200, height: 400 }, 'mobile')).toContain('proporción entre 1.2 y 1.5')
    expect(validateImageDimensions({ width: 2000, height: 1000 }, 'image')).toContain('proporción 2.00:1')
  })
  it('rechaza lados enormes y medidas ilegibles', () => {
    expect(validateImageDimensions({ width: 6001, height: 2700 }, 'desktop')).toContain('el lado máximo es 6000 px')
    expect(validateImageDimensions({ width: 0, height: 0 }, 'desktop')).toBe('No se pudo leer el tamaño de la imagen.')
  })
})

describe('campaignStatus', () => {
  const base = { hasUnpublishedChanges: false }
  it('traduce los estados', () => {
    expect(campaignStatus({ ...base, status: 'DRAFT', validity: null })).toEqual({ label: 'Borrador', tone: 'neutral', extra: null })
    expect(campaignStatus({ ...base, status: 'PUBLISHED', validity: 'ACTIVE' }).label).toBe('Publicado')
    expect(campaignStatus({ ...base, status: 'PUBLISHED', validity: 'SCHEDULED' }).label).toBe('Programado')
    expect(campaignStatus({ ...base, status: 'PUBLISHED', validity: 'EXPIRED' }).label).toBe('Vencido')
  })
  it('avisa de los cambios sin publicar', () => {
    expect(campaignStatus({ status: 'PUBLISHED', validity: 'ACTIVE', hasUnpublishedChanges: true }).label).toBe('Publicado con cambios sin publicar')
    expect(campaignStatus({ status: 'PUBLISHED', validity: 'SCHEDULED', hasUnpublishedChanges: true })).toMatchObject({ label: 'Programado', extra: 'Con cambios sin publicar' })
  })
})

describe('vista previa y fechas', () => {
  it('usa ajuste y foco en el encuadre', () => {
    expect(previewImageStyle('cover', 20, 80)).toEqual({ objectFit: 'cover', objectPosition: '20% 80%' })
    expect(previewImageStyle('contain', 150, -5)).toEqual({ objectFit: 'contain', objectPosition: '100% 0%' })
  })
  it('convierte hora de Colombia a ISO y de vuelta', () => {
    expect(localInputToIso('2026-11-05T08:30')).toBe('2026-11-05T13:30:00.000Z')
    expect(isoToLocalInput('2026-11-05T13:30:00.000Z')).toBe('2026-11-05T08:30')
    expect(localInputToIso('')).toBeNull()
    expect(isoToLocalInput(null)).toBe('')
    expect(() => localInputToIso('mañana')).toThrow()
  })
})

describe('isRevisionConflict', () => {
  const conflict = (message: string) => ({ response: { status: 409, data: { message } } })
  it('al editar cualquier 409 es de revisión', () => {
    expect(isRevisionConflict(conflict('x'), 'edit')).toBe(true)
  })
  it('en otras operaciones solo el mensaje de revisión; los demás 409 se muestran tal cual', () => {
    expect(isRevisionConflict(conflict('La campaña cambió mientras la editabas; recarga para ver la versión más reciente'), 'other')).toBe(true)
    expect(isRevisionConflict(conflict('Ya hay 6 banners del título publicados; retira uno antes de publicar otro'), 'other')).toBe(false)
    expect(isRevisionConflict({ response: { status: 400, data: {} } }, 'edit')).toBe(false)
  })
})
