import type { FeaturedSolution } from '../types/featuredSolution'

/**
 * TEMPORARY PRESENTATION DATA — "Soluciones destacadas" of the home (`/tienda`).
 *
 * There is NO backend contract for "solutions" (no endpoint, no Prisma model,
 * no RBAC): these entries are hardcoded presentation fixtures only, the same
 * demo pattern as `fixtures/home-sections.ts`. They carry:
 * - no prices, no inventory, no metrics and no performance claims;
 * - no API references and no real contact data;
 * - corporate/commercial security solution concepts, NOT distributor catalog
 *   data (no brands, no SKUs, no distributor pricing).
 *
 * Every card links to `/catalogo`, the destination that exists today; when a
 * solution gets a real destination only its `href` changes. The covers reuse
 * existing storefront images as placeholders until real solution media exists.
 * Replace this file with real solution data when the contract lands.
 */
export const FEATURED_SOLUTIONS: FeaturedSolution[] = [
  {
    id: 'solucion-videovigilancia-corporativa',
    title: 'Videovigilancia corporativa',
    category: 'Empresas y edificios',
    description: 'Sistemas de cámaras y grabación para sedes, bodegas y conjuntos.',
    imageUrl: '/images/categories/camaras-ip-domo.svg',
    imageAlt: 'Cámara de videovigilancia tipo domo para interiores corporativos',
    href: '/catalogo',
    ctaLabel: 'Ver solución',
  },
  {
    id: 'solucion-control-acceso',
    title: 'Control de acceso',
    category: 'Oficinas y plantas',
    description: 'Lectores biométricos y tarjetas para gestionar el ingreso del personal.',
    imageUrl: '/images/categories/biometricos-huella.jpg',
    imageAlt: 'Lector biométrico de huella para control de acceso de personal',
    href: '/catalogo',
    ctaLabel: 'Ver solución',
  },
  {
    id: 'solucion-deteccion-intrusos',
    title: 'Detección de intrusos',
    category: 'Comercio e industria',
    description: 'Paneles de alarma y sensores para proteger locales y perímetros.',
    imageUrl: '/images/categories/paneles-de-alarma.svg',
    imageAlt: 'Panel de alarma para detección de intrusos en locales comerciales',
    href: '/catalogo',
    ctaLabel: 'Ver solución',
  },
  {
    id: 'solucion-respaldo-energia',
    title: 'Respaldo de energía',
    category: 'Operación continua',
    description: 'UPS y baterías para mantener los equipos de seguridad en línea.',
    imageUrl: '/images/categories/fuentes-de-poder.jpg',
    imageAlt: 'Equipos de respaldo de energía para sistemas de seguridad',
    href: '/catalogo',
    ctaLabel: 'Ver solución',
  },
]
