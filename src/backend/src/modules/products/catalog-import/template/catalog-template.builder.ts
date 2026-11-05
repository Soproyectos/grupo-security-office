import * as XLSX from 'xlsx';
import { COLUMNS, HIGHLIGHT_TYPES, LIMITS, META_SHEET, RESOURCE_TYPES, SHEETS, STATE_LABELS, TEMPLATE_VERSION, TemplateDictionary, SpecDataType } from './catalog-template.types';

const TYPE_LABELS: Record<SpecDataType, string> = { TEXT: 'Texto', NUMBER: 'Numero', BOOLEAN: 'Si/No', OPTION: 'Una opcion', MULTI_OPTION: 'Varias opciones (separadas por ;)' };

export function instructionRows(): string[][] {
  return [
    ['PLANTILLA DE CATALOGO DE PRODUCTOS'],
    [`Version de la plantilla: ${TEMPLATE_VERSION}`],
    ['No modifique los nombres de las hojas ni de las columnas: el archivo se rechaza si cambian.'],
    [''],
    ['COMO FUNCIONA'],
    ['1. Cada producto es una fila de la hoja Productos. Las demas hojas se relacionan con el producto por la columna REFERENCIA (el SKU).'],
    ['2. Solo REFERENCIA y NOMBRE son obligatorios. Una celda vacia significa "pendiente" en un producto nuevo y "dejar como esta" en uno existente.'],
    ['3. Primero se muestra una vista previa; nada se guarda hasta que usted la confirme. Esta plantilla nunca crea marcas, categorias, subcategorias ni atributos.'],
    ['4. Un producto con contenido ya aprobado o publicado no se modifica: sus diferencias se muestran como propuestas para revisar.'],
    ['5. Quitar una fila de una hoja NO borra lo que ya existe en el producto. Para borrar, use el editor del producto.'],
    [''],
    ['HOJAS'],
    [`${SHEETS.products}: REFERENCIA, NOMBRE, MARCA, SUBCATEGORIA, CATEGORIA (opcional), DESCRIPCION. Marca y subcategoria deben existir en la hoja ${SHEETS.dictionaries}.`],
    [`${SHEETS.mainData}: una fila por dato principal. ESTADO: ${Object.values(STATE_LABELS).join(' / ')}. VALOR solo cuando el estado es Conocido. Los atributos permitidos dependen de la subcategoria.`],
    [`${SHEETS.specs}: tabla de especificaciones agrupadas (GRUPO, DATO, VALOR). ORDEN es opcional (numero entero desde 0).`],
    [`${SHEETS.highlights}: TIPO = ${HIGHLIGHT_TYPES.join(' / ')}. ORDEN es opcional.`],
    [`${SHEETS.resources}: TIPO = ${RESOURCE_TYPES.join(' / ')}. URL debe empezar por http:// o https://.`],
    [`${SHEETS.related}: un modelo relacionado por fila; la referencia relacionada debe existir en el archivo o en el catalogo.`],
    [`${SHEETS.dictionaries}: listas vigentes de marcas, categorias, subcategorias y atributos (solo lectura; no se importa).`],
    [''],
    ['IMAGENES Y DOCUMENTOS'],
    ['Una ruta de su computador (por ejemplo C:\\Users\\...\\foto.jpg) NO sube el archivo: Excel no puede adjuntar archivos.'],
    ['Hay dos mecanismos validos: (a) un enlace URL publico http/https en la hoja Recursos, o (b) subir el archivo desde el editor del producto (carga de archivos).'],
    [''],
    ['LIMITES'],
    [`Maximo ${LIMITS.maxProducts} productos y ${LIMITS.maxRowsPerSheet} filas por hoja; archivo de hasta ${LIMITS.maxFileBytes / (1024 * 1024)} MB.`],
    [`Por producto: ${LIMITS.maxHighlights} destacados, ${LIMITS.maxFeatures} caracteristicas, ${LIMITS.maxBadges} insignias, ${LIMITS.maxSpecGroups} grupos de especificaciones, ${LIMITS.maxResources} recursos, ${LIMITS.maxRelated} modelos relacionados.`],
    [`Textos: nombre ${LIMITS.name}, descripcion ${LIMITS.description}, destacado ${LIMITS.highlightText}, caracteristica ${LIMITS.featureText}, insignia ${LIMITS.badgeText} caracteres.`],
    ['No incluya precios, costos ni identificadores internos: el importador los rechaza o los ignora.'],
  ];
}

function sheetOf(headers: readonly string[], rows: unknown[][], widths: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([[...headers], ...rows]);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

function dictionarySheet(dictionary: TemplateDictionary): XLSX.WorkSheet {
  const brands = [...dictionary.brands].map((b) => b.name).sort((a, b) => a.localeCompare(b, 'es'));
  const tree: string[][] = [];
  for (const cat of [...dictionary.categories].sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
    const subs = dictionary.subcategories.filter((s) => s.categoryId === cat.id).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!subs.length) tree.push([cat.name, '']);
    for (const sub of subs) tree.push([cat.name, sub.name]);
  }
  const attrs: string[][] = [];
  for (const sub of [...dictionary.subcategories].sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name, 'es'))) {
    for (const spec of sub.specs) {
      attrs.push([sub.category, sub.name, spec.label, TYPE_LABELS[spec.dataType], spec.unit ?? '', spec.options.map((o) => o.label).join('; '), spec.required ? 'Si' : 'No']);
    }
  }
  const height = Math.max(brands.length, tree.length, attrs.length);
  const header = ['MARCA', '', 'CATEGORIA', 'SUBCATEGORIA', '', 'CATEGORIA', 'SUBCATEGORIA', 'ATRIBUTO', 'TIPO', 'UNIDAD', 'OPCIONES', 'OBLIGATORIO'];
  const aoa: unknown[][] = [header];
  for (let i = 0; i < height; i++) aoa.push([brands[i] ?? '', '', ...(tree[i] ?? ['', '']), '', ...(attrs[i] ?? ['', '', '', '', '', '', ''])]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [28, 3, 26, 30, 3, 26, 30, 30, 22, 12, 50, 12].map((wch) => ({ wch }));
  return ws;
}

export interface BuildOptions { generatedAt?: Date }

/** Product rows of one sheet, ready for aoa. Used by the empty template (no rows) and by the example. */
export interface TemplateRows {
  products?: unknown[][]; mainData?: unknown[][]; specs?: unknown[][]; highlights?: unknown[][]; resources?: unknown[][]; related?: unknown[][];
}

export function buildCatalogTemplate(dictionary: TemplateDictionary, rows: TemplateRows = {}, options: BuildOptions = {}): Buffer {
  const wb = XLSX.utils.book_new();
  const add = (name: string, ws: XLSX.WorkSheet) => XLSX.utils.book_append_sheet(wb, ws, name);
  const instructions = XLSX.utils.aoa_to_sheet(instructionRows());
  instructions['!cols'] = [{ wch: 140 }];
  add(SHEETS.instructions, instructions);
  add(SHEETS.products, sheetOf(COLUMNS.products, rows.products ?? [], [24, 44, 22, 28, 22, 60]));
  add(SHEETS.mainData, sheetOf(COLUMNS.mainData, rows.mainData ?? [], [24, 30, 16, 36]));
  add(SHEETS.specs, sheetOf(COLUMNS.specs, rows.specs ?? [], [24, 26, 32, 44, 10]));
  add(SHEETS.highlights, sheetOf(COLUMNS.highlights, rows.highlights ?? [], [24, 18, 60, 10]));
  add(SHEETS.resources, sheetOf(COLUMNS.resources, rows.resources ?? [], [24, 14, 36, 60, 10]));
  add(SHEETS.related, sheetOf(COLUMNS.related, rows.related ?? [], [24, 28]));
  add(SHEETS.dictionaries, dictionarySheet(dictionary));
  add(META_SHEET, XLSX.utils.aoa_to_sheet([['version', TEMPLATE_VERSION], ['generada', (options.generatedAt ?? new Date()).toISOString()], ['hojas', Object.values(SHEETS).join('|')]]));
  wb.Workbook = { Sheets: wb.SheetNames.map((name) => ({ name, Hidden: name === META_SHEET ? 1 : 0 })) };
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Synthetic dictionary used only by the example and the tests. */
export const EXAMPLE_DICTIONARY: TemplateDictionary = {
  brands: [{ id: 'b-1', name: 'MarcaEjemplo' }],
  categories: [{ id: 'c-1', name: 'Videovigilancia' }, { id: 'c-2', name: 'Redes' }],
  subcategories: [
    { id: 's-dvr', categoryId: 'c-1', category: 'Videovigilancia', name: 'Grabadores DVR', specs: [
      { key: 'channels', label: 'Canales', dataType: 'NUMBER', unit: 'canales', required: true, options: [] },
      { key: 'resolution', label: 'Resolucion maxima', dataType: 'OPTION', options: [{ key: '4mp', label: '4 MP' }, { key: '8mp', label: '8 MP' }] },
      { key: 'poe', label: 'Puertos PoE', dataType: 'BOOLEAN', options: [] },
      { key: 'ai', label: 'Funciones de analitica', dataType: 'MULTI_OPTION', options: [{ key: 'face', label: 'Rostros' }, { key: 'line', label: 'Cruce de linea' }] },
    ] },
    { id: 's-sw', categoryId: 'c-2', category: 'Redes', name: 'Switches', specs: [
      { key: 'ports', label: 'Puertos', dataType: 'NUMBER', unit: 'puertos', required: true, options: [] },
      { key: 'poe_budget', label: 'Presupuesto PoE', dataType: 'NUMBER', unit: 'W', options: [] },
      { key: 'managed', label: 'Administrable', dataType: 'BOOLEAN', options: [] },
    ] },
    { id: 's-acc', categoryId: 'c-1', category: 'Videovigilancia', name: 'Accesorios', specs: [
      { key: 'material', label: 'Material', dataType: 'TEXT', options: [] },
    ] },
  ],
};

/** Synthetic example: a DVR, a switch and an accessory, each using different sheets. */
export function buildExample(options: BuildOptions = {}): Buffer {
  return buildCatalogTemplate(EXAMPLE_DICTIONARY, {
    products: [
      ['EJ-DVR-0801', 'Grabador DVR 8 canales', 'MarcaEjemplo', 'Grabadores DVR', 'Videovigilancia', 'Grabador digital de 8 canales para camaras analogas y HD.'],
      ['EJ-SW-0802P', 'Switch 8 puertos PoE', 'MarcaEjemplo', 'Switches', '', 'Switch de 8 puertos con alimentacion PoE.'],
      ['EJ-ACC-FUENTE', 'Fuente de poder 12V 5A', 'MarcaEjemplo', 'Accesorios', 'Videovigilancia', ''],
    ],
    mainData: [
      ['EJ-DVR-0801', 'Canales', 'Conocido', 8],
      ['EJ-DVR-0801', 'Resolucion maxima', 'Conocido', '4 MP'],
      ['EJ-DVR-0801', 'Puertos PoE', 'Conocido', 'No'],
      ['EJ-DVR-0801', 'Funciones de analitica', 'Conocido', 'Rostros; Cruce de linea'],
      ['EJ-SW-0802P', 'Puertos', 'Conocido', 8],
      ['EJ-SW-0802P', 'Presupuesto PoE', 'Conocido', 120],
      ['EJ-SW-0802P', 'Administrable', 'No aplica', ''],
    ],
    specs: [
      ['EJ-DVR-0801', 'Video', 'Compresion', 'H.265+', 0],
      ['EJ-DVR-0801', 'Video', 'Salida', 'HDMI y VGA', 1],
      ['EJ-DVR-0801', 'Almacenamiento', 'Discos', '1 disco SATA hasta 10 TB', 2],
    ],
    highlights: [
      ['EJ-DVR-0801', 'Destacado', 'Reproduccion simultanea de 8 canales', 0],
      ['EJ-DVR-0801', 'Caracteristica', 'Compresion H.265+', 1],
      ['EJ-SW-0802P', 'Insignia', 'PoE', 0],
    ],
    resources: [
      ['EJ-DVR-0801', 'Imagen', 'Vista frontal', 'https://ejemplo.invalid/imagenes/dvr-0801.jpg', 0],
      ['EJ-DVR-0801', 'Documento', 'Ficha tecnica', 'https://ejemplo.invalid/docs/dvr-0801.pdf', 1],
      ['EJ-SW-0802P', 'Firmware', 'Firmware v1.2', 'https://ejemplo.invalid/fw/sw-0802p-1.2.bin', 0],
    ],
    related: [
      ['EJ-DVR-0801', 'EJ-SW-0802P'],
      ['EJ-SW-0802P', 'EJ-ACC-FUENTE'],
    ],
  }, options);
}
