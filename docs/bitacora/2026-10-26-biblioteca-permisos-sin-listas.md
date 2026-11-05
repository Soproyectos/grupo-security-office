# Biblioteca: permisos por panel y retirada visible de Listas

Fecha: 26/10/2026. Rama: `Esnaider/validacion-biblioteca`.

## Alcance confirmado

El usuario pidió completar consulta, edición y publicación mediante asignación de paneles por usuario y retirar Listas de Biblioteca. Confirmó que Super Admin conserva acceso total y que Actualización incluye notas internas. No se borran tablas, relaciones ni historial y no se reasignan usuarios automáticamente. Las fuentes anteriores se mantienen retirables.

La exploración de OpenCode con DeepSeek agotó su cuota y el cambio autorizado a NVIDIA no respondió con suficiente oportunidad. El usuario pidió continuar con Codex y un agente económico. Codex implementó el backend; un agente `gpt-6-luna` implementó el frontend y otro revisó las brechas y correcciones del backend. Las ejecuciones pendientes de OpenCode se cerraron. No hubo implementación de este bloque por OpenCode.

## Cambios de servidor

- Catálogo `panels-20261026-2`: las acciones de Biblioteca/precios solo admiten alcance global; los tres paquetes vigentes conservan consulta, actualización con notas y publicación separadas.
- Los tres paquetes anteriores quedan `assignable:false`. No se pueden aplicar ni recrear por `replaceSource`; la retirada de una fuente anterior no requiere que sus permisos sigan siendo asignables.
- `listas:*` y `assignments:manage` dejan de aparecer entre las nuevas opciones del catálogo de asignación y se rechazan al intentar concederlos. Sus definiciones históricas permanecen para no reescribir datos ni otros dominios.
- El paquete Comercial/Vendedor ya no concede Biblioteca implícitamente en nuevas asignaciones. Los datos de las fuentes antiguas no cambian.
- El perfil de autenticación deriva productos, precios y proveedores únicamente de concesiones globales vigentes con sus dependencias; roles y permisos individuales heredados no reactivan Biblioteca tras una revocación. Super Admin conserva su excepción. Los permisos operativos de otros dominios se preservan.
- Se cerró una vía alternativa de auditoría: el cargo Admin Comercial ya no permite leer historial de Biblioteca por el feed general. Los valores históricos que pueden incluir notas requieren Actualización con notas; no basta con lectura ni con un cargo. La auditoría operativa conserva su control anterior.

## Cambios de interfaz

- Tres accesos seleccionables de Biblioteca. Los paquetes retirados no aplicados se ocultan; los aplicados se presentan como acceso anterior y solo se pueden revocar.
- Se retiran las acciones manuales antiguas de Listas/Biblioteca. Si una fuente manual contiene concesiones que ya no son editables, se bloquea el guardado de ese bloque y se ofrece su retirada explícita, sin eliminarlas silenciosamente al guardar Comercial.
- Navegación y botones de Biblioteca exigen alcance global; Super Admin mantiene el acceso sin una lista explícita de permisos.
- Rutas antiguas de Listas redirigidas a Productos; editor de precios dirigido a Actualización; mensajes y KPI de Listas retirados.
- El acceso propio refresca también el perfil de sesión. La concesión o retirada se refleja al consultar nuevamente el acceso sin re-login. Una respuesta tardía no reemplaza a otra identidad ni revive una sesión cerrada.
- Publicar, retirar y programar exigen Publicación; archivar/restaurar exigen Actualización y eliminar añade su permiso correspondiente. Auditoría solo aparece con edición y notas; los controles de edición de revisión ya no dependen del cargo. Las antiguas asignaciones por Lista también redirigen a Productos; `/users/access` sigue siendo la asignación vigente de paneles.

## Verificación de servidor

Ejecutadas en `src/backend`:

- Jest sobre `auth.service.spec.ts`, `auth.library-permissions.spec.ts`, `access-assignments.library.spec.ts`, `access-catalog.spec.ts`, `users.controller.access.spec.ts`, `products.biblioteca-grants.spec.ts`, `biblioteca-endpoints.grants.spec.ts` y `audit.service.spec.ts`: **228 pruebas, 8 suites, salida 0**. Se usan mocks, sin escrituras en bases.
- ESLint sobre los 14 archivos de backend modificados: **salida 0**.
- `tsc --noEmit --incremental false -p tsconfig.build.json`: **salida 0**.
- `nest build`: **salida 0**.
- `tsc --noEmit --incremental false` completo: sigue fallando con los mismos 16 diagnósticos preexistentes de los specs de importación de escalafones (`PRICE_IMPORT_TARIFFS`, referencias tipadas y firmas anteriores). No se deshabilitaron tests ni se modificaron esos contratos para ocultarlo. Corresponde al bloque de escalafones pendiente.

La revisión económica de los cambios de servidor no encontró fallos confirmados. Esto no equivale a una auditoría exhaustiva de todas las rutas ni a una prueba de navegador.

## Verificación final de interfaz

Coordinador ejecutó en `src/frontend` Vitest sobre `ProductDetailPage.permissions.spec.tsx`, `UserAccessAssignments.spec.tsx`, `App.spec.tsx`, `access.spec.ts`, `rbac.spec.ts`, `AssignedHome.spec.tsx`, `LibraryProductEditorPage.spec.tsx` y `ProductsPage.spec.tsx`: **76 pruebas, 8 archivos, salida 0**. El agente ejecutó `npm run build` (TypeScript y Vite) con salida 0. ESLint dirigido sobre los archivos de interfaz modificados pasó con salida 0. Los tests del detalle usan el componente real `PublishTab` renderizado en SSR y una política de pestañas reutilizada por la página; no se afirma probar clicks con SSR.

La revisión final separó las acciones de publicación y archivo para evitar que Actualización perdiera archivo/restauración o Publicación mostrara esos controles. La batería de 228 pruebas backend se repitió después del ajuste final del paquete Publicación (incluye consulta de precios, sin escritura ni notas) y volvió a pasar.

## Entrega para QA y límites

Backend compilado final en los artefactos locales: `biblioteca-permisos-v2-api.tgz`, SHA-256 **`706E27350A3DD27971B58121D0CE6F84CC453CDA621BB9636E535D6312EBD025`**. Sustituye el paquete preliminar de hash `2613114B…` tras añadir consulta de precios al paquete Publicación. Sin credenciales, datos ni node_modules.

El usuario autorizó expresamente «Sí, actualizar la API de pruebas». Se transfirió el paquete a `/tmp/gs-test-biblioteca-permisos-v2-706e2735.tgz`, se verificó SHA-256 en la VPS, se conservó el código anterior en `/tmp/gs-test-biblioteca-permisos-v2-706e2735/previous-src`, se copió el código con `docker cp` y se reinició exclusivamente `gs-test-demo-api`. No hubo migraciones, semillas, reasignaciones de usuarios, commits ni push en este bloque. El entorno sigue en modo legacy; no realiza corte a biblioteca dedicada.

Comprobaciones reales después del reinicio:

- Catálogo ejecutado en el contenedor: `panels-20261026-2`; tres paquetes vigentes, tres anteriores no asignables y **0 nuevas acciones `listas:*`**.
- Salud a través de `http://127.0.0.1:5173/api/health`: OK, base conectada, entorno development. Productos sin sesión: **401**.
- Conteos antes/después: **5056 productos / 4 usuarios / 52 concesiones**, sin escrituras de usuarios ni asignaciones. Esto no es una comparación completa de contenido.
- `AuthService.getProfile` compilado se ejecutó en un proceso de lectura dentro del contenedor contra los cuatro usuarios de QA, sin emitir tokens ni sesiones ni imprimir identidades. Resultado agregado: dos perfiles con consulta/edición/publicación/notas, uno solo consulta y uno sin accesos de Biblioteca; todos con cero permisos de Listas. No se copiaron secretos al equipo local. La primera impresión de conteos necesitó ajustar la serialización de enteros de PostgreSQL; la comprobación posterior pasó completa.

Frontend local y túnel HTTP siguen corriendo. Pendiente la aceptación completa en navegador con asignación/revocación y los usuarios de prueba; no se crearon ni cambiaron sus credenciales. Las concesiones históricas no se migran automáticamente: para normalizar un usuario se asigna su paquete vigente y se retiran explícitamente sus fuentes anteriores.

## Reversión

### Corrección de pantalla blanca al abrir una ficha

La consulta pública del producto reportado devolvió imágenes con `{ url, alt }`, pero la comparación de fotos publicadas esperaba `src`. Cuando terminaba esa consulta, el render de `ProductPhotosSection` lanzaba `Cannot read properties of undefined (reading 'trim')`. Se alineó `PublishedImageRef` y la comparación con el campo `url` de la API. No se cambiaron permisos ni datos.

La nueva prueba integra `fetchPublishedImages` con `publishedImagesNotice` usando la respuesta realista `{ url, alt }`: falló antes de la corrección y pasó después. Las cuatro suites de servicio de ficha, comparación de fotos, componente real de fotos con consulta cargada y editor pasan (31 pruebas). ESLint dirigido y build TypeScript/Vite pasan; Vite mantiene el aviso de tamaño del bundle. Se verificó por HTTP 200 que el servidor local sirve la comparación corregida `p.url`. La sesión del navegador integrado está sin autenticar, por lo que la aceptación visual con Compras sigue pendiente. El cambio frontend se sirve mediante Vite local, sin despliegue ni reinicio de la API.

La instantánea previa de esta sesión está en el artefacto local `biblioteca-permisos-before.tgz`, SHA-256 `6C76E22BFBC238B286F341C329A5040CB0F3A0159BDED4A7634064BD8060C175`. Comparar y revertir solo el delta de permisos de esta sesión, nunca restaurar archivos completos desde HEAD: incluyen mucho trabajo previo de Claude. Mantener pruebas y documentación junto al comportamiento que se revierta. No hay cambios de datos que deshacer.

En QA, previa autorización para el cambio de servicio, copiar únicamente `/tmp/gs-test-biblioteca-permisos-v2-706e2735/previous-src/.` a `gs-test-demo-api:/app/dist/src` y reiniciar ese contenedor. No restaurar bases ni tocar otros servicios. Como en el preview anterior, el cambio persiste al reiniciar pero vive en la capa escribible del contenedor; recrearlo desde la imagen antigua lo perdería. El empaquetado posterior en una imagen reproducible no se hizo en esta tarea.
