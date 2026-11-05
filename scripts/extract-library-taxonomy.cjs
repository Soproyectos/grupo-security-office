#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const XLSX = require(path.join(__dirname, '..', 'src', 'backend', 'node_modules', 'xlsx'))

const DEFAULT_SOURCE = 'D:\\Empresa\\web-gruposecurity\\listas\\BIBLIOTECA_MAESTRA_2026-10-29\\REVISION_SEMANTICA\\MAESTRO_REVISADO.xlsx'
const DEFAULT_OUTPUT = path.join(__dirname, '..', 'src', 'backend', 'prisma', 'seed-data', 'library-taxonomy-9-66.json')
const DEFAULT_COUNTS = Object.freeze({ categories: 9, subcategories: 66 })

function extractTaxonomy(sourcePath, expectedCounts = DEFAULT_COUNTS) {
  const workbookBytes = fs.readFileSync(sourcePath)
  const sheetName = 'Categorias'
  const workbook = XLSX.read(workbookBytes, { type: 'buffer', cellDates: false, sheets: sheetName })
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`La hoja requerida «${sheetName}» no existe.`)

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null, blankrows: false })
  const headerIndexes = []
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index][0] === 'Categoria' && rows[index][1] === 'Subcategoria') headerIndexes.push(index)
  }
  if (headerIndexes.length !== 1) throw new Error('La hoja Categorias debe tener una sola fila con columnas Categoria y Subcategoria.')

  const categoryMap = new Map()
  let subcategoryCount = 0
  for (const [rowIndex, row] of rows.entries()) {
    if (rowIndex <= headerIndexes[0]) continue
    const rawCategory = row[0]
    const rawSubcategory = row[1]
    if ((rawCategory === null || rawCategory === '') && (rawSubcategory === null || rawSubcategory === '')) continue
    if (typeof rawCategory !== 'string' || typeof rawSubcategory !== 'string') {
      throw new Error(`Fila ${rowIndex + 1}: Categoria y Subcategoria deben ser texto.`)
    }
    const name = rawCategory.trim()
    const subcategoryName = rawSubcategory.trim()
    if (!name || !subcategoryName) throw new Error(`Fila ${rowIndex + 1}: Categoria y Subcategoria no pueden quedar vacías al recortar espacios.`)

    let subcategories = categoryMap.get(name)
    if (!subcategories) {
      subcategories = new Set()
      categoryMap.set(name, subcategories)
    }
    if (subcategories.has(subcategoryName)) {
      throw new Error(`Fila ${rowIndex + 1}: subcategoría duplicada «${subcategoryName}» en «${name}».`)
    }
    subcategories.add(subcategoryName)
    subcategoryCount += 1
  }

  if (categoryMap.size !== expectedCounts.categories || subcategoryCount !== expectedCounts.subcategories) {
    throw new Error(`Conteos inesperados: ${categoryMap.size} categorías y ${subcategoryCount} subcategorías; se esperaban ${expectedCounts.categories} y ${expectedCounts.subcategories}.`)
  }

  return {
    source: {
      filename: path.basename(sourcePath),
      sheet: sheetName,
      sha256: crypto.createHash('sha256').update(workbookBytes).digest('hex'),
    },
    categories: Array.from(categoryMap, ([name, subcategories]) => ({
      name,
      subcategories: Array.from(subcategories, (subcategoryName) => ({ name: subcategoryName })),
    })),
  }
}

function main(args) {
  if (args.length > 2) throw new Error('Uso: node scripts/extract-library-taxonomy.cjs [libro.xlsx] [salida.json]')
  const sourcePath = args[0] || DEFAULT_SOURCE
  const outputPath = args[1] ? path.resolve(args[1]) : DEFAULT_OUTPUT
  const taxonomy = extractTaxonomy(sourcePath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(taxonomy, null, 2)}\n`, 'utf8')
  process.stdout.write(`Taxonomía extraída: ${taxonomy.categories.length} categorías, ${taxonomy.categories.reduce((count, category) => count + category.subcategories.length, 0)} subcategorías.\n`)
  process.stdout.write(`Salida: ${outputPath}\n`)
}

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

module.exports = { DEFAULT_COUNTS, extractTaxonomy }
