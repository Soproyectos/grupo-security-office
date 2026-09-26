/**
 * DEMO DATA — hardcoded fixtures for the home sections (HOM-01).
 *
 * These are NOT product data: names, prices and descriptions are placeholder
 * demo content for the visual design of the home page. They carry no real PII,
 * no real phones and no real prices; replace them with real catalog data when
 * the product grid is published (ERP Yéminus integration).
 */

export interface HomeSectionCard {
  id: string
  title: string
  description: string
  /** Cover of the card, when the section shows one. */
  imageUrl: string | null
  /** Optional demo price, formatted for display (no computation needed). */
  priceLabel: string | null
  href: string
}

export interface HomeSection {
  id: string
  title: string
  cards: HomeSectionCard[]
}

const CATALOG_HREF = '/catalogo'

/**
 * Sections of the home, in display order. Every card links to the catalog,
 * the destination that exists today; when a section gets a real destination
 * (brand pages, offers page) only its `href` values change.
 */
export const HOME_SECTIONS: HomeSection[] = [
  {
    id: 'marcas',
    title: 'Marcas destacadas',
    cards: [
      {
        id: 'marca-hikvision',
        title: 'Hikvision',
        description: 'Videovigilancia IP, NVR y soluciones de análisis de video.',
        imageUrl: null,
        priceLabel: null,
        href: CATALOG_HREF,
      },
      {
        id: 'marca-dahua',
        title: 'Dahua',
        description: 'Cámaras de seguridad, grabadores y control de acceso.',
        imageUrl: null,
        priceLabel: null,
        href: CATALOG_HREF,
      },
      {
        id: 'marca-hilook',
        title: 'Hilook',
        description: 'Videovigilancia profesional para proyectos medianos.',
        imageUrl: null,
        priceLabel: null,
        href: CATALOG_HREF,
      },
      {
        id: 'marca-intelbras',
        title: 'Intelbras',
        description: 'Alarmas, intercomunicación y energía de respaldo.',
        imageUrl: null,
        priceLabel: null,
        href: CATALOG_HREF,
      },
    ],
  },
  {
    id: 'ofertas',
    title: 'Ofertas',
    cards: [
      {
        id: 'oferta-kit-camaras',
        title: 'Kit 4 cámaras IP',
        description: 'Kit de videovigilancia con grabador y app móvil.',
        imageUrl: '/images/categories/accesorios-cctv-discos-duros.jpg',
        priceLabel: 'Desde $899.900',
        href: CATALOG_HREF,
      },
      {
        id: 'oferta-biometrico',
        title: 'Control biométrico de huella',
        description: 'Lector de huella para control de acceso de personal.',
        imageUrl: '/images/categories/biometricos-huella.jpg',
        priceLabel: 'Desde $1.250.000',
        href: CATALOG_HREF,
      },
      {
        id: 'oferta-ups',
        title: 'UPS de respaldo',
        description: 'Respaldo de energía para equipos de seguridad.',
        imageUrl: '/images/categories/ups.jpg',
        priceLabel: 'Desde $459.900',
        href: CATALOG_HREF,
      },
    ],
  },
  {
    id: 'novedades',
    title: 'Novedades',
    cards: [
      {
        id: 'novedad-cerradura-smart',
        title: 'Cerraduras inteligentes',
        description: 'Apertura con app, código y llave de respaldo.',
        imageUrl: '/images/categories/cerraduras-inteligentes-smart.png',
        priceLabel: null,
        href: CATALOG_HREF,
      },
      {
        id: 'novedad-paneles-solares',
        title: 'Paneles solares',
        description: 'Energía autónoma para equipos en campo.',
        imageUrl: '/images/categories/energia-paneles-solares.jpg',
        priceLabel: null,
        href: CATALOG_HREF,
      },
      {
        id: 'novedad-routers',
        title: 'Routers y Wi-Fi',
        description: 'Conectividad para proyectos de redes y cámaras.',
        imageUrl: '/images/categories/routers-y-wifi.jpg',
        priceLabel: null,
        href: CATALOG_HREF,
      },
    ],
  },
]
