# Plantilla de catálogo de productos (`catalogo-v1`)

Libro de Excel con hojas relacionadas por la columna **REFERENCIA** (el SKU). La fila 1 de cada hoja de datos es el encabezado. Ejemplo sintético: `plantilla-catalogo-ejemplo.xlsx`. Código: `src/backend/src/modules/products/catalog-import/template/`.

Reglas generales
- La versión viaja en la hoja oculta `_plantilla` y en `Instrucciones`. Otra versión se rechaza completa.
- No se aceptan hojas ni columnas renombradas o faltantes; una columna extra se ignora con aviso; una columna de precios o costos se rechaza.
- Celda vacía: en un producto nuevo queda pendiente; en uno existente se deja como está.
- Quitar filas no borra nada en el producto. Para borrar se usa el editor.
- Esta plantilla nunca crea marcas, categorías, subcategorías ni atributos: lo desconocido es una incidencia.
- La REFERENCIA se compara sin espacios y sin distinguir mayúsculas (igual que el importador actual); los sufijos y variantes son productos distintos. Dos filas con la misma referencia en `Productos` quedan ambas inválidas.
- Productos publicados, con nombre bloqueado o con ficha editada/aprobada no se modifican: sus diferencias salen como propuestas.

| Hoja | Columna | Tipo | Obligatoria | Formato / regla |
|---|---|---|---|---|
| Productos | REFERENCIA | texto ≤100 | sí | SKU; clave de relación con las demás hojas |
| | NOMBRE | texto ≤200 | sí | |
| | MARCA | texto | no | debe existir en `Diccionarios`; si no, incidencia y marca pendiente |
| | SUBCATEGORIA | texto | no | debe existir; define qué datos principales se aceptan |
| | CATEGORIA | texto | no | si se indica debe corresponder a la subcategoría; si no, conflicto de clasificación (fila inválida) |
| | DESCRIPCION | texto ≤2000 | no | |
| Datos principales | REFERENCIA | texto | sí | debe estar en `Productos` |
| | ATRIBUTO | texto | sí | nombre (o clave) del atributo del molde de la subcategoría; fuera del molde o desconocido = incidencia, se omite |
| | ESTADO | lista | no | `Conocido` / `No aplica` / `Desconocido`; vacío con VALOR = Conocido |
| | VALOR | según atributo | solo si Conocido | número (coma o punto), Sí/No, texto, una opción, o varias separadas por `;`. Con No aplica/Desconocido debe ir vacío. 0 y No son valores reales |
| Especificaciones | REFERENCIA | texto | sí | |
| | GRUPO | texto ≤120 | sí | máx. 20 grupos por producto |
| | DATO | texto ≤200 | sí | máx. 100 por grupo |
| | VALOR | texto ≤2000 | sí | vacío = fila omitida con aviso |
| | ORDEN | entero ≥0 | no | vacío = orden del archivo |
| Destacados | REFERENCIA | texto | sí | |
| | TIPO | lista | sí | `Destacado` (≤500, máx. 20) / `Caracteristica` (≤80, máx. 12) / `Insignia` (≤40, máx. 10) |
| | TEXTO | texto | sí | |
| | ORDEN | entero ≥0 | no | |
| Recursos | REFERENCIA | texto | sí | |
| | TIPO | lista | sí | `Imagen` / `Documento` / `Firmware` (máx. 50 por producto) |
| | TITULO | texto ≤200 | sí | |
| | URL | texto ≤2048 | sí | solo `http://` o `https://`. Una ruta local (`C:\...`, `/...`) NO sube el archivo y se rechaza |
| | ORDEN | entero ≥0 | no | |
| Modelos relacionados | REFERENCIA | texto | sí | |
| | REFERENCIA RELACIONADA | texto ≤120 | sí | debe existir en el archivo o en el catálogo; no puede ser el mismo producto; máx. 50 |
| Diccionarios | (solo lectura) | | | marcas, categorías→subcategorías y atributos por subcategoría (tipo, unidad, opciones, obligatorio) leídos de la base |

Archivos adjuntos: Excel no sube archivos. Mecanismos válidos: enlace URL en `Recursos`, o la carga de archivos del editor del producto.

Límites del archivo: 5000 productos, 50 000 filas por hoja, 10 MB.

## Resultado de la vista previa (por producto)

| Código | Significado |
|---|---|
| `CREATE_DRAFT` | producto nuevo, borrador oculto; `pending` lista lo que falta |
| `UPDATED_FILLED_EMPTY` | solo se llenan campos vacíos de un producto sin protección |
| `UNCHANGED` | el archivo no aporta nada nuevo |
| `PROPOSED_DIFFERENT_VALUE` | valores distintos a los existentes; solo propuesta |
| `PROPOSED_PROTECTED` | producto protegido (`PUBLISHED`, `NAME_LOCKED`, `SHEET_EDITED`, `SHEET_APPROVED`); solo propuesta |
| `DUPLICATE_SKU_IN_FILE`, `SKU_MISSING`, `NAME_MISSING`, `SKU_AMBIGUOUS_EXISTING` | inválido (ya existían en el importador) |
| `CLASSIFICATION_CONFLICT`, `RELATED_REFERENCE_UNKNOWN`, `ATTRIBUTE_VALUE_INVALID`, `ATTRIBUTE_OPTION_UNKNOWN`, `INVALID_STATE`, `VALUE_MISSING`, `VALUE_CONTRADICTS_STATE`, `CONTRADICTORY_DUPLICATE`, `INVALID_ORDER`, `INVALID_URL`, `LOCAL_PATH_NOT_SUPPORTED`, `INVALID_TYPE`, `TEXT_TOO_LONG`, `TOO_MANY_ITEMS` | inválido (nuevos) |
| `MAPPING_BRAND_UNKNOWN`, `MAPPING_CATEGORY_UNKNOWN`, `MAPPING_SUBCATEGORY_UNKNOWN`, `MAPPING_SUBCATEGORY_AMBIGUOUS`, `ATTRIBUTE_UNKNOWN`, `ATTRIBUTE_NOT_IN_MOLDE`, `ATTRIBUTE_NO_SUBCATEGORY` | incidencias (aviso): el producto sigue, lo desconocido queda pendiente y no se crea |

El plan trae un `hash`; antes de aplicar se recalcula con el estado actual (`isPlanCurrent`) y, si cambió, se debe generar otra vista previa.
