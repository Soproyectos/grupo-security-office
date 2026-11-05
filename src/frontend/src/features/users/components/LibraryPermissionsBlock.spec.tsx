import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LibraryPermissionsBlock } from './LibraryPermissionsBlock'
import { type UserAccessState } from '../../../services/users.service'

/** Render de servidor (este repo no tiene DOM): estado inicial, resumen y avisos. */
function state(partial: Partial<UserAccessState> = {}): UserAccessState {
  return { catalogVersion: 'panels-20261028-2', accessVersion: 3, grants: [], sources: [], packages: [], ...partial }
}
const source = (id: string, templateId: string | null, kind = 'template') => ({
  id, kind, templateId, catalogVersion: 'panels-20261028-2', grantedById: 'admin-1', reason: null,
})
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

  it('quien tiene el paquete Fichas aparece con sus casillas marcadas, sin perder nada al abrir', () => {
    const html = render(state({
      sources: [source('s1', 'biblioteca-fichas')],
      grants: grants('s1', 'products:read', 'products:write', 'products:delete', 'products:validate', 'products:notes', 'prices:read'),
    }))
    for (const label of ['Editar fichas', 'Validar ficha', 'Notas internas', 'Eliminar producto']) {
      expect(isChecked(boxOf(html, label))).toBe(true)
    }
    expect(isChecked(boxOf(html, 'Aplicar precios'))).toBe(false)
    expect(html).toContain('Verá las pestañas: Productos, Fichas.')
    expect(html).toContain('reemplaza los paquetes y asignaciones anteriores de Biblioteca')
    expect(saveButton(html)).toContain('disabled')
  })

  it('el paquete anterior Actualización y la selección guardada marcan todas las casillas', () => {
    const all = ['products:read', 'products:write', 'products:delete', 'products:validate', 'products:notes', 'prices:read', 'prices:preview', 'prices:save', 'prices:apply', 'providers:read', 'providers:write']
    const html = render(state({
      sources: [source('s1', 'biblioteca-actualizacion'), source('s2', 'biblioteca-seleccion')],
      grants: [...grants('s1', ...all), ...grants('s2', 'products:read')],
    }))
    expect(html).toContain('Verá las pestañas: Productos, Fichas, Precios.')
    expect(isChecked(boxOf(html, 'Editar perfiles de proveedor'))).toBe(true)
  })

  it('Publicar en tienda sin «editar fichas» avisa en simple y bloquea Guardar; con editar fichas no avisa', () => {
    const noWrite = render(state({
      sources: [source('s1', 'biblioteca-seleccion'), source('p', 'biblioteca-publicacion')],
      grants: [...grants('s1', 'products:read'), ...grants('p', 'products:read', 'products:validate', 'products:publish')],
    }))
    expect(noWrite).toContain('Quita primero Publicar en tienda: necesita poder editar fichas.')
    expect(saveButton(noWrite)).toContain('disabled')
    const withWrite = render(state({
      sources: [source('s1', 'biblioteca-seleccion'), source('p', 'biblioteca-publicacion')],
      grants: [...grants('s1', 'products:read', 'products:write'), ...grants('p', 'products:publish')],
    }))
    expect(withWrite).not.toContain('Quita primero Publicar en tienda')
  })

  it('el complemento no se marca como casilla propia (validar ficha solo cuenta si viene de la selección)', () => {
    const html = render(state({
      sources: [source('s1', 'biblioteca-seleccion'), source('p', 'biblioteca-publicacion')],
      grants: [...grants('s1', 'products:read', 'products:write'), ...grants('p', 'products:validate', 'products:publish')],
    }))
    expect(isChecked(boxOf(html, 'Validar ficha'))).toBe(false)
  })

  it('un permiso suelto que no abre pestaña se explica en el resumen', () => {
    const html = render(state({ sources: [source('s1', 'biblioteca-seleccion')], grants: grants('s1', 'prices:read') }))
    expect(html).toContain('todavía no se abre ninguna pestaña')
  })

  it('textos en español simple, sin ids técnicos; objetivos táctiles de 44px', () => {
    const html = render(state())
    expect(html).not.toMatch(/products:|prices:|providers:|ACL|scope|@Roles/)
    expect(html).toContain('min-h-11')
  })
})
