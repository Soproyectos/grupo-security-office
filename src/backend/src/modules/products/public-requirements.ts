/**
 * Pure public requirement facets derived only from already public-lensed product data.
 * No catalog values are inferred from names, SKUs, or other identifiers.
 */
export interface RequirementValue {
  value: string;
  label: string;
  count: number;
}

export interface RequirementFacet {
  specKey: string;
  label: string;
  unit: string | null;
  dataType: 'TEXT';
  values: RequirementValue[];
}

export interface RequirementProduct {
  id: string;
  categorySlug: string;
  technicalSpecs?: unknown;
  catalogSpecGroups?: unknown;
}

interface Candidate {
  specKey: string;
  label: string;
  unit: string | null;
  value: string;
  displayValue: string;
  legacyValue: string;
  legacyKey?: string;
}

const FAMILY_KEYS: Readonly<Record<string, readonly string[]>> = {
  camaras: ['resolucion_video', 'distancia_ir', 'compresion_video', 'resolution', 'resolucion', 'resolucion_maxima', 'maximum_resolution', 'lens', 'lente', 'tipo_de_lente', 'lens_type', 'focal_length', 'distancia_focal', 'night_vision', 'vision_nocturna', 'range', 'alcance', 'ir_range', 'alcance_ir', 'analytics', 'analitica', 'sensor', 'image_sensor', 'compression', 'compresion', 'protection', 'proteccion', 'grado_de_proteccion', 'audio', 'power', 'alimentacion'],
  grabadores: ['channels', 'canales', 'resolution', 'resolucion', 'storage', 'almacenamiento', 'compression', 'compresion', 'bandwidth', 'ancho_de_banda', 'audio', 'network', 'red'],
  networking: ['estandar_poe', 'presupuesto_poe', 'potencia_puerto', 'puertos_poe', 'capacidad_conmutacion', 'banda_frecuencia', 'tension_entrada', 'ports', 'puertos', 'speed', 'velocidad', 'throughput', 'capacity', 'capacidad', 'poe', 'wireless_standard', 'estandar_wifi', 'range', 'alcance'],
  almacenamiento: ['capacity', 'capacidad', 'interface', 'interfaz', 'form_factor', 'factor_de_forma', 'speed', 'velocidad', 'technology', 'tecnologia'],
  energia: ['tension_entrada', 'tension_salida', 'potencia_salida', 'capacidad_ups', 'corriente_salida', 'tipo_bateria', 'frecuencia_entrada', 'frecuencia_salida', 'voltage', 'voltaje', 'power', 'potencia', 'capacity', 'capacidad', 'current', 'corriente', 'protection', 'proteccion'],
  alarmas: ['frecuencia_transmision', 'distancia_deteccion', 'rango_transmision', 'tipo_bateria', 'corriente_espera', 'zone_count', 'zonas', 'zonas_cableadas', 'wireless_zones', 'zonas_inalambricas', 'partitions', 'particiones', 'communication', 'comunicacion', 'protocol', 'protocolo', 'battery', 'bateria'],
  audio: ['potencia_salida', 'impedancia', 'frecuencia_muestreo', 'channels', 'canales', 'power', 'potencia', 'frequency_response', 'respuesta_de_frecuencia', 'impedance', 'impedancia', 'sensitivity', 'sensibilidad', 'connectivity', 'conectividad'],
  cableado: ['material_conductor', 'tipo_conductor', 'longitud_cable', 'category', 'categoria', 'length', 'longitud', 'conductor', 'shielding', 'blindaje', 'bandwidth', 'ancho_de_banda', 'connectors', 'conectores'],
  casa_inteligente: ['protocol', 'protocolo', 'connectivity', 'conectividad', 'compatibility', 'compatibilidad', 'power', 'alimentacion', 'voltage', 'voltaje'],
  control_acceso: ['capacidad_rostros', 'capacidad_tarjetas', 'capacidad_huellas', 'capacidad_eventos', 'capacidad_usuarios', 'puertas', 'credential', 'credencial', 'reader', 'lector', 'communication', 'comunicacion', 'capacity', 'capacidad', 'protection', 'proteccion'],
  parqueaderos: ['distancia_lectura', 'longitud_brazo', 'frecuencia_trabajo', 'voltaje_trabajo', 'proteccion', 'range', 'alcance', 'frequency', 'frecuencia', 'capacity', 'capacidad', 'credential', 'credencial', 'communication', 'comunicacion'],
  monitores: ['resolucion_fisica', 'resolucion_camara', 'tecnologia_tactil', 'puntos_tactiles', 'resolution', 'resolucion', 'resolucion_maxima', 'screen_size', 'tamano_de_pantalla', 'brightness', 'brillo', 'inputs', 'entradas', 'refresh_rate', 'frecuencia_de_actualizacion'],
  cerrajeria: ['type', 'tipo', 'material', 'finish', 'acabado', 'dimensions', 'dimensiones', 'security_level', 'nivel_de_seguridad', 'backset', 'distancia_de_entrada'],
};

const FAMILY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  camaras: ['camaras'],
  grabadores: ['grabadores', 'dvr', 'nvr'],
  networking: ['redes', 'networking', 'switches', 'routers', 'transceptores'],
  almacenamiento: ['almacenamiento', 'discos-duros', 'discos-solidos'],
  energia: ['energia', 'fuentes-de-poder', 'ups', 'baterias'],
  alarmas: ['alarmas', 'alarmas-y-deteccion'],
  audio: ['audio', 'audio-y-sonido'],
  cableado: ['cableado', 'cableado-estructurado'],
  casa_inteligente: ['casa-inteligente', 'domotica'],
  control_acceso: ['control-acceso', 'control-de-acceso'],
  parqueaderos: ['parqueaderos', 'control-de-parqueaderos'],
  monitores: ['monitores', 'pantallas'],
  cerrajeria: ['cerrajeria', 'cerraduras'],
};

const normalize = (raw: string): string => raw
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const KEY_ALIASES: Readonly<Record<string, string>> = {
  protocolo_de_interfaz: 'protocolo_api',
  protocolo_de_interfaz_api: 'protocolo_api',
  entrada_de_voltaje: 'tension_entrada',
  rango_de_voltaje_de_entrada: 'tension_entrada',
  voltaje_de_salida: 'tension_salida',
  rango_de_voltaje_de_salida: 'tension_salida',
  voltaje_de_cc: 'tension_salida',
  potencia_de_salida: 'potencia_salida',
  capacidad_de_ups: 'capacidad_ups',
  capacidad_del_ups: 'capacidad_ups',
  capacidad_del_sai: 'capacidad_ups',
  tipo_de_bateria: 'tipo_bateria',
  rango_de_transmision_espacio_libre: 'rango_transmision',
  alcance_de_transmision_espacio_libre: 'rango_transmision',
  frecuencia_de_transmision: 'frecuencia_transmision',
  distancia_de_deteccion: 'distancia_deteccion',
  corriente_en_espera: 'corriente_espera',
  respuesta_en_frecuencia: 'respuesta_de_frecuencia',
  resistencia: 'impedancia',
  capacidad_de_rostros: 'capacidad_rostros',
  capacidad_de_caras: 'capacidad_rostros',
  capacidad_de_cara: 'capacidad_rostros',
  capacidad_de_tarjetas: 'capacidad_tarjetas',
  capacidad_de_tarjeta: 'capacidad_tarjetas',
  capacidad_de_la_tarjeta: 'capacidad_tarjetas',
  capacidad_de_huellas_dactilares: 'capacidad_huellas',
  capacidad_de_huellas_digitales: 'capacidad_huellas',
  capacidad_de_eventos: 'capacidad_eventos',
  capacidad_del_evento: 'capacidad_eventos',
  capacidad_de_usuario: 'capacidad_usuarios',
  capacidad_de_usuarios: 'capacidad_usuarios',
  capacidad_de_puerta_vinculada: 'puertas',
  estandar_de_poe: 'estandar_poe',
  poe_estandar: 'estandar_poe',
  presupuesto_de_energia_poe: 'presupuesto_poe',
  presupuesto_de_potencia_poe: 'presupuesto_poe',
  max_potencia_del_puerto: 'potencia_puerto',
  potencia_maxima_por_puerto: 'potencia_puerto',
  potencia_max_del_puerto: 'potencia_puerto',
  capacidad_de_conmutacion: 'capacidad_conmutacion',
  distancia_de_lectura: 'distancia_lectura',
  longitud_del_brazo_de_la_barrera: 'longitud_brazo',
  frecuencia_de_trabajo: 'frecuencia_trabajo',
  voltaje_de_trabajo: 'voltaje_trabajo',
  voltaje_de_funcionamiento: 'voltaje_trabajo',
  material_del_conductor: 'material_conductor',
  conductor_material: 'material_conductor',
  tipo_de_conductor: 'tipo_conductor',
  longitud_del_cable: 'longitud_cable',
  resolucion_de_video: 'resolucion_video',
  distancia_de_ir: 'distancia_ir',
  compresion_de_video: 'compresion_video',
  tipo_de_lente: 'lente', lens_type: 'lente', resolucion_maxima: 'resolucion', maximum_resolution: 'resolucion',
  grado_de_proteccion: 'proteccion', protection_grade: 'protection',
  protocol: 'protocolo', protocols: 'protocolo', protocolos: 'protocolo',
  protocolo_protocolo_de_red: 'protocolo', red_protocolo_de_red: 'protocolo',
  protocolos_de_red_compatibles: 'protocolo',
  potencia_nominal: 'potencia_salida', rated_power: 'potencia_salida',
  consumo_de_energia: 'consumo', power_consumption: 'consumo',
  input_voltage: 'tension_entrada', tension_de_entrada: 'tension_entrada',
  voltaje_de_entrada: 'tension_entrada', impedancia_nominal: 'impedancia',
  protocolo_de_red: 'protocolo', protocolos_de_red: 'protocolo', network_protocols: 'protocolo',
  zone_count: 'zonas', zones: 'zonas', total_zones: 'zonas', zonas_totales: 'zonas',
  number_of_zones: 'zonas', numero_de_zonas: 'zonas', cantidad_de_zonas: 'zonas',
  wired_zones: 'zonas_cableadas', wireless_zones: 'zonas_inalambricas',
};

const DISPLAY_LABELS: Readonly<Record<string, string>> = {
  impedancia: 'Impedancia',
  protocolo_api: 'Protocolos de integración',
  tension_salida: 'Tensión de salida',
  capacidad_ups: 'Capacidad UPS',
  presupuesto_poe: 'Presupuesto PoE',
  potencia_puerto: 'Potencia por puerto',
  capacidad_rostros: 'Capacidad de rostros',
  capacidad_tarjetas: 'Capacidad de tarjetas',
  capacidad_huellas: 'Capacidad de huellas',
  capacidad_eventos: 'Capacidad de eventos',
  capacidad_usuarios: 'Capacidad de usuarios',
  puertas: 'Puertas controladas',
  tension_entrada: 'Tensión de entrada',
  consumo: 'Consumo eléctrico',
  potencia_salida: 'Potencia de salida',
  alimentacion: 'Alimentación',
};

const protocolLabels: Readonly<Record<string, string>> = {
  IPV4: 'IPv4', IPV6: 'IPv6', ZIGBEE: 'Zigbee', BLUETOOTH: 'Bluetooth', MODBUS: 'Modbus',
  'WI-FI': 'Wi-Fi', WIFI: 'Wi-Fi', 'Z-WAVE': 'Z-Wave', MATTER: 'Matter',
};

const preferredProtocols = ['TCP', 'HTTP', 'HTTPS', 'DHCP'];
const protocolPriority = (label: string) => {
  const position = preferredProtocols.indexOf(label);
  return position < 0 ? preferredProtocols.length : position;
};
const zoneKeys = new Set(['zonas', 'zonas_cableadas', 'zonas_inalambricas']);

function canonicalKey(raw: string): string {
  const key = normalize(raw);
  return KEY_ALIASES[key] ?? key;
}

function protocolValues(value: string): string[] {
  return value
    .replace(/\([^()]*\)/g, '')
    .replace(/\bTCP\s*\/\s*IP\b/gi, 'TCP')
    .split(/[,;\r\n|]+/)
    .flatMap((part) => /^\s*[\w.+-]+(?:\s*\/\s*[\w.+-]+)+\s*$/.test(part) ? part.split('/') : [part])
    .map((part) => toText(part))
    .filter((part): part is string => part !== null)
    .map((part) => protocolLabels[part.toUpperCase()] ?? part.toUpperCase());
}

function familyFor(categorySlug: string): string | null {
  const slug = normalize(categorySlug).replace(/_/g, '-');
  for (const [family, aliases] of Object.entries(FAMILY_ALIASES)) {
    if (aliases.some((alias) => slug === alias || slug.startsWith(`${alias}-`))) return family;
  }
  return null;
}

function toText(value: unknown, maxLength = 120): string | null {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || text.length > maxLength) return null;
    const normalized = normalize(text);
    if (['no_aplica', 'no_especificado', 'desconocido', 'unknown', 'n_a', 'na', 'not_applicable', 'not_specified', 'sin_dato', 'no_disponible'].includes(normalized)) return null;
    return text;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function candidates(product: RequirementProduct, allowed: ReadonlySet<string>): Candidate[] {
  const result: Candidate[] = [];
  const push = (rawKey: unknown, rawLabel: unknown, rawValue: unknown, rawUnit: unknown) => {
    if (typeof rawKey !== 'string') return;
    let specKey = canonicalKey(rawKey);
    if (!allowed.has(specKey)) return;
    // Some legacy sheets label a supply voltage as power. Units determine the magnitude.
    const rawText = typeof rawValue === 'string' ? rawValue : '';
    if (['potencia', 'power'].includes(specKey) && /\d\s*V(?:AC|DC|CC|CA)?\b/i.test(rawText) && !/\bW\b/i.test(rawText)) {
      specKey = /poe/i.test(rawText) ? 'alimentacion' : 'tension_entrada';
    }
    if (allowed.has('potencia_salida') && ['potencia', 'power'].includes(specKey) && /^\s*\d+(?:[.,]\d+)?\s*W\s*$/i.test(rawText)) specKey = 'potencia_salida';
    const label = DISPLAY_LABELS[specKey] ?? (specKey === 'protocolo' ? 'Protocolos' : specKey === 'zonas' ? 'Zonas'
      : typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim().slice(0, 100) : rawKey.trim().slice(0, 100));
    const unit = typeof rawUnit === 'string' && rawUnit.trim().length <= 30 ? rawUnit.trim() || null : null;
    const rawValues = specKey.startsWith('protocolo') && Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const raw of rawValues) {
      const value = toText(raw, specKey.startsWith('protocolo') ? 500 : 120);
      if (!value) continue;
      const legacyValue = unit ? `${value} ${unit}` : value;
      const normalizedValue = legacyValue.normalize('NFKC')
        .replace(/(\d)\s*Ω/g, '$1 Ω')
        .replace(/(\d)\s*[wW]\b/g, '$1 W')
        .replace(/(\d)\s*[mM][mM]\b/g, '$1 mm');
      const zoneCount = zoneKeys.has(specKey)
        ? /^(?:hasta\s+)?(\d+)(?:\s+zonas?)?$/i.exec(value.replace(/\([^()]*\)/g, '').trim())?.[1]
        : undefined;
      const options = specKey.startsWith('protocolo') ? protocolValues(value) : [zoneCount ?? normalizedValue];
      for (const option of options) {
        result.push({ specKey, label, unit: null, value: option, displayValue: option, legacyValue, legacyKey: canonicalKey(rawKey) });
      }
    }
  };

  if (Array.isArray(product.technicalSpecs)) {
    for (const entry of product.technicalSpecs) {
      if (!isRecord(entry)) continue;
      push(entry.key, entry.label ?? entry.key, entry.value, entry.unit);
    }
  }
  if (Array.isArray(product.catalogSpecGroups)) {
    for (const group of product.catalogSpecGroups) {
      if (!isRecord(group) || !Array.isArray(group.items)) continue;
      for (const item of group.items) {
        if (!isRecord(item)) continue;
        // The item's label is both the stable parameter source and user-facing label.
        push(item.label, item.label, item.value, item.unit);
      }
    }
  }
  return result;
}

/** Stable key:value parser: split once, preserving colons inside the exact value. */
export function parseRequirementFilter(raw: string): { specKey: string; value: string } | null {
  const separator = raw.indexOf(':');
  if (separator <= 0 || separator === raw.length - 1 || raw.length > 600) return null;
  const specKey = canonicalKey(raw.slice(0, separator));
  const value = raw.slice(separator + 1);
  if (!specKey || value.trim() !== value || value.length > 500) return null;
  return { specKey, value };
}

/** Máximo de facetas que devuelve la vitrina; más allá se marca como truncado. */
export const MAX_REQUIREMENT_FACETS = 20;

/** Claves permitidas de una familia. Única fuente para facetas, filtros y validación. */
function allowedKeys(family: string): ReadonlySet<string> {
  return new Set([...FAMILY_KEYS[family], 'protocolo', 'tension_entrada', 'consumo', 'alimentacion', 'protocolo_api', 'alimentacion_metodo', ...(family === 'audio' ? ['potencia_salida'] : [])]);
}

export interface RequirementFacetsResult {
  facets: RequirementFacet[];
  /** True when more facets with values existed than the returned ones. */
  truncated: boolean;
}

/** Returns the same visible values used by the filtering helper, counted once per product. */
export function buildPublicRequirementFacetsResult(
  categorySlug: string,
  products: readonly RequirementProduct[],
  options: { limit?: number } = {},
): RequirementFacetsResult {
  const family = familyFor(categorySlug);
  if (!family) return { facets: [], truncated: false };
  const allowed = allowedKeys(family);
  const bySpec = new Map<string, { label: string; unit: string | null; values: Map<string, { label: string; count: number }> }>();
  for (const product of products) {
    const perProduct = new Map<string, Candidate>();
    for (const candidate of candidates(product, allowed)) perProduct.set(`${candidate.specKey}\u0000${candidate.value}`, candidate);
    for (const candidate of perProduct.values()) {
      const facet = bySpec.get(candidate.specKey) ?? { label: candidate.label, unit: candidate.unit, values: new Map() };
      const entry = facet.values.get(candidate.value);
      facet.values.set(candidate.value, { label: candidate.displayValue, count: (entry?.count ?? 0) + 1 });
      bySpec.set(candidate.specKey, facet);
    }
  }
  const all = [...bySpec.entries()]
    .filter(([, facet]) => facet.values.size > 0)
    .map(([specKey, facet]) => ({
      specKey,
      label: facet.label,
      unit: facet.unit,
      dataType: 'TEXT' as const,
      values: [...facet.values.entries()].map(([value, entry]) => ({ value, ...entry })).sort((a, b) => {
        const priority = specKey === 'protocolo' ? protocolPriority(a.label) - protocolPriority(b.label) : 0;
        return priority || a.label.localeCompare(b.label, 'es', { numeric: true });
      }),
    }));
  const limit = options.limit ?? MAX_REQUIREMENT_FACETS;
  return { facets: all.slice(0, limit), truncated: all.length > limit };
}

/** Solo las facetas (contrato de siempre). Usa `buildPublicRequirementFacetsResult` si importa el recorte. */
export function buildPublicRequirementFacets(
  categorySlug: string,
  products: readonly RequirementProduct[],
  options: { limit?: number } = {},
): RequirementFacet[] {
  return buildPublicRequirementFacetsResult(categorySlug, products, options).facets;
}

/** Parameters combine together; alternative values within a parameter are interchangeable.
 * Protocols are capabilities, so every selected protocol must be available.
 */
export function productMatchesRequirements(categorySlug: string, product: RequirementProduct, filters: readonly string[]): boolean {
  if (filters.length === 0) return true;
  const family = familyFor(categorySlug);
  if (!family) return false;
  const allowed = allowedKeys(family);
  const selected = new Map<string, string[]>();
  for (const raw of filters) {
    const filter = parseRequirementFilter(raw);
    if (!filter || !allowed.has(filter.specKey)) return false;
    const values = selected.get(filter.specKey) ?? [];
    values.push(filter.value);
    selected.set(filter.specKey, values);
  }
  const available = new Set(candidates(product, allowed).flatMap(({ specKey, value, legacyValue, legacyKey }) => [
    `${specKey}:${value}`, `${specKey}:${legacyValue}`, `${legacyKey ?? specKey}:${legacyValue}`,
  ]));
  return [...selected.entries()].every(([key, values]) => {
    const matches = (value: string) => available.has(`${key}:${value}`);
    return key.startsWith('protocolo') ? values.every(matches) : values.some(matches);
  });
}

/**
 * Error en español (o `null`) para un conjunto de requisitos `clave:valor` de una categoría.
 * Usa las mismas claves permitidas que las facetas y el filtro.
 */
export function validateRequirementFilters(categorySlug: string, filters: readonly string[]): string | null {
  if (filters.length === 0) return null;
  const family = familyFor(categorySlug);
  if (!family) return `La categoría «${categorySlug}» no tiene requisitos técnicos`;
  const allowed = allowedKeys(family);
  for (const raw of filters) {
    const filter = parseRequirementFilter(raw);
    if (!filter) return `El requisito «${raw}» no tiene la forma clave:valor`;
    if (!allowed.has(filter.specKey)) return `El requisito «${filter.specKey}» no está disponible para esta categoría`;
  }
  return null;
}
