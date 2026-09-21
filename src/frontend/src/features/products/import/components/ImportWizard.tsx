import { useEffect } from 'react';
import { useImportStore } from '../store/import.store';
import { Alert, Button } from '../../../../components/ui';
import ImportStepper from './ImportStepper';
import ImportStepSections from './ImportStepSections';
import ImportStepUpload from './ImportStepUpload';
import ImportStepHeaders from './ImportStepHeaders';
import ImportStepMapping from './ImportStepMapping';
import ImportStepDocumentar from './ImportStepDocumentar';
import ImportStepValidation from './ImportStepValidation';
import ImportStepConfirm from './ImportStepConfirm';
import ImportStepExecution from './ImportStepExecution';
import ImportStepResult from './ImportStepResult';

const STEP_LABELS: Record<string, string> = {
  upload: 'Carga de archivo',
  headers: 'Encabezados',
  mapping: 'Mapeo de columnas',
  sections: 'Secciones',
  documentar: 'Documentar',
  validation: 'Validacion',
  confirm: 'Confirmacion',
  execution: 'Ejecucion',
  result: 'Resultado',
};

interface ImportWizardProps {
  onClose: () => void;
  listaId?: string;
}

export default function ImportWizard({ onClose, listaId }: ImportWizardProps) {
  const currentStep = useImportStore((s) => s.currentStep);
  const nextStep = useImportStore((s) => s.nextStep);
  const prevStep = useImportStore((s) => s.prevStep);
  const error = useImportStore((s) => s.error);
  const reset = useImportStore((s) => s.reset);
  const isRestored = useImportStore((s) => s.isRestored);
  const dismissRestored = useImportStore((s) => s.dismissRestored);
  const fileName = useImportStore((s) => s.fileName);
  const setListaId = useImportStore((s) => s.setListaId);

  useEffect(() => {
    setListaId(listaId ?? null);
  }, [listaId, setListaId]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'sections':
        return <ImportStepSections />;
      case 'upload':
        return <ImportStepUpload />;
      case 'headers':
        return <ImportStepHeaders />;
      case 'mapping':
        return <ImportStepMapping />;
      case 'documentar':
        return <ImportStepDocumentar />;
      case 'validation':
        return <ImportStepValidation />;
      case 'confirm':
        return <ImportStepConfirm />;
      case 'execution':
        return <ImportStepExecution onClose={handleClose} />;
      case 'result':
        return <ImportStepResult onNewImport={reset} onClose={handleClose} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-5xl h-[90vh] bg-white rounded-2xl shadow-xl">
        <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h1 className="text-xl font-condensed font-semibold text-neutral-800">
            Importar Productos
          </h1>
          <div className="flex items-center gap-3">
            {error && (
              <span className="text-sm text-brand-primary max-w-xs truncate">
                {error}
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cerrar
            </button>
          </div>
        </header>

        <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50">
          <ImportStepper currentStep={currentStep} />
        </div>

        <div className="mx-6 mt-4">
          <Alert variant="info">
            <strong>Importación automática:</strong> las categorías (secciones) y marcas que no
            existan se crearán automáticamente durante la importación. Puedes gestionarlas desde la
            pestaña "Configuración" de la Lista.
          </Alert>
        </div>

        {isRestored && currentStep !== 'upload' && (
          <div className="mx-6 mt-4 flex items-center justify-between p-3 bg-brand-primary-light border border-brand-primary-subtle rounded-lg">
            <p className="text-sm text-brand-primary">
              <strong>Sesión restaurada</strong>
              {fileName && <span> — Archivo: {fileName}</span>}
              <span> — Paso: {STEP_LABELS[currentStep] || currentStep}</span>
            </p>
            <button
              type="button"
              onClick={dismissRestored}
              className="ml-3 text-brand-primary hover:text-brand-primary-hover transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {renderStep()}
        </div>

        {currentStep !== 'execution' && currentStep !== 'result' && (
          <footer className="border-t border-neutral-200 px-6 py-4 flex items-center justify-between">
            <Button variant="secondary" onClick={prevStep} disabled={currentStep === 'upload'}>
              Anterior
            </Button>
            <Button onClick={nextStep} disabled>
              Siguiente
            </Button>
          </footer>
        )}
      </div>
    </div>
  );
}
