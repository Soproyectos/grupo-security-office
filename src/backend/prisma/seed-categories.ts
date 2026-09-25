/**
 * Demo seed del árbol de categorías del mega menú (MENU-02).
 *
 * VIVE FUERA DE prisma/seed.ts a propósito: `seed.ts` es el seed del sistema
 * (roles + usuarios) y corre en la mayoría de los entornos; este archivo crea
 * datos de DEMOSTRACIÓN y solo se ejecuta cuando alguien lo pide explícitamente
 * (`npm run db:seed:categories`). Nada de esto corre con `prisma migrate` ni con
 * el seed automático.
 *
 * Es idempotente por `slug` (único en el modelo Category): la segunda corrida
 * vuelve a leer cada fila, compara los campos que este seed administra y solo
 * escribe cuando algo difiere. Re-correglo es un no-op (incluso `updatedAt`).
 *
 * Escribe únicamente filas del árbol demo: no borra nada y no toca productos,
 * marcas, listas ni precios. Si un slug ya existe y la fila es de datos reales
 * (tiene productos) o pertenece a otro árbol (su padre no es del árbol demo), la
 * deja intacta y avisa en vez de reparentarla.
 *
 * Rutas de medios (las sirve Vite desde public/):
 *   - icono de raíz       → /images/category-icons/<slug>.svg
 *   - portada destacada   → /images/categories/<slug>.<ext>
 * Los SVG los genera src/frontend/scripts/generate-category-placeholders.mjs
 * (`npm --prefix src/frontend run gen:category-images`), que además verifica
 * que este árbol y el suyo coincidan, y siguen como fallback para los slugs
 * sin foto real (MENU-07): los destacados con foto real usan la foto descargada
 * del sitio público del fabricante/distribuidor (atribución en REAL_IMAGE_EXT).
 *
 * Uso (ts-node, estilo prisma/seed.ts):
 *   npm run db:seed:categories
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ICON_PATH_PREFIX = '/images/category-icons';
const TILE_PATH_PREFIX = '/images/categories';

/**
 * Extensión real de la foto destacada por slug (MENU-07): solo los slugs cuya
 * foto se descargó con éxito del sitio público del fabricante/distribuidor.
 * Los demás siguen apuntando al SVG placeholder generado localmente.
 */
const REAL_IMAGE_EXT: Record<string, string> = {
  'accesorios-cctv-discos-duros': 'jpg', // Western Digital (WD Purple)
  'baterias': 'jpg', // Mighty Max Battery
  'biometricos-huella': 'jpg', // ZKTeco (K40)
  'cableado-utp': 'png', // Connectec UK
  'cerraduras-inteligentes-smart': 'png', // ZKTeco
  'citofonos': 'png', // Commax
  'electroimanes': 'jpg', // ZKTeco (LM-350)
  'energia-paneles-solares': 'jpg', // Renogy
  'fuentes-de-poder': 'jpg', // Secuview
  'grabadores-nvr': 'jpg', // TP-Link (VIGI)
  'intercomunicadores-ip': 'png', // Security System Depot (Akuvox)
  'kits-cctv': 'webp', // TP-Link (VIGI kit)
  'racks': 'jpg', // StarTech.com
  'routers-y-wifi': 'jpg', // TP-Link (Archer C6)
  'sensores-humo': 'jpg', // BigCommerce (detector autónomo)
  'switches-poe': 'jpg', // TP-Link
  'ups': 'jpg', // Schneider Electric (APC)
  'videoporteros': 'png', // Commax (CDV-70H2)
};

interface DemoNode {
  slug: string;
  name: string;
  featured: boolean;
  children?: DemoNode[];
}

/** Hoja o nivel 2 destacado: aparece en la fila de círculos del mega menú. */
const f = (slug: string, name: string): DemoNode => ({ slug, name, featured: true });
/** Hoja o nivel 2 sin portada. */
const l = (slug: string, name: string): DemoNode => ({ slug, name, featured: false });
/** Nivel 2 con hijos. */
const c = (slug: string, name: string, children: DemoNode[]): DemoNode => ({ slug, name, featured: false, children });
/** Nivel 2 destacado con hijos. */
const fc = (slug: string, name: string, children: DemoNode[]): DemoNode => ({ slug, name, featured: true, children });

const DEMO_ROOTS: DemoNode[] = [
  {
    slug: 'videovigilancia',
    name: 'Videovigilancia',
    featured: false,
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
      fc('kits-cctv', 'Kits CCTV', [l('kit-4-camaras', 'Kit 4 cámaras'), l('kit-8-camaras', 'Kit 8 cámaras')]),
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
    featured: false,
    children: [
      c('biometricos', 'Biométricos', [
        f('biometricos-huella', 'Huella'),
        f('biometricos-reconocimiento-facial', 'Reconocimiento facial'),
      ]),
      c('lectores-y-tarjetas', 'Lectores y tarjetas', [f('lectores-rfid', 'Lectores RFID'), l('tarjetas-acceso', 'Tarjetas')]),
      c('cerraduras-electricas', 'Cerraduras eléctricas', [
        f('electroimanes', 'Electroimanes'),
        l('botones-de-salida', 'Botones de salida'),
      ]),
      f('torniquetes-y-barreras', 'Torniquetes y barreras'),
    ],
  },
  {
    slug: 'alarmas-y-smart-home',
    name: 'Alarmas y Smart Home',
    featured: false,
    children: [
      f('paneles-de-alarma', 'Paneles de alarma'),
      c('sensores', 'Sensores', [f('sensores-movimiento', 'Movimiento'), l('sensores-magneticos', 'Magnéticos'), f('sensores-humo', 'Humo')]),
      l('sirenas', 'Sirenas'),
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
    featured: false,
    children: [
      c('switches', 'Switches', [f('switches-poe', 'PoE'), l('switches-administrables', 'Administrables')]),
      c('cableado', 'Cableado', [f('cableado-utp', 'UTP'), l('conectores-cableado', 'Conectores')]),
      f('routers-y-wifi', 'Routers y Wi-Fi'),
      f('racks', 'Racks'),
    ],
  },
  {
    slug: 'energia-y-respaldo',
    name: 'Energía y Respaldo',
    featured: false,
    children: [
      f('ups', 'UPS'),
      f('fuentes-de-poder', 'Fuentes de poder'),
      f('baterias', 'Baterías'),
      f('energia-paneles-solares', 'Paneles solares'),
    ],
  },
  {
    slug: 'intercomunicacion',
    name: 'Intercomunicación',
    featured: false,
    children: [f('videoporteros', 'Videoporteros'), f('citofonos', 'Citófonos'), f('intercomunicadores-ip', 'Intercomunicadores IP')],
  },
];

/** Slugs del árbol demo, para distinguir filas propias de datos preexistentes. */
const DEMO_SLUGS = new Set<string>(DEMO_ROOTS.flatMap((root) => collect(root).map((node) => node.slug)));

function collect(node: DemoNode): DemoNode[] {
  return [node, ...(node.children ?? []).flatMap((child) => collect(child))];
}

interface DesiredRow {
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  imageUrl: string | null;
  iconUrl: string | null;
}

/**
 * Estado deseado de una fila. Las raíces llevan icono; los nodos destacados
 * llevan portada. `sortOrder` es múltiplo de 10 por hermano, así el orden del
 * mega menú es estable y sigue siendo editable desde la app.
 */
function desiredRow(node: DemoNode, parentId: string | null, index: number): DesiredRow {
  const isRoot = parentId === null;
  return {
    name: node.name,
    slug: node.slug,
    parentId,
    sortOrder: (index + 1) * 10,
    isActive: true,
    isFeatured: node.featured,
    imageUrl:
      !isRoot && node.featured
        ? `${TILE_PATH_PREFIX}/${node.slug}.${REAL_IMAGE_EXT[node.slug] ?? 'svg'}`
        : null,
    iconUrl: isRoot ? `${ICON_PATH_PREFIX}/${node.slug}.svg` : null,
  };
}

type Outcome = 'created' | 'updated' | 'unchanged' | 'skipped' | 'error';

interface SyncResult {
  outcome: Outcome;
  id: string | null;
}

async function syncNode(node: DemoNode, parentId: string | null, index: number): Promise<SyncResult> {
  const desired = desiredRow(node, parentId, index);
  const existing = await prisma.category.findUnique({
    where: { slug: node.slug },
    select: {
      id: true,
      parentId: true,
      name: true,
      sortOrder: true,
      isActive: true,
      isFeatured: true,
      imageUrl: true,
      iconUrl: true,
      _count: { select: { products: true } },
    },
  });

  if (!existing) {
    const created = await prisma.category.create({ data: desired });
    return { outcome: 'created', id: created.id };
  }

  // Slug ocupado por datos reales: el seed demo no reparaenta ni repinta lo que
  // pertenece al catálogo real, solo avisa.
  if (existing._count.products > 0) {
    console.warn(`⚠️  slug "${node.slug}" ya tiene productos: se deja intacto.`);
    return { outcome: 'skipped', id: existing.id };
  }
  if (existing.parentId !== null && existing.parentId !== parentId) {
    const parent = await prisma.category.findUnique({ where: { id: existing.parentId }, select: { slug: true } });
    if (parent && !DEMO_SLUGS.has(parent.slug)) {
      console.warn(`⚠️  slug "${node.slug}" ya existe bajo "${parent.slug}": se deja intacto.`);
      return { outcome: 'skipped', id: existing.id };
    }
  }

  const managed = {
    parentId: desired.parentId,
    name: desired.name,
    sortOrder: desired.sortOrder,
    isActive: desired.isActive,
    isFeatured: desired.isFeatured,
    imageUrl: desired.imageUrl,
    iconUrl: desired.iconUrl,
  };
  const same =
    existing.parentId === managed.parentId &&
    existing.name === managed.name &&
    existing.sortOrder === managed.sortOrder &&
    existing.isActive === managed.isActive &&
    existing.isFeatured === managed.isFeatured &&
    existing.imageUrl === managed.imageUrl &&
    existing.iconUrl === managed.iconUrl;

  if (same) return { outcome: 'unchanged', id: existing.id };

  await prisma.category.update({ where: { slug: node.slug }, data: managed });
  return { outcome: 'updated', id: existing.id };
}

/** Escribe un nivel del árbol (profundidad máxima 3, la del mega menú). */
async function syncLevel(nodes: DemoNode[], parentId: string | null, tally: Record<Outcome, number>): Promise<void> {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    let result: SyncResult;
    try {
      result = await syncNode(node, parentId, index);
    } catch (error) {
      result = { outcome: 'error', id: null };
      console.error(`❌ "${node.slug}": ${(error as Error).message}`);
    }
    tally[result.outcome] += 1;
    if (!result.id) continue;
    await syncLevel(node.children ?? [], result.id, tally);
  }
}

async function main() {
  const tally: Record<Outcome, number> = { created: 0, updated: 0, unchanged: 0, skipped: 0, error: 0 };
  const nodeCount = DEMO_ROOTS.reduce((total, root) => total + collect(root).length, 0);

  console.log(`🌱 Seed demo de categorías: ${DEMO_ROOTS.length} raíces, ${nodeCount} nodos`);

  for (let index = 0; index < DEMO_ROOTS.length; index += 1) {
    const root = DEMO_ROOTS[index];
    let result: SyncResult;
    try {
      result = await syncNode(root, null, index);
    } catch (error) {
      result = { outcome: 'error', id: null };
      console.error(`❌ "${root.slug}": ${(error as Error).message}`);
    }
    tally[result.outcome] += 1;
    if (!result.id) continue;
    await syncLevel(root.children ?? [], result.id, tally);
  }

  console.log(
    `✅ Categorías demo: ${tally.created} creadas, ${tally.updated} actualizadas, ` +
      `${tally.unchanged} sin cambios, ${tally.skipped} omitidas, ${tally.error} con error`,
  );
  console.log('   GET /api/public/categories/menu sirve este árbol sin autenticación.');
  if (tally.error > 0 || tally.skipped > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
