# Limpieza de categorías de Biblioteca en QA — 2026-10-28

## Resultado

Se eliminó el árbol de categorías existente de la copia QA `gs_api_copy` sin borrar fichas. La FK `products.categoryId` es obligatoria (`ON DELETE RESTRICT`), por lo que se reutilizó la categoría raíz/hoja ya existente **Sin categoría** como destino técnico. Queda una categoría neutral y ninguna subcategoría.

| Dato | Antes | Después |
|---|---:|---:|
| Categorías | 89 | 1 |
| Categorías eliminadas | — | 88 |
| Productos | 5.056 | 5.056 |
| Productos reasignados a Sin categoría | — | 5.056 |
| Marcas | 26 | 26 |
| Listas | 41 | 41 |
| Precios | 0 | 0 |
| Auditorías de categoryId | — | 5.056 |

La categoría conservada es `Sin categoría` (raíz, hoja, activa). No se modificaron marca, lista, precios, campos comerciales, contenido de publicación ni estado de publicación. Solo cambiaron `Product.categoryId` y `Product.updatedAt`; cada reasignación registra un `ProductChange` con `source=SYSTEM` y `field=categoryId`.

## Verificaciones

- Guardas de conexión: `NODE_ENV=development`, `LIBRARY_DATABASE_MODE=legacy`, `current_database()=gs_api_copy`, host `gs-test-demo-ops-db`, ruta `/gs_api_copy`.
- FK revisadas en PostgreSQL: `categories.parentId` tiene autorreferencia `ON DELETE SET NULL`; `products.categoryId` apunta a categorías con `ON DELETE RESTRICT`; no hay otras FKs involucradas.
- Transacción serializable con locks en `categories`, `products` y `product_changes`; estado cotejado contra el dry-run y huellas previas antes de escribir.
- Huellas de `Product` excluyendo `categoryId` y `updatedAt`, marcas, listas y precios: idénticas antes y después.
- Dry-run posterior: 0 categorías por borrar y 0 productos por reasignar.
- Salud HTTP de la web/API: **no verificada en esta operación**; quedó bajo coordinación aparte por discrepancia entre el health externo y el contenedor QA.

## Respaldo previo

Dump PostgreSQL completo formato custom, conservado solo en la VPS:

`/home/dev/qa-backups/gs-category-reset-20261028-213936/gs_api_copy-before-category-reset.dump`

Tamaño: 12.869.468 bytes. SHA-256: `7fcd66e3ee4ea921b530c71a68414ec08448e261e0bfb6407a575d390e838a8a`. Directorio modo 700, archivo modo 600; `pg_restore --list` pudo leer el dump. No copiarlo al repositorio ni al equipo local.

## Ejecución reproducible

El ejecutor `scripts/reset-categorias-qa.cjs` está limitado por guardas a la identidad de QA. En la VPS, ejecutar desde `/app` del contenedor `gs-test-demo-api`, enviando el archivo por stdin a `node -`. Sin `--apply` solo muestra el plan; con `--apply` requiere además que las huellas coincidan con el estado inicial inspeccionado. En el estado final, volver a correrlo produce 0 cambios.

## Cómo cargar una clasificación nueva

Preparar el árbol aprobado como archivo de importación con columnas para categoría y categoría padre (la fila raíz deja el padre vacío). En la web de Compras, abrir **Productos → Importar catálogo**, cargar el archivo, revisar el preview de categorías y jerarquía y aplicar solo después de validar nombres, padres y duplicados. Luego asignar/reclasificar productos con el mismo importador o desde el flujo de edición y confirmar el reporte antes de publicar. La categoría neutral permanece para fichas aún no clasificadas. No cargar precios ni publicar productos como parte de esta carga de estructura.

## Pendientes

Aceptar manualmente la carga de clasificación en el importador QA y confirmar por separado la salud de la API/túnel tras la coordinación actual. No se tocó producción, no se desplegó API como parte de esta operación, y no se ejecutaron migraciones.
