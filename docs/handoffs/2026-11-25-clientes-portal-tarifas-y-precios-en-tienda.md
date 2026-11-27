# Clientes del portal: panel del empleado, tarifas y precios en la tienda

- **Fecha** 25 de noviembre de 2026
- **Rutas** `/customer-accounts` (panel), `/catalogo`, ficha de producto, inicio de la tienda
- **Estado** `respondido`: código, pruebas y prueba en navegador listos en esta rama; falta la aprobación para hacer commits.

## 1. Pantalla en blanco de `/customer-accounts`

**Causa.** La página pedía `GET /api/prices/lists` y trataba la respuesta como una lista, pero el API la devuelve dentro de `{ "data": [...] }`. Al pintar el selector de tarifas fallaba `lists.data.filter` y React dejaba la pantalla en blanco.

**Arreglo.** Las lecturas del panel pasan por `fetchAdminAccounts`, `fetchAdminTiers`, `fetchAdminPriceLists` y `fetchAdminPriceMappings` (`src/frontend/src/services/customer-portal.service.ts`), que aceptan lista directa o `{ data }` y siempre entregan una lista. Prueba: `customer-portal.service.spec.ts` y `portal-accounts-admin.spec.tsx`.

## 2. Flujo del empleado

Lo que ve la persona (solo Super Admin, como antes):

- Lista de cuentas con estado, tarifa que recibe, cliente vinculado, búsqueda y filtro por estado. Las cuentas pendientes llegan abiertas.
- «Gestionar» cada cuenta: elegir su tarifa (nivel) y guardarla; buscar y vincular un cliente registrado (o quitar el vínculo); suspender con motivo; reactivar; aprobar o rechazar si la cuenta está pendiente.
- «Tarifa general»: la que ven los clientes sin nivel propio. Sin ella verán «Consultar precio».
- Crear y editar niveles de tarifa (antes «escalafones»).

Hoy toda cuenta nueva (correo o Google) nace **Activa** como cliente final, así que la cola de aprobar/rechazar solo se llena si en el futuro se vuelve a pedir revisión. Está implementada y probada, pero hoy no aparecerá ninguna cuenta pendiente.

**Contrato nuevo (backend, sin cambio de esquema):**

| Ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/customer-portal/admin/accounts` | Super Admin | Ahora incluye `customerId` y `customer {id, code, name}` |
| `PATCH /api/customer-portal/admin/accounts/:id/customer` | Super Admin | Cuerpo `{ "customerId": "<uuid>" \| null }`. Vincula o desvincula; exige cliente activo; deja registro de auditoría |

Los permisos los impone el servidor (`JwtAuthGuard` + `RolesGuard`, `Super Admin`); el frontend solo oculta o muestra. Los botones que antes usaban la sesión del cliente (`approve`/`reject`) ahora usan la sesión del panel.

Diferencia a revisar: la búsqueda de clientes usa `GET /api/commercial/customers`, que sigue sus propios permisos. Un Super Admin la ve completa.

## 3. Catálogo propio del portal eliminado; precios en la tienda

- Se eliminaron las páginas `ClientCatalogPage`, `PortalProductDetailPage`, `CatalogPage`, `CatalogViews`, el hook `useCatalog` y las funciones `fetch*Catalog*` del servicio. `/clientes/productos` y `/clientes/productos/...` redirigen a `/catalogo`. Los enlaces de «Mi cuenta» apuntan a `/catalogo`.
- Nuevo endpoint `GET /api/customer-portal/customer/catalog/prices?ids=a,b,c` (hasta 50; 400 si está vacío o pasa de 50). Requiere sesión de cliente con perfil completo. Responde `{ "data": { "prices": [{ "productId", "value", "currency" }] } }` con `Cache-Control: private, no-store` y `Vary: Cookie`. Solo incluye referencias publicadas y visibles con precio vigente en la tarifa del cliente (nivel o tarifa general). Un nivel inactivo o la falta de tarifa devuelven lista vacía, nunca un precio inventado. El servidor calcula todo; el frontend no calcula IVA ni descuentos.
- Tienda: `useAssignedProductPrices` consulta esos precios con la sesión del cliente. Tarjetas (inicio, listados, buscador, categorías) y ficha (incluida la barra móvil) muestran el valor con la leyenda «Tu tarifa». Sin sesión, con perfil incompleto o sin tarifa se mantiene el precio público o «Cotizar». Los datos estructurados para buscadores (JSON-LD) siguen con el precio público.

## 4. Comprobaciones

- Frontend: `npx tsc --noEmit` limpio; `npx vitest run` 165 archivos, 1832 pruebas en verde; `eslint` sin errores en lo tocado (1 aviso de «fast refresh» en `AdminAccountRow.tsx` por exportar `STATE_LABELS`).
- Backend: `npx jest src/modules/customer-portal` 14 suites, 144 pruebas en verde; `npx tsc --noEmit` limpio.
- Navegador (1440 y 390 px, datos ficticios en una base local desechable, sin tocar producción): el panel `/customer-accounts` carga con cuentas, «Tarifa general», niveles y cola de pendientes; vincular un cliente funciona («Cliente vinculado.»). A 390 px no hay scroll horizontal; se corrigió un botón («Guardar tarifa») que se cortaba. Con sesión de cliente (nivel Mayorista) las tarjetas y la ficha muestran el valor del nivel con «Tu tarifa»; sin sesión se ve «Cotizar»; `/clientes/productos/...` redirige a `/catalogo`.
- Fallo encontrado y corregido en la prueba: `customer/catalog/prices` llegaba envuelto dos veces (`data.data.prices`) y la tienda no mostraba el precio. El controlador ahora devuelve el objeto directo y el interceptor global lo envuelve una vez (`{ data: { prices } }`).
- En la ficha, el botón de compra sigue diciendo «Cotizar» aunque haya tarifa: esa acción existía antes y no se cambió.

## 5. Pendientes

- Selector por requisitos (`ParameterRequirements.tsx`): el usuario lo pedirá después. No se tocó.
- Los endpoints del servidor `customer/catalog/products` y `customer/catalog/products/:id` y el `catalog/products` público del portal ya no tienen pantalla que los use. Se dejaron para no ampliar el cambio; se pueden retirar en otra unidad de trabajo.
- `PortalApprovalQueue.tsx` (cola de aprobación antigua) no lo usa nadie; quedó sin tocar.
- Aplicar `requireCompleteProfile` ya está incluido en el endpoint nuevo.
- Entorno: el worktree no tenía `node_modules`; se enlazó el del frontend y se copió el del backend desde otro worktree (Prisma 6.19.3) y se generaron los clientes locales. Nada de esto se versiona.
