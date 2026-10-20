import { describe, expect, it } from 'vitest'
import { extractSpecHighlights } from './extractSpecHighlights'

describe('extractSpecHighlights', () => {
  it('lee resolución, alcance infrarrojo y lente de una cámara', () => {
    expect(extractSpecHighlights('Camara Bala 8MP EXIR IR30m 2.8mm Plástica', 'DS-2CE16U1T-ITPF(2.8mm)')).toEqual([
      '8 MP',
      'IR 30 m',
      '2.8 mm',
    ])
  })

  it('reconoce megapíxeles escritos en palabras', () => {
    expect(extractSpecHighlights('Cámara Domo (8 Megapixeles)', 'X-1')).toEqual(['8 MP'])
  })

  it('reconoce 4K, 2K y 1080P como resolución', () => {
    expect(extractSpecHighlights('Camara Domo 4K Varifocal', 'X')[0]).toBe('4K')
    expect(extractSpecHighlights('Camara Bala 2K', 'X')[0]).toBe('2K')
    expect(extractSpecHighlights('Camara Turret 1080P Micrófono', 'X')[0]).toBe('1080P')
  })

  it('muestra una sola resolución aunque el nombre traiga varias', () => {
    expect(extractSpecHighlights('Camara 8MP 4K 1080P', 'X')).toEqual(['8 MP'])
  })

  it('toma el lente del SKU cuando el nombre no lo trae', () => {
    expect(extractSpecHighlights('Camara Turret Interior', 'DS-2CE56(2.8mm)(C)')).toEqual(['2.8 mm'])
  })

  it('conserva el rango de un lente varifocal', () => {
    expect(extractSpecHighlights('Camara Bala Varifocal', 'DS-2CE19H8T-AIT3ZF(2.7-13.5mm)')).toEqual(['2.7-13.5 mm'])
  })

  it('lee canales y megapíxeles de un DVR', () => {
    expect(extractSpecHighlights('DVR 8mp/8 Canales, AcuSense Rec', 'iDS-7208HUHI-M2/FA')).toEqual(['8 MP', '8 CH'])
    expect(extractSpecHighlights('DVR AcuSense 32CH 4K Lite 2U', 'iDS-9032')).toEqual(['4K', '32 CH'])
  })

  it('limita el resultado a tres tokens', () => {
    const tokens = extractSpecHighlights('DVR 8CH Turbo 8MP 10TB 2.8mm IR40m', 'X')

    expect(tokens).toHaveLength(3)
    expect(tokens).toEqual(['8 MP', '8 CH', 'IR 40 m'])
  })

  it('lee la potencia de una UPS en kVA y VA', () => {
    expect(extractSpecHighlights('UPS On Line 3KVA Powest 3KVA', 'NUOLT-7283')).toEqual(['3 kVA'])
    expect(extractSpecHighlights('Regulador de Voltaje Powest 2200 VA', 'NRP2200')).toEqual(['2200 VA'])
    expect(extractSpecHighlights('UPS Interactiva 3000VA MICRONET', 'M3000')).toEqual(['3000 VA'])
  })

  it('lee kW y HP de un variador, incluido 1/2 HP', () => {
    expect(extractSpecHighlights('Powest VFD 1.5 KW (2 HP - 220/240 VAC 3 Phases', 'VFD-7730')).toEqual([
      '1.5 kW',
      '2 HP',
    ])
    expect(extractSpecHighlights('Motor 1/2 HP monofásico', 'M')).toEqual(['1/2 HP'])
  })

  it('lee voltaje y capacidad de una batería', () => {
    expect(extractSpecHighlights('Bateria Sellada 12V-35AH FL12350GS', 'CEBAT-7214')).toEqual(['12 V', '35 Ah'])
    expect(extractSpecHighlights('Bateria Gel Ciclo Profundo -12v 100Ah FLS121000 DC', 'CEBAT-7626')).toEqual([
      '12 V',
      '100 Ah',
    ])
  })

  it('no confunde VAC con voltaje', () => {
    expect(extractSpecHighlights('Variador 220/240 VAC', 'X')).toEqual([])
  })

  it('lee la capacidad de discos y memorias', () => {
    expect(extractSpecHighlights('Disco Duro WD Purple 4TB Videovigilancia', 'WD43PURZ')).toEqual(['4 TB'])
    expect(extractSpecHighlights('MicroSD WD Purple SC 128GB', 'WDD128')).toEqual(['128 GB'])
  })

  it('lee la potencia en vatios de un panel solar', () => {
    expect(extractSpecHighlights('Panel Solar Mono PERC 360W Powest', 'NERM360')).toEqual(['360 W'])
  })

  it('devuelve una lista vacía cuando no hay datos reconocibles', () => {
    expect(extractSpecHighlights('Sistema Anticaída Puertas Levadizas', 'AUACCRAB03')).toEqual([])
    expect(extractSpecHighlights('', '')).toEqual([])
  })

  it('no inventa datos a partir de códigos que solo parecen unidades', () => {
    expect(extractSpecHighlights('Kit Barrera MASTODON624', 'AUACKMTD624ART')).toEqual([])
  })
})
