import { describe, expect, it, vi } from 'vitest'
import {
  MAX_PHOTO_BYTES,
  checkPhotoFiles,
  photoRejection,
  runUploadQueue,
  uploadPhotoWithType,
  type UploadQueueEvent,
} from './product-photos-queue'

const photo = (name: string, type = 'image/jpeg', size = 1024) =>
  ({ name, type, size }) as unknown as File

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('photoRejection', () => {
  it('acepta imágenes de hasta 8 MB', () => {
    expect(photoRejection(photo('a.png', 'image/png', MAX_PHOTO_BYTES))).toBeNull()
  })

  it('rechaza archivos que no son imágenes, incluido un tipo vacío', () => {
    expect(photoRejection(photo('ficha.pdf', 'application/pdf'))).toBe('not-image')
    expect(photoRejection(photo('sin-tipo', ''))).toBe('not-image')
  })

  it('rechaza imágenes de más de 8 MB', () => {
    expect(photoRejection(photo('grande.jpg', 'image/jpeg', MAX_PHOTO_BYTES + 1))).toBe('too-large')
  })
})

describe('checkPhotoFiles', () => {
  it('conserva el orden de selección y marca solo los archivos descartados', () => {
    const verdicts = checkPhotoFiles([photo('a.jpg'), photo('b.pdf', 'application/pdf'), photo('c.webp', 'image/webp')])
    expect(verdicts.map((v) => [v.file.name, v.rejection])).toEqual([
      ['a.jpg', null],
      ['b.pdf', 'not-image'],
      ['c.webp', null],
    ])
  })
})

describe('runUploadQueue', () => {
  it('sube de una en una, en orden, sin paralelismo', async () => {
    const calls: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const uploadOne = vi.fn(async (file: File) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      calls.push(`start:${file.name}`)
      await settle()
      calls.push(`end:${file.name}`)
      inFlight -= 1
      return file.name
    })

    await runUploadQueue([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')], uploadOne, () => {})

    expect(maxInFlight).toBe(1)
    expect(calls).toEqual(['start:a.jpg', 'end:a.jpg', 'start:b.jpg', 'end:b.jpg', 'start:c.jpg', 'end:c.jpg'])
  })

  it('sigue con los siguientes archivos tras un fallo y devuelve el resultado de cada uno', async () => {
    const error = new Error('servidor')
    const uploadOne = vi.fn(async (file: File) => {
      if (file.name === 'b.jpg') throw error
      return `id-${file.name}`
    })

    const results = await runUploadQueue([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')], uploadOne, () => {})

    expect(uploadOne).toHaveBeenCalledTimes(3)
    expect(results.map((r) => (r.ok ? [r.file.name, r.value] : [r.file.name, r.error]))).toEqual([
      ['a.jpg', 'id-a.jpg'],
      ['b.jpg', error],
      ['c.jpg', 'id-c.jpg'],
    ])
  })

  it('emite inicio y fin de cada archivo con su posición', async () => {
    const events: UploadQueueEvent<string>[] = []
    await runUploadQueue(
      [photo('a.jpg'), photo('b.jpg')],
      async (file) => {
        if (file.name === 'b.jpg') throw new Error('fallo')
        return 'ok'
      },
      (event) => events.push(event),
    )

    expect(events.map((e) => [e.type, e.index])).toEqual([
      ['start', 0],
      ['success', 0],
      ['start', 1],
      ['failure', 1],
    ])
  })

  it('con cola vacía no llama a la subida', async () => {
    const uploadOne = vi.fn()
    await expect(runUploadQueue([], uploadOne, () => {})).resolves.toEqual([])
    expect(uploadOne).not.toHaveBeenCalled()
  })
})

describe('uploadPhotoWithType', () => {
  it('si el servidor ya devuelve el tipo elegido, no pide cambio de tipo', async () => {
    const steps = {
      upload: vi.fn().mockResolvedValue({ id: 'img-1', type: 'PRINCIPAL' }),
      assignType: vi.fn(),
    }

    await expect(uploadPhotoWithType(photo('a.jpg'), { type: 'PRINCIPAL', asPrimary: false }, steps))
      .resolves.toEqual({ imageId: 'img-1', typeAssigned: true })
    expect(steps.assignType).not.toHaveBeenCalled()
  })

  it('cambia el tipo con el id de la imagen creada, después de subirla', async () => {
    const calls: string[] = []
    const steps = {
      upload: vi.fn(async () => {
        calls.push('upload')
        return { id: 'img-2', type: 'PRINCIPAL' }
      }),
      assignType: vi.fn(async () => {
        calls.push('assign')
        return { id: 'img-2', type: 'COMPLEMENTARIA' }
      }),
    }

    await expect(uploadPhotoWithType(photo('a.jpg'), { type: 'COMPLEMENTARIA', asPrimary: false }, steps))
      .resolves.toEqual({ imageId: 'img-2', typeAssigned: true })
    expect(steps.assignType).toHaveBeenCalledWith('img-2', 'COMPLEMENTARIA')
    expect(calls).toEqual(['upload', 'assign'])
  })

  it('si el cambio de tipo falla, la foto cuenta como subida con el tipo pendiente', async () => {
    const steps = {
      upload: vi.fn().mockResolvedValue({ id: 'img-3', type: 'PRINCIPAL' }),
      assignType: vi.fn().mockRejectedValue(new Error('no confirmado')),
    }

    await expect(uploadPhotoWithType(photo('a.jpg'), { type: 'EXTRA', asPrimary: false }, steps))
      .resolves.toEqual({ imageId: 'img-3', typeAssigned: false })
  })

  it('si la subida falla, no cambia el tipo y el error llega al llamador', async () => {
    const error = new Error('413')
    const steps = {
      upload: vi.fn().mockRejectedValue(error),
      assignType: vi.fn(),
    }

    await expect(uploadPhotoWithType(photo('a.jpg'), { type: 'LOGO', asPrimary: false }, steps)).rejects.toBe(error)
    expect(steps.assignType).not.toHaveBeenCalled()
  })

  it('pasa la marca de principal tal cual a la subida', async () => {
    const steps = {
      upload: vi.fn().mockResolvedValue({ id: 'img-4', type: 'PRINCIPAL' }),
      assignType: vi.fn(),
    }

    await uploadPhotoWithType(photo('a.jpg'), { type: 'PRINCIPAL', asPrimary: true }, steps)
    expect(steps.upload).toHaveBeenCalledWith(expect.anything(), true)
  })

  it('dentro de la cola, un tipo pendiente no cuenta como fallo de la foto', async () => {
    const steps = {
      upload: vi.fn().mockResolvedValue({ id: 'img-5', type: 'PRINCIPAL' }),
      assignType: vi.fn().mockRejectedValue(new Error('no confirmado')),
    }

    const results = await runUploadQueue(
      [photo('a.jpg')],
      (file) => uploadPhotoWithType(file, { type: 'EXTRA', asPrimary: false }, steps),
      () => {},
    )

    expect(results).toEqual([
      { file: expect.anything(), ok: true, value: { imageId: 'img-5', typeAssigned: false } },
    ])
  })
})
