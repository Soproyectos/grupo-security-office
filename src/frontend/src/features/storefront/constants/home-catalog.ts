/**
 * Catalog picks of the storefront home, in one place so a change of stock only
 * touches this file. Slugs are the top-level categories of the public menu (/public/categories/menu):
 * a shelf whose category is empty hides itself, but a wrong slug is a silent
 * gap on the home.
 */

export interface HomeShelf {
  /** Category slug served by `GET /api/public/products?category=`. */
  slug: string
  title: string
}

export interface FeaturedHomeShelf extends HomeShelf {
  readonly skus: readonly string[]
}

/** Published references, ordered by use case and market demand signals. */
export const HOME_SHELVES: FeaturedHomeShelf[] = [
  {
    slug: 'camaras',
    title: 'Cámaras',
    skus: [
      'DS-2CFWQ3(2.8mm)(O-STD)/EU',
      'DS-2DE2C400MWG/W(2.8mm)/EU',
      'DS-2CD1023G2-LIU(2.8mm)',
      'DS-2CE76D0T-LPFS(2.8mm)',
      'DS-2CFWQ5(2.8mm)(O-STD)/EU',
      'DS-2CFW04(2.8mm)(O-STD)/EU',
      'DS-2CD1043G2-LIU(2.8mm)',
      'DS-2CD1347G2H-LIU(2.8mm)',
      'DS-2CE17D0T-LFS(2.8mm)',
      'DS-2CE78K0T-LXTS(2.8mm)',
      'DS-J142I/NKS422WBPH',
      'DS-2CFW06-P(2.8mm)(O-STD)/EU',
    ],
  },
  {
    slug: 'alarmas',
    title: 'Alarmas',
    skus: [
      'DS-PA201P-Kit-16WB',
      'DS-PWA64-KIT-WB',
      'DS-PWA48-KIT-WB',
      'DS-PHA64-Kit-WB',
      'DS-PDMC-EG2-WB',
      'DS-PDP15P-EG2-WB(B)/Colombia',
      'DS-PS1-E-WB/Red',
      'DS-PD201MC-WB',
      'DS-PD201P10-WB/Colombia bracket',
      'DS-PS201-WB',
      'DS-PDP18-HM-WB',
      'DS-PKF1-WB(B)',
    ],
  },
  {
    slug: 'control-de-acceso',
    title: 'Control de acceso',
    skus: [
      'DS-KIS603-P(C)',
      'DS-K1T321MFWX-B',
      'DS-KIS213',
      'DS-K1T804AMF',
      'DS-KV6113-WPE1(C)',
      'DS-K1T342MFWX-E1',
      'DS-KIS605-P(C)',
      'DS-K2802',
      'DS-K1T673DWX',
      'DS-K1801M',
      'DS-K4H255S',
      'DS-KIS302-P',
    ],
  },
  {
    slug: 'casa-inteligente',
    title: 'Casa inteligente',
    skus: [],
  },
]

/** Support categories shown as a plain mosaic (no products) under the shelves. */
export const HOME_OTHER_CATEGORIES: HomeShelf[] = [
  { slug: 'redes-y-wi-fi', title: 'Redes y Wi-Fi' },
  { slug: 'energia-y-electricidad', title: 'Energía y electricidad' },
  { slug: 'audio-y-perifoneo', title: 'Audio y perifoneo' },
  { slug: 'parqueaderos', title: 'Parqueaderos' },
]

/** Cap of the "Compra por categoría" tiles. */
export const HOME_CATEGORY_TILE_LIMIT = 8

export interface HomeBrand {
  label: string
  /** Slug de la marca para el filtro de búsqueda */
  brand: string
}

/** Brand chips shown on the homepage. Links to brand-filtered search. */
export const HOME_BRANDS: HomeBrand[] = [
  { label: 'Hikvision', brand: 'hikvision' },
  { label: 'Accessmatic', brand: 'accessmatic' },
  { label: 'Powest', brand: 'powest' },
  { label: 'Fuli Battery', brand: 'bateria-fuli' },
  { label: 'Western Digital', brand: 'western-digital' },
  { label: 'Imou', brand: 'imou' },
  { label: 'Kingston', brand: 'kingston' },
]

/** Catalog search of a brand chip. */
export function brandSearchHref(brand: HomeBrand): string {
  return `/catalogo/buscar?brand=${encodeURIComponent(brand.brand)}`;
}

/** Real camera subcategories (excludes accessories/recorders that hang from the camera category). */
export const CAMERA_SUBCATEGORY_SLUGS = [
  'camaras-ip-y-wi-fi',
  'camaras-analogicas',
  'camaras-especiales-y-para-vehiculos',
].join(',')

export const HOME_BRAND_CAMPAIGNS: { id: string; title: string; image: string; alt: string; href: string }[] = [
  {
    id: 'aov-4g',
    title: 'Cámaras solares AOV 4G',
    image: '/images/home/campanas/aov-4g.jpg',
    alt: 'Campaña Hikvision: cámaras solares AOV 4G',
    href: '/catalogo/buscar?brand=hikvision',
  },
  {
    id: 'colorvu-3',
    title: 'ColorVu 3.0 Serie 1',
    image: '/images/home/campanas/colorvu-3.jpg',
    alt: 'Campaña Hikvision: ColorVu 3.0 Serie 1',
    href: '/catalogo/buscar?brand=hikvision',
  },
  {
    id: 'easyip',
    title: 'EasyIP',
    image: '/images/home/campanas/easyip.jpg',
    alt: 'Campaña Hikvision: EasyIP',
    href: '/catalogo/buscar?brand=hikvision',
  },
]

export interface HomeReel {
  id: string
  url: string
  title: string
  thumbnail: string
  /** Optional silent clip (MP4, at least 5 s) that plays while the pointer is over the tile. */
  preview?: string
  /** Video length shown on the tile, e.g. "0:48". */
  duration?: string
}

// Real reels from the company Instagram account; while empty the section is not shown.
export const HOME_REELS: HomeReel[] = [
  { id: 'r1', url: 'https://www.instagram.com/p/DWRomcpkT6o/', title: 'Qué es la seguridad electrónica', thumbnail: '/images/home/reels/r1.jpg', preview: '/images/home/reels/r1.mp4', duration: '0:48' },
  { id: 'r2', url: 'https://www.instagram.com/p/DeR06MMuvUw/', title: 'Control de acceso con tu rostro', thumbnail: '/images/home/reels/r2.jpg', preview: '/images/home/reels/r2.mp4', duration: '0:34' },
  { id: 'r3', url: 'https://www.instagram.com/p/DbV97ULkWqg/', title: 'Cuida tu finca, lote o terreno', thumbnail: '/images/home/reels/r3.jpg', preview: '/images/home/reels/r3.mp4', duration: '0:48' },
  { id: 'r4', url: 'https://www.instagram.com/p/DXaJIAZCNG_/', title: 'Cámaras Hikvision ColorVu 3.0', thumbnail: '/images/home/reels/r4.jpg', preview: '/images/home/reels/r4.mp4', duration: '0:34' },
  { id: 'r5', url: 'https://www.instagram.com/p/DXIA5aTiIbD/', title: 'Reconocimiento facial para conductores', thumbnail: '/images/home/reels/r5.jpg', preview: '/images/home/reels/r5.mp4', duration: '0:36' },
  { id: 'r6', url: 'https://www.instagram.com/p/DOjMyZ2DrhR/', title: 'Fibra óptica: robusta y versátil', thumbnail: '/images/home/reels/r6.jpg', preview: '/images/home/reels/r6.mp4', duration: '0:43' },
]

export interface TrainingEvent {
  id: string
  kind: 'webinar' | 'clase' | 'certificacion'
  title: string
  /** ISO 8601 with offset, e.g. "2026-11-26T09:00:00-05:00" (Colombia time). */
  startsAt: string
  /** Hikvision registration page (https only). */
  registrationUrl: string
}

// Upcoming Hikvision classes, as published in Hikvision's LATAM calendar. Filled by hand for now (later by a webhook);
// while empty, or once every event is over, the home shows only the permanent training links.
export const HOME_TRAINING_EVENTS: TrainingEvent[] = [
  { id: 'smb-hpp-2026-11-26', kind: 'webinar', title: 'Soluciones SMB Hikvision y HPP Designer', startsAt: '2026-11-26T09:00:00-05:00', registrationUrl: 'https://hikvisionlatam.tech/calendar/latam' },
  { id: 'hik-ia-2026-12-02', kind: 'clase', title: 'Clase Abierta HIK-IA · Día 1', startsAt: '2026-12-02T10:00:00-05:00', registrationUrl: 'https://hikvisionlatam.tech/calendar/latam' },
  { id: 'hik-ia-2026-12-03', kind: 'clase', title: 'Clase Abierta HIK-IA · Día 2', startsAt: '2026-12-03T11:00:00-05:00', registrationUrl: 'https://hikvisionlatam.tech/calendar/latam' },
]
