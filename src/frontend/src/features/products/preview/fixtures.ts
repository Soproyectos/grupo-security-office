import type { ProductDetail } from '../types'

/** A storefront product with every zone filled, for the preview specs. */
export const storefrontFixture: ProductDetail = {
  id: 'prod-1',
  slug: 'ids-e04hqhi-d',
  price: { value: 118258.8, currency: 'COP' },
  isInformational: false,
  description: 'Cámara IP de 4 MP con visión nocturna.',
  brand: 'Hikvision',
  model: 'DS-2CD2143',
  name: 'Cámara Domo 4K',
  status: 'discontinued',
  badges: ['Destacado'],
  breadcrumb: [
    { label: 'Catálogo', href: '/catalogo' },
    { label: 'Videovigilancia', href: '/catalogo/categoria/videovigilancia' },
  ],
  image: { src: '/api/files/img-1', alt: 'Cámara Domo 4K' },
  images: [
    { src: '/api/files/img-1', alt: 'Cámara Domo 4K' },
    { src: '/api/files/img-2', alt: 'Vista lateral' },
  ],
  highlights: ['Compresión H.265+'],
  features: [{ id: 'f1', label: 'AcuSense', icon: 'shield' }],
  availableModels: [],
  specGroups: [{ id: 'video', title: 'Video', items: [{ label: 'Canales', value: '4' }] }],
  specsDisclaimer: 'Las especificaciones pueden cambiar sin previo aviso.',
  documents: [{ id: 'd1', type: 'datasheet', title: 'Ficha técnica', language: 'es', url: 'https://example.com/ds.pdf' }],
  firmware: {
    files: [{ id: 'fw1', kind: 'firmware', title: 'Firmware', url: 'https://example.com/fw.bin', requiresLicense: true }],
    appliesTo: [],
  },
}
