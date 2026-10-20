# Importación masiva de productos por SKU

Estado: **habilitado localmente para filas SKU-only; no autorizado para producción**.

Este documento es el contrato del wizard genérico de productos y precios. Para crear la biblioteca completa desde las listas oficiales se usa el manifiesto separado de **5.038 SKU únicos** documentado en [`importacion-masiva-biblioteca-vitrina.md`](./importacion-masiva-biblioteca-vitrina.md).

## Respuesta corta

Sí: el importador ya puede recibir una fila cuyo único dato identificable sea el SKU.

Cuando no hay nombre, descripción, especificaciones ni atributos adicionales:

- el SKU se normaliza y se guarda como nombre provisional;
- se crea el producto con estado `DRAFT` / `borrador`;
- queda `isActive = false` e `isVisible = false`, aunque la lista destino tenga visibilidad por defecto;
- los precios presentes se pueden guardar, pero **no publican el producto**;
- el resultado informa cuántos productos quedaron `pendingEnrichment`;
- una carga SKU-only posterior no borra la identidad que alguien haya completado manualmente.

El registro queda listo para rellenar con el tiempo. La publicación es una acción posterior, después de completar y revisar su identidad comercial.

## Qué es este lote y qué no es

Hay tres conjuntos que no deben mezclarse:

| Conjunto | Propósito | Evidencia actual |
| --- | --- | --- |
| Biblioteca de vitrina | Fichas curadas con nombre, descripción, categoría, marca y control de identidad | `biblioteca/*.json`; 764 fichas válidas, más reportes/respaldos del flujo |
| Catálogo base histórico | Parseo de listas usado para construir la biblioteca | `catalogo-base.json`; 764 productos parseados |
| Cargue masivo operativo | Crear o actualizar productos y precios a partir de archivos de proveedores | Wizard de `src/backend/src/modules/products/import` y pantalla de importación |

La estimación inicial de 5.028 fue reconciliada contra los 39 Excel oficiales. El artefacto reproducible contiene 5.038 SKU únicos, después de fusionar 329 apariciones duplicadas; el detalle está en [`auditoria-biblioteca-39-listas.md`](./auditoria-biblioteca-39-listas.md). El wizard sigue siendo útil para cargas operativas individuales, pero no es el mecanismo recomendado para crear de una vez la biblioteca consolidada.

## Campos del cargue

| Campo | Obligatorio | Comportamiento |
| --- | --- | --- |
| SKU / referencia | Sí | Es la identidad técnica. Se normaliza para detectar duplicados por mayúsculas y espacios. Máximo 100 caracteres. |
| Nombre | No | Si falta, se usa el SKU provisionalmente. La fila queda pendiente si no tiene otros datos de identidad. |
| Descripción | No | Puede servir como fuente de nombre cuando existe. |
| Categoría | No | Se resuelve o cae en `Sin categoría`. La ausencia no bloquea. |
| Marca | No | Se resuelve o cae en `Sin marca`. La ausencia no bloquea. |
| Especificaciones | No | Se guardan como JSON cuando existen. |
| Atributos adicionales | No | Se guardan como `extraAttributes` cuando existen. |
| Precios | No | Se guardan si son válidos. Un precio sin identidad comercial no vuelve publicable al producto. |

La regla de “pendiente” se aplica cuando el normalizador marca el nombre como fallback y no hay descripción, especificaciones ni atributos adicionales. La categoría, marca o precio por sí solos no sustituyen la identidad comercial.

## Recorrido correcto

1. Subir un `.xlsx`, `.xls` o `.csv` al wizard local.
2. Revisar que el encabezado de SKU/referencia se haya detectado y mapearlo a `sku`.
3. Mapear cualquier dato disponible. Nombre, descripción, categoría, marca y precios pueden quedar vacíos.
4. Ejecutar la preview y revisar, como mínimo:
   - total de filas;
   - filas válidas e inválidas;
   - duplicados de SKU;
   - `toCreate` y `toUpdate`;
   - advertencias y errores.
5. Ejecutar solo con la lista destino correcta y en ambiente local.
6. Esperar el resultado del proceso en segundo plano. El resumen muestra `Pendientes` / `pendingEnrichment`.
7. Completar esos productos desde el panel o mediante una nueva importación con datos reales.
8. Revisar y publicar explícitamente los productos ya enriquecidos.

## Limitaciones que deben quedar visibles

### Un libro Excel se procesa por la primera hoja

`src/backend/src/modules/products/import/sources/excel-adapter.ts` detecta y procesa la primera hoja del libro. No se debe subir el libro completo esperando que sus demás hojas formen parte del lote. Para trabajar hoy con un libro de varias hojas hay que:

- consolidar los SKUs en una sola hoja de datos; o
- exportar y cargar cada hoja por separado, verificando duplicados entre cargas.

Esta limitación significa que el wizard no debe recibir los 39 libros como si fueran un único Excel multihoja. Para la biblioteca completa, `scripts/generar_manifiesto_biblioteca.py` recorre todos los archivos y hojas reconocidas y produce el manifiesto único; para cargas operativas del wizard se debe consolidar una hoja o cargar cada archivo por separado.

El adaptador también limita cada archivo a 10 MB. El ejecutor usa lotes de 15 filas para evitar timeouts cuando hay varias tarifas por producto y el proceso se ejecuta en segundo plano.

### No hay enriquecimiento automático

El importador no inventa nombres, imágenes, marcas ni especificaciones. SKU-only significa “crear un registro pendiente”, no “completarlo con búsquedas web”. El enriquecimiento debe venir de una persona, de una fuente autorizada o de una futura carga con columnas completas.

### No confundir con importación de precios

El diseño de [importación de precios](../DISENO-IMPORTACION-PRECIOS-2026-10-14.md) tiene un contrato más estricto: una referencia desconocida no crea productos desde una carga que solo pretende actualizar precios. Este documento describe el cargue de productos; si el flujo seleccionado es exclusivamente de precios, se conserva la regla de no crear.

## Señales técnicas para agentes

- Campo obligatorio del mapping: `sku`.
- Nombre provisional: `nameIsFallback = true` en la fila normalizada.
- Producto pendiente nuevo: `lifecycleStatus = 'DRAFT'`, `publishStatus = 'borrador'`, `isActive = false`, `isVisible = false`.
- Marcador de procedencia en pendientes nuevos: `extraAttributes.importStatus = 'pending_enrichment'` y `pendingReason = 'missing_identity'`.
- El resultado de ejecución expone `pendingEnrichment` y el frontend lo muestra en el resumen, widget y reporte.
- Para un SKU existente con identidad real, una fila SKU-only solo refresca `lastSeenAt` y precios; no borra nombre, descripción, especificaciones ni atributos.
- La unicidad se resuelve por SKU normalizado; no crear duplicados por diferencias de mayúsculas o espacios.

## Checklist antes de dar la tarea por terminada

- [ ] El archivo está consolidado en una hoja o se ha definido el orden de cargas por hoja.
- [ ] La preview confirma el total esperado y no hay duplicados no resueltos.
- [ ] Los SKU-only aparecen como pendientes, no como publicados.
- [ ] Los precios, si existen, pertenecen a la lista destino correcta.
- [ ] Se descargó y conservó el reporte de resultado.
- [ ] Se validó localmente con lint, typecheck y pruebas pertinentes.
- [ ] No se ejecutó producción ni se cambiaron credenciales.

## Archivos principales

- Backend: `src/backend/src/modules/products/import/`
- Validación y normalización: `pipeline/row-validator.service.ts`, `pipeline/row-normalizer.service.ts`
- Mapping: `pipeline/column-mapper.service.ts`, `pipeline/header-detector.service.ts`
- Persistencia: `pipeline/batch-executor.service.ts`
- Adaptador Excel: `sources/excel-adapter.ts`
- UI: `src/frontend/src/features/products/import/`
- Biblioteca curada separada: `docs/IMPORTADOR-CATALOGO.md`
