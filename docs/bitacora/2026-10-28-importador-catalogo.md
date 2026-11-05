# Importador de catálogo desde Productos

Fecha: 28/10/2026. Rama Esnaider/validacion-biblioteca, HEAD de partida cb230aa. Código sin commit/push.

## Resultado y alcance

Anotación del usuario en /commercial/library/update/products: importar masivamente estructura, marcas y productos. Botón «Importar catálogo» y ruta /commercial/library/update/import implementados. Una pantalla selecciona categorías/subcategorías, marcas o productos; descarga plantillas, revisa preview y altas propuestas, exige confirmación para nuevas entidades y permite aplicar válidas/exportar pendientes reimportables. Precios separados, proveedores fuera del alcance.

Módulo aislado /api/products/catalog-import/{preview,execute}; importador histórico sin cambios. Permiso products:write en ruta, botón y servidor; altas de estructura conservan restricciones de cargos del CRUD existente. Preview persistido con namespace, propietario y vencimiento; ejecución transaccional e idempotencia. Se valida SKU normalizado, jerarquía y datos actuales. Updates preservan precios/publicación/archivos/catalog* e identidad bloqueada, registran historial y dejan revisión de ficha pendiente. Altas de producto borrador/inactivas. Utiliza facade Biblioteca tanto para dominio como sesiones, assertWritesAllowed y writeTransaction; no cliente operativo alternativo.

## Archivos propios

Backend: src/backend/src/modules/products/catalog-import/{catalog-import.controller.ts,catalog-import.module.ts,catalog-import.service.ts,catalog-import.service.spec.ts}; registro mínimo en products.module.ts.
Frontend: pages/LibraryCatalogImportPage.tsx; services/catalog-import.service.ts; features/catalog-import/; botón y prueba en LibraryProductQueuePage; ruta en App.tsx y tab activa en CommercialLayout.tsx. Se conservaron modificaciones preexistentes ajenas. Contrato: docs/handoffs/2026-10-28-importador-catalogo.md.

## Evidencia comprobada

- Backend: node node_modules/jest/bin/jest.js --runInBand --no-cache --forceExit --testTimeout=5000 --runTestsByPath src/modules/products/catalog-import/catalog-import.service.spec.ts: 9/9, exit 0. Incluye DI con clientes mockeados, ausencia de altas de dominio durante preview, duplicados, ausencia de defaults silenciosos, identidad bloqueada, roles/confirmación, dueño, precios excluidos, filas inválidas y selección Guía/Productos.
- Backend: tsc --noEmit --incremental false --project tsconfig.build.json --pretty false: exit 0 final. ESLint de nuevos archivos y products.module: exit 0 final. Nest build --path tsconfig.build.json pasó antes del último ajuste; TypeScript final cubre el ajuste. Typecheck global de specs tiene errores previos en specs de precios/products, no modificados por esta unidad.
- Frontend: 42/42 pruebas focalizadas; tsc -b y ESLint focalizados aprobados. Build Vite 540 módulos exit 0 mediante wrapper inline de esbuild existente/documentado, antes del último ajuste de rótulo/clase. Build convencional falla al limpiar temporal Windows por acceso denegado. Tras ese ajuste puramente visual volvieron a pasar tsc y lint.
- Playwright bundled sin instalar: render de pantalla con identidad/API sintéticas en 1440/1440 y 375/375 px, sin overflow y pestaña Fichas seleccionada. No es prueba de backend real. Capturas locales en D:/Empresa/web-gruposecurity/listas/LISTA_DE_PRECIOS_EXCEL/_control/catalog-import-1440.png y catalog-import-375.png. Harness: _control/qa-catalog-import.cjs.
- Revisión independiente Luna: cuatro fallos corregidos (issues objeto renderizado, altas de inválidas, colisión de slugs entre padres, protección incompleta de identidad). Segundo pase confirmó correcciones. Filas skip se cuentan como válidas; una ejecución sin cambios efectivos puede terminar con omitidos, sin altas de catálogo.

## Límites y pendientes

No se importaron datos reales, no se consultó/escribió QA para esta implementación, no hay migraciones, despliegues ni reinicios. La API actual del túnel local continúa sin estos endpoints hasta un despliegue QA autorizado; botón local no equivale a integración real aprobada. No se probó recorrido real de catálogo contra PostgreSQL; pruebas de servicios/DI y pantalla con dobles. Imágenes/documentos y precios conservan sus flujos existentes.

Siguiente acción: el usuario puede entrar al importador de catálogo de la Biblioteca QA, elegir «Categorías», subir la hoja `CATEGORIA,SUBCATEGORIA`, revisar la vista previa y confirmar las altas propuestas antes de aplicar.

## Recibo de despliegue en QA (28/10/2026)

El usuario autorizó preparar las categorías tras el vaciado; el coordinador dio GO para desplegar solo el backend en `gs-test-demo-api`. No se cargaron productos ni se ejecutó una importación.

- Contenedor exclusivo: `gs-test-demo-api`. Configuración segura verificada: `NODE_ENV=development`, `LIBRARY_DATABASE_MODE=legacy`, host/base `gs-test-demo-ops-db` / `gs_api_copy`.
- Paquete acotado: `qa-catalog-import-api-20261028-2141z.tgz`; SHA-256 `220CA30B11023CF258F9150D16A024C764AE22A6151EF6730AEFC989E0A71731`. Contiene únicamente los tres JavaScript compilados del módulo nuevo y su manifiesto.
- `ProductsModule` remoto fue respaldado antes del cambio (SHA-256 previo `8f1e438e7c07672892d0d75aa16f13fb53e487dfc137509ebb4dda9019097b6f`) y recibió un parche aditivo con una importación y una entrada al módulo. SHA-256 parcheado `c739e5eaae8da4c1171a7843a9078502bbd3cc949813310b37e45aeb478773b4`; no se reemplazó el módulo por la compilación local del árbol sucio.
- Backup recuperable en `/home/dev/qa-backups/gs-catalog-import-api-20261028-2141z/`; el módulo `catalog-import` no existía en el contenedor antes de la carga. Solo se reinició `gs-test-demo-api`.
- Salud posterior: desde el contenedor y desde el puerto local 3001, `status=ok`, `database=connected`, `environment=development`. `POST /api/products/catalog-import/preview` sin sesión respondió `401 No autorizado` en ambos puntos, confirmando que la ruta existe y exige autenticación.
- Agregados de `gs_api_copy` posteriores al reinicio: 1 categoría, 5.056 productos, 26 marcas, 41 listas y 0 precios. La transacción anterior del agente de datos eliminó 88 categorías, conservó una categoría neutral y reclasificó los productos; reportó 0 cambios en precios.
- Sin migraciones, cambios a otros contenedores, carga de productos, despliegue de frontend, commit ni push.

La reversión del código de QA requiere restaurar el `ProductsModule` respaldado, retirar solo la carpeta nueva `catalog-import` y reiniciar únicamente `gs-test-demo-api`. No restaurar la base de datos para revertir el código.

## Reversión

Retirar únicamente módulo nuevo y su registro; pantalla/servicio/utilidades nuevos; enlace y ruta añadidos y selección de pestaña. No revertir archivos compartidos completos porque contienen trabajo ajeno. No restaurar bases de datos: no se modificaron. Sin commit/push hasta autorización propia.

## Corrección del preview JSONB — 28/10/2026

El usuario reportó PostgreSQL 22P05 en ImportSession.create al revisar el Excel: \u0000 no puede convertirse a texto. Causa: claves compuestas de categoría padre/hijo usaban el separador NUL y se persistían dentro de state.proposedCategories. No fue un defecto del archivo.

Se sustituyeron las claves compuestas por tuplas serializadas con JSON.stringify de forma consistente. Se rechaza entrada con NUL indicando fila/columna antes de acceder a datos y se valida recursivamente el estado persistible. No se eliminan silenciosamente caracteres de identidad. Se añadieron regresiones para claves adversariales, entrada NUL sin sesión y el workbook real de 9 categorías/66 subcategorías.

Comprobaciones finales: Jest 12/12, TypeScript de producción, ESLint focal y Nest build exit 0. Se capturó el data exacto de ImportSession.create del Excel real (20.663 caracteres); en QA, SELECT parametrizado con cast $1::jsonb devolvió database gs_api_copy y tipo object. Fue SELECT sin importar estructura ni productos; no equivale a recorrido autenticado del navegador.

Despliegue correctivo autorizado dentro del mismo flujo QA: reemplazado solo catalog-import.service.js, ProductsModule intacto; reinicio exclusivo gs-test-demo-api. SHA256 servicio 95e9c447da274a8b3f08829912fd396b2e666ef675cb5daa0f474def326008f4. Backup fresco /home/dev/qa-backups/gs-catalog-import-null-fix-20261028-222109z. Paquete SHA256 b5360b7a8f07dd4ab8344ad663557567c4948ad64277d71294fb0e56a59d9c14.

Health interno y verificación independiente del padre desde PC 127.0.0.1:3001: ok, connected, development; preview anónimo 401. Conteos observados: 1 categoría técnica, 5.056 productos, 26 marcas, 0 precios y 7 tarifas (modelo PriceList; distintas de las 41 Listas de catálogo históricamente observadas). No interpretar esa distinción como pérdida de Listas. No se aplicó ninguna importación real ni migración. Siguiente: el usuario reintenta Revisar archivo con el mismo Excel.
