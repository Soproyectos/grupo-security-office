# Mapa técnico del panel Biblioteca

Referencias verificadas en el worktree `validacion-biblioteca` el 3 de noviembre de 2026. Empieza por la [guía de uso y permisos](mapa-de-permisos-biblioteca.md#guía-vigente-del-panel-biblioteca) si necesitas configurar una cuenta. Este anexo sirve para localizar el código y seguir las conexiones entre módulos.

Los enlaces de código apuntan al archivo y llevan una línea de referencia. Si la línea se desplaza, busca el símbolo o la llamada indicada. Las rutas de API que se muestran son relativas al prefijo `/api`.

## Entrada al panel y permisos

El [router, `App.tsx` (líneas 95–111)](../../src/frontend/src/App.tsx#L95) conecta cada ruta con su página y con `AccessBoundary`. Las [casillas, `library-permissions.ts` (línea 30)](../../src/frontend/src/features/users/library-permissions.ts#L30) definen los grupos visibles en el formulario. El [catálogo del servidor, `access-catalog.ts` (línea 117)](../../src/backend/src/common/security/access-catalog.ts#L117) define acciones, alcances y dependencias.

- **Guardar Biblioteca.** [`LibraryPermissionsBlock` (línea 194)](../../src/frontend/src/features/users/components/LibraryPermissionsBlock.tsx#L194) → [`users.service.ts` (línea 306)](../../src/frontend/src/services/users.service.ts#L306) → `PUT /users/:id/access/library` → [`setUserLibraryAccess` (línea 380)](../../src/backend/src/modules/users/users.controller.ts#L380) → [`replaceLibrarySelection` (línea 584)](../../src/backend/src/common/security/access-assignments.service.ts#L584).
- **Guardar acciones individuales.** [`saveGrantsMutation` (línea 135)](../../src/frontend/src/features/users/components/UserAccessAssignments.tsx#L135) → `PUT /users/:id/access` → [`setUserAccess` (línea 337)](../../src/backend/src/modules/users/users.controller.ts#L337) → [`replaceManualSource` (línea 344)](../../src/backend/src/common/security/access-assignments.service.ts#L344). Prisma representa la procedencia y la concesión en [`AccessSource` y `AccessGrant` (líneas 819 y 838)](../../src/backend/prisma/schema.prisma#L819).

## Productos

- **Entrada.** [Ruta y guard `products:read` (líneas 95–96)](../../src/frontend/src/App.tsx#L95) → lista `ProductsPage` y detalle `ProductDetailPage`. En la consulta de Biblioteca, [`LibraryProductConsultationPage` (líneas 135–136)](../../src/frontend/src/pages/LibraryProductConsultationPage.tsx#L135) carga el producto y su ficha.
- **API y datos.** `GET /products/:id` → [`ProductsController.findOne` (línea 101)](../../src/backend/src/modules/products/products.controller.ts#L101) → [`ProductsService.findOne` (línea 731)](../../src/backend/src/modules/products/products.service.ts#L731). La ficha pasa por `fetchProductSheet` y el [controlador de ficha (línea 32)](../../src/backend/src/modules/products/sheet/product-sheet.controller.ts#L32).
- **Recursos.** [`ConsultationFiles` (línea 52)](../../src/frontend/src/pages/LibraryProductConsultationPage.tsx#L52) presenta los archivos de consulta. Prisma distingue [`Product` (línea 152)](../../src/backend/prisma/schema.prisma#L152), [`ProductCatalogResource` (línea 289)](../../src/backend/prisma/schema.prisma#L289) y [`ProductImage` (línea 584)](../../src/backend/prisma/schema.prisma#L584).

## Fichas y publicación

- **Crear y editar.** [Rutas del asistente y el editor (líneas 109–111)](../../src/frontend/src/App.tsx#L109) → [mutaciones del asistente (líneas 120–124)](../../src/frontend/src/pages/LibraryProductWizardPage.tsx#L120) y [guardado del editor (línea 368)](../../src/frontend/src/pages/LibraryProductEditorPage.tsx#L368) → `POST /products` o `PUT /products/:id` → [`ProductsController.create/update` (líneas 109 y 116)](../../src/backend/src/modules/products/products.controller.ts#L109) → [`ProductsService.create/update` (líneas 831 y 899)](../../src/backend/src/modules/products/products.service.ts#L831).
- **Fotos y documentos.** [`ProductsController.uploadImage/uploadAsset` (líneas 261 y 292)](../../src/backend/src/modules/products/products.controller.ts#L261) → [`ProductsService.uploadImage/uploadAsset` (líneas 1930 y 2008)](../../src/backend/src/modules/products/products.service.ts#L1930).
- **Publicar en tienda.** La revisión [carga producto y ficha (línea 90)](../../src/frontend/src/pages/LibraryProductPublicationPage.tsx#L90). El [cliente `publishProduct/unpublishProduct` (líneas 145 y 153)](../../src/frontend/src/services/product-detail.service.ts#L145) llama a los endpoints de [`publish/unpublish` (líneas 160 y 173)](../../src/backend/src/modules/products/products.controller.ts#L160). [`ProductsService.publish` (línea 1088)](../../src/backend/src/modules/products/products.service.ts#L1088) ejecuta la publicación. El permiso `products:publish` se asigna como complemento de Editar fichas.

## Precios

[Ruta de Precios (línea 100)](../../src/frontend/src/App.tsx#L100) → [`LibraryUpdatePage` monta `PriceImportFlow` (línea 2)](../../src/frontend/src/pages/LibraryUpdatePage.tsx#L2) → [`PriceImportController` (línea 176)](../../src/backend/src/modules/prices/import/price-import.controller.ts#L176).

El controlador enlaza la descarga de plantillas (líneas 192 y 211), [previsualización, guardado y aplicación (líneas 254, 270 y 307)](../../src/backend/src/modules/prices/import/price-import.controller.ts#L254) y perfiles de proveedor (línea 325). Las acciones son `prices:preview`, `prices:save` y `prices:apply`. La revisión persistida se representa en [`PriceImportRevision` (línea 477)](../../src/backend/prisma/schema.prisma#L477).

## Importaciones

[Ruta de Importaciones (línea 102)](../../src/frontend/src/App.tsx#L102) → [`LibraryCatalogImportPage` (línea 50)](../../src/frontend/src/pages/LibraryCatalogImportPage.tsx#L50) → [`template-import.api.ts` (líneas 23–51)](../../src/frontend/src/features/catalog-import/template-import.api.ts#L23). El cliente descarga plantilla y ejemplo, envía el Excel, guarda el mapeo, confirma la ejecución y consulta el historial.

El [controlador de importación (líneas 34–68)](../../src/backend/src/modules/products/catalog-import/catalog-template-import.controller.ts#L34) sirve plantilla y ejemplo y llama a `preview`, `resolveMapping` y `execute`. Consultar requiere `imports:read`. Ejecutar requiere `imports:run` y depende de poder editar fichas.

## Catálogos maestros

[Rutas de Catálogos maestros (líneas 105–106)](../../src/frontend/src/App.tsx#L105) → [`MasterSectionBody` (línea 16)](../../src/frontend/src/pages/LibraryMastersPage.tsx#L16). El componente deriva categorías, subcategorías, marcas y tarifas a [`catalog-sections.tsx` (líneas 48–191)](../../src/frontend/src/features/masters/catalog-sections.tsx#L48) y el diccionario y moldes a [`DictionarySection` (línea 315)](../../src/frontend/src/features/masters/DictionarySection.tsx#L315). La consulta y edición usan `masters:read` y `masters:write`. El [catálogo de acciones (línea 117)](../../src/backend/src/common/security/access-catalog.ts#L117) define `products:approveSpecs` y su dependencia de Editar fichas.

## Estadísticas en Mi resumen

[`AssignedHome` (línea 74)](../../src/frontend/src/pages/AssignedHome.tsx#L74) → [`fetchLibraryStats` (línea 420)](../../src/frontend/src/services/dashboard-insights.service.ts#L420) → `GET /dashboard/library-stats` → [`DashboardController` (línea 72)](../../src/backend/src/modules/dashboard/dashboard.controller.ts#L72) → [`LibraryStatsService.getLibraryStats` (línea 61)](../../src/backend/src/modules/dashboard/library-stats.service.ts#L61).

El servicio selecciona las secciones según las concesiones globales. Las consultas de Productos, Fichas y Publicación empiezan en las líneas 79, 100 y 125 del servicio. Una respuesta exitosa vacía produce el aviso en [`AssignedHome` (línea 100)](../../src/frontend/src/pages/AssignedHome.tsx#L100) si la persona tiene un panel de Biblioteca.

## Procedencia de datos y artefactos

- **Datos que consulta el panel.** La API lee los registros persistidos en PostgreSQL mediante Prisma. El [esquema](../../src/backend/prisma/schema.prisma) permite seguir modelos y relaciones.
- **Lote oficial.** Los 39 Excel de `D:\Empresa\web-gruposecurity\listas\LISTA_DE_PRECIOS_EXCEL` originan los 5.038 SKU únicos del lote. [Auditoría de archivos, filas y duplicados](../procedimientos/auditoria-biblioteca-39-listas.md).
- **Enriquecimiento.** Las fichas JSON de `biblioteca/` complementan SKU coincidentes del lote. El procedimiento identifica el generador, el manifiesto de carga y su reporte. [Contrato y comandos del lote oficial](../procedimientos/importacion-masiva-biblioteca-vitrina.md).
- **Plantillas de operación.** Las descargas y cargas hechas desde Precios e Importaciones siguen los recorridos de sus respectivas pestañas. La auditoría del lote oficial documenta una fuente y una carga concretas.
