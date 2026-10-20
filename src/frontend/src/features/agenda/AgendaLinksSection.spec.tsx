import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AgendaLinksSection from './AgendaLinksSection'
import { isUuid, type AgendaActivityLink } from '../../services/agenda.service'

/**
 * ACEPTACIÓN BASE-03 frontend-vinculos: «Un enlace no revela recurso ajeno ni
 * concede permisos» (contrato §5/§6.3; DISENO-CATALOGO:91 «si se retira
 * acceso… se ocultan los detalles internos… se bloquea el enlace»).
 *
 * El repo no tiene entorno DOM: la sección se afirma en render de servidor
 * (mismo patrón que AgendaActivityDetail.spec). El recorrido HTTP de
 * alta/baja (POST/DELETE, 400/404/409, invalidate + refetch) vive en
 * agenda.service.spec.ts.
 */

const UUID = '11111111-1111-4111-8111-111111111111'
const OTRO_UUID = '22222222-2222-4222-8222-222222222222'

/** Recurso con cobertura RETIRADA: el servidor ya no manda label ni target. */
const oculto: AgendaActivityLink = {
  id: 'l1',
  targetType: 'PRODUCT',
  targetId: UUID,
  revealed: false,
}

/** Recurso con cobertura vigente para este usuario (respuesta de admin). */
const revelado: AgendaActivityLink = {
  id: 'l2',
  targetType: 'PRODUCT',
  targetId: OTRO_UUID,
  revealed: true,
  label: 'Producto Fixture Vinculos',
  target: {
    id: OTRO_UUID,
    name: 'Producto Fixture Vinculos',
    sku: 'T06C-SKU-1',
    publishStatus: 'borrador',
  },
}

const lista: AgendaActivityLink = {
  id: 'l3',
  targetType: 'LISTA',
  targetId: '33333333-3333-4333-8333-333333333333',
  revealed: true,
  label: 'Lista Temporada',
  target: { id: '33333333-3333-4333-8333-333333333333', name: 'Lista Temporada', code: 'TMP-26', isActive: true },
}

type SectionProps = Parameters<typeof AgendaLinksSection>[0]

const renderSection = (props: Partial<SectionProps> = {}) =>
  renderToStaticMarkup(
    <AgendaLinksSection
      links={props.links ?? []}
      canManage={props.canManage ?? false}
      busy={props.busy ?? false}
      error={props.error}
      onAdd={props.onAdd ?? (() => undefined)}
      onRemove={props.onRemove ?? (() => undefined)}
    />,
  )

/** El fragmento de un vínculo concreto, para mirar solo lo que le toca. */
function linkFragment(html: string, targetId: string): string {
  const start = html.indexOf(targetId)
  const open = html.lastIndexOf('<li', start)
  const close = html.indexOf('</li>', start)
  return html.slice(open, close + 5)
}

describe('vínculo revealed:false — solo trazabilidad, sin revelar el recurso', () => {
  it('pinta únicamente tipo y id del recurso', () => {
    const html = renderSection({ links: [oculto] })
    const fragmento = linkFragment(html, UUID)

    expect(fragmento).toContain('PRODUCT')
    expect(fragmento).toContain(UUID)
    expect(fragmento).not.toContain('Producto Fixture')
    expect(fragmento).not.toContain('T06C-SKU-1')
    expect(fragmento).not.toContain('borrador')
    expect(fragmento).not.toContain('label')
  })

  it('no hay navegación ni nada clickeable hacia el recurso', () => {
    const html = renderSection({ links: [oculto] })

    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href=')
    expect(linkFragment(html, UUID)).not.toContain('<a')
    expect(linkFragment(html, UUID)).toContain('aria-disabled="true"')
  })

  it('hace visible que el enlace está bloqueado y por qué (trazabilidad)', () => {
    const html = renderSection({ links: [oculto] })

    expect(html).toContain('Sin acceso vigente')
    expect(html).toContain('Trazabilidad')
  })

  it('un vínculo oculto entre dos revelados no arrastra sus detalles', () => {
    const html = renderSection({ links: [revelado, oculto] })

    const ocultoHtml = linkFragment(html, UUID)
    expect(ocultoHtml).not.toContain('Producto Fixture')
    expect(ocultoHtml).not.toContain('T06C-SKU-1')
    expect(ocultoHtml).toContain('PRODUCT')
  })
})

describe('vínculo revealed:true — sí muestra el detalle que el servidor reveló', () => {
  it('pinta label, nombre, sku y estado del producto', () => {
    const html = renderSection({ links: [revelado] })

    expect(html).toContain('Producto Fixture Vinculos')
    expect(html).toContain('T06C-SKU-1')
    expect(html).toContain('borrador')
    expect(html).not.toContain('aria-disabled="true"')
  })

  it('lista de catálogo: pinta nombre, código y estado', () => {
    const html = renderSection({ links: [lista] })

    expect(html).toContain('Lista Temporada')
    expect(html).toContain('TMP-26')
    expect(html).toContain('Activa')
  })

  it('revealed:true sin label ni target (recurso borrado) pinta el tipo, no un hueco vacío', () => {
    const html = renderSection({
      links: [{ id: 'l5', targetType: 'PRODUCT', targetId: UUID, revealed: true, label: null, target: null }],
    })

    expect(html).toContain('Producto (PRODUCT)')
    expect(html).not.toContain('aria-disabled="true"')
    expect(html).not.toContain('Sin acceso vigente')
  })

  it('un revealed:false de otro tipo tampoco revela nada', () => {
    const html = renderSection({
      links: [{ id: 'l4', targetType: 'IMPORT_SESSION', targetId: UUID, revealed: false }],
    })

    const fragmento = linkFragment(html, UUID)
    expect(fragmento).toContain('IMPORT_SESSION')
    expect(fragmento).toContain('aria-disabled="true"')
    expect(html).not.toContain('href=')
  })
})

describe('lista de vínculos', () => {
  it('una actividad sin recursos ofrece el estado vacío', () => {
    expect(renderSection({ links: [] })).toContain('Sin recursos enlazados')
  })

  it('pinta cada vínculo una sola vez aunque el estado lo traiga duplicado', () => {
    const html = renderSection({ links: [oculto, { ...oculto }, revelado] })

    expect(html.split(UUID).length - 1).toBe(1)
    expect(html.split(OTRO_UUID).length - 1).toBe(1)
  })
})

describe('gestión mínima de enlaces (solo con el criterio agendaAccess)', () => {
  it('sin canManage no hay formulario ni botón de quitar: no se ofrece la acción', () => {
    const html = renderSection({ links: [oculto, revelado], canManage: false })

    expect(html).not.toContain('Añadir enlace')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('Quitar')
    expect(html).not.toContain('<select')
    // El listado (lo que el servidor ya reveló) sí se ve: leer no es gestionar.
    expect(html).toContain('PRODUCT')
  })

  it('con canManage aparece el selector de tipos, el campo UUID y las acciones', () => {
    const html = renderSection({ links: [oculto], canManage: true })

    expect(html).toContain('Añadir enlace')
    expect(html).toContain('<form')
    expect(html).toContain('Producto')
    expect(html).toContain('Lista')
    expect(html).toContain('Lista de tarifas')
    expect(html).toContain('Importación')
    expect(html).toContain('placeholder=')
    expect(html).toContain('Quitar')
  })

  it('el botón de añadir nace deshabilitado: sin UUID válido no se envía nada', () => {
    const html = renderSection({ canManage: true })

    expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled)/)
    expect(isUuid('')).toBe(false)
  })

  it('con busy el formulario no admite otra petición en vuelo', () => {
    const html = renderSection({ canManage: true, busy: true })

    expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled)/)
  })
})

describe('errores 400/404/409 en la sección', () => {
  it('muestra el aviso como alerta sin borrar la lista de vínculos', () => {
    const html = renderSection({
      links: [oculto, revelado],
      canManage: true,
      error: 'Ese recurso ya está enlazado a esta actividad',
    })

    expect(html).toContain('role="alert"')
    expect(html).toContain('Ese recurso ya está enlazado a esta actividad')
    expect(html).toContain(UUID)
    expect(html).toContain('Producto Fixture Vinculos')
    expect(html).toContain('Añadir enlace')
  })

  it('sin error no hay alerta', () => {
    expect(renderSection({ links: [revelado], canManage: true })).not.toContain('role="alert"')
  })
})
