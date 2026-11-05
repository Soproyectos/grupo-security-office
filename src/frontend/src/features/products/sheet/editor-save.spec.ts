import { describe, expect, it, vi } from 'vitest'
import { saveEditorParts } from './editor-save'

describe('saveEditorParts', () => {
  it('guarda primero los datos generales y luego la ficha', async () => {
    const calls: string[] = []
    const ok = await saveEditorParts({
      datosDirty: true,
      sheetDirty: true,
      saveDatos: async () => { calls.push('datos'); return true },
      saveSheet: async () => { calls.push('ficha'); return true },
    })
    expect(ok).toBe(true)
    expect(calls).toEqual(['datos', 'ficha'])
  })

  it('si fallan los datos se detiene y no toca la ficha', async () => {
    const saveSheet = vi.fn(async () => true)
    const ok = await saveEditorParts({ datosDirty: true, sheetDirty: true, saveDatos: async () => false, saveSheet })
    expect(ok).toBe(false)
    expect(saveSheet).not.toHaveBeenCalled()
  })

  it('si fallan los datos no sincroniza el nombre ni guarda la ficha aunque el nombre cambiara', async () => {
    const saveSheet = vi.fn(async () => true)
    const ok = await saveEditorParts({
      datosDirty: true,
      sheetDirty: false,
      syncName: 'Cámara nueva',
      saveDatos: async () => false,
      saveSheet,
    })
    expect(ok).toBe(false)
    expect(saveSheet).not.toHaveBeenCalled()
  })

  it('si solo cambió la ficha no guarda los datos', async () => {
    const saveDatos = vi.fn(async () => true)
    const ok = await saveEditorParts({ datosDirty: false, sheetDirty: true, saveDatos, saveSheet: async () => true })
    expect(ok).toBe(true)
    expect(saveDatos).not.toHaveBeenCalled()
  })

  it('si solo cambiaron los datos no llama a la ficha', async () => {
    const saveSheet = vi.fn(async () => true)
    const ok = await saveEditorParts({ datosDirty: true, sheetDirty: false, saveDatos: async () => true, saveSheet })
    expect(ok).toBe(true)
    expect(saveSheet).not.toHaveBeenCalled()
  })

  it('si los datos se guardan pero la ficha falla, responde false', async () => {
    const ok = await saveEditorParts({ datosDirty: true, sheetDirty: true, saveDatos: async () => true, saveSheet: async () => false })
    expect(ok).toBe(false)
  })

  it('sincroniza el nombre de la ficha solo cuando el nombre del producto cambió', async () => {
    const saveSheet = vi.fn(async () => true)
    await saveEditorParts({ datosDirty: true, sheetDirty: false, syncName: 'Cámara nueva', saveDatos: async () => true, saveSheet })
    expect(saveSheet).toHaveBeenCalledWith({ syncName: 'Cámara nueva', force: true })

    const untouched = vi.fn(async () => true)
    const ok = await saveEditorParts({ datosDirty: false, sheetDirty: false, saveDatos: async () => true, saveSheet: untouched })
    expect(ok).toBe(true)
    expect(untouched).not.toHaveBeenCalled()
  })

  it('fuerza el guardado de la ficha cuando solo cambió el nombre, aunque la ficha no estuviera sucia', async () => {
    const saveSheet = vi.fn(async () => true)
    const ok = await saveEditorParts({ datosDirty: true, sheetDirty: false, syncName: 'DVR 8 canales', saveDatos: async () => true, saveSheet })
    expect(ok).toBe(true)
    expect(saveSheet).toHaveBeenCalledTimes(1)
    expect(saveSheet).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
  })

  it('guarda una ficha sucia sin forzar y sin cambiar el nombre', async () => {
    const saveSheet = vi.fn(async () => true)
    await saveEditorParts({ datosDirty: false, sheetDirty: true, saveDatos: async () => true, saveSheet })
    expect(saveSheet).toHaveBeenCalledWith({ syncName: undefined, force: false })
  })
})
