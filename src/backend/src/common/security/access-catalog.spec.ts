/**
 * BASE-04 unidad 1 — catálogo de acciones en formato `apartado:acción`
 * (formato fijado en BASE-02 §3; catálogo BASE-02 §3.1-§3.4 + IDs anclados
 * reales de S3). Los IDs con punto del worktree UA se remapean: ninguno
 * puede sobrevivir aquí (BASE-02 §11 D2, decisión de esta tanda).
 *
 * RED observado: estos specs deben fallar mientras `./access-catalog` no exista.
 */
import {
  ACCESS_CATALOG,
  ACCESS_CATALOG_VERSION,
  getActionDefinition,
  isActionIdFormat,
  isAssignableAction,
} from './access-catalog';
import * as catalogModule from './access-catalog';
import type { AccessScope } from './access-catalog';

const ACTION_ID = /^[a-z][A-Za-z0-9]*:[a-z][A-Za-z0-9-]*$/;
const VALID_SCOPES: readonly AccessScope[] = ['own', 'team', 'list', 'product', 'global'];

function definition(id: string) {
  const found = getActionDefinition(id);
  expect(found).toBeDefined();
  return found!;
}

describe('access-catalog (BASE-02 §3 / BASE-04 §3)', () => {
  it('expone una versión de catálogo estable', () => {
    expect(typeof ACCESS_CATALOG_VERSION).toBe('string');
    expect(ACCESS_CATALOG_VERSION.length).toBeGreaterThan(0);
  });

  it('usa apartado:acción en todas las entradas; ningún ID conserva el formato con punto del UA', () => {
    for (const action of ACCESS_CATALOG) {
      expect(action.id).toMatch(ACTION_ID);
      expect(action.id).not.toContain('.');
    }
  });

  it('no declara acciones duplicadas', () => {
    const ids = ACCESS_CATALOG.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('solo declara scopes del conjunto own|team|list|product|global (BASE-02 §7)', () => {
    for (const action of ACCESS_CATALOG) {
      expect(action.allowedScopes.length).toBeGreaterThan(0);
      for (const scope of action.allowedScopes) {
        expect(VALID_SCOPES).toContain(scope);
      }
    }
  });

  it('cubre las acciones del hijo Vendedor (BASE-02 §3.1)', () => {
    const vendedor = [
      'customers:read', 'customers:create', 'customers:edit',
      'quotes:read', 'quotes:create', 'quotes:edit', 'quotes:status',
      'erpSales:read', 'targets:read',
      'stockRequests:read', 'stockRequests:create', 'stockRequests:edit', 'stockRequests:cancel',
      'activities:read', 'activities:create', 'activities:complete',
      'commercialPromotions:read',
    ];
    for (const id of vendedor) definition(id);
  });

  it('cubre las acciones de Supervisor y Gestión comercial (BASE-02 §3.2-§3.3)', () => {
    const supervisadas = [
      'teamInsights:read', 'activities:assign',
      'customers:reassign', 'targets:edit',
      'commercialPromotions:create', 'commercialPromotions:edit',
      'commercialPromotions:publish', 'commercialPromotions:withdraw',
      'stockRequests:import', 'stockRequests:export',
      'commercialSettings:read', 'commercialSettings:edit',
    ];
    for (const id of supervisadas) definition(id);
  });

  it('conserva los IDs anclados reales de S3 (@Permissions/seed, BASE-02 §3)', () => {
    const anclados = [
      'products:read', 'products:write', 'products:delete', 'products:publish',
      'listas:create', 'listas:update', 'listas:duplicate', 'listas:import',
      'listas:archive', 'listas:delete', 'listas:publish',
      'assignments:manage', 'users:read',
    ];
    for (const id of anclados) {
      const action = definition(id);
      expect(action.enabled).toBe(true);
    }
  });

  it('BASE-03 backend-vinculos añade listas:read para revelar recursos enlazados (contrato §6.3)', () => {
    const action = definition('listas:read');
    expect(action.allowedScopes).toEqual(['list', 'global']);
    expect(action.enabled).toBe(true);
    // Se decide por acción y alcance sobre la lista concreta: own/team no
    // aplican a la lectura de un recurso enlazado (ficha regla 1).
    expect(action.allowedScopes).not.toContain('own');
    expect(action.allowedScopes).not.toContain('team');
    expect(action.purpose).toMatch(/enlazad/i);
  });

  it('concede lectura de equipo y edición propia como scopes distintos por acción (§3.1/§3.2)', () => {
    expect(definition('customers:read').allowedScopes).toContain('team');
    expect(definition('customers:read').allowedScopes).toContain('own');
    expect(definition('customers:edit').allowedScopes).toContain('own');
    expect(definition('teamInsights:read').allowedScopes).toEqual(['own', 'team', 'global']);
    expect(definition('customers:reassign').allowedScopes).toEqual(['own', 'team', 'global']);
    expect(definition('targets:edit').allowedScopes).toContain('own');
  });

  it('la agenda admite los tres alcances en sus cuatro acciones', () => {
    for (const id of ['activities:read', 'activities:create', 'activities:complete', 'activities:assign']) {
      expect(definition(id).allowedScopes).toEqual(['own', 'team', 'global']);
    }
  });

  it('asignar no concede completar: las acciones siguen siendo distintas y complete depende de read (§4/§5)', () => {
    expect(definition('activities:assign').id).not.toEqual(
      definition('activities:complete').id,
    );
    expect(definition('activities:assign').dependencies).toEqual(['activities:read']);
    expect(definition('activities:complete').dependencies).toEqual(['activities:read']);
    expect(definition('activities:assign').purpose).toMatch(/sin conceder completar/);
  });

  it('deja enabled:false las acciones bloqueadas o sin módulo (B1/B2, §3.1/§3.3)', () => {
    expect(definition('erpSales:read').enabled).toBe(false);
    expect(definition('stockRequests:read').enabled).toBe(false);
    expect(definition('stockRequests:import').enabled).toBe(false);
    expect(definition('commercialSettings:read').enabled).toBe(false);
    expect(definition('commercialSettings:edit').enabled).toBe(false);
  });

  it('CAT-01 §4 permite desvincular con permiso propio y mantiene link pendiente', () => {
    for (const id of ['listas:link', 'listas:unlink']) {
      const action = definition(id);
      expect(action.allowedScopes).toEqual(['list', 'global']);
      expect(action.dependencies).toEqual(['listas:read']);
      expect(action.enabled).toBe(id === 'listas:unlink');
    }
    expect(definition('listas:unlink').purpose).toMatch(/conservando/i);
    expect(definition('listas:link').purpose).toMatch(/sin lista/i);
  });

  it('IMP-04 declara prices:save (guardar sin aplicar) con dependencia de prices:preview', () => {
    const action = definition('prices:save');
    expect(action.allowedScopes).toEqual(['global']);
    expect(action.dependencies).toEqual(['prices:preview']);
    expect(action.enabled).toBe(true);
  });

  it('IMP-05 declara prices:apply SEPARADO de prices:save (aprobar sin preparar, diseño §35)', () => {
    const action = definition('prices:apply');
    expect(action.allowedScopes).toEqual(['global']);
    expect(action.dependencies).toEqual(['prices:read']);
    expect(action.dependencies).not.toContain('prices:save');
    expect(action.enabled).toBe(true);
  });

  it('IMP-07B declara providers:read/write globales, con write dependiente de read', () => {
    const read = definition('providers:read');
    const write = definition('providers:write');
    expect(read.allowedScopes).toEqual(['global']);
    expect(write.allowedScopes).toEqual(['global']);
    expect(write.dependencies).toEqual(['providers:read']);
    // Ninguna de las dos habilita por sí sola previsualizar/guardar/aplicar precios.
    expect([...read.dependencies, ...write.dependencies]).not.toContain('prices:preview');
    expect(read.enabled).toBe(true);
    expect(write.enabled).toBe(true);
  });

  it('habilita las acciones con consumidor real en S3 y las del paquete comercial', () => {
    for (const id of ['customers:read', 'customers:edit', 'quotes:read', 'quotes:create',
      'activities:read', 'targets:read', 'teamInsights:read', 'commercialPromotions:read',
      'products:publish', 'listas:publish']) {
      expect(definition(id).enabled).toBe(true);
    }
  });

  it('CAT-03: declara products:notes (notas internas) sin sustituir a products:write', () => {
    const notes = definition('products:notes');
    expect(notes.enabled).toBe(true);
    expect(notes.dependencies).toEqual(['products:read']);
    expect(notes.allowedScopes).toContain('global');
    // No habilita por sí sola editar el resto de la ficha.
    expect(notes.dependencies).not.toContain('products:write');
    expect(definition('products:write').dependencies).toEqual(['products:read']);
  });

  it('CAT-05: declara products:validate (motor único, varios puntos de entrada)', () => {
    const validate = definition('products:validate');
    expect(validate.enabled).toBe(true);
    expect(validate.dependencies).toEqual(['products:read']);
  });

  it('declara products:approveSpecs (aprobar datos clave) como complemento que exige leer y editar', () => {
    const approve = definition('products:approveSpecs');
    expect(approve.enabled).toBe(true);
    expect(approve.dependencies).toEqual(['products:read', 'products:write']);
    expect(approve.allowedScopes).toContain('global');
    // Es un permiso aparte: ni editar ni publicar lo concede.
    expect(definition('products:write').dependencies).not.toContain('products:approveSpecs');
    expect(definition('products:publish').dependencies).not.toContain('products:approveSpecs');
  });

  it('mantiene Biblioteca export/import fuera de las asignaciones habilitadas', () => {
    expect(definition('products:export').enabled).toBe(false);
    expect(definition('products:import').enabled).toBe(false);
  });

  it('declara las dependencias edit→view exigidas por BASE-02 §5.3', () => {
    expect(definition('customers:edit').dependencies).toEqual(['customers:read']);
    expect(definition('customers:reassign').dependencies).toEqual(['customers:read']);
    expect(definition('quotes:create').dependencies).toEqual(['customers:read']);
    expect(definition('quotes:edit').dependencies).toEqual(['quotes:read']);
    expect(definition('targets:edit').dependencies).toEqual(['targets:read']);
    expect(definition('products:write').dependencies).toEqual(['products:read']);
    expect(definition('activities:complete').dependencies).toEqual(['activities:read']);
    expect(definition('commercialPromotions:publish').dependencies).toEqual(['commercialPromotions:read']);
  });

  it('getActionDefinition devuelve la entrada o undefined para acción desconocida', () => {
    expect(getActionDefinition('customers:read')?.id).toBe('customers:read');
    expect(getActionDefinition('customers:export')).toBeUndefined();
  });

  // COM-03 §3 — la operación sensible de descuento se separa de la edición.
  it('COM-03 §3 declara quotes:discount con dependencia quotes:edit y alcances comerciales', () => {
    const action = definition('quotes:discount');
    expect(action.dependencies).toEqual(['quotes:edit']);
    expect(action.allowedScopes).toEqual(['own', 'team', 'global']);
    expect(action.enabled).toBe(true);
    expect(action.purpose).toMatch(/descuento/i);
    expect(isActionIdFormat('quotes:discount')).toBe(true);
  });

  it('isActionIdFormat valida apartado:acción y rechaza IDs UA y permisos legacy', () => {
    expect(isActionIdFormat('customers:read')).toBe(true);
    expect(isActionIdFormat('listas:delete')).toBe(true);
    expect(isActionIdFormat('commercial.customers.view')).toBe(false);
    expect(isActionIdFormat('dashboard:pack:ventas')).toBe(false);
    expect(isActionIdFormat('customers')).toBe(false);
    expect(isActionIdFormat('')).toBe(false);
  });
});

// ─── IMP-01 integrado — acciones prices:read / prices:preview ───
describe('IMP-01 — precios en el catálogo', () => {
  it('prices:preview depende solo de prices:read (sin Listas)', () => {
    const def = getActionDefinition('prices:preview');
    expect(def).toMatchObject({ enabled: true, dependencies: ['prices:read'] });
  });

  it('prices:read no depende de ninguna acción (sin Listas)', () => {
    expect(getActionDefinition('prices:read')).toMatchObject({ enabled: true, dependencies: [] });
  });

  it('ninguna acción de precios, proveedores ni productos depende de listas:read', () => {
    for (const def of ACCESS_CATALOG) {
      if (/^(prices|providers|products):/.test(def.id)) {
        expect(def.dependencies).not.toContain('listas:read');
      }
    }
    expect(getActionDefinition('prices:apply')?.dependencies).toEqual(['prices:read']);
    expect(getActionDefinition('prices:save')?.dependencies).toEqual(['prices:preview']);
  });
});

describe('Marketing y mercadeo → Campañas', () => {
  const IDS = ['marketing:read', 'marketing:create', 'marketing:edit', 'marketing:publish', 'marketing:delete'];

  it('declara read/create/edit/publish/delete globales y habilitadas', () => {
    for (const id of IDS) {
      expect(isActionIdFormat(id)).toBe(true);
      expect(definition(id)).toMatchObject({ enabled: true, allowedScopes: ['global'] });
    }
  });

  it('create/edit/publish/delete dependen de marketing:read; read no depende de nada', () => {
    expect(definition('marketing:read').dependencies).toEqual([]);
    for (const id of IDS.slice(1)) expect(definition(id).dependencies).toEqual(['marketing:read']);
  });

  it('publicar y retirar es un permiso separado de crear y editar', () => {
    expect(definition('marketing:publish').dependencies).not.toContain('marketing:edit');
    expect(definition('marketing:edit').dependencies).not.toContain('marketing:publish');
    expect(definition('marketing:publish').label).toMatch(/publicar/i);
  });
});

describe('Mi resumen — estadísticas de Biblioteca por pestaña', () => {
  const STATS: Array<[string, string, string]> = [
    ['libraryStats:products', 'Estadísticas de Productos', 'products:read'],
    ['libraryStats:update', 'Estadísticas de Fichas', 'products:write'],
    ['libraryStats:publication', 'Estadísticas de Publicar en tienda', 'products:publish'],
  ];

  it.each(STATS)('%s: etiqueta, alcance global y dependencia de su pestaña', (id, label, dependency) => {
    expect(isActionIdFormat(id)).toBe(true);
    expect(definition(id)).toMatchObject({ label, enabled: true, allowedScopes: ['global'], dependencies: [dependency] });
  });

  it('acciones del portal de clientes: alcances y dependencias', () => {
    expect(getActionDefinition('portalAccounts:read')).toMatchObject({ allowedScopes: ['own', 'team', 'global'], dependencies: [], enabled: true });
    expect(getActionDefinition('portalAccounts:assign')).toMatchObject({ allowedScopes: ['own', 'team', 'global'], dependencies: ['portalAccounts:read'], enabled: true });
    expect(getActionDefinition('portalAccounts:manage')).toMatchObject({ allowedScopes: ['own', 'team', 'global'], dependencies: ['portalAccounts:read'], enabled: true });
    expect(getActionDefinition('quotes:history')).toMatchObject({ allowedScopes: ['own', 'team', 'global'], dependencies: ['quotes:read'], enabled: true });
  });
});

describe('acciones que reemplazan las rutas protegidas solo por cargo', () => {
  it('declara las cinco acciones, asignables y con sus alcances y dependencias', () => {
    expect(ACCESS_CATALOG_VERSION).toBe('panels-20261127-1');
    expect(definition('audit:read')).toMatchObject({ allowedScopes: ['global'], dependencies: [], enabled: true });
    expect(definition('salesOrders:read')).toMatchObject({ allowedScopes: ['own', 'team', 'global'], dependencies: [], enabled: true });
    expect(definition('salesOrders:invoice')).toMatchObject({ allowedScopes: ['own', 'team', 'global'], dependencies: ['salesOrders:read'], enabled: true });
    expect(definition('storefront:manage')).toMatchObject({ allowedScopes: ['global'], dependencies: [], enabled: true });
    expect(definition('portalTariffs:manage')).toMatchObject({ allowedScopes: ['global'], dependencies: ['portalAccounts:read'], enabled: true });
    for (const id of ['audit:read', 'salesOrders:read', 'salesOrders:invoice', 'storefront:manage', 'portalTariffs:manage']) {
      expect(isActionIdFormat(id)).toBe(true);
      expect(isAssignableAction(id)).toBe(true);
    }
  });
});

describe('los paquetes de paneles ya no existen', () => {
  it('el catálogo solo expone acciones: no hay plantillas de paquete que asignar', () => {
    const exported = Object.keys(catalogModule);
    expect(exported).not.toContain('PACKAGE_TEMPLATES');
    expect(exported).not.toContain('getPackageTemplate');
  });
});

/**
 * Decision of 2026-11-26: every action over data with an owner, an author or a
 * team relation is offered at own / team / global (the server enforces each
 * level). Shared data with no owner stays global-only until the product owner
 * decides what "own" and "team" would mean there.
 */
describe('alcances propio / equipo / global por tipo de dato', () => {
  const THREE = ['own', 'team', 'global'];

  it('grupo A: las acciones de datos con dueño ofrecen los tres alcances', () => {
    const groupA = [
      'customers:read', 'customers:create', 'customers:edit', 'customers:reassign',
      'quotes:read', 'quotes:create', 'quotes:edit', 'quotes:discount', 'quotes:status', 'quotes:history',
      'portalAccounts:read', 'portalAccounts:assign', 'portalAccounts:manage',
      'targets:read', 'targets:edit',
      'activities:read', 'activities:create', 'activities:complete', 'activities:assign',
      'commercialPromotions:read', 'commercialPromotions:create', 'commercialPromotions:edit',
      'commercialPromotions:publish', 'commercialPromotions:withdraw',
      'teamInsights:read',
      'salesOrders:read', 'salesOrders:invoice',
    ];
    for (const id of groupA) expect([id, [...definition(id).allowedScopes]]).toEqual([id, THREE]);
  });

  it('grupo B: los datos compartidos sin dueño siguen solo en global (decisión pendiente)', () => {
    const groupB = ACCESS_CATALOG.filter((item) => /^(products|prices|imports|masters|providers|marketing|libraryStats):/.test(item.id));
    expect(groupB.length).toBeGreaterThan(20);
    for (const item of groupB) expect([item.id, [...item.allowedScopes]]).toEqual([item.id, ['global']]);
    // Zones have no owner yet (needs a schema change): still global only.
    expect(definition('portalZones:manage').allowedScopes).toEqual(['global']);
    // Reading users keeps its team / global levels until it is decided.
    expect(definition('users:read').allowedScopes).toEqual(['team', 'global']);
  });

  it('una acción dependiente nunca ofrece un alcance que su dependencia no ofrece', () => {
    const levels = new Set(['own', 'team', 'global']);
    for (const item of ACCESS_CATALOG) {
      for (const dependencyId of item.dependencies) {
        const dependency = definition(dependencyId);
        for (const scope of item.allowedScopes.filter((value) => levels.has(value))) {
          expect([item.id, dependencyId, scope, dependency.allowedScopes.includes(scope)])
            .toEqual([item.id, dependencyId, scope, true]);
        }
      }
    }
  });
});
