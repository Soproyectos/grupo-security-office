import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from './hooks/useToast'
import App from './App'
import './index.css'

const installClipboardFallback = () => {
  const clipboard = navigator.clipboard as Partial<Clipboard> | undefined
  if (typeof clipboard?.writeText === 'function') return

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('aria-hidden', 'true')
        textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
        document.body.appendChild(textarea)

        try {
          textarea.focus()
          textarea.select()
          textarea.setSelectionRange(0, text.length)

          if (!document.execCommand('copy')) {
            throw new Error('Clipboard copy was rejected')
          }
        } finally {
          textarea.remove()
        }
      },
    },
  })
}

installClipboardFallback()

// Overlay de anotaciones (agentation) para trabajar con el agente.
// Activo por defecto en dev; en cualquier otro entorno se fuerza con
// VITE_AGENTATION_ENABLED=true. El endpoint se deriva del host de la propia
// pagina para que el overlay funcione desde cualquier maquina (localhost
// solo resuelve cuando el navegador corre en el mismo servidor).
const agentationEnabled =
  import.meta.env.DEV || import.meta.env.VITE_AGENTATION_ENABLED === 'true'

const agentationEndpoint =
  import.meta.env.VITE_AGENTATION_URL ?? `http://${window.location.hostname}:4747`

const Agentation = agentationEnabled
  ? React.lazy(() => import('agentation').then((m) => ({ default: m.Agentation })))
  : null

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        {Agentation && (
          <React.Suspense fallback={null}>
            <Agentation endpoint={agentationEndpoint} />
          </React.Suspense>
        )}
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
