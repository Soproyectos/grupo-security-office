import { describe, expect, it } from 'vitest'
import { toSentenceCase } from './toSentenceCase'

describe('toSentenceCase', () => {
  it('convierte un texto en mayúsculas a oración', () => {
    expect(toSentenceCase('CÁMARA DE SEGURIDAD PARA EXTERIORES. RESISTENTE AL AGUA.')).toBe(
      'Cámara de seguridad para exteriores. Resistente al agua.',
    )
  })

  it('no toca un texto que ya está bien escrito', () => {
    const text = 'Cámara de seguridad para exteriores con visión nocturna.'

    expect(toSentenceCase(text)).toBe(text)
  })

  it('no toca un texto mixto con algunas siglas', () => {
    const text = 'Grabador DVR de 8 canales con soporte HD y WIFI.'

    expect(toSentenceCase(text)).toBe(text)
  })

  it('conserva unidades y modelos con dígitos', () => {
    expect(toSentenceCase('FUENTE DE PODER 110V A 12V CON SALIDA 1080P')).toBe(
      'Fuente de poder 110V a 12V con salida 1080P',
    )
  })

  it('conserva las siglas de la lista', () => {
    expect(toSentenceCase('GRABADOR DVR CON WIFI, POE Y SOPORTE HD PARA UPS')).toBe(
      'Grabador DVR con WiFi, PoE y soporte HD para UPS',
    )
  })

  it('conserva las palabras indicadas, como la marca', () => {
    expect(toSentenceCase('CÁMARA HIKVISION PARA EXTERIORES', { keep: ['Hikvision'] })).toBe(
      'Cámara Hikvision para exteriores',
    )
  })

  it('reinicia la mayúscula tras un punto y tras un salto de línea', () => {
    expect(toSentenceCase('PRIMERA LÍNEA DEL PRODUCTO\nSEGUNDA LÍNEA. TERCERA FRASE')).toBe(
      'Primera línea del producto\nSegunda línea. Tercera frase',
    )
  })

  it('no juzga textos demasiado cortos', () => {
    expect(toSentenceCase('HD WIFI')).toBe('HD WIFI')
    expect(toSentenceCase('')).toBe('')
  })

  it('respeta los signos de apertura y cierre pegados a la palabra', () => {
    expect(toSentenceCase('INCLUYE (FUENTE Y CABLE) PARA INSTALACIÓN')).toBe('Incluye (fuente y cable) para instalación')
  })
})
