# Espacio personal del vendedor

Fecha: 2026-10-05. Servidor: srv-soporte. Checkout: /home/soporte/office_ai/grupo-security-office.
Estado: base implementada en código y validada con pruebas/fixtures; sin despliegue, commits ni push.

El vendedor entra a /sales y encuentra su inicio, sus clientes y sus cotizaciones, con acceso al catálogo publicado como herramienta de consulta. El panel administrativo redirige al vendedor a /sales antes de montar Header, AdminLayout o CommercialLayout. Clientes y cotizaciones se limitan en el servidor al propietario autenticado, incluso si existe una relación de subordinados. El vendedor no puede crear una cotización para un cliente ajeno ni cambiar el propietario de un cliente.

Esta separación aplica a Vendedor sin Super Admin, Supervisor o Admin Comercial. Una persona con uno de esos roles de gestión adicional mantiene el espacio y alcance de gestión otorgado explícitamente. Los demás roles conservan su comportamiento actual y requieren sus propias tareas.

## Validación

- Frontend: vitest run src/lib/workspace.spec.ts src/features/sales/SalesLayout.spec.tsx — 2 archivos, 10 pruebas aprobadas.
- Backend: jest --runInBand src/modules/commercial/customers/customers.service.spec.ts src/modules/commercial/quotes/quotes.service.spec.ts — 2 suites, 35 pruebas aprobadas.
- ESLint de los 16 archivos de esta tarea — aprobado, sin errores.
- Backend: tsc --noEmit --incremental false -p tsconfig.build.json — aprobado.
- Frontend: vite build --outDir /tmp/codex-seller-build-01a10d04 — aprobado. No despliega artefactos.
- Frontend: tsc --noEmit --incremental false — bloqueado por tipos implícitos ausentes (babel__generator, babel__template, babel__traverse, deep-eql y prop-types), detectados antes del cambio.
- Frontend: tsc --noEmit --incremental false --types vite/client — seis errores en Header.tsx, audit-format.ts y AuditPage.tsx, archivos ajenos a esta tarea. No hay errores reportados en los archivos del vendedor.
- Typecheck completo backend: tres errores preexistentes en import-biblioteca.logic.spec.ts, detectados antes del cambio. La configuración de build del backend pasa.
- Navegador con App y estilos reales, sesión y datos ficticios y un adaptador de API en memoria: /commercial/settings redirige a /sales; navegación a clientes, cotizaciones y detalle mantiene /sales; el asistente de creación devuelve al detalle personal. Consola: 0 errores. No se conectó al backend ni se usaron usuarios/datos reales.
- Comando para reproducir el bundle de fixtures: node /tmp/build-seller-preview-01a10d04.mjs desde src/frontend. El script elimina sus entradas temporales al terminar.
- Vista de revisión local: http://127.0.0.1:8768/sales. Evidencia: vendedor-espacio.jpg en los artefactos locales de esta conversación.

## Siguiente tarea concreta

Completar la selección de tarifa autorizada al crear una cotización. El asistente existente selecciona listaId pero no envía priceListId; QuotesService.addItem exige priceListId y actualmente bloquea agregar productos a esas cotizaciones. La navegación probada con fixtures no demuestra el flujo de precios/productos contra el backend real. La siguiente tarea debe resolver ese contrato y verificar creación, selección de productos y totales usando precios autorizados, antes de considerar utilizable el flujo completo de venta.

Las metas, seguimientos y solicitudes de excepción siguen pendientes. No se cambiaron permisos de los otros roles, ni políticas de descuento, ni precios, ni datos de producción.

## Unidades de revisión y reversión

El cambio de código contiene 386 adiciones y 32 eliminaciones (418 líneas autorales), comparadas con el estado inicial de esta tarea, que ya tenía cambios ajenos. Se divide para revisión en dos comportamientos coherentes:

1. Cartera personal protegida en API: helper de vendedor, servicios de clientes/cotizaciones y sus pruebas. Puede revisarse/revertirse sin tocar la navegación.
2. Espacio independiente del vendedor: política de rutas, layout/inicio, variantes personales de los componentes compartidos y pruebas. Puede revisarse/revertirse sin modificar las restricciones del servidor.

El manifiesto de respaldo seller-workspace-change.json y los parches de revisión se conservan en C:/Users/sopor/.codex/visualizations/2026/10/05/01a10d04-af1e-75f0-81e3-971efe232306. Copia inicial remota: /tmp/codex-seller-workspace-01a10d04.json.

Para revertir únicamente esta tarea, comprobar primero que cada archivo coincide con el contenido final del manifiesto; restaurar el contenido inicial de los archivos que figuran en originals y quitar únicamente los nuevos archivos de files sin original. Si hay modificaciones posteriores, revertir por diferencias para conservarlas. La matriz y este registro se revierten aparte; nunca usar git reset ni restaurar todo el checkout.

Archivos exactos de código y pruebas:
- src/frontend/src/lib/roles.ts
- src/frontend/src/lib/workspace.ts
- src/frontend/src/App.tsx
- src/frontend/src/pages/CustomersPage.tsx
- src/frontend/src/pages/QuotesPage.tsx
- src/frontend/src/pages/QuoteDetailPage.tsx
- src/frontend/src/features/quotes/components/QuoteBuilderModal.tsx
- src/frontend/src/features/sales/SalesLayout.tsx
- src/frontend/src/features/sales/SalesHomePage.tsx
- src/frontend/src/lib/workspace.spec.ts
- src/backend/src/common/rbac/personal-seller.ts
- src/backend/src/modules/commercial/customers/customers.service.ts
- src/backend/src/modules/commercial/quotes/quotes.service.ts
- src/backend/src/modules/commercial/customers/customers.service.spec.ts
- src/backend/src/modules/commercial/quotes/quotes.service.spec.ts
- src/frontend/src/features/sales/SalesLayout.spec.tsx

## Evidencia y estado del proyecto

La matriz en docs/UI/matriz-roles-pantallas-propuesta-2026-10-05.html se ajustó para dejar al vendedor fuera de las pantallas administrativas de Comercial. Los demás roles siguen como propuesta, no como funcionalidades implementadas.

No se crearon commits ni se cambió la rama feat/storefront-public-pricing. La autorización humana sigue siendo necesaria para commits/push y despliegue a producción.

