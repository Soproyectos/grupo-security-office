import { Fragment, useState } from 'react'
import { Button } from '../../components/ui'
import type { PriceImportPreview, PriceImportIssue, PriceImportRow } from '../../services/price-import.service'
import { formatPreviewPesos, pageItems } from './preview.utils'

const changeLabels = { new: 'Nuevo precio', changed: 'Cambia', unchanged: 'Sin cambios' }

function IssueList({ issues }: { issues: PriceImportIssue[] }) {
  return <ul className="space-y-1">{issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.row !== null ? `Fila ${issue.row}: ` : ''}{issue.column ? `${issue.column}: ` : ''}{issue.message}</li>)}</ul>
}

function ProductRows({ row }: { row: PriceImportRow }) {
  return (
    <Fragment>
      {row.prices.map((price, index) => (
        <tr key={`${price.code}-${index}`} className={`border-t border-neutral-100 ${row.status === 'error' ? 'bg-red-50' : ''}`}>
          <td className="p-3">{row.row}</td>
          <td className="p-3 font-mono">{row.sku || 'Sin referencia'}</td>
          <td className="p-3">{price.code}</td>
          <td className="whitespace-nowrap p-3">{formatPreviewPesos(price.previous)}</td>
          <td className="p-3 font-mono">{price.raw}</td>
          <td className="whitespace-nowrap p-3 font-medium">{formatPreviewPesos(price.rounded)}{price.wasRounded && <span className="mt-1 block text-xs text-amber-800">Redondeado</span>}</td>
          <td className="whitespace-nowrap p-3">{price.difference === null ? '—' : formatPreviewPesos(price.difference)}</td>
          <td className="p-3">{row.status === 'error' ? 'Requiere corrección' : changeLabels[price.change]}</td>
        </tr>
      ))}
      {row.issues.length > 0 && <tr className="border-t border-red-100 bg-red-50"><td className="p-3">{row.row}</td><td className="p-3 font-mono">{row.sku || 'Sin referencia'}</td><td colSpan={6} className="p-3 text-red-800"><IssueList issues={row.issues} /></td></tr>}
      {row.prices.length === 0 && row.issues.length === 0 && <tr className="border-t border-neutral-100"><td className="p-3">{row.row}</td><td className="p-3 font-mono">{row.sku}</td><td colSpan={6} className="p-3">Sin precios para actualizar; se conservan los actuales.</td></tr>}
    </Fragment>
  )
}

export default function PriceImportPreviewResults({ result }: { result: PriceImportPreview }) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState<25 | 50>(25)
  const pages = Math.max(1, Math.ceil(result.rows.length / size))
  const currentPage = Math.min(page, pages)
  const summary = result.summary
  const globalIssues = result.issues.filter(issue => issue.row === null)
  const stats = [
    ['Filas revisadas', summary.rows], ['Filas correctas', summary.validRows], ['Filas con problemas', summary.errorRows],
    ['Precios revisados', summary.prices], ['Precios nuevos', summary.newPrices], ['Precios que cambian', summary.changedPrices],
    ['Precios sin cambios', summary.unchangedPrices], ['Precios redondeados', summary.roundedPrices],
  ] as const

  return (
    <div className="min-w-0 space-y-4" aria-label="Resultado de revisión">
      <div role="status" className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <p className="break-words font-semibold">Revisión de {result.fileName}</p>
        <p className="mt-1 text-neutral-600">{summary.errorRows > 0 || result.issues.length > 0 ? 'Hay problemas por corregir. Revisa los mensajes y vuelve a subir el archivo corregido.' : 'Revisión terminada.'} No se ha guardado ningún cambio.</p>
        <p className="mt-1 text-neutral-600">Pesos colombianos · IVA incluido · Redondeo al peso más cercano; desde 50 centavos sube al siguiente peso.</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="rounded-lg border border-neutral-200 bg-white p-3"><dt className="text-xs text-neutral-600">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>)}</dl>
      {summary.errorRows > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{summary.errorRows === 1 ? 'Hay 1 fila con problemas.' : `Hay ${summary.errorRows} filas con problemas.`} Encontrarás los detalles en cada fila de la comparación. Usa las páginas para revisar todas las filas.</p>}
      {globalIssues.length > 0 && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><h3 className="mb-2 font-semibold">Problemas generales de la revisión</h3><IssueList issues={globalIssues} /></div>}
      <div className="min-w-0 rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto" role="region" aria-label="Comparación de precios; desplázate horizontalmente para ver todas las columnas" tabIndex={0}>
          <table className="w-full min-w-[850px] text-left text-sm">
            <caption className="p-4 text-left font-semibold">Comparación de precios — filas {result.rows.length ? (currentPage - 1) * size + 1 : 0} a {Math.min(currentPage * size, result.rows.length)} de {result.rows.length} del archivo</caption>
            <thead className="bg-neutral-50 text-xs text-neutral-600"><tr>{['Fila Excel', 'Referencia', 'Tarifa', 'Precio anterior', 'Valor del archivo', 'Precio redondeado', 'Diferencia', 'Resultado'].map(label => <th scope="col" key={label} className="p-3">{label}</th>)}</tr></thead>
            <tbody>{pageItems(result.rows, currentPage, size).map(row => <ProductRows key={row.row} row={row} />)}</tbody>
          </table>
          {result.rows.length === 0 && <p className="p-4 text-sm text-neutral-500">No hay filas de productos para mostrar.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 p-3 text-sm">
          <label className="flex items-center gap-2">Filas por página<select value={size} onChange={event => { setSize(event.target.value === '50' ? 50 : 25); setPage(1) }} className="rounded border border-neutral-200 bg-white p-2"><option value="25">25</option><option value="50">50</option></select></label>
          <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span>Página {currentPage} de {pages}</span><Button variant="secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Siguiente</Button></div>
        </div>
      </div>
    </div>
  )
}
