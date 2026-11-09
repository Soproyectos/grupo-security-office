#!/usr/bin/env node
/**
 * Extrae el catalogo base desde las listas de proveedor (.xlsx).
 *
 * SEGURIDAD POR CONSTRUCCION: solo lee las columnas REFERENCIA y DESCRIPCION.
 * Las columnas de COSTO, UTILIDAD, margenes y precios nunca se leen, asi que no
 * pueden salir en el archivo resultante ni viajar al servidor.
 *
 * Uso: node extract-catalog.cjs <carpeta-listas> <salida.json> [--incluir-subcarpetas]
 */
const fs = require('fs');
const path = require('path');

let XLSX;
for (const c of [process.env.XLSX_PATH, 'xlsx', path.join(process.cwd(), 'node_modules/xlsx')]) {
  if (!c) continue;
  try { XLSX = require(c); break; } catch { /* siguiente candidato */ }
}
if (!XLSX) {
  console.error('Falta el paquete "xlsx". Instalalo o exporta XLSX_PATH con su ruta.');
  process.exit(1);
}

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error('Uso: node extract-catalog.cjs <carpeta-listas> <salida.json> [--incluir-subcarpetas]');
  process.exit(1);
}
const recursivo = process.argv.includes('--incluir-subcarpetas');

/** Marcas deducibles por prefijo de referencia. Solo pistas: el agente confirma. */
const PREFIJOS = [
  [/^(DS-|IDS-|HWT|HWI)/i, 'Hikvision'],
  [/^(AUAC|AUEL|AUPR)/i, 'Accessmatic'],
  [/^WD/i, 'Western Digital'],
  [/^(SYS|KL\d|AWG|SF\d)/i, 'Yonusa'],
  [/^(VFD-|PW)/i, 'Powest'],
  [/^(TX\d|RRC-|ECR|IDX-)/i, 'JFL'],
];
const EN_TEXTO = ['HIKVISION', 'YONUSA', 'POWEST', 'ACCESSMATIC', 'ELITE', 'JFL', 'IMOU', 'MICRONET', 'EPCOM', 'SYSCOM'];

const limpiar = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function deducirMarca(ref, desc) {
  for (const [re, marca] of PREFIJOS) if (re.test(ref)) return marca;
  const up = desc.toUpperCase();
  for (const m of EN_TEXTO) if (up.includes(m)) return m.charAt(0) + m.slice(1).toLowerCase();
  return null;
}

function archivos(base) {
  const res = [];
  for (const nombre of fs.readdirSync(base)) {
    const p = path.join(base, nombre);
    if (fs.statSync(p).isDirectory()) { if (recursivo) res.push(...archivos(p)); continue; }
    if (!nombre.toLowerCase().endsWith('.xlsx')) continue;
    if (/plantilla|~\$/i.test(nombre)) continue;
    res.push(p);
  }
  return res;
}

const productos = new Map();
const informe = [];

for (const archivo of archivos(dir)) {
  const wb = XLSX.readFile(archivo);
  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, blankrows: false, defval: '' });
    const iHeader = filas.findIndex((f) => f.some((c) => limpiar(c).toUpperCase().startsWith('REFERENCIA')));
    if (iHeader < 0) { informe.push({ archivo: path.basename(archivo), hoja, error: 'sin columna REFERENCIA' }); continue; }

    const cab = filas[iHeader].map((c) => limpiar(c).toUpperCase());
    const iRef = cab.findIndex((c) => c.startsWith('REFERENCIA'));
    const iDesc = cab.findIndex((c) => c.startsWith('DESCRIPCI'));
    if (iDesc < 0) { informe.push({ archivo: path.basename(archivo), hoja, error: 'sin columna DESCRIPCION' }); continue; }

    let seccion = null;
    let nuevos = 0, repetidos = 0;

    for (const fila of filas.slice(iHeader + 1)) {
      const ref = limpiar(fila[iRef]);
      const desc = limpiar(fila[iDesc]);

      // Fila de seccion: trae texto en una sola de las dos columnas y nada en la otra.
      // Estas filas cargan la categoria real del bloque que sigue.
      if (!ref !== !desc) { seccion = ref || desc; continue; }
      if (!ref || !desc) continue;

      const clave = ref.toUpperCase();
      if (productos.has(clave)) {
        productos.get(clave).tambien_en.push(`${path.basename(archivo)} / ${hoja}`);
        repetidos++;
        continue;
      }
      productos.set(clave, {
        referencia: ref,
        descripcion: desc,
        origen: { archivo: path.basename(archivo), hoja, seccion },
        pista_marca: deducirMarca(ref, desc),
        tambien_en: [],
      });
      nuevos++;
    }
    informe.push({ archivo: path.basename(archivo), hoja, nuevos, repetidos, seccion_detectada: seccion !== null });
  }
}

const lista = [...productos.values()];
fs.writeFileSync(out, JSON.stringify({
  generado: new Date().toISOString(),
  total: lista.length,
  contiene_precios: false,
  productos: lista,
}, null, 2), 'utf8');

console.log(`${lista.length} referencias unicas -> ${out}`);
for (const r of informe) {
  console.log(r.error ? `  ! ${r.archivo} / ${r.hoja}: ${r.error}` : `  ${r.archivo} / ${r.hoja}: ${r.nuevos} nuevos, ${r.repetidos} repetidos`);
}
const sinMarca = lista.filter((p) => !p.pista_marca).length;
console.log(`sin pista de marca: ${sinMarca} (${Math.round((sinMarca / lista.length) * 100)}%)`);
