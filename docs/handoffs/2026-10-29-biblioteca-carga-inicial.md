# Biblioteca: carga inicial interna y jerarquía

Fecha: 29/10/2026. Rama: Esnaider/validacion-biblioteca.
Estado: implementado, aplicado en QA y comprobado. Sin cambios en producción.

## Decisión y alcance

El usuario autorizó preparar el catálogo internamente, retirar el importador general de la web y reconstruir la copia QA conservando el demo iDS-E04HQHI-D (SKU almacenado IDS-E04HQHI-D). Los productos sin identificación suficiente quedan en Excel. No se trabaja con proveedores; marca es una relación independiente de la categoría.

## Resultado comprobado

QA gs_api_copy contiene 1.539 productos: el demo intacto y 1.538 productos nuevos en DRAFT, inactivos, invisibles y sin publicar. Los 1.538 SKU, nombres, marcas y categorías hoja coinciden exactamente con el manifiesto aplicado. Ninguno usa Sin marca; no se asignaron listas ni extraAttributes.biblioteca.

El árbol conserva nueve familias y 66 subcategorías. Hay además una raíz técnica Sin categoría: 76 nodos y diez raíces totales. Se reutilizaron 17 marcas y se crearon siete marcas inactivas respaldadas por texto: 3M, MikroTik, Phillips, Ruijie, Paradox, 3Bumen y Ubiquiti. Total de marcas en BD: 33; las 41 listas heredadas permanecen.

Los 5.056 registros originales concilian en 1.538 cargados, 3.508 pendientes, seis rótulos, tres restringidos y un demo. Los 3.517 registros excluidos no están en el catálogo reconstruido. Los libros fuente no se modificaron.

## Demo y conservación

Demo id 655337aa-6b8a-4ae7-8973-ff977267af04. Conserva publicación/revisión pública, dos imágenes, cinco recursos, siete grupos y 34 especificaciones, una revisión y dos UploadedFiles referenciados. Huella completa antes/después: dbeb8e118ca9771e1dd86ae909bf17a82ec90c3a807526716a69e9c86bbf70dc.

Precios, quote_items y stocks siguen en cero. Los 445 UploadedFiles y los blobs no se purgaron. Se preservaron dos PublicationEvents y 10.228 ProductChange: 10.223 asociados a productos retirados, dos del demo y tres huérfanos históricos. Los 94 AuditLogs sobreviven; cuatro enlaces a productos retirados quedaron en NULL por su FK. El ejecutor no modifica ProductChange.

## Interfaz y filtros

Se retiró el botón de importación general; su URL anterior redirige a Productos bajo el guard existente. Gestión de categorías muestra principales e hijas; crear/editar permite indicar el padre y la ficha separa principal/subcategoría guardando la hoja. Las marcas se gestionan por separado. Se conserva la edición y el importador de precios.

El catálogo comercial utiliza categoryIds con OR y expansión de hijas directas, antes de paginar, tanto en Prisma como en búsqueda SQL. Se preserva categoryId legado exacto. El alcance es el árbol aprobado de dos niveles. La biblioteca pública ya contempla la rama de categoría. Los tres JS de filtros desplegados en gs-test-demo-api difieren del baseline únicamente en ese cambio; salud HTTP200 development y productos sin token HTTP401. Frontend actualizado localmente en el worktree; no publicación de frontend productivo.

El importador de precios encuentra SKU DRAFT/inactivos mediante sku-identity y no cambia sus flags de publicación. Conserva autorización: productos sin lista requieren concesión global.

## Artefactos definitivos

Carpeta D:/Empresa/web-gruposecurity/listas/LISTA_DE_PRECIOS_EXCEL/BIBLIOTECA_MAESTRA_2026-10-29/REVISION_SEMANTICA:

- MAESTRO_REVISADO.xlsx: conciliación completa y árbol.
- PRODUCTOS_PARA_CARGA.xlsx: los 1.538 productos aplicados como borradores.
- PENDIENTES_IDENTIFICACION.xlsx: 3.517 registros excluidos y sus motivos.
- lote_carga.json, SHA256 8c674a8124390f791e204880e42508bb1491852ae844e50a08b2783a4f459aef.
- auditoria_revision.json y scripts/JSON de revisión en el directorio _control de la carpeta maestra.

Los libros iniciales de 1.417 propuestas eran una fase anterior; no son el lote aplicado. La revisión semántica y el control independiente corrigieron 92 asignaciones y bloquearon 20 casos dentro de los 1.558 candidatos de la segunda fase. La auditoría semántica independiente fue dirigida por familias y contraejemplos; no constituye verificación oficial de fabricante de cada SKU. Toda nueva ficha queda pendiente de enriquecimiento y revisión comercial antes de publicar.

## Validación, respaldo y reversión

49 pruebas frontend de estructura, seis de filtros, 135 del servicio de productos y diez del ejecutor. TypeScript, ESLint focal, git diff --check y build backend aprobados. React/Playwright sintéticos en 1440/375 verificaron gestión y selección; no se afirma prueba de navegador autenticada contra QA.

La primera transacción de reconstrucción se revirtió por un error de orden/conteos del snapshot; se corrigió con regresión y el estado anterior se comprobó idéntico antes del intento exitoso. El commit usó respaldo completo fresco, hash de manifiesto, snapshot validado, identidad QA estricta y locks/transacción serializable. El postcheck independiente verificó todas las filas y la integridad del demo. No hubo correcciones de datos posteriores al commit.

Respaldo usado en VPS: /home/dev/qa-backups/gs-library-rebuild-20261029-060642/gs_api_copy-before-apply.dump; SHA256 2b7165c9a74b311979a047507bb1649a3e95abff05c348e989e87795f1a7a9c8, 13.159.667 bytes; pg_restore --list verificado.

Respaldo, recibo y evidencia de datos: ../bitacora/2026-10-29-biblioteca-rebuild-qa.md. Despliegue de filtros: D:/Empresa/web-gruposecurity/listas/LISTA_DE_PRECIOS_EXCEL/_control/revision_despliegue_filtros_qa/receipt.json. Para revertir código, retirar solo los cambios propios; el worktree contiene cambios ajenos previos. Restaurar datos requiere el respaldo concreto de QA y una operación explícitamente acotada; no ejecutar automáticamente el reset otra vez.

No hubo migraciones, commit, push, cambios de producción ni purga de blobs. El siguiente trabajo es resolver los pendientes por bloques y enriquecer los borradores, manteniendo la publicación controlada.
