import { Alert, Button } from '../../components/ui'
import { orderIssues, summarizeValidation, STALE_NOTICE, type ValidationReportView } from './validation-model'

/**
 * Panel presentacional de validación (CAT-05 `frontend`): sin hooks ni red —
 * el contenedor `ValidationSection` le pasa el informe y las acciones. Así es
 * verificable con render de servidor (sin DOM) y reutilizable por CAT-06.
 * Enlaces a la ficha SOLO si `canEditSheet` (diseño §6: sin permiso de
 * Biblioteca el problema queda visible, sin habilitar el enlace).
 */
export interface ValidationPanelProps {
  report: ValidationReportView | null
  canEditSheet: boolean
  validating: boolean
  error: string | null
  onValidate: () => void
}

export function ValidationPanel({ report, canEditSheet, validating, error, onValidate }: ValidationPanelProps) {
  const summary = summarizeValidation(report)
  return (
    <div className="space-y-3" data-testid="validation-panel">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-600" aria-live="polite">
          Validación:{' '}
          <strong data-testid="validation-label" className={summary.blocking && report ? 'text-red-700' : 'text-neutral-800'}>
            {report ? summary.label : 'sin revisar'}
          </strong>
          {report ? ` (${report.rulesVersion})` : ''}
        </p>
        <Button type="button" variant="secondary" loading={validating} onClick={onValidate}>
          {report ? 'Volver a validar' : 'Validar'}
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {report?.stale && (
        <Alert variant="warning">
          <span data-testid="validation-stale">{STALE_NOTICE}</span>
        </Alert>
      )}

      {report && (
        <ul className="space-y-1.5" data-testid="validation-issues">
          {report.issues.length === 0 && <li className="text-sm text-neutral-400">Sin incidencias.</li>}
          {orderIssues(report.issues, canEditSheet).map((issue) => (
            <li key={`${issue.code}-${issue.field ?? ''}`} data-testid={`issue-${issue.severity}`}>
              <span className={`text-sm font-medium ${issue.severity === 'error' ? 'text-red-700' : issue.severity === 'warning' ? 'text-amber-700' : 'text-neutral-500'}`}>
                {issue.severity === 'error' ? 'Bloquea' : issue.severity === 'warning' ? 'Aviso' : 'Info'}
              </span>
              <span className="text-sm text-neutral-700"> — {issue.message} </span>
              <span className="text-xs text-neutral-500">{issue.fix}</span>
              {issue.anchor && (
                <a href={issue.anchor} className="ml-2 text-xs text-security-600 hover:text-security-700 underline">
                  Ir a la sección
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
