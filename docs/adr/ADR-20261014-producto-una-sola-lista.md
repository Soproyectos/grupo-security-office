# Un producto pertenece como máximo a una lista

**Estado: decisión de producto confirmada por el usuario el 14 de octubre de 2026.** Es una regla para construir y verificar; este documento no certifica que todos los caminos actuales la cumplan.

## Regla

Una referencia identifica un producto único en Biblioteca. Ese producto puede estar sin lista mientras se prepara o pertenecer a una sola lista. No puede figurar en dos listas distintas, aunque una esté inactiva o archivada.

Dentro de esa lista puede tener precios Instalador, Tienda, Oro, Platino y Cliente final. Son tarifas del mismo producto, no otras pertenencias.

## Qué pasa al cargar

Vigente desde la [Enmienda 2026-10-20](#enmienda-2026-10-20-carga-de-precios-por-referencia-sin-lista-destino); reemplaza el texto original del 14 de octubre, que exigía una lista destino:

- La carga de precios identifica el producto solo por su referencia (SKU). No se elige una lista destino: el producto conserva su única lista y una importación nunca lo mueve.
- Referencia con lista: se actualizan sus precios si la persona tiene permiso sobre esa lista. Las filas de listas sin permiso se rechazan sin revelar el nombre de la lista ni sus precios.
- Referencia existente sin lista: se actualiza su precio y se marca como «sin lista». No se vincula a ninguna lista de forma automática.
- Referencia desconocida: la fila se rechaza y no bloquea el resto. Con permiso de Biblioteca se puede crear como ficha borrador oculta, «pendiente de ficha» (SKU, nombre, marca y categoría), y aplicar su precio; o bien omitirla.
- La pertenencia se comprueba al revisar y nuevamente al aplicar. La escritura debe resolver carreras entre cargas.

El precio anterior se conserva en historial. Una revisión histórica no es otra lista ni una pertenencia adicional. Una nueva carga del mismo proveedor no obliga a crear una lista distinta para sus productos.

## Archivo, duplicación y retirada

Archivar la lista conserva la pertenencia y sus históricos; no libera automáticamente sus referencias. Duplicar una lista puede copiar datos/configuración, pero empieza sin productos y no clona referencias. Retirar un producto exige una acción explícita: conserva la ficha y el historial, elimina su pertenencia vigente y no mantiene ofertas activas sin destino autorizado.

Trasladar un producto a otra lista, si se necesita, requiere definir un flujo separado y sus permisos, efectos sobre precios/publicaciones y auditoría. No se añade ese permiso ni esa operación mediante una importación ordinaria (se mantiene tras la enmienda). Una eliminación de lista no debe borrar la Biblioteca; sus asociaciones y ofertas deben resolverse coherentemente.

## Efecto técnico

`Product.listaId` es la base para la única pertenencia vigente, no un dato meramente informativo. No se propone una tabla de pertenencias muchos-a-muchos. La unicidad `Price(productId, priceListId)` sirve como base para un precio vigente por producto/tarifa, con revisiones separadas e historial; las relaciones auxiliares de lista deben coincidir con la pertenencia única.

Esta decisión reemplaza los supuestos de multilistado de las propuestas anteriores y revisa ese punto de [ADR-002](ADR-002-biblioteca-vitrina.md), que conserva su contexto histórico. Permanece vigente la separación entre identidad permanente de Biblioteca y precios actualizables de las listas.

## Comprobación

- Recargar una lista actualiza sin duplicar productos.
- Una importación nunca mueve un producto a otra lista; una segunda lista no puede tomar una referencia ya asignada.
- Varias tarifas del producto son válidas dentro de la misma lista.
- Archivo, duplicación, restauración, API directa e importación de Biblioteca no eluden la regla.
- Cargas concurrentes no logran asignar el producto a dos listas.
- Un archivo con referencias de varias listas actualiza las permitidas y rechaza las demás; una referencia desconocida no bloquea las demás filas.
- Cada cambio de precio queda en el historial por producto con quién, cuándo, valor anterior, valor nuevo y origen.
- Los precios anteriores siguen consultables como historial autorizado, sin cambiar facturas/cotizaciones históricas.

Detalle en el [diseño del panel](../DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md) y la [carga de precios](../DISENO-IMPORTACION-PRECIOS-2026-10-14.md).

## Enmienda 2026-10-20: carga de precios por referencia, sin lista destino

Decisión de producto confirmada por el usuario el 20 de octubre de 2026. **La invariante no cambia:** un producto pertenece como máximo a una lista. Cambia solo la forma de cargar precios; el texto original se conserva como historia en el control de versiones.

1. **Sin lista destino.** El archivo se cruza por SKU con todos los productos. Puede traer referencias de varias listas y marcas en una misma revisión. La importación nunca cambia `Product.listaId`.
2. **Productos sin lista.** Se les actualiza el precio y se marcan «sin lista». No se vinculan solos; vincular sigue siendo una acción separada. Estos casos y la resolución de referencias desconocidas exigen `prices:apply` y `products:write` con alcance global.
3. **Permisos por lista.** Se exige permiso sobre cada lista afectada. Las filas de otras listas se rechazan sin exponer su nombre ni sus precios. Si un permiso se revoca entre la revisión y la aplicación, la aplicación completa responde 409.
4. **Referencia desconocida.** Es una fila rechazada que no bloquea. Con permiso de Biblioteca se puede crear una ficha borrador oculta, «pendiente de ficha», con su precio del archivo, o bien omitir la fila. La ficha no aparece en la vitrina pública. Las omitidas no se recuerdan para la siguiente carga.
5. **Aplicar con filas rechazadas.** Se aplican las filas válidas, pero la persona debe confirmar de forma explícita el número de filas rechazadas que quedan sin aplicar.
6. **Cambios grandes.** Un cambio de precio superior al 30 % (al alza o a la baja) se señala con precio anterior, nuevo y porcentaje. No bloquea, pero exige confirmación al aplicar. Cero, negativos, no numéricos y fuera de rango siempre se rechazan; una celda vacía conserva el precio.
7. **Historial por producto.** Además del historial por revisión, cada variable del producto registra quién, cuándo, valor anterior, valor nuevo y origen. Aún no cubre imágenes, ficha de vitrina, importaciones heredadas y de Biblioteca, borrado definitivo ni desvinculación de lista.
