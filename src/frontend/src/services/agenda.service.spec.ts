import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

vi.mock('./api', () => ({ default: { get, post, patch, delete: del } }))

import {
  AgendaServiceError,
  addAgendaLink,
  addAgendaLinkInCache,
  agendaActivitiesKey,
  agendaErrorMessage,
  assignAgendaActivity,
  completeAgendaActivity,
  completeAgendaActivityInCache,
  createAgendaActivity,
  dedupeAgendaActivities,
  fetchAgendaActivities,
  fetchAgendaSellers,
  isAgendaConflict,
  isUuid,
  mergeAgendaActivities,
  reassignAgendaActivityInCache,
  removeAgendaLink,
  removeAgendaLinkInCache,
  type AgendaActivity,
} from './agenda.service'

// ---------------------------------------------------------------------------
// Covered scenarios:
// ✅ Los 3 endpoints del incremento (list/create/complete) con envoltorio real
//    `{ data: … }` y con el doble envoltorio si el interceptor no lo peló
// ✅ ACEPTACIÓN: crear → completar → recargar conserva cada actividad UNA sola
//    vez (dedup por id), incluso si la recarga trae la fila duplicada
// ✅ 409 «ya completada» → error tipado `conflict` con aviso legible
// ✅ 404/403 → error tipado con el mensaje del servidor (o uno claro)
// ✅ El estado local se deduplica/fusiona por id sin perder el historial
// ---------------------------------------------------------------------------

function activity(over: Partial<AgendaActivity> & { id: string }): AgendaActivity {
  return {
    title: 'Llamada de seguimiento al cliente Robles',
    kind: 'CALL',
    startsAt: '2026-10-16T14:00:00.000Z',
    status: 'PENDING',
    assigneeId: 'seller-1',
    creatorId: 'seller-1',
    assignee: { id: 'seller-1', name: 'Ana Vendedora' },
    creator: { id: 'seller-1', name: 'Ana Vendedora' },
    updatedBy: null,
    events: [
      { id: `ev-${over.id}`, activityId: over.id, actorId: 'seller-1', type: 'CREATE', at: '2026-10-15T10:00:00.000Z' },
    ],
    ...over,
  }
}

function httpError(status: number, message?: string) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: message ? { message } : {} },
  })
}

const networkError = () => Object.assign(new Error('Network Error'), { response: undefined })

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
  del.mockReset()
})

describe('fetchAgendaActivities', () => {
  it('pide la lista de actividades al endpoint correcto', async () => {
    get.mockResolvedValue({ data: [activity({ id: 'a1' })] })

    const rows = await fetchAgendaActivities()

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/team-workflow/activities')
    expect(rows.map(r => r.id)).toEqual(['a1'])
  })

  it('desenvuelve el envoltorio { data: [...] } del interceptor', async () => {
    get.mockResolvedValue({ data: { data: [activity({ id: 'a1' }), activity({ id: 'a2' })] } })

    await expect(fetchAgendaActivities()).resolves.toHaveLength(2)
  })

  it('descarta las filas duplicadas por id que traiga el servidor', async () => {
    const duplicada = activity({ id: 'a1' })
    get.mockResolvedValue({ data: [duplicada, { ...duplicada }, activity({ id: 'a2' })] })

    const rows = await fetchAgendaActivities()

    expect(rows.map(r => r.id)).toEqual(['a1', 'a2'])
  })

  it.each([
    ['objeto sin data', { status: 'ok' }],
    ['data nulo', { data: null }],
    ['data que no es arreglo', { data: { unexpected: true } }],
  ])('devuelve lista vacía si la respuesta es %s', async (_caso: string, payload: unknown) => {
    get.mockResolvedValue(payload)

    await expect(fetchAgendaActivities()).resolves.toEqual([])
  })

  it('propaga el error de red sin envolverlo para que la página ofrezca reintentar', async () => {
    const failure = networkError()
    get.mockRejectedValue(failure)

    await expect(fetchAgendaActivities()).rejects.toBe(failure)
  })
})

describe('createAgendaActivity', () => {
  const payload = {
    title: 'Visita al proyecto Los Robles',
    kind: 'VISIT',
    assigneeId: 'seller-1',
    startsAt: '2026-10-16T14:00:00.000Z',
  }

  it('envía solo title, kind, assigneeId y startsAt a POST /team-workflow/activities', async () => {
    post.mockResolvedValue({ data: activity({ id: 'a1', ...payload }) })

    const creada = await createAgendaActivity(payload)

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/team-workflow/activities', payload)
    expect(creada.id).toBe('a1')
  })

  it('desenvuelve la actividad cuando viene envuelta en { data: … }', async () => {
    post.mockResolvedValue({ data: { data: activity({ id: 'a1', ...payload }) } })

    await expect(createAgendaActivity(payload)).resolves.toMatchObject({ id: 'a1' })
  })

  it('rechaza con 403 y el mensaje del servidor cuando el asignado está fuera del equipo', async () => {
    post.mockRejectedValue(httpError(403, 'Solo puedes asignar actividades dentro de tu equipo'))

    const error = await createAgendaActivity(payload).catch(e => e)

    expect(error).toBeInstanceOf(AgendaServiceError)
    expect(error).toMatchObject({ code: 'forbidden', status: 403 })
    expect(error.message).toBe('Solo puedes asignar actividades dentro de tu equipo')
  })

  it('propaga el error de red sin envolverlo', async () => {
    const failure = networkError()
    post.mockRejectedValue(failure)

    await expect(createAgendaActivity(payload)).rejects.toBe(failure)
  })
})

describe('completeAgendaActivity', () => {
  it('completa con PATCH al recurso de la actividad', async () => {
    patch.mockResolvedValue({ data: { ok: true } })

    await completeAgendaActivity('a1')

    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch).toHaveBeenCalledWith('/team-workflow/activities/a1/complete')
  })

  it('la segunda completada (409) se vuelve un error conflict con aviso de «ya completada»', async () => {
    patch.mockRejectedValue(httpError(409, 'La actividad ya fue completada'))

    const error = await completeAgendaActivity('a1').catch(e => e)

    expect(error).toBeInstanceOf(AgendaServiceError)
    expect(error).toMatchObject({ code: 'conflict', status: 409 })
    expect(error.message).toContain('ya fue completada')
    expect(isAgendaConflict(error)).toBe(true)
  })

  it('un 409 sin mensaje del servidor igual avisa que ya fue completada', async () => {
    patch.mockRejectedValue(httpError(409))

    const error = await completeAgendaActivity('a1').catch(e => e)

    expect(error.message).toContain('ya fue completada')
  })

  it('un ID ajeno o inexistente (404) conserva el mensaje «Actividad no encontrada»', async () => {
    patch.mockRejectedValue(httpError(404, 'Actividad no encontrada'))

    const error = await completeAgendaActivity('a1').catch(e => e)

    expect(error).toMatchObject({ code: 'not-found', status: 404 })
    expect(error.message).toBe('Actividad no encontrada')
    expect(isAgendaConflict(error)).toBe(false)
  })

  it('un 401 cae en unauthorized con un mensaje de sesión expirada', async () => {
    patch.mockRejectedValue(httpError(401))

    const error = await completeAgendaActivity('a1').catch(e => e)

    expect(error).toMatchObject({ code: 'unauthorized', status: 401 })
    expect(error.message).toContain('sesión')
  })

  it('propaga el error de red sin envolverlo', async () => {
    const failure = networkError()
    patch.mockRejectedValue(failure)

    await expect(completeAgendaActivity('a1')).rejects.toBe(failure)
  })
})

describe('agendaErrorMessage', () => {
  it('devuelve el mensaje del error tipado sin tocarlo', async () => {
    patch.mockRejectedValue(httpError(409, 'La actividad ya fue completada'))

    const error = await completeAgendaActivity('a1').catch(e => e)

    expect(agendaErrorMessage(error)).toBe('La actividad ya fue completada')
  })

  it('lee el mensaje del servidor aunque el error venga sin envolver', () => {
    expect(agendaErrorMessage(httpError(403, 'Solo puedes asignar actividades dentro de tu equipo'))).toBe(
      'Solo puedes asignar actividades dentro de tu equipo',
    )
  })

  it('usa el fallback de quien llama cuando no hay estado HTTP', () => {
    expect(agendaErrorMessage(networkError(), 'No se pudo guardar la actividad.')).toBe(
      'No se pudo guardar la actividad.',
    )
  })

  it('sin fallback sigue ofreciendo un aviso accionable', () => {
    expect(agendaErrorMessage(networkError())).toContain('vuelve a intentarlo')
  })
})

describe('estado local (dedup y fusión por id)', () => {
  it('agendaActivitiesKey fija la misma clave que usa la página', () => {
    expect(agendaActivitiesKey('user-1')).toEqual(['team-workflow', 'activities', 'user-1'])
    expect(agendaActivitiesKey()).toEqual(['team-workflow', 'activities', undefined])
  })

  it('dedupeAgendaActivities conserva el orden y gana la primera aparición', () => {
    const primera = activity({ id: 'a1', title: 'Primera' })
    const segunda = { ...activity({ id: 'a1' }), title: 'Segunda' }

    const rows = dedupeAgendaActivities([primera, segunda, activity({ id: 'a2' })])

    expect(rows.map(r => r.title)).toEqual(['Primera', 'Llamada de seguimiento al cliente Robles'])
    expect(rows.map(r => r.id)).toEqual(['a1', 'a2'])
  })

  it('mergeAgendaActivities deja una fila por id: la recarga manda y nada del historial se pierde', () => {
    const estadoLocal = [activity({ id: 'a1' }), activity({ id: 'a2', title: 'Solo existía en el estado local' })]
    const recarga = [{ ...activity({ id: 'a1' }), status: 'COMPLETED' }]

    const merged = mergeAgendaActivities(estadoLocal, recarga)

    expect(merged.map(r => r.id)).toEqual(['a1', 'a2'])
    expect(merged.find(r => r.id === 'a1')?.status).toBe('COMPLETED')
    expect(merged.find(r => r.id === 'a2')?.title).toBe('Solo existía en el estado local')
  })

  it('mergeAgendaActivities tolera estado vacío o sin datos', () => {
    const nueva = activity({ id: 'a1' })

    expect(mergeAgendaActivities(undefined, [nueva, { ...nueva }])).toHaveLength(1)
    expect(mergeAgendaActivities([nueva], undefined)).toHaveLength(1)
  })
})

describe('aceptación: crear → completar → recargar sin entradas duplicadas', () => {
  it('la recarga conserva cada actividad una sola vez y con su historial', async () => {
    const servidor: AgendaActivity[] = []
    const creada = activity({ id: 'act-1', assigneeId: 'seller-1' })

    get.mockImplementation(async () => ({ data: { data: [...servidor] } }))
    post.mockImplementation(async () => {
      servidor.push(creada, { ...creada })
      return { data: { data: creada } }
    })
    patch.mockImplementation(async () => {
      // Semántica real del backend: el segundo PATCH choca con el updateMany condicional.
      const target = servidor.find(r => r.id === 'act-1')
      if (!target || target.status === 'COMPLETED') throw httpError(409, 'La actividad ya fue completada')
      target.status = 'COMPLETED'
      return { data: { data: { ok: true } } }
    })

    const nueva = await createAgendaActivity({
      title: creada.title,
      kind: creada.kind,
      assigneeId: creada.assigneeId,
      startsAt: creada.startsAt,
    })

    let estadoLocal = mergeAgendaActivities([], dedupeAgendaActivities(await fetchAgendaActivities()))
    expect(estadoLocal.map(r => r.id)).toEqual(['act-1'])

    await completeAgendaActivity(nueva.id)
    await expect(completeAgendaActivity(nueva.id)).rejects.toMatchObject({ code: 'conflict' })

    estadoLocal = mergeAgendaActivities(estadoLocal, dedupeAgendaActivities(await fetchAgendaActivities()))

    expect(estadoLocal.map(r => r.id)).toEqual(['act-1'])
    expect(estadoLocal[0]?.status).toBe('COMPLETED')
    expect(estadoLocal[0]?.events).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// BASE-03 frontend-equipo: «Botones y API concuerdan»
// ---------------------------------------------------------------------------

describe('fetchAgendaSellers (directorio del equipo)', () => {
  it('pide el directorio al endpoint de vendedores', async () => {
    get.mockResolvedValue({ data: [{ id: 'seller-1', name: 'Ana Vendedora' }] })

    const rows = await fetchAgendaSellers()

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/team-workflow/sellers')
    expect(rows.map(p => p.id)).toEqual(['seller-1'])
  })

  it('tolera el envoltorio { data: [...] } del interceptor', async () => {
    get.mockResolvedValue({ data: { data: [{ id: 'seller-1', name: 'Ana Vendedora' }] } })

    await expect(fetchAgendaSellers()).resolves.toHaveLength(1)
  })

  it('devuelve lista vacía si la respuesta no trae personas', async () => {
    get.mockResolvedValue({ data: { unexpected: true } })

    await expect(fetchAgendaSellers()).resolves.toEqual([])
  })

  it('convierte el fallo HTTP en error tipado para que la página ofrezca reintentar', async () => {
    get.mockRejectedValue(httpError(403, 'No autorizado'))

    const error = await fetchAgendaSellers().catch(e => e)

    expect(error).toBeInstanceOf(AgendaServiceError)
    expect(error).toMatchObject({ code: 'forbidden', status: 403 })
  })
})

describe('assignAgendaActivity (botón Reasignar)', () => {
  it('reasigna con PATCH al recurso /assign y envía el nuevo asignado', async () => {
    patch.mockResolvedValue({ data: { ok: true } })

    await assignAgendaActivity('a1', 'seller-9')

    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch).toHaveBeenCalledWith('/team-workflow/activities/a1/assign', { assigneeId: 'seller-9' })
  })

  it('403 (destino fuera del equipo) → error tipado con el mensaje del servidor', async () => {
    patch.mockRejectedValue(httpError(403, 'Solo puedes asignar actividades dentro de tu equipo'))

    const error = await assignAgendaActivity('a1', 'seller-9').catch(e => e)

    expect(error).toBeInstanceOf(AgendaServiceError)
    expect(error).toMatchObject({ code: 'forbidden', status: 403 })
    expect(agendaErrorMessage(error)).toBe('Solo puedes asignar actividades dentro de tu equipo')
  })

  it('404 (actividad ajena o inexistente) → error tipado not-found', async () => {
    patch.mockRejectedValue(httpError(404, 'Actividad no encontrada'))

    const error = await assignAgendaActivity('a1', 'seller-9').catch(e => e)

    expect(error).toMatchObject({ code: 'not-found', status: 404 })
    expect(error.message).toBe('Actividad no encontrada')
    expect(isAgendaConflict(error)).toBe(false)
  })

  it('propaga el error de red sin envolverlo', async () => {
    const failure = networkError()
    patch.mockRejectedValue(failure)

    await expect(assignAgendaActivity('a1', 'seller-9')).rejects.toBe(failure)
  })
})

describe('reassignAgendaActivityInCache (el botón Reasignar contra la caché compartida)', () => {
  const key = agendaActivitiesKey('user-1')

  function seededCache() {
    const client = new QueryClient()
    const duplicada = activity({ id: 'a1' })
    client.setQueryData<AgendaActivity[]>(key, [
      duplicada,
      { ...duplicada },
      activity({ id: 'a2', title: 'Llamada a otro cliente' }),
    ])
    return client
  }

  it('éxito: cambia el asignado de la fila sin duplicar ni tocar el resto', async () => {
    const client = seededCache()
    patch.mockResolvedValue({ data: { ok: true } })

    await reassignAgendaActivityInCache(client, key, 'a1', { id: 'seller-9', name: 'Nueve Vendedor' })

    expect(patch).toHaveBeenCalledWith('/team-workflow/activities/a1/assign', { assigneeId: 'seller-9' })
    const rows = client.getQueryData<AgendaActivity[]>(key)
    expect(rows?.map(r => r.id)).toEqual(['a1', 'a2'])
    expect(rows?.[0]).toMatchObject({
      assigneeId: 'seller-9',
      assignee: { id: 'seller-9', name: 'Nueve Vendedor' },
      status: 'PENDING',
    })
    expect(rows?.[1]?.title).toBe('Llamada a otro cliente')
  })

  it('403: mensaje claro del servidor y la caché queda intacta (sin cambio optimista)', async () => {
    const client = seededCache()
    const antes = client.getQueryData(key)
    patch.mockRejectedValue(httpError(403, 'Solo puedes asignar actividades dentro de tu equipo'))

    const error = await reassignAgendaActivityInCache(client, key, 'a1', {
      id: 'seller-9',
      name: 'Nueve Vendedor',
    }).catch(e => e)

    expect(agendaErrorMessage(error)).toBe('Solo puedes asignar actividades dentro de tu equipo')
    expect(client.getQueryData(key)).toEqual(antes)
    expect((client.getQueryData<AgendaActivity[]>(key) ?? [])[0]?.assigneeId).toBe('seller-1')
  })

  it('404: mensaje claro y la caché queda intacta', async () => {
    const client = seededCache()
    const antes = client.getQueryData(key)
    patch.mockRejectedValue(httpError(404, 'Actividad no encontrada'))

    const error = await reassignAgendaActivityInCache(client, key, 'a1', {
      id: 'seller-9',
      name: 'Nueve Vendedor',
    }).catch(e => e)

    expect(error).toMatchObject({ code: 'not-found', status: 404 })
    expect(client.getQueryData(key)).toEqual(antes)
  })
})

describe('completeAgendaActivityInCache (el botón Completar contra la caché compartida)', () => {
  const key = agendaActivitiesKey('user-1')

  function seededCache() {
    const client = new QueryClient()
    const duplicada = activity({ id: 'a1' })
    client.setQueryData<AgendaActivity[]>(key, [duplicada, { ...duplicada }, activity({ id: 'a2' })])
    return client
  }

  it('éxito: la fila queda COMPLETED y sigue habiendo una sola por id', async () => {
    const client = seededCache()
    patch.mockResolvedValue({ data: { ok: true } })

    await completeAgendaActivityInCache(client, key, 'a1')

    const rows = client.getQueryData<AgendaActivity[]>(key)
    expect(rows?.map(r => r.id)).toEqual(['a1', 'a2'])
    expect(rows?.[0]?.status).toBe('COMPLETED')
    expect(rows?.[1]?.status).toBe('PENDING')
  })

  it('409 (ya completada): la caché no cambia — ni filas nuevas ni estado incorrecto', async () => {
    const client = seededCache()
    const antes = client.getQueryData(key)
    patch.mockRejectedValue(httpError(409, 'La actividad ya fue completada'))

    const error = await completeAgendaActivityInCache(client, key, 'a1').catch(e => e)

    expect(isAgendaConflict(error)).toBe(true)
    expect(agendaErrorMessage(error)).toBe('La actividad ya fue completada')
    expect(client.getQueryData(key)).toEqual(antes)
    const rows = client.getQueryData<AgendaActivity[]>(key) ?? []
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.status === 'PENDING')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BASE-03 frontend-vinculos: «Un enlace no revela recurso ajeno ni concede
// permisos» (contrato §5/§6.3, DISENO-CATALOGO:91)
// ---------------------------------------------------------------------------

const UUID = '11111111-1111-4111-8111-111111111111'
const payload = { targetType: 'PRODUCT', targetId: UUID } as const
const creadoConservador = {
  id: 'l9',
  activityId: 'a1',
  targetType: 'PRODUCT',
  targetId: UUID,
  revealed: false,
}

describe('isUuid (validación cliente del campo de enlace)', () => {
  it('acepta el formato UUID que exige el backend (@IsUUID)', () => {
    expect(isUuid(UUID)).toBe(true)
    expect(isUuid(' 11111111-1111-4111-8111-111111111111 ')).toBe(true)
    expect(isUuid('892957e3-8948-441e-bb65-960262341cfc')).toBe(true)
  })

  it('rechaza cualquier cosa que no sea un UUID', () => {
    expect(isUuid('')).toBe(false)
    expect(isUuid('producto-1')).toBe(false)
    expect(isUuid('11111111-1111-4111-8111')).toBe(false)
    expect(isUuid('11111111111141118111111111111111')).toBe(false)
  })
})

describe('addAgendaLink (POST /activities/:id/links)', () => {
  it('envía SOLO targetType y targetId: el cliente no envía nada que conceda permisos', async () => {
    post.mockResolvedValue({ data: { data: creadoConservador } })

    const link = await addAgendaLink('a1', payload)

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/team-workflow/activities/a1/links', payload)
    // Ni permiso, ni concesión, ni rol, ni revealed: exactamente los 2 campos del DTO.
    expect(Object.keys(post.mock.calls[0]![1] as object)).toEqual(['targetType', 'targetId'])
    expect(link).toMatchObject({ id: 'l9', targetType: 'PRODUCT', targetId: UUID, revealed: false })
  })

  it('la respuesta de alta es conservadora: revealed:false y sin label ni target', async () => {
    post.mockResolvedValue({ data: { data: creadoConservador } })

    const link = await addAgendaLink('a1', payload)

    expect(link.revealed).toBe(false)
    expect(link).not.toHaveProperty('label')
    expect(link).not.toHaveProperty('target')
  })

  it('targetId sin forma de UUID: error invalid 400 sin llegar a llamar a la API', async () => {
    const error = await addAgendaLink('a1', { targetType: 'PRODUCT', targetId: 'no-es-uuid' }).catch(e => e)

    expect(post).not.toHaveBeenCalled()
    expect(error).toBeInstanceOf(AgendaServiceError)
    expect(error).toMatchObject({ code: 'invalid', status: 400 })
    expect(error.message).toContain('UUID')
  })

  it('400 del servidor → mensaje claro de validación, sin romper el error tipado', async () => {
    post.mockRejectedValue(httpError(400))

    const error = await addAgendaLink('a1', payload).catch(e => e)

    expect(error).toBeInstanceOf(AgendaServiceError)
    expect(error).toMatchObject({ code: 'invalid', status: 400 })
    expect(error.message).toContain('UUID')
  })

  it('404 (actividad ajena o inexistente) → not-found con mensaje claro', async () => {
    post.mockRejectedValue(httpError(404, 'Actividad no encontrada'))

    const error = await addAgendaLink('a1', payload).catch(e => e)

    expect(error).toMatchObject({ code: 'not-found', status: 404 })
    expect(error.message).toBe('Actividad no encontrada')
  })

  it('409 (ya enlazado) → conflict con el mensaje «ya está enlazado»', async () => {
    post.mockRejectedValue(httpError(409, 'Ese recurso ya está enlazado a esta actividad'))

    const error = await addAgendaLink('a1', payload).catch(e => e)

    expect(error).toBeInstanceOf(AgendaServiceError)
    expect(error).toMatchObject({ code: 'conflict', status: 409 })
    expect(error.message).toContain('ya está enlazado')
    expect(isAgendaConflict(error)).toBe(true)
  })

  it('409 sin mensaje del servidor sigue avisando del duplicado, no de «ya completada»', async () => {
    post.mockRejectedValue(httpError(409))

    const error = await addAgendaLink('a1', payload).catch(e => e)

    expect(error.message).toContain('ya está enlazado')
    expect(error.message).not.toContain('completada')
  })

  it('403 (sin permiso en la actividad) → forbidden con mensaje claro', async () => {
    post.mockRejectedValue(httpError(403, 'No tienes permiso'))

    const error = await addAgendaLink('a1', payload).catch(e => e)

    expect(error).toMatchObject({ code: 'forbidden', status: 403 })
    expect(agendaErrorMessage(error)).toBe('No tienes permiso')
  })

  it('propaga el error de red sin envolverlo', async () => {
    const failure = networkError()
    post.mockRejectedValue(failure)

    await expect(addAgendaLink('a1', payload)).rejects.toBe(failure)
  })
})

describe('removeAgendaLink (DELETE /activities/:id/links/:linkId)', () => {
  it('quita el vínculo con DELETE al recurso anidado', async () => {
    del.mockResolvedValue({ data: { data: { ok: true } } })

    await removeAgendaLink('a1', 'l9')

    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith('/team-workflow/activities/a1/links/l9')
  })

  it('404 (enlace ya quitado o actividad ajena) → not-found con mensaje claro', async () => {
    del.mockRejectedValue(httpError(404, 'Enlace no encontrado'))

    const error = await removeAgendaLink('a1', 'l9').catch(e => e)

    expect(error).toBeInstanceOf(AgendaServiceError)
    expect(error).toMatchObject({ code: 'not-found', status: 404 })
    expect(error.message).toBe('Enlace no encontrado')
  })

  it('propaga el error de red sin envolverlo', async () => {
    const failure = networkError()
    del.mockRejectedValue(failure)

    await expect(removeAgendaLink('a1', 'l9')).rejects.toBe(failure)
  })
})

describe('addAgendaLinkInCache (alta de enlaces contra la caché compartida)', () => {
  const key = agendaActivitiesKey('user-1')

  function seededCache() {
    const client = new QueryClient()
    const duplicada = activity({ id: 'a1' })
    client.setQueryData<AgendaActivity[]>(key, [duplicada, { ...duplicada }])
    return client
  }

  it('tras el POST solo invalida: la respuesta conservadora NO se pinta como estado final', async () => {
    const client = seededCache()
    const antes = client.getQueryData(key)
    post.mockResolvedValue({ data: { data: creadoConservador } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await addAgendaLinkInCache(client, key, 'a1', payload)

    expect(post).toHaveBeenCalledWith('/team-workflow/activities/a1/links', payload)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key })
    // El POST devuelve revealed:false por DISEÑO (crear un enlace no revela):
    // en caché no aparece ningún vínculo nuevo hasta que el refetch mande.
    expect(client.getQueryData(key)).toEqual(antes)
    expect((client.getQueryData<AgendaActivity[]>(key) ?? []).every(row => !row.links)).toBe(true)
  })

  it('el refetch pinta el estado real (revealed:true) dejando UNA fila y UN vínculo', async () => {
    const client = seededCache()
    post.mockResolvedValue({ data: { data: creadoConservador } })
    await addAgendaLinkInCache(client, key, 'a1', payload)

    get.mockResolvedValue({
      data: {
        data: [
          activity({
            id: 'a1',
            links: [
              {
                id: 'l9',
                targetType: 'PRODUCT',
                targetId: UUID,
                revealed: true,
                label: 'Producto Fixture Vinculos',
                target: { id: UUID, name: 'Producto Fixture Vinculos', sku: 'T06C-SKU-1', publishStatus: 'borrador' },
              },
            ],
          }),
        ],
      },
    })
    await client.fetchQuery({ queryKey: key, queryFn: fetchAgendaActivities })

    const rows = client.getQueryData<AgendaActivity[]>(key) ?? []
    expect(rows).toHaveLength(1)
    expect(rows[0]?.links).toHaveLength(1)
    expect(rows[0]?.links?.[0]).toMatchObject({
      revealed: true,
      label: 'Producto Fixture Vinculos',
      target: { sku: 'T06C-SKU-1' },
    })
  })

  it('409 (ya enlazado): mensaje claro y la caché queda intacta', async () => {
    const client = seededCache()
    const antes = client.getQueryData(key)
    post.mockRejectedValue(httpError(409, 'Ese recurso ya está enlazado a esta actividad'))

    const error = await addAgendaLinkInCache(client, key, 'a1', payload).catch(e => e)

    expect(error).toMatchObject({ code: 'conflict' })
    expect(agendaErrorMessage(error)).toContain('ya está enlazado')
    expect(client.getQueryData(key)).toEqual(antes)
  })

  it('404 (actividad fuera de tu conjunto): mensaje claro y la caché queda intacta', async () => {
    const client = seededCache()
    const antes = client.getQueryData(key)
    post.mockRejectedValue(httpError(404, 'Actividad no encontrada'))

    const error = await addAgendaLinkInCache(client, key, 'a1', payload).catch(e => e)

    expect(error).toMatchObject({ code: 'not-found' })
    expect(agendaErrorMessage(error)).toBe('Actividad no encontrada')
    expect(client.getQueryData(key)).toEqual(antes)
  })
})

describe('removeAgendaLinkInCache (baja de enlaces contra la caché compartida)', () => {
  const key = agendaActivitiesKey('user-1')

  function seededCache() {
    const client = new QueryClient()
    client.setQueryData<AgendaActivity[]>(key, [
      activity({
        id: 'a1',
        links: [
          { id: 'l9', targetType: 'PRODUCT', targetId: UUID, revealed: true, label: 'Producto Fixture Vinculos' },
        ],
      }),
      activity({ id: 'a1', title: 'Fila duplicada por panel' }),
    ])
    return client
  }

  it('DELETE confirmado → invalida y el refetch deja la fila sin el vínculo (una sola fila)', async () => {
    const client = seededCache()
    del.mockResolvedValue({ data: { data: { ok: true } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await removeAgendaLinkInCache(client, key, 'a1', 'l9')

    expect(del).toHaveBeenCalledWith('/team-workflow/activities/a1/links/l9')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key })

    get.mockResolvedValue({ data: { data: [activity({ id: 'a1', links: [] })] } })
    await client.fetchQuery({ queryKey: key, queryFn: fetchAgendaActivities })

    const rows = client.getQueryData<AgendaActivity[]>(key) ?? []
    expect(rows).toHaveLength(1)
    expect(rows[0]?.links).toEqual([])
  })

  it('404 (enlace ya quitado): mensaje claro y la caché queda intacta', async () => {
    const client = seededCache()
    const antes = client.getQueryData(key)
    del.mockRejectedValue(httpError(404, 'Enlace no encontrado'))

    const error = await removeAgendaLinkInCache(client, key, 'a1', 'l9').catch(e => e)

    expect(error).toMatchObject({ code: 'not-found' })
    expect(agendaErrorMessage(error)).toBe('Enlace no encontrado')
    expect(client.getQueryData(key)).toEqual(antes)
  })
})
