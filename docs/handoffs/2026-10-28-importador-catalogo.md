# Importador masivo de catálogo desde Biblioteca

Estado: integrado y desplegado en QA con autorización del usuario; aceptación autenticada y carga del árbol pendientes.
Rama: Esnaider/validacion-biblioteca. Solicitud: anotación de Productos, 28/10/2026.

## 1. Necesidad y diseño

Compras necesita importar o actualizar muchas fichas desde la barra de Productos, sin editar cada producto por separado. Botón «Importar catálogo», navegación al espacio de importación en el mismo panel; no modal inicial.

Recorrido: seleccionar categorías/subcategorías, marcas o productos -> subir CSV/Excel -> revisar filas válidas, pendientes y altas propuestas -> confirmar explícitamente altas de estructura -> aplicar válidas -> consultar resultado y descargar pendientes. Categorías y marcas pueden cargarse primero; el lote de productos puede proponer altas, siempre visibles y confirmadas, sujetas a los permisos vigentes.

La ficha usa SKU/modelo/referencia único, nombre, categoría/subcategoría, marca, características y estado comercial. Los precios se importan por separado. Crear producto implica borrador/inactivo; actualizar no publica ni altera estados, precios, archivos o contenido comercial aprobado. Marca/proveedor no se mezclan: proveedores fuera del alcance.

## 2. Contrato de backend

Ruta nueva para evitar los efectos del importador histórico: POST /api/products/catalog-import/preview (multipart file, kind=categories|brands|products). Respuesta: previewId, kind, summary(total/valid/invalid/creates/updates), rows(row/sku/name/action/issues), proposedBrands(key/name), proposedCategories(key/name/parentKey), canCreateStructure.

POST /api/products/catalog-import/execute: {previewId, confirmNewEntities}; devuelve created, updated, skipped, invalid y detalles disponibles.

Preview persistido por usuario y tipo con vencimiento; ejecución repetida idempotente. Aplicación revalida y usa transacción. No cambios de esquema. Product.categoryId apunta a la hoja de Category.parentId. Rechazar asociaciones con padres incompatibles y duplicados normalizados. Evitar creaciones implícitas Sin marca/Sin categoría. Conflictos de identidad bloqueada quedan pendientes.

Permisos: conservar products:write y las restricciones actuales de creación de marcas/categorías; no ampliar roles ni crear reglas nuevas. Precio y publicación permanecen fuera de la ruta. Contratos consumidores: solo nueva pantalla/servicio; importadores históricos no se modifican.

Plantilla productos: SKU,NOMBRE,MARCA,CATEGORIA,SUBCATEGORIA; DESCRIPCION y CARACTERISTICAS opcionales según validación final. Plantilla marcas: MARCA. Plantilla categorías: CATEGORIA,SUBCATEGORIA. Los datos de demostración son ficticios.

## 3. Integración y comprobaciones

Backend respondido e interfaz integrada en el código local. Módulo nuevo src/backend/src/modules/products/catalog-import y registro en products.module.ts. Pantalla LibraryCatalogImportPage, servicio catalog-import.service, utilidades y pruebas en features/catalog-import; botón en LibraryProductQueuePage, ruta en App y pestaña Fichas conservada por CommercialLayout.

Contrato final: execute devuelve issues como string[]; frontend tolera también objetos row/message para no romper resultados. Preview conserva valores brand/category/subcategory/description/characteristics/extraAttributes para exportar pendientes completos. Admite CSV/Excel, selecciona hoja Productos cuando existe y reconoce Características_filtros. Límites: 10 MiB/10.000 filas. Confirmar altas no autoriza crear entidades para filas inválidas. Slugs de subcategorías incluyen su padre. Nombre e identidad curados quedan protegidos; updates generan ProductChange/Audit y marcan pendiente la revisión de ficha. Las características admitidas no sustituyen el flujo de archivos/imágenes. El estado comercial no se importa desde el archivo.

Comprobado: nueve pruebas backend; producción TypeScript y lint focalizados correctos; 42 pruebas frontend, tsc -b y lint focalizados correctos. Build frontend aprobado con envoltorio local de esbuild documentado por el proyecto. Capturas sintéticas de 1440 y 375 px sin overflow, pestaña Fichas activa. Detalle y límites: ../bitacora/2026-10-28-importador-catalogo.md. No se verificó conexión HTTP a API QA nueva: código no desplegado allí.

## 4. Alcance operativo y reversión

Cambios de código locales autorizados. No autoriza migraciones, cambios de servicios, despliegue en QA/producción, carga de catálogo real, commit ni push. API remota actual no recibirá estos cambios sin autorización de despliegue específica.

Reversión: retirar únicamente el módulo catalog-import, su registro, la pantalla/servicio y el enlace de la barra introducidos por este cambio. No revertir App.tsx, products.module.ts ni la página completa porque contienen trabajo ajeno previo. Conservar el importador histórico y el importador de precios.

## Actualización operativa autorizada — 28/10/2026

El usuario aprobó continuar y borrar las categorías anteriores. En gs_api_copy se reutilizó la raíz técnica Sin categoría, se reasignaron 5.056 productos y se borraron las otras 88 categorías. Hashes de contenido protegido, marcas, Listas y precios conservados. Respaldo y auditoría: ../bitacora/2026-10-28-biblioteca-limpieza-categorias-qa.md.

Despliegue limitado: tres JS nuevos de catalog-import y parche aditivo al ProductsModule remoto preservado; reinicio exclusivo gs-test-demo-api. Health interno y desde PC development/connected/ok; preview anónimo 401. Verificación independiente del padre desde PC confirmó health y 401. Agregados finales QA: 1 categoría técnica, 5.056 productos, 26 marcas, 41 Listas, 0 precios. No se aplicó importación ni migración. Los apartados previos de autorización pendiente describen el estado antes de esta aprobación.

Archivo preparado en CARGA_ESTRUCTURA_WEB/CATEGORIAS_Y_SUBCATEGORIAS_GRUPO_SECURITY.xlsx (y CSV), workspace de listas: 66 filas categoría/subcategoría, 9 padres, 66 hijos, 75 nodos propuestos. El usuario lo aplicará mediante Importar catálogo -> Categorías y subcategorías -> Elegir archivo -> Revisar archivo -> confirmar altas -> Aplicar filas válidas. Sin aplicar el fichero por agente.

### Incidencia JSONB resuelta

Error 22P05 en preview por claves internas con NUL: corregido con tuplas JSON y validación de entrada/estado, 12 pruebas aprobadas y cast JSONB del payload real aceptado por gs_api_copy. Servicio corregido desplegado en la misma API QA; sin aplicar importación ni cambios de estructura. Ver bitácora, sección Corrección del preview JSONB.
