import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ImportWizardState, ImportStep, ImportPreviewResult, ImportExecutionResult, SystemField, ImportSection, ImportListaMetadata } from '../types/import.types';

export const IMPORT_WIZARD_STORAGE_KEY = 'gs-import-wizard';

/** Pasos que nunca se restauran a medias (no son un punto seguro de reanudación). */
const NON_RESTORABLE_STEPS: ImportStep[] = ['upload', 'sections', 'documentar', 'execution', 'result'];

export function hasPersistedImportState(): boolean {
  try {
    const raw = sessionStorage.getItem(IMPORT_WIZARD_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const step = parsed?.state?.currentStep;
    if (typeof step !== 'string' || NON_RESTORABLE_STEPS.includes(step as ImportStep)) return false;
    return true;
  } catch {
    return false;
  }
}

interface ImportStore extends ImportWizardState {
  setStep: (step: ImportStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setFile: (file: File, buffer: ArrayBuffer) => void;
  clearFile: () => void;
  setPreview: (preview: ImportPreviewResult) => void;
  setExecutionResult: (result: ImportExecutionResult) => void;
  setColumnMappings: (mappings: Array<{ sourceColumn: string; targetField: SystemField }>) => void;
  updateMapping: (sourceColumn: string, targetField: SystemField) => void;
  setFixedValue: (field: SystemField, value: string) => void;
  setIvaMode: (mode: 'with_iva' | 'without_iva' | 'mixed') => void;
  setListaId: (listaId: string | null) => void;
  setSections: (sections: ImportSection[]) => void;
  updateSection: (key: string, patch: Partial<ImportSection>) => void;
  mergeSections: (keys: string[], merged: ImportSection) => void;
  setListaMetadata: (metadata: Partial<ImportListaMetadata>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  isRestored: boolean;
  dismissRestored: () => void;
}

const STEPS: ImportStep[] = ['upload', 'headers', 'mapping', 'sections', 'documentar', 'validation', 'confirm', 'execution', 'result'];

const initialMetadata: ImportListaMetadata = {
  mode: 'create',
  listaId: null,
  name: '',
  codigo: '',
  currency: 'COP',
  validFrom: '',
  validUntil: '',
  notes: '',
};

const initialState: ImportWizardState = {
  currentStep: 'upload',
  file: null,
  fileBuffer: null,
  fileName: '',
  preview: null,
  executionResult: null,
  columnMappings: [],
  fixedValues: {},
  ivaMode: 'with_iva',
  listaId: null,
  sections: [],
  listaMetadata: initialMetadata,
  isLoading: false,
  error: null,
};

export const useImportStore = create<ImportStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      isRestored: false,

      setStep: (step) => set({ currentStep: step }),

      nextStep: () => {
        const { currentStep } = get();
        const idx = STEPS.indexOf(currentStep);
        if (idx < STEPS.length - 1 && STEPS[idx + 1]) set({ currentStep: STEPS[idx + 1] });
      },

      prevStep: () => {
        const { currentStep } = get();
        const idx = STEPS.indexOf(currentStep);
        if (idx > 0 && STEPS[idx - 1]) set({ currentStep: STEPS[idx - 1] });
      },

      setFile: (file, buffer) => set({ file, fileBuffer: buffer, fileName: file.name }),
      clearFile: () => set({ file: null, fileBuffer: null, fileName: '', preview: null, executionResult: null, sections: [] }),

      setPreview: (preview) => set({ preview }),
      setExecutionResult: (result) => set({ executionResult: result }),

      setColumnMappings: (mappings) => set({ columnMappings: mappings }),
      updateMapping: (sourceColumn, targetField) => {
        const { columnMappings } = get();
        const existing = columnMappings.find(m => m.sourceColumn === sourceColumn);
        if (existing) {
          set({ columnMappings: columnMappings.map(m => m.sourceColumn === sourceColumn ? { ...m, targetField } : m) });
        } else {
          set({ columnMappings: [...columnMappings, { sourceColumn, targetField }] });
        }
      },
      setFixedValue: (field, value) => {
        const { fixedValues } = get();
        const next = { ...fixedValues };
        if (value.trim() === '') {
          delete next[field];
        } else {
          next[field] = value;
        }
        set({ fixedValues: next });
      },
      setIvaMode: (mode) => set({ ivaMode: mode }),
      setListaId: (listaId) => set({ listaId, listaMetadata: { ...get().listaMetadata, listaId } }),
      setSections: (sections) => set({ sections }),
      updateSection: (key, patch) => {
        const { sections } = get();
        set({ sections: sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
      },
      mergeSections: (keys, merged) => {
        const { sections } = get();
        set({ sections: [...sections.filter((s) => !keys.includes(s.key)), merged] });
      },
      setListaMetadata: (metadata) => set({ listaMetadata: { ...get().listaMetadata, ...metadata } }),

      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      reset: () => set({ ...initialState, isRestored: false }),

      dismissRestored: () => set({ isRestored: false }),
    }),
    {
      name: 'gs-import-wizard',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => {
        const persisted: Record<string, unknown> = {
          currentStep: state.currentStep,
          fileName: state.fileName,
          columnMappings: state.columnMappings,
          fixedValues: state.fixedValues,
          ivaMode: state.ivaMode,
          preview: state.preview,
        };
        if (state.listaId) persisted.listaId = state.listaId;
        return persisted;
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Record<string, unknown> | undefined;
        if (!persisted) return currentState;
        const step = persisted.currentStep as ImportStep;
        if (NON_RESTORABLE_STEPS.includes(step) || !step) {
          return currentState;
        }
        if (step === 'upload' && !persisted.fileName) {
          return currentState;
        }
        return { ...currentState, ...persisted, isRestored: true };
      },
    },
  ),
);