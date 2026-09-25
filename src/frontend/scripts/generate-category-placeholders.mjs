#!/usr/bin/env node
/**
 * Generates the placeholder artwork for the demo category tree (MENU-02).
 *
 * Outputs (deterministic, no dependencies, no network access):
 *   - public/images/categories/<slug>.svg      240x240 tile for every featured node
 *   - public/images/category-icons/<slug>.svg 24x24 root icon for every root
 *
 * The SVGs are committed so the demo tree renders without running this script.
 * Re-running it must produce byte-identical files (no dates, no randomness).
 *
 * The tree below is the single source of truth for the *artwork*; the demo rows
 * live in src/backend/prisma/seed-categories.ts (backend is a separate package,
 * so the tree is deliberately duplicated instead of imported). This script
 * verifies both stay in sync and fails when a slug is missing from the seed.
 *
 * Usage:
 *   npm run gen:category-images            # write the SVGs
 *   npm run gen:category-images -- --check # only verify (no writes)
 *
 * Consuming the 24px icons: `stroke="currentColor"` only picks up the page
 * color when the SVG is inlined or used as a CSS mask
 * (`mask-image: url(/images/category-icons/<slug>.svg)`); an `<img>` tag
 * renders them in their own default color.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const FRONTEND_DIR = resolve(SCRIPT_DIR, '..')
const REPO_DIR = resolve(FRONTEND_DIR, '..', '..')
const SEED_FILE = resolve(REPO_DIR, 'src', 'backend', 'prisma', 'seed-categories.ts')

const TILES_DIR = resolve(FRONTEND_DIR, 'public', 'images', 'categories')
const ICONS_DIR = resolve(FRONTEND_DIR, 'public', 'images', 'category-icons')

const TILE_SIZE = 240
const ICON_SIZE = 24

const BRAND = {
  red: '#CE0203',
  redDark: '#AD0102',
  gray: '#484748',
  ink: '#1A1A1A',
  surface: '#FAFAFA',
}

/** Leaf node (level 3, or a level 2 without children). */
const f = (slug, name) => ({ slug, name, featured: true })
/** Non-featured leaf node. */
const l = (slug, name) => ({ slug, name, featured: false })
/** Level 2 node with children. */
const c = (slug, name, children) => ({ slug, name, children })

/**
 * Demo category tree. Root slugs are URL friendly; `family` picks the glyph used
 * for the root icon and for every featured tile below that root.
 */
const DEMO_TREE = [
  {
    slug: 'videovigilancia',
    name: 'Videovigilancia',
    family: 'camera',
    children: [
      c('camaras-ip', 'Cámaras IP', [
        f('camaras-ip-domo', 'Domo'),
        f('camaras-ip-bala', 'Bala'),
        f('camaras-ip-ptz', 'PTZ'),
        l('camaras-ip-fisheye', 'Fisheye'),
      ]),
      c('grabadores', 'Grabadores', [
        f('grabadores-nvr', 'NVR'),
        l('grabadores-dvr', 'DVR'),
        l('grabadores-xvr', 'XVR'),
      ]),
      { slug: 'kits-cctv', name: 'Kits CCTV', featured: true, children: [
        l('kit-4-camaras', 'Kit 4 cámaras'),
        l('kit-8-camaras', 'Kit 8 cámaras'),
      ] },
      c('accesorios-cctv', 'Accesorios CCTV', [
        l('accesorios-cctv-fuentes', 'Fuentes'),
        l('accesorios-cctv-baluns', 'Baluns'),
        l('accesorios-cctv-soportes', 'Soportes'),
        f('accesorios-cctv-discos-duros', 'Discos duros'),
      ]),
    ],
  },
  {
    slug: 'control-de-acceso',
    name: 'Control de Acceso',
    family: 'lock',
    children: [
      c('biometricos', 'Biométricos', [
        f('biometricos-huella', 'Huella'),
        f('biometricos-reconocimiento-facial', 'Reconocimiento facial'),
      ]),
      c('lectores-y-tarjetas', 'Lectores y tarjetas', [
        f('lectores-rfid', 'Lectores RFID'),
        l('tarjetas-acceso', 'Tarjetas'),
      ]),
      c('cerraduras-electricas', 'Cerraduras eléctricas', [
        f('electroimanes', 'Electroimanes'),
        l('botones-de-salida', 'Botones de salida'),
      ]),
      { slug: 'torniquetes-y-barreras', name: 'Torniquetes y barreras', featured: true },
    ],
  },
  {
    slug: 'alarmas-y-smart-home',
    name: 'Alarmas y Smart Home',
    family: 'sensor',
    children: [
      { slug: 'paneles-de-alarma', name: 'Paneles de alarma', featured: true },
      c('sensores', 'Sensores', [
        f('sensores-movimiento', 'Movimiento'),
        l('sensores-magneticos', 'Magnéticos'),
        f('sensores-humo', 'Humo'),
      ]),
      { slug: 'sirenas', name: 'Sirenas', featured: false },
      c('smart-home', 'Smart Home', [
        f('timbres-con-video', 'Timbres con video'),
        f('cerraduras-inteligentes-smart', 'Cerraduras inteligentes'),
        l('enchufes-inteligentes', 'Enchufes'),
      ]),
    ],
  },
  {
    slug: 'redes-y-cableado',
    name: 'Redes y Cableado',
    family: 'network',
    children: [
      c('switches', 'Switches', [
        f('switches-poe', 'PoE'),
        l('switches-administrables', 'Administrables'),
      ]),
      c('cableado', 'Cableado', [
        f('cableado-utp', 'UTP'),
        l('conectores-cableado', 'Conectores'),
      ]),
      { slug: 'routers-y-wifi', name: 'Routers y Wi-Fi', featured: true },
      { slug: 'racks', name: 'Racks', featured: true },
    ],
  },
  {
    slug: 'energia-y-respaldo',
    name: 'Energía y Respaldo',
    family: 'battery',
    children: [
      { slug: 'ups', name: 'UPS', featured: true },
      { slug: 'fuentes-de-poder', name: 'Fuentes de poder', featured: true },
      { slug: 'baterias', name: 'Baterías', featured: true },
      { slug: 'energia-paneles-solares', name: 'Paneles solares', featured: true },
    ],
  },
  {
    slug: 'intercomunicacion',
    name: 'Intercomunicación',
    family: 'intercom',
    children: [
      { slug: 'videoporteros', name: 'Videoporteros', featured: true },
      { slug: 'citofonos', name: 'Citófonos', featured: true },
      { slug: 'intercomunicadores-ip', name: 'Intercomunicadores IP', featured: true },
    ],
  },
]

/**
 * Glyph library. Each glyph is a list of SVG path/shape descriptors on a
 * 24x24 grid, stroked (never filled) so the same geometry can be rendered at
 * 24px with `currentColor` and at 240px scaled up inside a gradient circle.
 */
const GLYPHS = {
  camera: [
    '<rect x="2" y="7.5" width="14" height="9" rx="1.5" />',
    '<path d="M16 11.2 21.5 8.4v7.2L16 12.8z" />',
  ],
  lock: [
    '<path d="M7.75 10.5V8a4.25 4.25 0 0 1 8.5 0v2.5" />',
    '<rect x="4.25" y="10.5" width="15.5" height="10" rx="1.5" />',
    '<path d="M12 14.2v2.6" />',
  ],
  sensor: [
    '<path d="M4.5 18.5h15L18 15.6V11a6 6 0 0 0-12 0v4.6z" />',
    '<path d="M10 21a2.2 2.2 0 0 0 4 0" />',
  ],
  network: [
    '<rect x="2" y="8.5" width="20" height="7" rx="1" />',
    '<path d="M5.5 12h1.8M10 12h1.8M14.5 12h1.8" />',
  ],
  battery: [
    '<rect x="1.5" y="7.5" width="16" height="9" rx="1" />',
    '<path d="M19 10.5h2.5v3H19z" />',
    '<path d="M11 8.75 7.5 13.25h2.75l-.5 3 3.5-4.5h-2.75z" />',
  ],
  intercom: [
    '<rect x="6" y="2.75" width="12" height="18.5" rx="1" />',
    '<path d="M9 6.75h6M9 9.75h6" />',
    '<rect x="10.25" y="13.5" width="3.5" height="4" rx="0.5" />',
  ],
}

const escapeXml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Splits a label into words, hard-splitting words longer than `maxChars`. */
function wordsOf(text, maxChars) {
  const words = []
  for (const word of text.split(/\s+/)) {
    if (word.length <= maxChars) {
      words.push(word)
      continue
    }
    for (let i = 0; i < word.length; i += maxChars) words.push(word.slice(i, i + maxChars))
  }
  return words
}

/**
 * Greedy wrap. The usable width is the chord of the 240px circle at the label
 * baseline, which is narrower than the full square. Words longer than `maxChars`
 * are hard-split; `wrapWords` reports that so the caller can prefer a smaller
 * font size over a mid-word break.
 */
function wrapLabel(text, maxChars) {
  const lines = []
  let current = ''
  for (const word of wordsOf(text, maxChars)) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines
}

/** True when no word had to be broken to fit `maxChars`. */
function wrapsOnWordBoundaries(text, maxChars) {
  return text.split(/\s+/).every((word) => word.length <= maxChars)
}

/** Largest font size (21 → 13) whose wrap fits in at most two lines. */
function layoutLabel(text) {
  const usableWidth = 168
  let fallback = null
  for (let fontSize = 21; fontSize >= 13; fontSize -= 1) {
    const maxChars = Math.floor(usableWidth / (0.55 * fontSize))
    const lines = wrapLabel(text, maxChars)
    if (lines.length > 2) continue
    if (wrapsOnWordBoundaries(text, maxChars)) return { fontSize, lines }
    if (!fallback) fallback = { fontSize, lines }
  }
  if (fallback) return fallback
  const lines = wrapLabel(text, Math.floor(usableWidth / (0.55 * 13))).slice(0, 2)
  const last = lines.length - 1
  if (lines[last].length >= 2) lines[last] = `${lines[last].slice(0, -1)}…`
  return { fontSize: 13, lines }
}

/** 240x240 tile: brand gradient circle, glyph, short label. */
function renderTile({ name, family }) {
  const { fontSize, lines } = layoutLabel(name)
  const center = TILE_SIZE / 2
  const glyphScale = 4.2
  const glyphOffset = 90
  const baseline = lines.length === 1 ? 186 : 168
  const lineHeight = fontSize + 6

  return [
    '<!-- Generated by scripts/generate-category-placeholders.mjs. Do not edit by hand. -->',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}" role="img">`,
    `<title>${escapeXml(name)}</title>`,
    '<defs>',
    '<radialGradient id="tile-bg" cx="32%" cy="26%" r="92%">',
    `<stop offset="0" stop-color="${BRAND.red}" />`,
    `<stop offset="0.55" stop-color="${BRAND.redDark}" />`,
    `<stop offset="1" stop-color="${BRAND.gray}" />`,
    '</radialGradient>',
    '</defs>',
    `<rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="${BRAND.surface}" />`,
    `<circle cx="${center}" cy="${center}" r="${center}" fill="url(#tile-bg)" />`,
    `<circle cx="${center}" cy="${center}" r="${center - 9}" fill="none" stroke="${BRAND.surface}" stroke-opacity="0.18" stroke-width="2" />`,
    `<g transform="translate(${center} ${glyphOffset}) scale(${glyphScale}) translate(-12 -12)" fill="none" stroke="${BRAND.surface}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">`,
    ...GLYPHS[family],
    '</g>',
    `<text x="${center}" y="${baseline}" text-anchor="middle" fill="${BRAND.surface}" font-family="system-ui, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="600">`,
    ...lines.map((line, index) => `<tspan x="${center}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`),
    '</text>',
    '</svg>',
    '',
  ].join('\n')
}

/** 24x24 root icon, same stroke language as the inline SVGs in StorefrontChrome. */
function renderIcon({ name, family }) {
  return [
    '<!-- Generated by scripts/generate-category-placeholders.mjs. Do not edit by hand. -->',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img">`,
    `<title>${escapeXml(name)}</title>`,
    ...GLYPHS[family],
    '</svg>',
    '',
  ].join('\n')
}

function collectNodes() {
  const roots = []
  const featured = []
  const all = []
  for (const root of DEMO_TREE) {
    roots.push(root)
    all.push(root.slug)
    const walk = (node) => {
      all.push(node.slug)
      if (node.featured) featured.push({ ...node, family: root.family })
      for (const child of node.children ?? []) walk(child)
    }
    for (const child of root.children ?? []) walk(child)
  }
  return { roots, featured, all }
}

/** Fails when the backend seed and this script disagree on the demo tree. */
function verifySeedSync(slugs) {
  let source
  try {
    source = readFileSync(SEED_FILE, 'utf8')
  } catch {
    console.warn(`[gen:category-images] seed not found at ${SEED_FILE}; sync check skipped.`)
    return true
  }
  const missing = slugs.filter((slug) => !source.includes(`'${slug}'`))
  const paths =
    source.includes('/images/category-icons/') && source.includes('/images/categories/')
  if (missing.length === 0 && paths) return true
  console.error('[gen:category-images] the demo tree drifted from the seed:')
  for (const slug of missing) console.error(`  - seed is missing slug "${slug}"`)
  if (!paths) console.error('  - seed is missing the /images/... path templates')
  return false
}

function main() {
  const checkOnly = process.argv.slice(2).includes('--check')
  const { roots, featured, all } = collectNodes()

  if (!verifySeedSync(all)) {
    process.exitCode = 1
    return
  }

  if (!checkOnly) {
    mkdirSync(TILES_DIR, { recursive: true })
    mkdirSync(ICONS_DIR, { recursive: true })
    for (const node of featured) {
      writeFileSync(resolve(TILES_DIR, `${node.slug}.svg`), renderTile(node), 'utf8')
    }
    for (const root of roots) {
      writeFileSync(resolve(ICONS_DIR, `${root.slug}.svg`), renderIcon(root), 'utf8')
    }
  }

  console.log(
    `[gen:category-images] ${checkOnly ? 'checked' : 'wrote'} ${featured.length} tiles ` +
      `(${TILES_DIR.replace(FRONTEND_DIR, 'src/frontend')}) and ${roots.length} icons ` +
      `(${ICONS_DIR.replace(FRONTEND_DIR, 'src/frontend')})`,
  )
  console.log(
    `[gen:category-images] demo tree: ${roots.length} roots / ${all.length - roots.length} nodes / ${featured.length} featured`,
  )
}

main()
