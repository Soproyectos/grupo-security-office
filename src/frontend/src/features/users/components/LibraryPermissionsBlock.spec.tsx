import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LibraryPermissionsBlock } from './LibraryPermissionsBlock'
import { type UserAccessState } from '../../../services/users.service'

/** Render de servidor (este repo no tiene DOM): estado inicial, resumen y avisos. */
function state(partial: Partial<UserAccessState> = {}): UserAccessState {
  return { catalogVersion: 'panels-20261028-2', accessVersion: 3, grants: [], sources: [], ...partial }
}
const grants = (sourceId: string, ...ids: string[]) => ids.map((actionId) => ({ sourceId, actionId, scope: 'global' as const }))

function render(access: UserAccessState) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <LibraryPermissionsBlock userId="user-1" access={access} />
    </QueryClientProvider>,
  )
}

/** Primera casilla cuya etiqueta es `label` (el input que precede a su texto). */
function boxOf(html: string, label: string): string {
  const marker = `<span class="break-words">${label}</span>`
  const at = html.indexOf(marker)
  const inputs = html.slice(0, at).match(/<input[^>]*>/g) ?? []
  return at < 0 ? '' : inputs[inputs.length - 1] ?? ''
}
const isChecked = (input: string) => input.includes('checked')
const saveButton = (html: string) => html.match(/<button[^>]*>Guardar Biblioteca<\/button>/)?.[0] ?? ''

describe('LibraryPermissionsBlock', () => {
  it('sin accesos: todo desmarcado, resumen sin pestañas y Guardar bloqueado', () => {
    const html = render(state())
    expect(html).toContain('Sin acceso a Biblioteca: no verá ninguna pestaña.')
    expect(isChecked(boxOf(html, 'Ver productos'))).toBe(false)
    expect(saveButton(html)).toContain('disabled')
  })

  it('quien tiene las acciones de Fichas aparece con sus casillas marcadas, sin perder nada al abrir', () => {
    const html = render(state({
      grants: grants('s1', 'products:read', 'products:write', 'products:delete', 'products:validate', 'products:notes', 'prices:read'),
    }))
    for (const label of ['Editar fichas', 'Validar ficha', 'Notas internas', 'Eliminar producto']) {
      expect(isChecked(boxOf(html, label))).toBe(true)
    }
    expect(isChecked(boxOf(html, 'Aplicar precios'))).toBe(false)
    expect(html).toContain('Verá las pestañas: Productos, Fichas.')
    expect(html).not.toMatch(/paquete/i)
    expect(saveButton(html)).toContain('disabled')
  })

  it('todas las acciones asignadas marcan todas las casillas, vengan de la fuente que vengan', () => {
    const all = ['products:read', 'products:write', 'products:delete', 'products:validate', 'products:notes', 'prices:read', 'prices:preview', 'prices:save', 'prices:apply', 'providers:read', 'providers:write']
    const html = render(state({ grants: [...grants('s1', ...all), ...grants('s2', 'products:read')] }))
    expect(html).toContain('Verá las pestañas: Productos, Fichas, Precios.')
    expect(isChecked(boxOf(html, 'Editar perfiles de proveedor'))).toBe(true)
  })

  it('Biblioteca se asigna por pestaña: cada una tiene su casilla de sección y sus acciones directas', () => {
    const html = render(state())
    for (const tab of ['Productos', 'Fichas', 'Precios', 'Importaciones', 'Catálogos maestros']) {
      expect(html).toContain(`aria-label="${tab}: marcar o desmarcar todo"`)
    }
    for (const label of ['Ver productos', 'Editar fichas', 'Revisar archivo de precios', 'Ver importaciones', 'Ver catálogos maestros']) {
      const box = boxOf(html, label)
      expect(box, label).toContain('type="checkbox"')
      expect(box, label).not.toMatch(/\sdisabled(?:=|\s|\/?>)/)
    }
  })

  it('con solo Importaciones asignadas ve Productos e Importaciones y ninguna otra pestaña', () => {
    const html = render(state({ grants: grants('s1', 'products:read', 'imports:read') }))
    expect(html).toContain('Verá las pestañas: Productos, Importaciones.')
    expect(isChecked(boxOf(html, 'Ver importaciones'))).toBe(true)
    expect(isChecked(boxOf(html, 'Importar datos'))).toBe(false)
  })

  it('Publicar en tienda sin «editar fichas» avisa en simple y bloquea Guardar; con editar fichas no avisa', () => {
    const noWrite = render(state({
      grants: [...grants('s1', 'products:read'), ...grants('p', 'products:read', 'products:publish')],
    }))
    expect(noWrite).toContain('Quita primero Publicar en tienda: necesita poder editar fichas.')
    expect(saveButton(noWrite)).toContain('disabled')
    const withWrite = render(state({
      grants: [...grants('s1', 'products:read', 'products:write'), ...grants('p', 'products:publish')],
    }))
    expect(withWrite).not.toContain('Quita primero Publicar en tienda')
  })

  it('«Publicar en tienda» no se marca como casilla propia de las pestañas', () => {
    const html = render(state({ grants: grants('s1', 'products:read', 'products:write', 'products:publish') }))
    expect(html).not.toContain('Publicar en tienda</span>')
    expect(isChecked(boxOf(html, 'Validar ficha'))).toBe(false)
  })

  it('un permiso suelto que no abre pestaña se explica en el resumen', () => {
    const html = render(state({ grants: grants('s1', 'prices:read') }))
    expect(html).toContain('todavía no se abre ninguna pestaña')
  })

  it('textos en español simple, sin ids técnicos; objetivos táctiles de 44px', () => {
    const html = render(state())
    expect(html).not.toMatch(/products:|prices:|providers:|ACL|scope|@Roles/)
    expect(html).toContain('min-h-11')
  })
})
