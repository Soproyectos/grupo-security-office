import { create } from 'zustand'

/**
 * Controla la apertura del wizard de importación desde cualquier punto de
 * la app — antes cada página (ListasPage, ListaDetailPage) tenía su propio
 * estado local `showImportModal`, así que nada fuera de esa página podía
 * abrirlo. `BackgroundImportWidget` (montado una vez en AdminLayout, visible
 * en cualquier pantalla) necesita poder abrirlo también, para dejar entrar
 * al usuario a ver el progreso completo de una importación en curso sin
 * importar en qué página esté.
 */
interface ImportModalStore {
  isOpen: boolean
  listaId?: string
  open: (listaId?: string) => void
  close: () => void
}

export const useImportModalStore = create<ImportModalStore>()((set) => ({
  isOpen: false,
  listaId: undefined,

  open: (listaId) => set({ isOpen: true, listaId }),
  close: () => set({ isOpen: false, listaId: undefined }),
}))
