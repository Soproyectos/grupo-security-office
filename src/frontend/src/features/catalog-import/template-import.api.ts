import api from '../../services/api'
import type { BatchPage, BatchResults, BatchSummary, MappingResolution, TemplatePreview } from './template-import.types'

const BASE = '/catalog-import'

/** Saves a binary response the browser way. Never used for JSON. */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function download(path: string, fileName: string, params?: Record<string, string>) {
  const response = await api.get<Blob>(`${BASE}/${path}`, { responseType: 'blob', params })
  saveBlob(response.data, fileName)
}

export const downloadTemplate = () => download('template', 'plantilla-catalogo.xlsx')
export const downloadExample = () => download('template/example', 'ejemplo-plantilla-catalogo.xlsx')
export const downloadBatchResults = (batchId: string, format: 'xlsx' | 'csv') =>
  download(`batches/${encodeURIComponent(batchId)}/results/download`, `resultado-importacion.${format}`, { format })

export async function previewTemplate(file: File): Promise<TemplatePreview> {
  const form = new FormData()
  form.append('file', file)
  return (await api.post<TemplatePreview>(`${BASE}/preview`, form)).data
}

export async function saveMappings(previewId: string, resolutions: MappingResolution[]): Promise<TemplatePreview> {
  return (await api.patch<TemplatePreview>(`${BASE}/preview/${encodeURIComponent(previewId)}/mapping`, { resolutions })).data
}

export async function executeTemplate(previewId: string, confirmUnresolved: string[]): Promise<BatchSummary> {
  return (await api.post<BatchSummary>(`${BASE}/execute/${encodeURIComponent(previewId)}`, { confirmUnresolved })).data
}

export async function getProgress(batchId: string): Promise<BatchSummary> {
  return (await api.get<BatchSummary>(`${BASE}/progress/${encodeURIComponent(batchId)}`)).data
}

export async function listBatches(page = 1, pageSize = 20): Promise<BatchPage> {
  return (await api.get<BatchPage>(`${BASE}/batches`, { params: { page, pageSize } })).data
}

export async function getBatchResults(batchId: string): Promise<BatchResults> {
  return (await api.get<BatchResults>(`${BASE}/batches/${encodeURIComponent(batchId)}/results`)).data
}
