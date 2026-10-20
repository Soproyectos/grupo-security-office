import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

vi.mock('./api', () => ({ default: { get, patch, delete: del } }))

import {
  LISTA_DELETE_CONSERVATION_NOTICE,
  LISTA_UNLINK_CONSERVATION_NOTICE,
  ListaServiceError,
  archiveLista,
  deleteLista,
  listaErrorMessage,
  restoreLista,
  unlinkProduct,
} from './listas.service'

// ---------------------------------------------------------------------------
// CAT-01 frontend — contrato de servidor conservacionista consumido por la UI.
// Covered scenarios:
// ✅ ACEPTACIÓN «Eliminar/desvincular/archivar conserva identidad, medios e
//    históricos»: el cliente solo ofrece las 4 acciones conservacionistas
//    (DELETE con confirm, unlink, archive, restore) y NUNCA un "mover" de
//    producto entre listas (unlink viaja sin cuerpo ni destino).
// ✅ Errores tipados 400/403/404/409 con el mensaje del servidor tal cual
//    (incluye el motivo 409 de cotizaciones al eliminar).
// ✅ Envoltorio { data: … } defensivo (patrón agenda.service).
// ---------------------------------------------------------------------------

const LISTA_ID = '22222222-2222-4222-8222-222222222222'
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111'

const MOTIVO_COTIZACION =
  'La Lista tiene 1 cotización asociada: no se puede eliminar hasta resolver Quote.listaId (destino de la referencia).'

function httpError(status: number, message?: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: message ? { message } : {} },
  })
}

const networkError = () => Object.assign(new Error('Network Error'), { response: undefined })

beforeEach(() => {
  get.mockReset()
  patch.mockReset()
  del.mockReset()
})

describe('deleteLista (DELETE /api/listas/:id conservacionista)', () => {
  it('envía confirm:true en el cuerpo y devuelve mensaje + productosConservados', async () => {
    del.mockResolvedValue({
      data: {
        data: { message: 'Lista eliminada exitosamente', productosConservados: 3 },
      },
    })

    const result = await deleteLista(LISTA_ID, { confirm: true })

    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(`/listas/${LISTA_ID}`, { data: { confirm: true } })
    expect(result).toEqual({ message: 'Lista eliminada exitosamente', productosConservados: 3 })
  })

  it('desenvuelve el envoltorio { data: … } cuando el interceptor no lo peló', async () => {
    del.mockResolvedValue({
      data: { message: 'Lista eliminada exitosamente', productosConservados: 1 },
    })

    await expect(deleteLista(LISTA_ID, { confirm: true })).resolves.toEqual({
      message: 'Lista eliminada exitosamente',
      productosConservados: 1,
    })
  })

  it('acepta confirm:false y lo refleja en la petición (el servidor responderá 400)', async () => {
    del.mockResolvedValue({ data: { data: { message: 'ok', productosConservados: 0 } } })

    await deleteLista(LISTA_ID, { confirm: false })

    expect(del).toHaveBeenCalledWith(`/listas/${LISTA_ID}`, { data: { confirm: false } })
  })

  it('400 sin confirm → error tipado invalid con el mensaje del servidor', async () => {
    del.mockRejectedValue(
      httpError(400, 'Debes confirmar el borrado físico con confirm: true'),
    )

    const error = await deleteLista(LISTA_ID, { confirm: true }).catch((e) => e)

    expect(error).toBeInstanceOf(ListaServiceError)
    expect(error).toMatchObject({ code: 'invalid', status: 400 })
    expect(error.message).toBe('Debes confirmar el borrado físico con confirm: true')
  })

  it('409 con cotizaciones conserva el motivo del servidor tal cual', async () => {
    del.mockRejectedValue(httpError(409, MOTIVO_COTIZACION))

    const error = await deleteLista(LISTA_ID, { confirm: true }).catch((e) => e)

    expect(error).toBeInstanceOf(ListaServiceError)
    expect(error).toMatchObject({ code: 'conflict', status: 409 })
    expect(error.message).toBe(MOTIVO_COTIZACION)
    expect(listaErrorMessage(error)).toBe(MOTIVO_COTIZACION)
  })

  it('409 sin mensaje del servidor sigue avisando con un motivo claro', async () => {
    del.mockRejectedValue(httpError(409))

    const error = await deleteLista(LISTA_ID, { confirm: true }).catch((e) => e)

    expect(error).toMatchObject({ code: 'conflict', status: 409 })
    expect(error.message.length).toBeGreaterThan(0)
  })

  it('403 (rol sin listas:delete) → forbidden con el mensaje del servidor', async () => {
    del.mockRejectedValue(
      httpError(403, 'Solo Super Admin o Admin Comercial pueden eliminar Listas'),
    )

    const error = await deleteLista(LISTA_ID, { confirm: true }).catch((e) => e)

    expect(error).toMatchObject({ code: 'forbidden', status: 403 })
    expect(error.message).toBe('Solo Super Admin o Admin Comercial pueden eliminar Listas')
  })

  it('404 (lista inexistente) → not-found con mensaje claro', async () => {
    del.mockRejectedValue(httpError(404, 'Lista no encontrada'))

    const error = await deleteLista(LISTA_ID, { confirm: true }).catch((e) => e)

    expect(error).toMatchObject({ code: 'not-found', status: 404 })
    expect(error.message).toBe('Lista no encontrada')
  })

  it('propaga el error de red sin envolverlo para que la página ofrezca reintentar', async () => {
    const failure = networkError()
    del.mockRejectedValue(failure)

    await expect(deleteLista(LISTA_ID, { confirm: true })).rejects.toBe(failure)
  })
})

describe('unlinkProduct (PATCH /api/listas/:id/products/:productId/unlink)', () => {
  it('desvincula con PATCH al recurso anidado y SIN cuerpo: nunca envía otra lista', async () => {
    patch.mockResolvedValue({
      data: { data: { id: PRODUCT_ID, sku: 'T06C-SKU-1', listaId: null } },
    })

    const product = await unlinkProduct(LISTA_ID, PRODUCT_ID)

    expect(patch).toHaveBeenCalledTimes(1)
    // Sin segundo argumento: no hay destino, no hay reasignación implícita.
    expect(patch.mock.calls[0]).toEqual([`/listas/${LISTA_ID}/products/${PRODUCT_ID}/unlink`])
    expect(product).toMatchObject({ id: PRODUCT_ID, listaId: null })
  })

  it('desenvuelve la respuesta cuando viene envuelta en { data: … }', async () => {
    patch.mockResolvedValue({ data: { id: PRODUCT_ID, listaId: null } })

    await expect(unlinkProduct(LISTA_ID, PRODUCT_ID)).resolves.toMatchObject({
      id: PRODUCT_ID,
      listaId: null,
    })
  })

  it('404 (producto no pertenece a la lista o lista inexistente) → not-found con el mensaje', async () => {
    patch.mockRejectedValue(httpError(404, 'Producto no encontrado en esta Lista'))

    const error = await unlinkProduct(LISTA_ID, PRODUCT_ID).catch((e) => e)

    expect(error).toBeInstanceOf(ListaServiceError)
    expect(error).toMatchObject({ code: 'not-found', status: 404 })
    expect(error.message).toBe('Producto no encontrado en esta Lista')
  })

  it('403 (ACL insuficiente) → forbidden con el mensaje del servidor', async () => {
    patch.mockRejectedValue(
      httpError(403, 'No tienes permisos suficientes sobre esta Lista'),
    )

    const error = await unlinkProduct(LISTA_ID, PRODUCT_ID).catch((e) => e)

    expect(error).toMatchObject({ code: 'forbidden', status: 403 })
    expect(error.message).toBe('No tienes permisos suficientes sobre esta Lista')
  })

  it('409 (lista con eliminación pendiente) → conflict con el motivo', async () => {
    patch.mockRejectedValue(
      httpError(409, 'No se puede desvincular productos de una Lista con solicitud de eliminación pendiente'),
    )

    const error = await unlinkProduct(LISTA_ID, PRODUCT_ID).catch((e) => e)

    expect(error).toMatchObject({ code: 'conflict', status: 409 })
    expect(error.message).toContain('eliminación pendiente')
  })

  it('401 (sesión expirada) → unauthorized con aviso de sesión', async () => {
    patch.mockRejectedValue(httpError(401))

    const error = await unlinkProduct(LISTA_ID, PRODUCT_ID).catch((e) => e)

    expect(error).toMatchObject({ code: 'unauthorized', status: 401 })
    expect(error.message).toContain('sesión')
  })

  it('propaga el error de red sin envolverlo', async () => {
    const failure = networkError()
    patch.mockRejectedValue(failure)

    await expect(unlinkProduct(LISTA_ID, PRODUCT_ID)).rejects.toBe(failure)
  })
})

describe('archiveLista / restoreLista (PATCH archive|restore)', () => {
  it('archive llama a PATCH /listas/:id/archive y devuelve la Lista', async () => {
    patch.mockResolvedValue({
      data: { data: { id: LISTA_ID, archivedAt: '2026-10-15T12:00:00.000Z', isActive: false } },
    })

    const lista = await archiveLista(LISTA_ID)

    expect(patch).toHaveBeenCalledWith(`/listas/${LISTA_ID}/archive`)
    expect(lista).toMatchObject({ id: LISTA_ID, isActive: false })
  })

  it('restore llama a PATCH /listas/:id/restore y devuelve la Lista', async () => {
    patch.mockResolvedValue({
      data: { data: { id: LISTA_ID, archivedAt: null, isActive: true } },
    })

    const lista = await restoreLista(LISTA_ID)

    expect(patch).toHaveBeenCalledWith(`/listas/${LISTA_ID}/restore`)
    expect(lista).toMatchObject({ id: LISTA_ID, archivedAt: null, isActive: true })
  })

  it('403 al archivar → forbidden con el mensaje del servidor', async () => {
    patch.mockRejectedValue(httpError(403, 'No tienes permisos suficientes sobre esta Lista'))

    const error = await archiveLista(LISTA_ID).catch((e) => e)

    expect(error).toBeInstanceOf(ListaServiceError)
    expect(error).toMatchObject({ code: 'forbidden', status: 403 })
    expect(error.message).toBe('No tienes permisos suficientes sobre esta Lista')
  })

  it('404 al restaurar (lista oculta o inexistente) → not-found', async () => {
    patch.mockRejectedValue(httpError(404, 'Lista no encontrada'))

    const error = await restoreLista(LISTA_ID).catch((e) => e)

    expect(error).toMatchObject({ code: 'not-found', status: 404 })
    expect(error.message).toBe('Lista no encontrada')
  })

  it('propaga el error de red sin envolverlo', async () => {
    const failure = networkError()
    patch.mockRejectedValue(failure)

    await expect(archiveLista(LISTA_ID)).rejects.toBe(failure)
  })
})

describe('listaErrorMessage (mensaje claro para la UI)', () => {
  it('devuelve el mensaje del error tipado sin tocarlo', () => {
    const error = new ListaServiceError('conflict', MOTIVO_COTIZACION, 409)

    expect(listaErrorMessage(error)).toBe(MOTIVO_COTIZACION)
  })

  it('lee el mensaje del servidor aunque el error venga sin envolver', () => {
    expect(listaErrorMessage(httpError(409, MOTIVO_COTIZACION))).toBe(MOTIVO_COTIZACION)
  })

  it('un estado sin mensaje del servidor cae en un aviso claro por código', () => {
    expect(listaErrorMessage(httpError(403))).toContain('permiso')
    expect(listaErrorMessage(httpError(404))).toContain('disponible')
  })

  it('usa el fallback de quien llama cuando no hay estado HTTP', () => {
    expect(listaErrorMessage(networkError(), 'No se pudo quitar el producto de la Lista')).toBe(
      'No se pudo quitar el producto de la Lista',
    )
  })

  it('sin fallback sigue ofreciendo un aviso accionable', () => {
    expect(listaErrorMessage(networkError())).toContain('Vuelve a intentarlo')
  })
})

describe('avisos conservacionistas (copy que la UI muestra)', () => {
  it('el aviso de eliminar dice que productos, imágenes y precios se conservan', () => {
    expect(LISTA_DELETE_CONSERVATION_NOTICE).toBe(
      'Los productos, imágenes y precios se conservan; la lista desaparece.',
    )
  })

  it('el aviso de desvincular dice que no se mueve el producto a otra lista', () => {
    expect(LISTA_UNLINK_CONSERVATION_NOTICE).toContain('conserva')
    expect(LISTA_UNLINK_CONSERVATION_NOTICE).toContain('no se añade a otra lista')
  })
})
