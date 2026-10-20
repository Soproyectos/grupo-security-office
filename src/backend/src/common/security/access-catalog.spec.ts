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
  PACKAGE_TEMPLATES,
  getActionDefinition,
  getPackageTemplate,
  isActionIdFormat,
} from './access-catalog';
import type { AccessScope, PackageTemplate } from './access-catalog';

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
    expect(definition('teamInsights:read').allowedScopes).toEqual(['team', 'global']);
    expect(definition('customers:reassign').allowedScopes).not.toContain('own');
    expect(definition('targets:edit').allowedScopes).toContain('own');
  });

  it('BASE-03 backend-equipo añade alcance team a la agenda sin quitar own (contrato §4-§5)', () => {
    expect(definition('activities:read').allowedScopes).toEqual(['own', 'team']);
    expect(definition('activities:create').allowedScopes).toEqual(['own', 'team']);
  });

  it('las cuatro acciones de agenda admiten team y conservan su alcance propio (§4)', () => {
    expect(definition('activities:read').allowedScopes).toEqual(
      expect.arrayContaining(['own', 'team']),
    );
    expect(definition('activities:create').allowedScopes).toEqual(
      expect.arrayContaining(['own', 'team']),
    );
    expect(definition('activities:complete').allowedScopes).toEqual(
      expect.arrayContaining(['own', 'team']),
    );
    // `activities:assign` es team/global por diseño (§4): asignar trabajo del
    // equipo sin conceder completar ajenas — own no aplica a esta acción.
    expect(definition('activities:assign').allowedScopes).toEqual(['team', 'global']);
    expect(definition('activities:assign').allowedScopes).not.toContain('own');
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
    expect(action.allowedScopes).toEqual(['list', 'global']);
    expect(action.dependencies).toEqual(['prices:preview']);
    expect(action.enabled).toBe(true);
  });

  it('IMP-05 declara prices:apply SEPARADO de prices:save (aprobar sin preparar, diseño §35)', () => {
    const action = definition('prices:apply');
    expect(action.allowedScopes).toEqual(['list', 'global']);
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

  it('mantiene Biblioteca export/import fuera de las asignaciones habilitadas', () => {
    expect(definition('products:export').enabled).toBe(false);
    expect(definition('products:import').enabled).toBe(false);
    const assigned = PACKAGE_TEMPLATES.flatMap((pkg) => pkg.selections.map((item) => item.actionId));
    expect(assigned).not.toContain('products:export');
    expect(assigned).not.toContain('products:import');
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

  it('COM-03 F1 — ningún paquete asigna quotes:discount (queda para asignación explícita)', () => {
    const granted = PACKAGE_TEMPLATES.flatMap((pkg) =>
      pkg.selections.map((s) => s.actionId),
    );
    expect(granted).not.toContain('quotes:discount');
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

/**
 * COM-01 §3.1 — los tres paquetes con sus acciones concretas, tomados de la
 * tabla literal del contrato. Paquete ≠ rol (ficha regla 1): es una
 * preselección de acciones+alcance que Super Admin revisa casilla a casilla.
 * Ningún paquete incluye acciones `enabled:false` (pendientes B1/B2): hacerlo
 * produciría 400 de `validateGrants` al aplicarlo (COM-01 §11).
 */
describe('PACKAGE_TEMPLATES (COM-01 §3.1)', () => {
  const selectionsById = (id: string): Array<{ actionId: string; scope: AccessScope }> =>
    getPackageTemplate(id)!.selections.map((s) => ({ actionId: s.actionId, scope: s.scope }));

  it('expone los tres hijos comerciales y los tres paquetes de Catálogo y precios', () => {
    expect(PACKAGE_TEMPLATES.map((p) => p.id)).toEqual([
      'gestion-listas-precios',
      'biblioteca-productos',
      'publicacion-catalogo',
      'vendedor',
      'supervisor-comercial',
      'gestion-comercial',
    ]);
    expect(PACKAGE_TEMPLATES.map((p) => p.name)).toEqual([
      'Gestión de listas y precios',
      'Biblioteca de productos',
      'Publicación del catálogo',
      'Vendedor',
      'Supervisor comercial',
      'Gestión comercial',
    ]);
    for (const pkg of PACKAGE_TEMPLATES) {
      expect(pkg.catalogVersion).toBe(ACCESS_CATALOG_VERSION);
    }
  });

  it('paquete Vendedor — acciones con alcance own + consulta de catálogo global (§3.1)', () => {
    expect(selectionsById('vendedor')).toEqual([
      { actionId: 'customers:read', scope: 'own' },
      { actionId: 'customers:create', scope: 'own' },
      { actionId: 'customers:edit', scope: 'own' },
      { actionId: 'quotes:read', scope: 'own' },
      { actionId: 'quotes:create', scope: 'own' },
      { actionId: 'quotes:edit', scope: 'own' },
      { actionId: 'quotes:status', scope: 'own' },
      // Consulta del catálogo: `list`/`product` exigen resourceId concreto, y
      // un paquete es una preselección estática → el único alcance aplicable
      // es `global` (E3: prices:read no existe en el catálogo, no se inventa).
      { actionId: 'products:read', scope: 'global' },
      { actionId: 'listas:read', scope: 'global' },
      { actionId: 'activities:read', scope: 'own' },
      { actionId: 'activities:create', scope: 'own' },
      { actionId: 'activities:complete', scope: 'own' },
      { actionId: 'targets:read', scope: 'own' },
      { actionId: 'commercialPromotions:read', scope: 'own' },
    ]);
  });

  it('paquete Supervisor comercial — acciones con alcance team (§3.1)', () => {
    expect(selectionsById('supervisor-comercial')).toEqual([
      { actionId: 'teamInsights:read', scope: 'team' },
      { actionId: 'customers:read', scope: 'team' },
      { actionId: 'quotes:read', scope: 'team' },
      { actionId: 'activities:read', scope: 'team' },
      { actionId: 'activities:assign', scope: 'team' },
      { actionId: 'targets:read', scope: 'team' },
    ]);
  });

  it('paquete Gestión comercial — acciones de gestión con sus dependencias incluidas (§3.1)', () => {
    // §3.1 declara customers:reassign, targets:edit y las cuatro acciones de
    // avisos con sus dependencias (`:read`); el paquete se aplica como UNA
    // fuente vía replaceSource, de modo que las dependencias viajan dentro de
    // la selección (assertDependencies BASE-02 §5.3). Alcance concreto `team`
    // (par más estrecho del `team/global` de §3.1; Super Admin amplía a
    // global en la revisión casilla a casilla si corresponde).
    expect(selectionsById('gestion-comercial')).toEqual([
      { actionId: 'customers:read', scope: 'team' },
      { actionId: 'customers:reassign', scope: 'team' },
      { actionId: 'targets:read', scope: 'team' },
      { actionId: 'targets:edit', scope: 'team' },
      { actionId: 'commercialPromotions:read', scope: 'team' },
      { actionId: 'commercialPromotions:create', scope: 'team' },
      { actionId: 'commercialPromotions:edit', scope: 'team' },
      { actionId: 'commercialPromotions:publish', scope: 'team' },
      { actionId: 'commercialPromotions:withdraw', scope: 'team' },
    ]);
  });

  it('toda selección referencia una acción existente, habilitada y con alcance permitido', () => {
    for (const pkg of PACKAGE_TEMPLATES) {
      for (const selection of pkg.selections) {
        const definition = getActionDefinition(selection.actionId);
        expect(definition).toBeDefined();
        expect(definition!.enabled).toBe(true);
        expect(definition!.allowedScopes).toContain(selection.scope);
        // Un paquete estático no lleva recursos concretos: nunca list/product.
        expect(selection.resourceId).toBeUndefined();
        expect(['own', 'team', 'global']).toContain(selection.scope);
      }
    }
  });

  it('cada paquete es autocontenido en dependencias (BASE-02 §5.3)', () => {
    for (const pkg of PACKAGE_TEMPLATES) {
      const granted = new Set(pkg.selections.map((s) => s.actionId));
      for (const selection of pkg.selections) {
        const definition = getActionDefinition(selection.actionId)!;
        for (const dependency of definition.dependencies) {
          expect({ pkg: pkg.id, action: selection.actionId, dependency }).toEqual({
            pkg: pkg.id,
            action: selection.actionId,
            dependency,
          });
          expect(granted.has(dependency)).toBe(true);
        }
      }
    }
  });

  it('ningún paquete incluye acciones pendientes enabled:false (B1/B2, §3.1)', () => {
    const pending = [
      'erpSales:read',
      'stockRequests:read', 'stockRequests:create', 'stockRequests:edit',
      'stockRequests:cancel', 'stockRequests:import', 'stockRequests:export',
      'commercialSettings:read', 'commercialSettings:edit',
      'listas:link',
    ];
    const assigned = new Set(PACKAGE_TEMPLATES.flatMap((p) => p.selections.map((s) => s.actionId)));
    for (const id of pending) {
      expect(assigned.has(id)).toBe(false);
    }
  });

  it('los paquetes quedan congelados (nadie muta una definición en caliente)', () => {
    expect(Object.isFrozen(PACKAGE_TEMPLATES)).toBe(true);
    for (const pkg of PACKAGE_TEMPLATES as readonly PackageTemplate[]) {
      expect(Object.isFrozen(pkg)).toBe(true);
      expect(Object.isFrozen(pkg.selections)).toBe(true);
    }
  });

  it('getPackageTemplate devuelve el paquete o undefined para id desconocido', () => {
    expect(getPackageTemplate('vendedor')?.name).toBe('Vendedor');
    expect(getPackageTemplate('no-existe')).toBeUndefined();
  });
});

// ─── IMP-01 integrado — acciones prices:read / prices:preview ───
describe('IMP-01 — precios en el catálogo', () => {
  it('prices:preview depende de prices:read y listas:read, con alcance de lista', () => {
    const def = getActionDefinition('prices:preview');
    expect(def).toMatchObject({
      enabled: true,
      allowedScopes: expect.arrayContaining(['list']),
      dependencies: expect.arrayContaining(['prices:read', 'listas:read']),
    });
  });

  it('prices:read existe con dependencia de listas:read', () => {
    const def = getActionDefinition('prices:read');
    expect(def).toMatchObject({ enabled: true, dependencies: ['listas:read'] });
  });

  it('la revisión de precios pertenece a gestión de listas, no a un hijo comercial', () => {
    expect(getPackageTemplate('gestion-listas-precios')?.selections.some((sel) => sel.actionId === 'prices:preview')).toBe(true);
    for (const id of ['vendedor', 'supervisor-comercial', 'gestion-comercial']) {
      expect(getPackageTemplate(id)?.selections.some((sel) => sel.actionId === 'prices:preview')).toBe(false);
    }
  });
});
