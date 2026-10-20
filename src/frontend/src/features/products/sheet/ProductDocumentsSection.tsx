import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../services/api'
import type { Product, ProductDocument } from '../types/product.types'
import { getApiErrorMessage } from '../../../lib/apiError'
import { formatBytes } from '../../../lib/format'
import { Alert, Button, Modal } from '../../../components/ui'

const inputClass =
  'w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm'

function DocumentModal({
  error,
  loading,
  onClose,
  onConfirm,
}: {
  error: unknown
  loading: boolean
  onClose: () => void
  onConfirm: (doc: ProductDocument) => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState('')
  const [size, setSize] = useState('')
  const [formError, setFormError] = useState('')

  const handleConfirm = () => {
    if (!name.trim()) {
      setFormError('El nombre es requerido.')
      return
    }
    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      setFormError('La URL es requerida.')
      return
    }
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      setFormError('La URL debe comenzar con http:// o https://')
      return
    }
    let sizeNum: number | undefined
    if (size.trim()) {
      sizeNum = Number(size)
      if (!Number.isFinite(sizeNum) || sizeNum < 0) {
        setFormError('El tamaño debe ser un número mayor o igual que 0.')
        return
      }
    }
    setFormError('')
    onConfirm({
      name: name.trim(),
      url: trimmedUrl,
      ...(type.trim() ? { type: type.trim() } : {}),
      ...(sizeNum !== undefined ? { size: sizeNum } : {}),
    })
  }

  const alertMessage =
    formError || (error ? getApiErrorMessage(error, 'No se pudo añadir el documento.') : '')

  return (
    <Modal
      open
      onClose={onClose}
      title="Añadir documento"
      footer={
        <>
          <Button variant="secondary" disabled={loading} onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={loading} onClick={handleConfirm}>
            Añadir
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {alertMessage && <Alert variant="error">{alertMessage}</Alert>}
        <div>
          <label className="block text-sm font-medium text-neutral-800 mb-1.5">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Ej: Ficha técnica DVR-8"
            maxLength={200}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-800 mb-1.5">
            URL <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputClass}
            placeholder="https://..."
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-1.5">Tipo (opcional)</label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputClass}
              placeholder="Ej: pdf, xlsx"
              maxLength={30}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-1.5">Tamaño en bytes (opcional)</label>
            <input
              type="number"
              min="0"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className={inputClass}
              placeholder="Ej: 204800"
            />
          </div>
        </div>
        <p className="text-xs text-neutral-400">
          El documento se guarda como referencia (nombre y dirección). Aún no se pueden subir archivos desde aquí.
        </p>
      </div>
    </Modal>
  )
}

export function ProductDocumentsSection({ product }: { product: Product }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const documents = product.documents ?? []

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['product', product.id] })
  }

  const addDoc = useMutation({
    mutationFn: (doc: ProductDocument) =>
      api.put(`/products/${product.id}`, { documents: [...documents, doc] }),
    onSuccess: refresh,
  })

  const removeDoc = useMutation({
    mutationFn: (doc: ProductDocument) =>
      api.put(`/products/${product.id}`, {
        documents: documents.filter((d) => !(d.name === doc.name && d.url === doc.url)),
      }),
    onSuccess: refresh,
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-700">Documentos adjuntos</h3>
          <p className="text-xs text-neutral-500">
            Fichas técnicas del producto. La ficha pública las usa solo si no hay documentos en «Documentos y firmware».
            Se guardan al instante.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] px-2 py-1 rounded hover:bg-[var(--color-primary-bg-subtle)] transition-colors"
        >
          + Añadir documento
        </button>
      </div>

      {addDoc.isError && (
        <Alert variant="error">
          {getApiErrorMessage(addDoc.error, 'No se pudo añadir el documento.')}
        </Alert>
      )}
      {removeDoc.isError && (
        <Alert variant="error">
          {getApiErrorMessage(removeDoc.error, 'No se pudo eliminar el documento.')}
        </Alert>
      )}
      {addDoc.isSuccess && !open && (
        <Alert variant="success">Documento añadido correctamente.</Alert>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-neutral-400 py-3 text-center">Sin documentos asociados.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg">
          {documents.map((doc, idx) => (
            <li key={`${doc.url}-${idx}`} className="flex items-center gap-3 px-3 py-2.5">
              <svg
                className="w-5 h-5 text-neutral-300 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-[var(--color-primary)] hover:underline truncate block"
                  title={doc.url}
                >
                  {doc.name}
                </a>
                <p className="text-xs text-neutral-400">
                  {(doc.type ? doc.type.toUpperCase() : 'Documento') +
                    (doc.size ? ` · ${formatBytes(doc.size)}` : '')}
                </p>
              </div>
              <button
                type="button"
                disabled={removeDoc.isPending}
                onClick={() => {
                  if (confirm(`¿Eliminar el documento "${doc.name}"?`)) removeDoc.mutate(doc)
                }}
                className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                title="Eliminar documento"
                aria-label={`Eliminar documento ${doc.name}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <DocumentModal
          error={addDoc.error}
          loading={addDoc.isPending}
          onClose={() => setOpen(false)}
          onConfirm={(doc) => addDoc.mutate(doc)}
        />
      )}
    </div>
  )
}
