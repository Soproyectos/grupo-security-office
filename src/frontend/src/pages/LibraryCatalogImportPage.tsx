import { useState } from 'react'
import { useHasAssignedAction } from '../features/users/access'
import { TemplateImportHistory, TemplateImportWizard } from '../features/catalog-import/TemplateImportContainers'
import { downloadExample, downloadTemplate } from '../features/catalog-import/template-import.api'
import { friendlyImportError, visibleSections } from '../features/catalog-import/template-import.helpers'
import { ErrorBox, buttonClasses } from '../features/catalog-import/TemplateImportViews'

type Tab = 'wizard' | 'history'
const TAB_LABELS: Record<Tab, string> = { wizard: 'Nueva importación', history: 'Historial' }

function ReadOnlyTemplate() {
  const [error, setError] = useState<string | null>(null)
  const run = (action: () => Promise<void>) => { setError(null); action().catch((cause) => setError(friendlyImportError(cause).message)) }
  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4" aria-label="Plantilla de importación">
      <p className="text-sm text-neutral-600">Tu cuenta puede consultar las importaciones y descargar la plantilla, pero no importar datos.</p>
      {error && <ErrorBox message={error} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClasses.secondary} onClick={() => run(downloadTemplate)}>Descargar plantilla</button>
        <button type="button" className={buttonClasses.secondary} onClick={() => run(downloadExample)}>Descargar ejemplo lleno</button>
      </div>
    </section>
  )
}

export function ImportPageBody({ canRun, tab, onTab }: { canRun: boolean; tab: Tab; onTab: (tab: Tab) => void }) {
  const sections = visibleSections(canRun)
  const active = sections.includes(tab) ? tab : sections[0]
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-condensed text-2xl font-bold text-neutral-800">Importaciones</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">Carga productos con la plantilla de Excel: revisas qué cambiaría antes de guardar y puedes descargar el resultado.</p>
      </div>
      {sections.length > 1 && (
        <div role="tablist" aria-label="Secciones de importaciones" className="flex gap-2">
          {sections.map((section) => (
            <button key={section} role="tab" type="button" aria-selected={section === active} onClick={() => onTab(section)}
              className={`min-h-11 rounded-md border px-4 text-sm ${section === active ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] font-semibold' : 'border-neutral-300 bg-white'}`}>{TAB_LABELS[section]}</button>
          ))}
        </div>
      )}
      {!canRun && <ReadOnlyTemplate />}
      {active === 'wizard' && canRun && <TemplateImportWizard canRun={canRun} />}
      {active === 'history' && <TemplateImportHistory />}
    </div>
  )
}

export default function LibraryCatalogImportPage() {
  // imports:read opens the tab (route gate); uploading, mapping and applying need imports:run.
  const canRun = useHasAssignedAction(['imports:run'])
  const [tab, setTab] = useState<Tab>('wizard')
  return <ImportPageBody canRun={canRun} tab={tab} onTab={setTab} />
}
