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
export const ACCESS_CATALOG_VERSION = 'panels-20261127-1';

const ACTION_ID_PATTERN = /^[a-z][A-Za-z0-9]*:[a-z][A-Za-z0-9-]*$/;

/** Formato `apartado:acción`; los IDs con punto del UA y los permisos
 * legacy de tres segmentos (`dashboard:pack:ventas`) no son acciones. */
export function isActionIdFormat(id: string): boolean {
  return ACTION_ID_PATTERN.test(id);
}

/**
 * Data with an owner, an author or a team relation (customers, quotes, targets,
 * portal accounts, agenda, notices, team summary, reassignments): the three
 * levels mean something and the server enforces each one. `own` = what the
 * person owns or created; `team` = the person and their reporting team;
 * `global` = everything.
 */
const COMMERCIAL_SCOPES: readonly AccessScope[] = ['own', 'team', 'global'];
/**
 * Shared data with no owner (products, prices, imports, master catalogs,
 * providers, banners, library stats). `own` and `team` have no real meaning
 * there, so only `global` is offered. `portalZones:manage` also stays here until
 * zones get an owner (needs a schema change).
 */
const CATALOG_SCOPES: readonly AccessScope[] = ['global'];
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
  // propia). Nadie la tiene por defecto → F1 (COM-03 §8): mientras
  // el coordinador no la conceda explícitamente solo Super Admin puede usarla
  // (excepción EXPLÍCITA del resolver, no un permiso global inventado).
  action('quotes:discount', 'Aplicar descuento', 'Aplicar el descuento porcentual de una línea de cotización.', COMMERCIAL_SCOPES, ['quotes:edit']),
  action('quotes:status', 'Cambiar estado', 'Mover una cotización por transiciones legales.', COMMERCIAL_SCOPES, ['quotes:read']),
  // Portal de clientes: estados e historial de cotizaciones, con el alcance concedido.
  action('quotes:history', 'Ver historial de cotizaciones', 'Ver los estados y el historial de cada cotización en el alcance concedido.', COMMERCIAL_SCOPES, ['quotes:read']),
  // Portal de clientes: cuentas web registradas. «Propio» = el asesor es la persona o es dueña del cliente vinculado.
  action('portalAccounts:read', 'Ver cuentas del portal', 'Ver los registros y cuentas web de clientes en el alcance concedido.', COMMERCIAL_SCOPES),
  action('portalAccounts:assign', 'Asignar asesor del portal', 'Asignar o reasignar el asesor de una cuenta web (y de su cliente vinculado).', COMMERCIAL_SCOPES, ['portalAccounts:read']),
  action('portalAccounts:manage', 'Gestionar cuentas del portal', 'Vincular cliente, asignar tarifa, activar, rechazar, suspender y reactivar cuentas web.', COMMERCIAL_SCOPES, ['portalAccounts:read']),
  action('portalZones:manage', 'Gestionar zonas de asesores', 'Crear, editar, activar y eliminar las zonas que reparten los registros nuevos entre asesores.', CATALOG_SCOPES, ['portalAccounts:read']),
  // Tarifa general y niveles de clientes del portal (global: son datos de la empresa, sin dueño).
  action('portalTariffs:manage', 'Gestionar tarifa general y niveles', 'Elegir la tarifa general de la tienda y crear o editar los niveles de clientes con su tarifa.', CATALOG_SCOPES, ['portalAccounts:read']),
  // Pedidos de venta: ver y registrar la factura externa, con el alcance concedido.
  action('salesOrders:read', 'Consultar pedidos', 'Ver los pedidos de venta en el alcance concedido.', COMMERCIAL_SCOPES),
  action('salesOrders:invoice', 'Registrar factura del pedido', 'Anotar el número y la fecha de la factura de un pedido en el alcance concedido.', COMMERCIAL_SCOPES, ['salesOrders:read']),
  // Tienda web: avisos y consultas de clientes, cuentas y ajustes de la tienda (global).
  action('storefront:manage', 'Gestionar la tienda web', 'Ver el resumen de la tienda, cambiar sus ajustes y atender cuentas y consultas de clientes.', CATALOG_SCOPES),
  // Auditoría: quién cambió qué. Biblioteca sigue exigiendo editar fichas con notas.
  action('audit:read', 'Consultar auditoría', 'Ver el registro de cambios de las áreas comerciales. El historial de Biblioteca sigue pidiendo editar fichas con notas internas.', CATALOG_SCOPES),
  action('erpSales:read', 'Consultar ventas ERP', 'Ver ventas y facturas del ERP.', COMMERCIAL_SCOPES, [], false),
  action('targets:read', 'Consultar metas', 'Ver metas comerciales en el alcance concedido.', COMMERCIAL_SCOPES),
  action('stockRequests:read', 'Consultar pedidos por stock', 'Ver solicitudes por falta de stock.', COMMERCIAL_SCOPES, [], false),
  action('stockRequests:create', 'Crear pedido por stock', 'Abrir solicitud por falta de stock.', COMMERCIAL_SCOPES, [], false),
  action('stockRequests:edit', 'Editar pedido por stock', 'Modificar cantidades de una solicitud propia.', COMMERCIAL_SCOPES, [], false),
  action('stockRequests:cancel', 'Cancelar pedido por stock', 'Cancelar una solicitud abierta.', COMMERCIAL_SCOPES, [], false),
  // BASE-03 backend-equipo: `team` llega con *-equipo (contrato §4-§5);
  // `own` se conserva de backend-propias.
  action('activities:read', 'Consultar agenda', 'Ver actividades en el alcance concedido.', COMMERCIAL_SCOPES),
  action('activities:create', 'Crear actividad', 'Crear actividad propia o de equipo.', COMMERCIAL_SCOPES),
  action('activities:complete', 'Completar actividad', 'Marcar actividad como terminada.', COMMERCIAL_SCOPES, ['activities:read']),
  action('commercialPromotions:read', 'Consultar avisos internos', 'Ver promociones y avisos internos.', COMMERCIAL_SCOPES),

  // — BASE-02 §3.2 hijo Supervisor comercial —
  action('teamInsights:read', 'Consultar equipo', 'Ver resumen y consulta del equipo (solo lectura).', COMMERCIAL_SCOPES),
  action('activities:assign', 'Asignar actividades', 'Asignar trabajo del equipo sin conceder completar ajenas.', COMMERCIAL_SCOPES, ['activities:read']),

  // — BASE-02 §3.3 hijo Gestión comercial —
  action('customers:reassign', 'Reasignar responsable del cliente', 'Cambiar el responsable de un cliente, uno a uno.', COMMERCIAL_SCOPES, ['customers:read']),
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
  action('products:read', 'Consultar productos', 'Consultar Biblioteca con precios y características.', CATALOG_SCOPES),
  action('products:write', 'Editar productos', 'Crear o editar contenido de producto en el alcance.', CATALOG_SCOPES, ['products:read']),
  action('products:delete', 'Eliminar producto', 'Borrar producto físico dentro del alcance.', CATALOG_SCOPES, ['products:read']),
  action('products:publish', 'Publicar producto', 'Ejecutar la transición de publicación. Complemento de la pestaña Fichas: requiere poder editar.', CATALOG_SCOPES, ['products:read', 'products:write']),
  // Aprobar una fila del molde de datos clave de una subcategoría es una decisión editorial aparte:
  // exige poder editar, pero editar no basta. El aprobador queda registrado desde la sesión.
  action('products:approveSpecs', 'Aprobar datos clave', 'Aprobar filas del molde de datos clave de una subcategoría. Complemento de Fichas: requiere poder editar.', CATALOG_SCOPES, ['products:read', 'products:write']),
  // Pestaña Importaciones: ver el historial y bajar la plantilla es distinto de cargar datos.
  action('imports:read', 'Consultar importaciones', 'Ver el historial y los resultados de las importaciones y descargar la plantilla.', CATALOG_SCOPES, ['products:read']),
  action('imports:run', 'Importar datos', 'Subir, validar, previsualizar y aplicar importaciones. Requiere poder editar fichas.', CATALOG_SCOPES, ['imports:read', 'products:write']),
  // Pestaña Catálogos maestros: categorías, subcategorías, marcas, aranceles, diccionario de
  // atributos y moldes. Aprobar moldes sigue siendo `products:approveSpecs`, nunca implícito aquí.
  action('masters:read', 'Consultar catálogos maestros', 'Listar, buscar y ver el uso de los catálogos maestros.', CATALOG_SCOPES, ['products:read']),
  action('masters:write', 'Editar catálogos maestros', 'Crear, editar, activar, desactivar y eliminar elementos de los catálogos maestros.', CATALOG_SCOPES, ['masters:read']),
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
  action('prices:read', 'Consultar precios', 'Consultar precios de Biblioteca.', CATALOG_SCOPES),
  action('prices:preview', 'Revisar archivo de precios', 'Comparar una plantilla .xlsx con los precios vigentes SIN aplicar cambios.', CATALOG_SCOPES, ['prices:read']),
  // IMP-04: guardar la revisión comercial preparada (NO aplica). Permiso propio
  // separado de `prices:preview`; `prices:apply` (IMP-05) será otra acción
  // separada, no se inventa aquí.
  action('prices:save', 'Guardar revisión de precios', 'Guardar una revisión de precios preparada SIN aplicar cambios.', CATALOG_SCOPES, ['prices:preview']),
  // IMP-05: aplicar es un permiso SEPARADO de preparar (diseño §35). NO depende
  // de `prices:save` para que quien aprueba y no prepara pueda terminar el
  // trabajo que otro dejó listo. `prices:read` es la base de consulta.
  action('prices:apply', 'Aplicar precios de una revisión', 'Aplicar los precios de una revisión confirmada (solo precios, sin identidad).', CATALOG_SCOPES, ['prices:read']),
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
  // «Mi resumen»: estadísticas de Biblioteca por pestaña. Permiso EXTRA sobre el
  // acceso de la pestaña; apagado por defecto (ningún paquete lo incluye).
  action('libraryStats:products', 'Estadísticas de Productos', 'Ver en «Mi resumen» las cifras de la pestaña Productos.', CATALOG_SCOPES, ['products:read']),
  action('libraryStats:update', 'Estadísticas de Fichas', 'Ver en «Mi resumen» las cifras de la pestaña Fichas.', CATALOG_SCOPES, ['products:write']),
  action('libraryStats:publication', 'Estadísticas de Publicar en tienda', 'Ver en «Mi resumen» las cifras de Publicar en tienda.', CATALOG_SCOPES, ['products:publish']),
  action('users:read', 'Consultar usuarios', 'Ver cuentas internas y sus datos de panel.', ['team', 'global']),
  // Panel «Marketing y mercadeo → Banners» (banner del título y ventana emergente de la tienda).
  // Se conceden por los paquetes `marketing-*` (panel asignable). Preparar y editar no publican.
  action('marketing:read', 'Ver campañas', 'Ver las campañas de la tienda (banner del título y ventana emergente) con su borrador y su estado.', CATALOG_SCOPES),
  action('marketing:create', 'Crear campaña', 'Preparar una campaña nueva como borrador, sin que se vea todavía en la tienda.', CATALOG_SCOPES, ['marketing:read']),
  action('marketing:edit', 'Editar campaña', 'Cambiar el nombre, el enlace, las fechas y las imágenes de una campaña. Los cambios no se ven en la tienda hasta publicarla.', CATALOG_SCOPES, ['marketing:read']),
  action('marketing:publish', 'Publicar y retirar campañas', 'Hacer que una campaña se vea en la tienda o quitarla de allí.', CATALOG_SCOPES, ['marketing:read']),
  action('marketing:delete', 'Eliminar campaña', 'Borrar una campaña que ya no está publicada.', CATALOG_SCOPES, ['marketing:read']),
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

/** Historical permissions remain resolvable, but cannot be assigned again. */
export function isAssignableAction(id: string): boolean {
  return !id.startsWith('listas:') && id !== 'assignments:manage'
    && getActionDefinition(id)?.enabled === true;
}
