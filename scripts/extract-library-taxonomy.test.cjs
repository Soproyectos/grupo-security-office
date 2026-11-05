'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const XLSX = require(path.join(__dirname, '..', 'src', 'backend', 'node_modules', 'xlsx'))
const { extractTaxonomy } = require('./extract-library-taxonomy.cjs')

function makeWorkbook(taxonomyRows, otherSheets = {}) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Taxonomía aprobada', null],
    ['Categoria', 'Subcategoria'],
    ...taxonomyRows,
  ]), 'Categorias')
  for (const [name, rows] of Object.entries(otherSheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

function withWorkbook(bytes, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-library-taxonomy-test-'))
  const workbookPath = path.join(directory, 'synthetic.xlsx')
  fs.writeFileSync(workbookPath, bytes)
  try {
    return run(workbookPath)
  } finally {
    const tempRoot = path.resolve(os.tmpdir())
    const resolvedDirectory = path.resolve(directory)
    if (!resolvedDirectory.startsWith(`${tempRoot}${path.sep}`) || !path.basename(resolvedDirectory).startsWith('gs-library-taxonomy-test-')) {
      throw new Error(`Refusing to remove unexpected test directory: ${resolvedDirectory}`)
    }
    fs.rmSync(resolvedDirectory, { recursive: true, force: true })
  }
}

test('extrae solo Categorias y omite datos de Productos/Resumen', () => {
  const workbook = makeWorkbook(
    [[' Alarmas ', 'Accesorios'], ['Alarmas', 'Paneles']],
    {
      Productos: [['SKU', 'Precio'], ['SECRET-SKU-123', 987654321]],
      Resumen: [['Precio total'], [987654321]],
    },
  )
  withWorkbook(workbook, (sourcePath) => {
    const originalRead = XLSX.read
    let readOptions
    XLSX.read = (bytes, options) => {
      readOptions = options
      return originalRead(bytes, options)
    }
    let result
    try {
      result = extractTaxonomy(sourcePath, { categories: 1, subcategories: 2 })
    } finally {
      XLSX.read = originalRead
    }
    assert.equal(readOptions.sheets, 'Categorias')
    assert.deepEqual(result.categories, [{ name: 'Alarmas', subcategories: [{ name: 'Accesorios' }, { name: 'Paneles' }] }])
    const serialized = JSON.stringify(result)
    assert.doesNotMatch(serialized, /Productos|Resumen|SECRET-SKU-123|987654321|Precio|SKU/)
    assert.deepEqual(result.source, {
      filename: 'synthetic.xlsx',
      sheet: 'Categorias',
      sha256: crypto.createHash('sha256').update(workbook).digest('hex'),
    })
  })
})

test('rechaza conteos que no sean los aprobados que se esperan', () => {
  const workbook = makeWorkbook([['Alarmas', 'Accesorios']])
  withWorkbook(workbook, (sourcePath) => {
    assert.throws(() => extractTaxonomy(sourcePath), /Conteos inesperados: 1 categorías y 1 subcategorías; se esperaban 9 y 66\./)
  })
})

test('rechaza subcategorías duplicadas en vez de normalizarlas silenciosamente', () => {
  const workbook = makeWorkbook([['Alarmas', 'Paneles'], ['Alarmas', ' Paneles ']])
  withWorkbook(workbook, (sourcePath) => {
    assert.throws(() => extractTaxonomy(sourcePath, { categories: 1, subcategories: 2 }), /subcategoría duplicada «Paneles» en «Alarmas»/)
  })
})

test('rechaza filas de categoría o subcategoría incompletas', () => {
  const workbook = makeWorkbook([['Alarmas', '']])
  withWorkbook(workbook, (sourcePath) => {
    assert.throws(() => extractTaxonomy(sourcePath, { categories: 1, subcategories: 1 }), /no pueden quedar vacías/)
  })
})

test('reextraer el mismo libro produce JSON determinista', () => {
  const workbook = makeWorkbook([['Alarmas', 'Accesorios'], ['Redes', 'Switches']])
  withWorkbook(workbook, (sourcePath) => {
    const first = JSON.stringify(extractTaxonomy(sourcePath, { categories: 2, subcategories: 2 }))
    const second = JSON.stringify(extractTaxonomy(sourcePath, { categories: 2, subcategories: 2 }))
    assert.equal(second, first)
  })
})
