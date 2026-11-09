import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccessPermissionGrid } from './AccessPermissionGrid'
import type { AccessActionDefinition } from '../../../services/users.service'

const actions: AccessActionDefinition[] = [
  { id: 'customers:read', label: 'Consultar clientes', purpose: 'Ver la cartera', enabled: true, allowedScopes: ['own'], dependencies: [] },
  { id: 'customers:edit', label: 'Editar clientes', purpose: 'Cambiar sus datos', enabled: true, allowedScopes: ['own'], dependencies: ['customers:read'] },
]

function render(selected: string[], inherited: string[]) {
  return renderToStaticMarkup(<AccessPermissionGrid groups={[{ label: 'Clientes', actions }]} selected={new Set(selected)} inherited={new Set(inherited)} disabled={false} onToggle={() => undefined} onToggleGroup={() => undefined} renderOptions={() => null} />)
}

describe('AccessPermissionGrid', () => {
  it('muestra el acceso por paquete marcado y protegido, sin bloquear las acciones adicionales', () => {
    const html = render([], ['customers:read'])
    const protectedBox = html.match(/<input[^>]*aria-label="Consultar clientes"[^>]*>/)?.[0] ?? ''
    const editableBox = html.match(/<input[^>]*aria-label="Editar clientes"[^>]*>/)?.[0] ?? ''
    expect(protectedBox).toMatch(/\schecked(?:=|\s|\/?>)/)
    expect(protectedBox).toMatch(/\sdisabled(?:=|\s|\/?>)/)
    expect(editableBox).not.toMatch(/\sdisabled(?:=|\s|\/?>)/)
    expect(html).toContain('(por paquete)')
  })

  it('comunica una selección parcial y cuenta también lo concedido por paquetes al completar el grupo', () => {
    expect(render([], ['customers:read'])).toContain('aria-checked="mixed"')
    const complete = render(['customers:edit'], ['customers:read'])
    expect(complete).toContain('aria-checked="true"')
    expect(complete).not.toContain('aria-checked="mixed"')
  })
})
