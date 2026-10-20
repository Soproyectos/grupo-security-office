/**
 * Catálogo de acciones de la plataforma en formato `apartado:acción`
 * (formato fijado en BASE-02 §3; fuente: catálogo BASE-02 §3.1-§3.3 más los
 * IDs anclados reales de S3 — `@Permissions(...)` y permisos del seed).
 *
 * Los IDs con punto del worktree UA (`commercial.customers.view`) NO se
 * conservan: se remapean a `apartado:acción` (BASE-02 §11 D2, decisión de
 * esta tanda). Las acciones de Catálogo y precios cuyo ID aún no está fijado
 * (validación, exportación completa, historial, aplicación de precios)
 * deliberadamente no aparecen aquí: DISENO-CATALOGO:308 exige IDs estables y
 * matriz de migración antes de habilitarlas.
 *
 * `enabled:false` marca acciones conocidas pero todavía no honrables: están
 * bloqueadas (erpSales:read — Yéminus B1; stockRequests:* — Excel «Pedidos»
 * B2) o su módulo aún no existe (commercialSettings:*). El resolver las
 * deniega siempre (BASE-04 §3, patrón UA access-policy.service.ts:74-76).
 */

export type AccessScope = 'own' | 'team' | 'list' | 'product' | 'global';

export interface ActionDefinition {
  readonly id: string;
  readonly label: string;
  readonly purpose: string;
  readonly allowedScopes: readonly AccessScope[];
  readonly dependencies: readonly string[];
  readonly enabled: boolean;
}

/** Versión del catálogo con la que se resuelve y con la que se asigna (§4). */
export const ACCESS_CATALOG_VERSION = 'panels-20261019-3';

const ACTION_ID_PATTERN = /^[a-z][A-Za-z0-9]*:[a-z][A-Za-z0-9-]*$/;

/** Formato `apartado:acción`; los IDs con punto del UA y los permisos
 * legacy de tres segmentos (`dashboard:pack:ventas`) no son acciones. */
export function isActionIdFormat(id: string): boolean {
  return ACTION_ID_PATTERN.test(id);
}

const COMMERCIAL_SCOPES: readonly AccessScope[] = ['own', 'team', 'global'];
/** Agenda: `own` (backend-propias) + `team` (backend-equipo, §4-§5). */
const AGENDA_SCOPES: readonly AccessScope[] = ['own', 'team'];
const CATALOG_SCOPES: readonly AccessScope[] = ['list', 'product', 'global'];
const LISTA_SCOPES: readonly AccessScope[] = ['list', 'global'];

function action(
  id: string,
  label: string,
  purpose: string,
  allowedScopes: readonly AccessScope[],
  dependencies: readonly string[] = [],
  enabled = true,
): ActionDefinition {
  return Object.freeze({
    id,
    label,
    purpose,
    allowedScopes: Object.freeze([...allowedScopes]),
    dependencies: Object.freeze([...dependencies]),
    enabled,
  });
}

export const ACCESS_CATALOG: readonly ActionDefinition[] = Object.freeze([
  // — BASE-02 §3.1 Comercial / hijo Vendedor —
  action('customers:read', 'Consultar clientes', 'Ver clientes y prospectos en el alcance concedido.', COMMERCIAL_SCOPES),
  action('customers:create', 'Crear cliente', 'Crear cliente con propietario autorizado.', COMMERCIAL_SCOPES),
  action('customers:edit', 'Editar cliente', 'Editar cliente sin ampliar propietario ni equipo.', COMMERCIAL_SCOPES, ['customers:read']),
  action('quotes:read', 'Consultar cotizaciones', 'Ver cotizaciones en el alcance concedido.', COMMERCIAL_SCOPES),
  action('quotes:create', 'Crear cotización', 'Crear cotización sobre un cliente autorizado.', COMMERCIAL_SCOPES, ['customers:read']),
  action('quotes:edit', 'Editar cotización', 'Editar líneas y datos de una cotización editable.', COMMERCIAL_SCOPES, ['quotes:read']),
  // COM-03 §3 (DISENO:189 «Descuentos de cotización: quotes:discount, además de
  // edición de la cotización»): operación SENSIBLE separada de `quotes:edit`.
  // Dependencia `quotes:edit` (el resolver la exige además de la concesión
  // propia). Ningún `PACKAGE_TEMPLATES` la asigna → F1 (COM-03 §8): mientras
  // el coordinador no la conceda explícitamente solo Super Admin puede usarla
  // (excepción EXPLÍCITA del resolver, no un permiso global inventado).
  action('quotes:discount', 'Aplicar descuento', 'Aplicar el descuento porcentual de una línea de cotización.', COMMERCIAL_SCOPES, ['quotes:edit']),
  action('quotes:status', 'Cambiar estado', 'Mover una cotización por transiciones legales.', COMMERCIAL_SCOPES, ['quotes:read']),
  action('erpSales:read', 'Consultar ventas ERP', 'Ver ventas y facturas del ERP.', COMMERCIAL_SCOPES, [], false),
  action('targets:read', 'Consultar metas', 'Ver metas comerciales en el alcance concedido.', COMMERCIAL_SCOPES),
  action('stockRequests:read', 'Consultar pedidos por stock', 'Ver solicitudes por falta de stock.', COMMERCIAL_SCOPES, [], false),
  action('stockRequests:create', 'Crear pedido por stock', 'Abrir solicitud por falta de stock.', COMMERCIAL_SCOPES, [], false),
  action('stockRequests:edit', 'Editar pedido por stock', 'Modificar cantidades de una solicitud propia.', COMMERCIAL_SCOPES, [], false),
  action('stockRequests:cancel', 'Cancelar pedido por stock', 'Cancelar una solicitud abierta.', COMMERCIAL_SCOPES, [], false),
  // BASE-03 backend-equipo: `team` llega con *-equipo (contrato §4-§5);
  // `own` se conserva de backend-propias.
  action('activities:read', 'Consultar agenda', 'Ver actividades en el alcance concedido.', AGENDA_SCOPES),
  action('activities:create', 'Crear actividad', 'Crear actividad propia o de equipo.', AGENDA_SCOPES),
  action('activities:complete', 'Completar actividad', 'Marcar actividad como terminada.', COMMERCIAL_SCOPES, ['activities:read']),
  action('commercialPromotions:read', 'Consultar avisos internos', 'Ver promociones y avisos internos.', COMMERCIAL_SCOPES),

  // — BASE-02 §3.2 hijo Supervisor comercial —
  action('teamInsights:read', 'Consultar equipo', 'Ver resumen y consulta del equipo (solo lectura).', ['team', 'global']),
  action('activities:assign', 'Asignar actividades', 'Asignar trabajo del equipo sin conceder completar ajenas.', ['team', 'global'], ['activities:read']),

  // — BASE-02 §3.3 hijo Gestión comercial —
  action('customers:reassign', 'Reasignar cartera', 'Cambiar responsable de clientes del equipo.', ['team', 'global'], ['customers:read']),
  action('targets:edit', 'Editar metas', 'Crear o actualizar metas de objetivos.', COMMERCIAL_SCOPES, ['targets:read']),
  action('commercialPromotions:create', 'Crear aviso', 'Preparar aviso interno nuevo.', COMMERCIAL_SCOPES, ['commercialPromotions:read']),
  action('commercialPromotions:edit', 'Editar aviso', 'Modificar un aviso sin publicarlo.', COMMERCIAL_SCOPES, ['commercialPromotions:read']),
  action('commercialPromotions:publish', 'Publicar aviso', 'Publicar aviso interno de forma explícita.', COMMERCIAL_SCOPES, ['commercialPromotions:read']),
  action('commercialPromotions:withdraw', 'Retirar aviso', 'Retirar un aviso publicado.', COMMERCIAL_SCOPES, ['commercialPromotions:read']),
  action('stockRequests:import', 'Importar pedidos (Excel)', 'Importar el Excel «Pedidos» saneado.', COMMERCIAL_SCOPES, [], false),
  action('stockRequests:export', 'Exportar pedidos', 'Exportar solicitudes autorizadas.', COMMERCIAL_SCOPES, [], false),
  action('commercialSettings:read', 'Consultar parámetros comerciales', 'Ver parámetros del área comercial.', COMMERCIAL_SCOPES, [], false),
  action('commercialSettings:edit', 'Editar parámetros comerciales', 'Modificar parámetros del área comercial.', COMMERCIAL_SCOPES, [], false),

  // — IDs anclados reales de S3 (BASE-02 §3; @Permissions + seed) —
  action('products:read', 'Consultar productos', 'Ver productos sin precios implícitos.', CATALOG_SCOPES),
  action('products:write', 'Editar productos', 'Crear o editar contenido de producto en el alcance.', CATALOG_SCOPES, ['products:read']),
  action('products:delete', 'Eliminar producto', 'Borrar producto físico dentro del alcance.', CATALOG_SCOPES, ['products:read']),
  action('products:publish', 'Publicar producto', 'Ejecutar la transición de publicación.', CATALOG_SCOPES, ['products:read']),
  // CAT-03 (D2): las notas internas de la ficha NO se publican ni salen en la
  // exportación ordinaria; leerlas/editarlas exige esta acción. No habilita por
  // sí sola editar el resto de la ficha (`products:write`).
  action('products:notes', 'Notas internas de la ficha', 'Leer y editar las notas internas de la ficha (nunca públicas).', CATALOG_SCOPES, ['products:read']),
  // CAT-05 (§3.4): un solo motor, varios puntos de entrada. HABILITADA porque
  // tiene consumidor real inmediato (endpoints de validación individual/batch).
  action('products:validate', 'Validar ficha', 'Ejecutar el motor de validación y consultar el informe (por alcance).', CATALOG_SCOPES, ['products:read']),
  action('products:export', 'Exportar Biblioteca', 'Descargar los datos y medios autorizados de la Biblioteca.', CATALOG_SCOPES, ['products:read'], false),
  action('products:import', 'Importar Biblioteca', 'Revisar y recuperar un paquete como borradores, sin publicar.', CATALOG_SCOPES, ['products:write'], false),
  // BASE-03 backend-vinculos (contrato §6.3): `listas:read` es la acción con
  // la que se decide si el detalle de un recurso enlazado a una actividad se
  // REVELA al leerlo. No existía (el catálogo sólo tenía acciones de escritura
  // de lista); se añade con alcance `list|global` y SIN dependencias: no se
  // tocan las acciones de escritura existentes (habilitar sus dependencias
  // exigiría migrar concesiones ya emitidas — queda en COM-01/D5).
  action('listas:read', 'Consultar listas', 'Ver Listas y el detalle de los recursos enlazados que dependen de ellas.', LISTA_SCOPES),
  action('listas:create', 'Crear lista', 'Crear una Lista inactiva.', ['global']),
  action('listas:update', 'Editar lista', 'Modificar configuración de Lista en el alcance.', LISTA_SCOPES),
  action('listas:duplicate', 'Duplicar lista', 'Copiar una Lista autorizada.', LISTA_SCOPES),
  action('listas:import', 'Importar a lista', 'Previsualizar y aplicar importaciones en Lista.', LISTA_SCOPES),
  action('listas:archive', 'Archivar lista', 'Archivar una Lista en el alcance.', LISTA_SCOPES),
  action('listas:delete', 'Eliminar lista', 'Eliminar físicamente una Lista autorizada.', LISTA_SCOPES),
  action('listas:publish', 'Publicar lista', 'Publicar productos elegibles de una Lista.', LISTA_SCOPES),
  // IMP-01 integrado 2026-10-16 (LEEME): preview de precios de Compras.
  // Sin asignación en ningún paquete todavía (misma decisión F1 que quotes:discount).
  action('prices:read', 'Consultar precios', 'Ver precios de las Listas autorizadas.', LISTA_SCOPES, ['listas:read']),
  action('prices:preview', 'Revisar archivo de precios', 'Comparar una plantilla .xlsx con los precios vigentes SIN aplicar cambios.', LISTA_SCOPES, ['prices:read', 'listas:read']),
  // IMP-04: guardar la revisión comercial preparada (NO aplica). Permiso propio
  // separado de `prices:preview`; `prices:apply` (IMP-05) será otra acción
  // separada, no se inventa aquí.
  action('prices:save', 'Guardar revisión de precios', 'Guardar una revisión de precios preparada SIN aplicar cambios.', LISTA_SCOPES, ['prices:preview']),
  // IMP-05: aplicar es un permiso SEPARADO de preparar (diseño §35). NO depende
  // de `prices:save` para que quien aprueba y no prepara pueda terminar el
  // trabajo que otro dejó listo. `prices:read` es la base de consulta.
  action('prices:apply', 'Aplicar precios de una revisión', 'Aplicar los precios de una revisión confirmada (solo precios, sin identidad).', LISTA_SCOPES, ['prices:read']),
  // IMP-07B (07B): perfiles de proveedor reutilizables. Globales (el formato de
  // un proveedor se reutiliza entre listas); `providers:write` NO habilita por
  // sí solo previsualizar/guardar/aplicar, que conservan sus propias acciones.
  action('providers:read', 'Consultar perfiles de proveedor', 'Ver perfiles de proveedor y sus equivalencias.', ['global']),
  action('providers:write', 'Editar perfiles de proveedor', 'Crear, revisar o retirar perfiles de proveedor y equivalencias.', ['global'], ['providers:read']),
  // CAT-01 §4: unlink tiene endpoint existente y permiso propio; link sigue
  // deshabilitado porque aún no existe una operación equivalente.
  action('listas:link', 'Vincular producto a lista', 'Vincular un producto sin Lista a una Lista autorizada.', LISTA_SCOPES, ['listas:read'], false),
  action('listas:unlink', 'Desvincular producto de lista', 'Retirar un producto de su Lista conservando ficha, medios y precios.', LISTA_SCOPES, ['listas:read']),
  action('assignments:manage', 'Administrar asignaciones', 'Gestionar niveles de acceso por Lista.', LISTA_SCOPES),
  action('users:read', 'Consultar usuarios', 'Ver cuentas internas y sus datos de panel.', ['team', 'global']),
]);

const CATALOG_BY_ID: ReadonlyMap<string, ActionDefinition> = (() => {
  const map = new Map<string, ActionDefinition>();
  for (const definition of ACCESS_CATALOG) {
    if (!isActionIdFormat(definition.id)) {
      throw new Error(`Invalid access action id: ${definition.id}`);
    }
    if (map.has(definition.id)) {
      throw new Error(`Duplicate access action: ${definition.id}`);
    }
    map.set(definition.id, definition);
  }
  return map;
})();

export function getActionDefinition(id: string): ActionDefinition | undefined {
  return CATALOG_BY_ID.get(id);
}

/**
 * COM-01 §3 — paquete de trabajo: `{ id, nombre, catalogVersion, selections }`
 * donde cada selección es una concreción `{ actionId, scope, resourceId? }`
 * del catálogo. Paquete ≠ rol (ficha regla 1): es una preselección que Super
 * Admin revisa casilla a casilla antes de guardar; su aplicación es
 * idempotente y no migra cuentas existentes por silencio (E2 resuelta como
 * mapa constante en el catálogo — los writePaths de esta ficha no añaden
 * tabla AccessPackage).
 */
export interface AssignmentSelection {
  readonly actionId: string;
  readonly scope: AccessScope;
  readonly resourceId?: string;
}

export interface PackageTemplate {
  readonly id: string;
  readonly name: string;
  readonly catalogVersion: string;
  readonly selections: readonly AssignmentSelection[];
}

function selection(actionId: string, scope: AccessScope): AssignmentSelection {
  return Object.freeze({ actionId, scope });
}

function packageTemplate(
  id: string,
  name: string,
  selections: readonly AssignmentSelection[],
): PackageTemplate {
  return Object.freeze({
    id,
    name,
    catalogVersion: ACCESS_CATALOG_VERSION,
    selections: Object.freeze([...selections]),
  });
}

/**
 * Los tres paquetes de COM-01 §3.1, con sus acciones y alcances LITERALES del
 * contrato. Solo acciones `enabled:true`: un paquete con acciones bloqueadas
 * (erpSales:read B1, stockRequests:* B2, commercialSettings:* sin módulo,
 * listas:link/unlink C4) produciría 400 de `validateGrants` al aplicarse
 * (COM-01 §11). Donde §3.1 anota un par de alcances (`team/global`) elige el
 * más estrecho; Super Admin lo amplía en la revisión casilla a casilla.
 *
 * - Vendedor: todo `own` («Mis …»); la consulta del catálogo usa `global`
 *   porque `list`/`product` exigen resourceId concreto y el paquete es
 *   estático (E3: `prices:read` no existe en el catálogo, no se inventa).
 * - Supervisor comercial: todo `team` (resumen/consulta del equipo).
 * - Gestión comercial: `team`, con las dependencias `:read` incluidas dentro
 *   de la selección (el paquete se aplica como UNA fuente vía replaceSource;
 *   assertDependencies BASE-02 §5.3 las exigiría igualmente).
 */
export const PACKAGE_TEMPLATES: readonly PackageTemplate[] = Object.freeze([
  packageTemplate('gestion-listas-precios', 'Gestión de listas y precios', [
    selection('listas:read', 'global'),
    selection('listas:create', 'global'),
    selection('listas:update', 'global'),
    selection('listas:archive', 'global'),
    selection('prices:read', 'global'),
    selection('prices:preview', 'global'),
    selection('prices:save', 'global'),
    selection('prices:apply', 'global'),
    selection('providers:read', 'global'),
    selection('providers:write', 'global'),
  ]),
  packageTemplate('biblioteca-productos', 'Biblioteca de productos', [
    selection('products:read', 'global'),
    selection('products:write', 'global'),
    selection('products:validate', 'global'),
  ]),
  packageTemplate('publicacion-catalogo', 'Publicación del catálogo', [
    selection('products:read', 'global'),
    selection('products:validate', 'global'),
    selection('products:publish', 'global'),
    selection('listas:read', 'global'),
  ]),
  packageTemplate('vendedor', 'Vendedor', [
    // Mis clientes y prospectos
    selection('customers:read', 'own'),
    selection('customers:create', 'own'),
    selection('customers:edit', 'own'),
    // Mis cotizaciones
    selection('quotes:read', 'own'),
    selection('quotes:create', 'own'),
    selection('quotes:edit', 'own'),
    selection('quotes:status', 'own'),
    // Consulta del catálogo
    selection('products:read', 'global'),
    selection('listas:read', 'global'),
    // Mi agenda
    selection('activities:read', 'own'),
    selection('activities:create', 'own'),
    selection('activities:complete', 'own'),
    // Metas (lectura)
    selection('targets:read', 'own'),
    // Promociones internas
    selection('commercialPromotions:read', 'own'),
  ]),
  packageTemplate('supervisor-comercial', 'Supervisor comercial', [
    // Resumen/consulta del equipo
    selection('teamInsights:read', 'team'),
    // Clientes y cotizaciones del equipo (lectura no amplía edición)
    selection('customers:read', 'team'),
    selection('quotes:read', 'team'),
    // Agenda del equipo
    selection('activities:read', 'team'),
    selection('activities:assign', 'team'),
    // Metas del equipo
    selection('targets:read', 'team'),
  ]),
  packageTemplate('gestion-comercial', 'Gestión comercial', [
    // Cartera (depende de customers:read)
    selection('customers:read', 'team'),
    selection('customers:reassign', 'team'),
    // Metas (targets:edit depende de targets:read)
    selection('targets:read', 'team'),
    selection('targets:edit', 'team'),
    // Avisos internos (create/edit/publish/withdraw dependen de :read)
    selection('commercialPromotions:read', 'team'),
    selection('commercialPromotions:create', 'team'),
    selection('commercialPromotions:edit', 'team'),
    selection('commercialPromotions:publish', 'team'),
    selection('commercialPromotions:withdraw', 'team'),
  ]),
]);

/** Autochequeo al cargar: un paquete tóxico no arranca el servidor (COM-01 §11). */
for (const pkg of PACKAGE_TEMPLATES) {
  const granted = new Set(pkg.selections.map((s) => s.actionId));
  for (const item of pkg.selections) {
    const definition = CATALOG_BY_ID.get(item.actionId);
    if (!definition) {
      throw new Error(`Package ${pkg.id} references unknown action: ${item.actionId}`);
    }
    if (!definition.enabled) {
      throw new Error(`Package ${pkg.id} references disabled action: ${item.actionId}`);
    }
    if (!definition.allowedScopes.includes(item.scope)) {
      throw new Error(
        `Package ${pkg.id} grants ${item.actionId} with disallowed scope: ${item.scope}`,
      );
    }
    for (const dependency of definition.dependencies) {
      if (!granted.has(dependency)) {
        throw new Error(
          `Package ${pkg.id} is not self-contained: ${item.actionId} requires ${dependency}`,
        );
      }
    }
  }
}

const PACKAGES_BY_ID: ReadonlyMap<string, PackageTemplate> = (() => {
  const map = new Map<string, PackageTemplate>();
  for (const pkg of PACKAGE_TEMPLATES) {
    map.set(pkg.id, pkg);
  }
  return map;
})();

export function getPackageTemplate(id: string): PackageTemplate | undefined {
  return PACKAGES_BY_ID.get(id);
}
