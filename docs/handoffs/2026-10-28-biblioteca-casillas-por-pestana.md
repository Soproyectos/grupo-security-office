# Traspaso: Biblioteca con casillas por permiso dentro de cada pestaña

<!-- biblioteca-vigente-20261103 -->
**Referencia operativa vigente.** Para la estructura de cinco pestañas y los pasos actuales de asignación de Biblioteca y estadísticas, consulta la [guía vigente del panel](../biblioteca-dominio/mapa-de-permisos-biblioteca.md#guía-vigente-del-panel-biblioteca). Este traspaso conserva el estado de la entrega original.


- **Tema:** un bloque Biblioteca con Productos / Fichas / Precios y una casilla por permiso (T11)
- **Fecha:** 2026-10-28
- **Pantalla / ruta:** `/users/access` (solo Super Admin); efectos en menú y rutas de Biblioteca
- **Estado:** `respondido`
- **Sesión que lo pide:** decisión del usuario 2026-10-28 (continúa `2026-10-28-biblioteca-tres-pestanas.md`)

## 1. Lo que pide el diseño

**Qué verá y hará la persona que administra:** un único bloque «Biblioteca» con tres secciones. La casilla de cada sección marca o desmarca todas las suyas (estado intermedio si hay parciales); después se afina. Marcar algo marca solo lo que necesita; desmarcar quita lo que dependa de ello. Un solo botón «Guardar Biblioteca» y un resumen de cómo quedará. Quien ya tenía paquetes aparece con las casillas que ya le daban.

**Qué verá la persona con acceso:** solo las pestañas que sus permisos abren (Productos = «Ver productos», Fichas = «Editar fichas», Precios = «Revisar archivo de precios»).

**Acciones y quién puede hacerlas:**

| Acción | Quién puede | Permiso técnico |
|---|---|---|
| Guardar las casillas de Biblioteca de un usuario | Solo Super Admin | `PUT /api/users/:id/access/library` |
| Productos: Ver productos, Ver precios | según casilla | `products:read`, `prices:read` |
| Fichas: Ver, Editar, Validar, Notas internas, Eliminar | según casilla | `products:read`, `products:write`, `products:validate`, `products:notes`, `products:delete` |
| Precios: Ver precios, Revisar archivo, Guardar revisión, Aplicar, Ver/Editar perfiles de proveedor | según casilla | `prices:read`, `prices:preview`, `prices:save`, `prices:apply`, `providers:read`, `providers:write` |
| Publicar en tienda | complemento aparte (paquete `biblioteca-publicacion`) | `products:publish` (no entra en las casillas) |

**Restricciones:** sin migración ni cambio de esquema; catálogo sin cambios (`ACCESS_CATALOG_VERSION` sigue en `panels-20261028-2`).

## 2. Respuesta de funcionalidad

**Contrato:**

- Método y ruta: `PUT /api/users/:id/access/library` (solo Super Admin, `@Roles('Super Admin')` + identidad viva igual que `PUT /users/:id/access`).
- Request: `{ actionIds: string[], expectedVersion: number, expectedCatalogVersion?: string, idempotencyKey?: string, reason?: string }`. `actionIds` vacío = retirar todo Biblioteca.
- Response: el mismo recibo de las demás operaciones de accesos.

```json
// Request
{ "actionIds": ["products:read", "products:write", "prices:read", "prices:preview", "prices:save"], "expectedVersion": 4, "expectedCatalogVersion": "panels-20261028-2" }
// Response 200 (el servidor añadió las dependencias que faltaran)
{
  "userId": "u-123", "sourceId": "src-9", "accessVersion": 5, "changed": true,
  "grants": [
    { "sourceId": "src-9", "actionId": "products:read", "scope": "global" },
    { "sourceId": "src-9", "actionId": "prices:read", "scope": "global" },
    { "sourceId": "src-9", "actionId": "products:write", "scope": "global" },
    { "sourceId": "src-9", "actionId": "prices:preview", "scope": "global" },
    { "sourceId": "src-9", "actionId": "prices:save", "scope": "global" }
  ]
}
```

`GET /api/users/:id/access` no cambia: ya devuelve `grants` (con `sourceId`) y `sources` (con `templateId`); con eso el frontend pinta las casillas y distingue el complemento.

**Reglas del servidor** (`AccessAssignmentsService.replaceLibrarySelection`, `common/security/library-selection.ts`):
- Solo estas 11 acciones: `products:read|write|validate|notes|delete`, `prices:read|preview|save|apply`, `providers:read|write`. Cualquier otra (incluida `products:publish`) → 400.
- El servidor calcula el cierre de dependencias del catálogo; el cliente no decide. Nunca concede más que lo marcado más sus dependencias. Alcance siempre `global`.
- En una sola transacción (con la versión OCC): reemplaza la fuente de selección, **elimina** las fuentes de los paquetes Productos / Fichas / Precios / Actualización (anterior) y purga los permisos de Biblioteca de fuentes manuales y de paquetes anteriores (`gestion-listas-precios`, `biblioteca-productos`, `publicacion-catalogo`). Los permisos comerciales y el complemento `biblioteca-publicacion` no se tocan.
- Si hay «Publicar en tienda» y la selección no incluye `products:write` → 400.
- Auditoría: `AuditLog` acción `replaceLibrarySelection` (antes/después, paquetes reemplazados, cantidad purgada) y `AccessOperation` con idempotencia, igual que las otras operaciones.

**Decisión de almacenamiento:** una fuente por usuario, `kind: 'template'`, `templateId: 'biblioteca-seleccion'` (id reservado, **no** está en `PACKAGE_TEMPLATES`), con las concesiones guardadas como `AccessGrant` globales. No hay tabla ni columna nueva. `biblioteca-seleccion` se añadió a `CURRENT_LIBRARY_PACKAGE_IDS`, así que cuenta como fuente vigente: no se purga al aplicar/retirar otros paquetes, y satisface la dependencia de `products:write` del complemento. `DELETE /users/:id/access/packages/biblioteca-seleccion` también funciona (retira y purga anteriores). Alternativa descartada: una fuente por pestaña (más filas, ambigüedad en permisos compartidos como `products:read`).

**Errores** (código estable + mensaje en español):

| Código | Mensaje |
|---|---|
| 400 | La selección incluye permisos que no pertenecen a las pestañas de Biblioteca. Publicar en tienda se asigna aparte. |
| 400 | Quita primero Publicar en tienda: necesita poder editar fichas. |
| 400 | (validación del cuerpo: `actionIds` ausente/no lista, `expectedVersion` negativa) |
| 403 | Sólo Super Admin puede administrar concesiones por acción… |
| 409 `access-version-conflict` | Las concesiones de este usuario cambiaron mientras se editaban; recargue y reintente. |
| 409 `catalog-version-conflict` | El navegador trae un catálogo desactualizado; recargue la pantalla. |

**Consumidores afectados:**
- `features/users/access.ts`: `hasAssignedLibraryPanel` ahora acepta también la selección (fuente `biblioteca-seleccion`); recibe `sources`. Afecta `AccessBoundary` (`App.tsx`), `usePanelAccess` (menú, `CommercialLayout`, `Header`) y `firstAssignedLibraryPath`.
- `UserAccessAssignments.tsx` (bloque nuevo `LibraryPermissionsBlock.tsx`, `library-permissions.ts`), `services/users.service.ts`.
- Backend: `users.controller.ts` (ruta nueva), `access-assignments.service.ts`. Nada cambia en `auth`/`acl`/guards: leen los `AccessGrant`, sea cual sea la fuente.

**Permisos que aplica el servidor:** el endpoint exige Super Admin. Las acciones se aplican como siempre por `AccessGrant` global; el permiso del servidor para cada acción coincide con el que usa la interfaz para mostrar la pestaña.

**Pruebas ejecutadas** (`src/backend`, `src/frontend`):
- `npx tsc --noEmit` (backend): 17 errores, los mismos previos de `modules/prices/**` y `products.service.spec`; ninguno nuevo.
- `npx jest --runInBand` de `common/security` (sin `access-assignments.service.spec`), `users.controller.access`, `auth.library-permissions`, `products.biblioteca-grants`: 282 pasan, 12 fallan. Los 3 de publicación ya fallaban antes (2 en `products.biblioteca-grants`, 1 en `auth.library-permissions`); los otros 9 son de `catalog-resource-access.spec` y `data-scope.spec` (alcance por lista de productos), archivos que esta tarea no toca. Nuevas: `access-assignments.library-selection.spec.ts` (12 pasan) y 5 en `users.controller.access.spec.ts`.
- `npx tsc --noEmit` (frontend): sin errores. `npx vitest run`: 111 archivos, 1147 pruebas pasan.

**Lo que NO se hizo:**
- `access-assignments.service.spec.ts` (usa base real): no se ejecutó; no se modificó porque los cambios solo añaden código.
- No se probó contra una base real ni en navegador (ver sección 3).

**Aprobaciones pendientes del usuario:** ninguna de esquema o migración. Commit/push siguen sin autorizar.

## 3. Integración

**Qué se conectó:** bloque «Biblioteca» en `/users/access` (reemplaza los botones de paquetes Productos/Fichas/Precios/Actualización); complemento «Publicar en tienda» como sección aparte (habilitado solo si «Editar fichas» ya está guardado); gating de menú y rutas por permisos reales.

**Validación hecha:** `tsc --noEmit` y `vitest` completos (arriba). Estados: reposo/hover/focus-visible/disabled/cargando («Guardando…»)/error (aviso con el texto del servidor). Casillas y botones `min-h-11` (44px) en móvil; las secciones se apilan en una columna en móvil y van en tres columnas desde `md`.

**Pendientes:**
- Revisión visual a 375px y ~1440px (no se pudo ejecutar la app) y checklist-ux manual.
- Prueba contra PostgreSQL real de `replaceLibrarySelection` y de `access-assignments.service.spec`.
- Duda de producto: la sección Precios con solo «Revisar archivo de precios» no incluye «Ver productos»; el paquete Precios anterior sí lo incluía. Se siguió la lista aprobada.
