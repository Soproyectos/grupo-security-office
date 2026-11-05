import { Fragment, useState, type ReactNode } from 'react'
import { Button } from '../../components/ui'
import type { PriceImportPreview, PriceImportIssue, PriceImportRow } from '../../services/price-import.service'
import { formatPreviewPesos, pageItems } from './preview.utils'
import { countRowsByFilter, filterRows, formatChangePercent, ROW_FILTERS, type RowFilter } from './review-issues.utils'

const changeLabels = { new: 'Nuevo precio', changed: 'Cambia', unchanged: 'Sin cambios' }
const COLUMNS = ['Fila Excel', 'Referencia', 'Tarifa', 'Precio anterior', 'Valor del archivo', 'Precio redondeado', 'Diferencia', '% cambio', 'Resultado']

function IssueList({ issues }: { issues: PriceImportIssue[] }) {
  return <ul className="space-y-1">{issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.row !== null ? `Fila ${issue.row}: ` : ''}{issue.column ? `${issue.column}: ` : ''}{issue.message}</li>)}</ul>
}

const errorRowClass = 'border-t border-[var(--color-border)] bg-[var(--color-error-bg-subtle)]'

function ProductRows({ row }: { row: PriceImportRow }) {
  return (
    <Fragment>
      {row.prices.map((price, index) => (
        <tr key={`${price.code}-${index}`} className={row.status === 'error' ? errorRowClass : 'border-t border-[var(--color-border)]'}>
          <td className="p-2">{row.row}</td>
          <td className="p-2 font-mono">{row.sku || 'Sin referencia'}</td>
          <td className="p-2">{price.code}</td>
          <td className="whitespace-nowrap p-2">{formatPreviewPesos(price.previous)}</td>
          <td className="p-2 font-mono">{price.raw}</td>
          <td className="whitespace-nowrap p-2 font-medium">{formatPreviewPesos(price.rounded)}{price.wasRounded && <span className="block text-xs text-[var(--color-text-secondary)]">Redondeado</span>}</td>
          <td className="whitespace-nowrap p-2">{price.difference === null ? '—' : formatPreviewPesos(price.difference)}</td>
          <td className="whitespace-nowrap p-2">{formatChangePercent(price.changePercent)}</td>
          <td className="p-2">
            {row.status === 'error' ? 'Requiere corrección' : changeLabels[price.change]}
            {price.largeChange && <span className="ml-2 rounded px-1.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'var(--color-warning-bg-subtle)', color: 'var(--color-text-primary)' }}>Cambio grande</span>}
          </td>
        </tr>
      ))}
      {row.issues.length > 0 && <tr className={errorRowClass}><td className="p-2">{row.row}</td><td className="p-2 font-mono">{row.sku || 'Sin referencia'}</td><td colSpan={7} className="p-2 text-[var(--color-text-primary)]"><IssueList issues={row.issues} /></td></tr>}
      {row.prices.length === 0 && row.issues.length === 0 && <tr className="border-t border-[var(--color-border)]"><td className="p-2">{row.row}</td><td className="p-2 font-mono">{row.sku}</td><td colSpan={7} className="p-2">Sin precios para actualizar; se conservan los actuales.</td></tr>}
    </Fragment>
  )
}

interface Props {
  result: PriceImportPreview
  /** Rendered between the summary and the table (the grouped problems). */
  beforeTable?: ReactNode
  /** When the problems are shown grouped elsewhere, skip the flat list of file-level problems. */
  hideProblemDetails?: boolean
}

export default function PriceImportPreviewResults({ result, beforeTable, hideProblemDetails = false }: Props) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState<25 | 50>(25)
  const [filter, setFilter] = useState<RowFilter>('all')
  const rows = filterRows(result.rows, filter)
  const counts = countRowsByFilter(result.rows)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const currentPage = Math.min(page, pages)
  const summary = result.summary
  const globalIssues = result.issues.filter(issue => issue.row === null)
  const hasProblems = summary.errorRows > 0 || result.issues.length > 0
  const stats = [
    ['Filas listas', summary.validRows, false], ['Con problemas', summary.errorRows, summary.errorRows > 0], ['Precios que cambian', summary.changedPrices, false],
    ['Sin cambios', summary.unchangedPrices, false], ['Nuevos', summary.newPrices, false],
  ] as const

  return (
    <div className="min-w-0 space-y-3" aria-label="Resultado de revisión">
      <div role="status" className="text-sm">
        <p className="break-words font-semibold">Revisión de {result.fileName} <span className="font-normal text-[var(--color-text-secondary)]">({summary.rows} filas, {summary.prices} precios)</span></p>
        <p className="text-[var(--color-text-secondary)]">{hasProblems ? 'Hay problemas por corregir.' : 'Revisión terminada.'} No se ha guardado ningún cambio.</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map(([label, value, alert]) => (
          <div key={label} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2" style={alert ? { borderColor: 'var(--color-error)', backgroundColor: 'var(--color-error-bg-subtle)' } : undefined}>
            <dt className="text-xs text-[var(--color-text-secondary)]">{label}</dt>
            <dd className="text-lg font-semibold text-[var(--color-text-primary)]">{value}</dd>
          </div>
        ))}
      </dl>
      {!hideProblemDetails && summary.errorRows > 0 && <p className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-bg-subtle)] p-3 text-sm text-[var(--color-text-primary)]">{summary.errorRows === 1 ? 'Hay 1 fila con problemas.' : `Hay ${summary.errorRows} filas con problemas.`} Encontrarás los detalles en cada fila de la comparación. Usa las páginas para revisar todas las filas.</p>}
      {!hideProblemDetails && globalIssues.length > 0 && <div role="alert" className="rounded-lg border border-[var(--color-error)] bg-[var(--color-error-bg-subtle)] p-3 text-sm text-[var(--color-text-primary)]"><h3 className="mb-2 font-semibold">Problemas generales de la revisión</h3><IssueList issues={globalIssues} /></div>}
      {beforeTable}
      <div className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3" role="group" aria-label="Filtrar filas">
          {ROW_FILTERS.map(({ id, label }) => {
            const active = filter === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => { setFilter(id); setPage(1) }}
                className="min-h-[44px] rounded-full border px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] sm:min-h-0 sm:py-1"
                style={active
                  ? { borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-primary-bg-subtle)', color: 'var(--color-primary)', fontWeight: 600 }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {label} ({counts[id]})
              </button>
            )
          })}
        </div>
        <div className="overflow-x-auto" role="region" aria-label="Comparación de precios; desplázate horizontalmente para ver todas las columnas" tabIndex={0}>
          <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="p-3 text-left font-semibold">Comparación de precios — filas {rows.length ? (currentPage - 1) * size + 1 : 0} a {Math.min(currentPage * size, rows.length)} de {rows.length}{filter === 'all' ? ' del archivo' : ' con este filtro'}</caption>
            <thead className="bg-[var(--color-bg-surface)] text-xs text-[var(--color-text-secondary)]"><tr>{COLUMNS.map(label => <th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead>
            <tbody>{pageItems(rows, currentPage, size).map(row => <ProductRows key={row.row} row={row} />)}</tbody>
          </table>
          {rows.length === 0 && <p className="p-4 text-sm text-[var(--color-text-secondary)]">{filter === 'all' ? 'No hay filas de productos para mostrar.' : 'Ninguna fila coincide con este filtro.'}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] p-3 text-sm">
          <label className="flex items-center gap-2">Filas por página<select value={size} onChange={event => { setSize(event.target.value === '50' ? 50 : 25); setPage(1) }} className="min-h-[44px] rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 sm:min-h-0 sm:py-1"><option value="25">25</option><option value="50">50</option></select></label>
          <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" className="min-h-[44px] sm:min-h-0" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span>Página {currentPage} de {pages}</span><Button variant="secondary" className="min-h-[44px] sm:min-h-0" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Siguiente</Button></div>
        </div>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)]">Pesos colombianos · IVA incluido · Redondeo al peso más cercano; desde 50 centavos sube al siguiente peso.</p>
    </div>
  )
}
