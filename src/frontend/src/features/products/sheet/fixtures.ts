import type { ProductSheetApi } from './sheet-form'

/** Sheet of the enriched example product, as returned by `GET /products/:id/sheet`. */
export const sheetFixture = (over: Partial<ProductSheetApi> = {}): ProductSheetApi => ({
  productId: '69ba44ee-7081-475b-8f00-b3220364bee5',
  sku: 'IDS-E04HQHI-D',
  productName: 'DVR Turbo 4 canales',
  name: 'DVR AcuSense de 4 canales',
  slug: 'ids-e04hqhi-d',
  published: true,
  status: 'ACTIVE',
  brand: 'Hikvision',
  model: 'iDS-E04HQHI-D',
  badges: ['Destacado'],
  highlights: ['Impulsado por tecnología eSSD', 'Bajo consumo de energía'],
  features: [
    { id: 'acusense', label: 'AcuSense', icon: 'person' },
    { id: 'essd', label: 'eSSD 1 TB', icon: 'storage' },
  ],
  availableModels: ['iDS-E04HQHI-D'],
  imageUrl: null,
  imageAlt: null,
  specsDisclaimer: 'Pruebas en entorno controlado.',
  firmwareNote: 'Actualiza al firmware más reciente.',
  manufacturerRefs: ['DS-E04HQHI-D/PN', '7798123456789'],
  internalNotes: 'Almacén Bodega 2: último lote sin garantía extendida.',
  canSeeInternalNotes: true,
  version: 4,
  specGroups: [
    {
      key: 'video',
      title: 'Video',
      items: [
        { label: 'Canales', value: '4' },
        { label: 'Resolución', value: '1080p' },
      ],
    },
    { key: 'red', title: 'Red', items: [{ label: 'Puertos', value: '1 RJ45' }] },
  ],
  resources: [
    { kind: 'DATASHEET', title: 'Ficha técnica', language: 'en', url: 'https://example.com/ds.pdf', fileName: 'ds.pdf', version: null, region: null, requiresLicense: false },
    { kind: 'FIRMWARE', title: 'Firmware Europa V4.75', language: 'en', url: 'https://example.com/fw-eu.zip', fileName: null, version: 'V4.75.011', region: 'Europa', requiresLicense: true },
    { kind: 'MANUAL', title: 'Manual de usuario', language: 'es', url: '/api/files/manual-1', fileName: null, version: null, region: null, requiresLicense: false },
    { kind: 'RELEASE_NOTES', title: 'Notas de versión', language: 'en', url: 'https://example.com/rn.pdf', fileName: null, version: 'V4.75.011', region: null, requiresLicense: false },
  ],
  updatedAt: '2026-10-02T12:00:00.000Z',
  ...over,
})
