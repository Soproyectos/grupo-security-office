import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Page from '../src/pages/LibraryCatalogImportPage'
import { useAuthStore } from '../src/stores/auth.store'
import '../src/index.css'

// Only served by scripts/qa-importador-local.cjs, never part of the application entry.
const identity = JSON.parse(document.getElementById('qa-identity')!.textContent!)
useAuthStore.getState().login(identity)
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Page />
  </QueryClientProvider>,
)
