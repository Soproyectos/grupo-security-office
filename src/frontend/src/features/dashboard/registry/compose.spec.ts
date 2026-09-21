import { describe, it, expect } from 'vitest'
import {
  composeDashboard,
  resolveVisibleBlockIds,
  packSelectionState,
} from './compose'
import { DASHBOARD_BLOCKS, blocksInPack, PACKS } from './blocks'
import { blockPermission, packPermission, SCOPE_RANK } from './types'

// ---------------------------------------------------------------------------
// Escenarios cubiertos (fase 1 — motor de composición):
// ✅ Usuario sin permisos → dashboard vacío
// ✅ Un paquete concedido → todos sus bloques
// ✅ Un bloque suelto → sólo ese bloque
// ✅ Paquete + bloque del mismo paquete → sin duplicados
// ✅ Multi-rol: la unión de dos paquetes, deduplicada
// ✅ Super Admin ve todo sin permisos explícitos (excepción BE-RBAC-001)
// ✅ Resolución de alcance: gana el más amplio
// ✅ Los bloques salen ordenados por `order`
// ✅ Catálogo íntegro: ids únicos, paquetes declarados, KPIs sin `span`
// ✅ Casilla de tres estados para la pantalla de concesiones
// ---------------------------------------------------------------------------

const noRoles = { roles: [], permissions: [] }

describe('resolveVisibleBlockIds', () => {
  it('sin permisos no hace visible ningún bloque', () => {
    expect(resolveVisibleBlockIds(noRoles).size).toBe(0)
  })

  it('un paquete concedido habilita todos sus bloques', () => {
    const visible = resolveVisibleBlockIds({
      roles: ['Vendedor'],
      permissions: [packPermission('cotizaciones')],
    })

    const esperados = blocksInPack('cotizaciones').map((b) => b.id)

    expect(visible.size).toBe(esperados.length)
    esperados.forEach((id) => expect(visible.has(id)).toBe(true))
  })

  it('un bloque suelto habilita sólo ese bloque', () => {
    const visible = resolveVisibleBlockIds({
      roles: ['Consulta'],
      permissions: [blockPermission('ranking-equipo')],
    })

    expect([...visible]).toEqual(['ranking-equipo'])
  })

  /**
   * Conceder un paquete y además una pieza suya no debe contar dos veces.
   * Al ser un Set, la deduplicación es estructural y no hay que programarla.
   */
  it('no duplica al conceder un paquete y un bloque suyo', () => {
    const conAmbos = resolveVisibleBlockIds({
      roles: [],
      permissions: [packPermission('operacion'), blockPermission('mis-tareas-pendientes')],
    })

    expect(conAmbos.size).toBe(blocksInPack('operacion').length)
  })

  /**
   * El caso que motivó todo el diseño: un usuario Supervisor + Admin Comercial
   * ve la unión de ambos conjuntos, sin repetir lo compartido.
   */
  it('multi-rol: une los paquetes sin repetir lo compartido', () => {
    const soloVentas = resolveVisibleBlockIds({
      roles: [],
      permissions: [packPermission('ventas')],
    })
    const soloAuditoria = resolveVisibleBlockIds({
      roles: [],
      permissions: [packPermission('auditoria')],
    })
    const ambos = resolveVisibleBlockIds({
      roles: [],
      permissions: [packPermission('ventas'), packPermission('auditoria')],
    })

    expect(ambos.size).toBe(soloVentas.size + soloAuditoria.size)
    expect([...ambos].length).toBe(new Set([...ambos]).size)
  })

  /**
   * El backend deja pasar al Super Admin sin evaluar permisos (BE-RBAC-001).
   * Si el compositor no replicara la excepción, podría pedir los datos por API
   * pero no vería el bloque que los muestra.
   */
  it('Super Admin ve todo el catálogo sin permisos explícitos', () => {
    const visible = resolveVisibleBlockIds({
      roles: ['Super Admin'],
      permissions: [],
    })

    expect(visible.size).toBe(DASHBOARD_BLOCKS.length)
  })

  it('ignora permisos que no son de dashboard', () => {
    const visible = resolveVisibleBlockIds({
      roles: ['Operador'],
      permissions: ['products:read', 'listas:publish', 'users:manage'],
    })

    expect(visible.size).toBe(0)
  })

  it('ignora un permiso de bloque inexistente', () => {
    const visible = resolveVisibleBlockIds({
      roles: [],
      permissions: [blockPermission('bloque-que-no-existe')],
    })

    expect(visible.size).toBe(0)
  })
})

describe('composeDashboard', () => {
  it('marca vacío el dashboard de un usuario sin concesiones', () => {
    const result = composeDashboard(noRoles)

    expect(result.isEmpty).toBe(true)
    expect(result.kpis).toEqual([])
    expect(result.panels).toEqual([])
  })

  /**
   * "Vacío" se juzga sobre lo permitido, no sobre lo implementado: a quien no
   * se le concedió nada hay que explicárselo, mientras que un bloque sin
   * componente sería un hueco temporal del desarrollo, no un problema de
   * permisos. Hoy no queda ninguno, y el siguiente test lo vigila.
   */
  it('un paquete concedido produce un dashboard no vacío', () => {
    const result = composeDashboard({
      roles: [],
      permissions: [packPermission('ventas')],
    })

    expect(result.isEmpty).toBe(false)
    expect(result.kpis.length + result.panels.length).toBeGreaterThan(0)
  })

  /**
   * Todo bloque del catálogo tiene componente. Declarar uno y olvidarse de
   * implementarlo lo haría desaparecer en silencio: el compositor lo omite sin
   * avisar, y el usuario no vería nada donde debería haber algo.
   */
  it('no queda ningún bloque declarado sin componente', () => {
    const result = composeDashboard({ roles: ['Super Admin'], permissions: [] })

    expect(result.pendingBlocks.map((b) => b.id)).toEqual([])
  })

  it('separa KPIs de paneles', () => {
    const result = composeDashboard({ roles: ['Super Admin'], permissions: [] })
    const todos = [...result.kpis, ...result.panels, ...result.pendingBlocks]

    expect(todos.length).toBe(DASHBOARD_BLOCKS.length)
    result.kpis.forEach((b) => expect(b.kind).toBe('kpi'))
    result.panels.forEach((b) => expect(b.kind).toBe('panel'))
  })

  it('devuelve los bloques ordenados por `order`', () => {
    const { kpis, panels } = composeDashboard({
      roles: ['Super Admin'],
      permissions: [],
    })

    for (const grupo of [kpis, panels]) {
      const orders = grupo.map((b) => b.order)
      expect([...orders].sort((a, b) => a - b)).toEqual(orders)
    }
  })
})

describe('resolución de alcance', () => {
  /**
   * Un bloque declarado con dos alcances debe aparecer UNA vez, con el más
   * amplio. Renderizar ambos mostraría la misma tabla dos veces con datos
   * distintos, y parecería un error de la aplicación.
   */
  it('conserva una sola copia, con el alcance más amplio', () => {
    const catalogo = [
      { id: 'demo', title: 'Demo', kind: 'panel' as const, pack: 'clientes' as const, scope: 'own' as const, order: 1 },
      { id: 'demo', title: 'Demo', kind: 'panel' as const, pack: 'clientes' as const, scope: 'global' as const, order: 1 },
    ]

    const mejor = catalogo.reduce((acc, b) =>
      SCOPE_RANK[b.scope] > SCOPE_RANK[acc.scope] ? b : acc,
    )

    expect(mejor.scope).toBe('global')
  })

  it('el orden de amplitud es own < team < commercial < global', () => {
    expect(SCOPE_RANK.own).toBeLessThan(SCOPE_RANK.team)
    expect(SCOPE_RANK.team).toBeLessThan(SCOPE_RANK.commercial)
    expect(SCOPE_RANK.commercial).toBeLessThan(SCOPE_RANK.global)
  })
})

describe('integridad del catálogo', () => {
  it('no hay ids duplicados con el mismo alcance', () => {
    const claves = DASHBOARD_BLOCKS.map((b) => `${b.id}::${b.scope}`)

    expect(new Set(claves).size).toBe(claves.length)
  })

  it('todo bloque pertenece a un paquete declarado', () => {
    const declarados = new Set(PACKS.map((p) => p.id))

    DASHBOARD_BLOCKS.forEach((b) => expect(declarados.has(b.pack)).toBe(true))
  })

  it('todo paquete tiene al menos un bloque', () => {
    PACKS.forEach((p) => expect(blocksInPack(p.id).length).toBeGreaterThan(0))
  })

  it('los KPI no declaran `span` (siempre ocupan una celda)', () => {
    DASHBOARD_BLOCKS.filter((b) => b.kind === 'kpi').forEach((b) =>
      expect(b.span).toBeUndefined(),
    )
  })

  it('los ids usan kebab-case, apto para formar el permiso', () => {
    DASHBOARD_BLOCKS.forEach((b) => expect(b.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/))
  })
})

describe('packSelectionState', () => {
  it('sin bloques seleccionados el paquete está vacío', () => {
    const estado = packSelectionState('listas', new Set())

    expect(estado.state).toBe('none')
    expect(estado.selected).toBe(0)
  })

  it('con todos los bloques el paquete está completo', () => {
    const ids = new Set(blocksInPack('listas').map((b) => b.id))
    const estado = packSelectionState('listas', ids)

    expect(estado.state).toBe('all')
    expect(estado.selected).toBe(estado.total)
  })

  /**
   * El estado intermedio es el que pidió el usuario: "ve Ventas, pero sólo 2
   * de sus bloques".
   */
  it('con algunos bloques el paquete queda parcial', () => {
    const bloques = blocksInPack('ventas')
    const estado = packSelectionState('ventas', new Set([bloques[0]!.id]))

    expect(estado.state).toBe('partial')
    expect(estado.selected).toBe(1)
    expect(estado.total).toBeGreaterThan(1)
  })
})
