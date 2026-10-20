# Un producto pertenece como máximo a una lista

**Estado: decisión de producto confirmada por el usuario el 14 de octubre de 2026.** Es una regla para construir y verificar; este documento no certifica que todos los caminos actuales la cumplan.

## Regla

Una referencia identifica un producto único en Biblioteca. Ese producto puede estar sin lista mientras se prepara o pertenecer a una sola lista. No puede figurar en dos listas distintas, aunque una esté inactiva o archivada.

Dentro de esa lista puede tener precios Instalador, Tienda, Oro, Platino y Cliente final. Son tarifas del mismo producto, no otras pertenencias.

## Qué pasa al cargar

- Misma referencia y misma lista: comparar y actualizar únicamente los precios incluidos al aplicar la revisión. No crear otra ficha ni otra pertenencia.
- Misma referencia y otra lista: marcar conflicto y no cambiar precios, duplicar, mover o desasignar el producto automáticamente. Mostrar el detalle de la lista existente solo si hay permiso para consultarla.
- Referencia existente sin lista: proponer su vinculación y exigir la acción correspondiente además del permiso de precios. No asignar por una coincidencia silenciosa.
- Referencia desconocida: queda pendiente; crearla en Biblioteca exige su permiso y no ocurre desde la carga de precios.
- La pertenencia se comprueba al revisar y nuevamente al aplicar. La escritura debe resolver carreras entre cargas a listas diferentes.

El precio anterior se conserva en historial. Una revisión histórica no es otra lista ni una pertenencia adicional. Una nueva carga del mismo proveedor no obliga a crear una lista distinta para sus productos.

## Archivo, duplicación y retirada

Archivar la lista conserva la pertenencia y sus históricos; no libera automáticamente sus referencias. Duplicar una lista puede copiar datos/configuración, pero empieza sin productos y no clona referencias. Retirar un producto exige una acción explícita: conserva la ficha y el historial, elimina su pertenencia vigente y no mantiene ofertas activas sin destino autorizado.

Trasladar un producto a otra lista, si se necesita, requiere definir un flujo separado y sus permisos, efectos sobre precios/publicaciones y auditoría. No se añade ese permiso ni esa operación mediante una importación ordinaria. Una eliminación de lista no debe borrar la Biblioteca; sus asociaciones y ofertas deben resolverse coherentemente.

## Efecto técnico

`Product.listaId` es la base para la única pertenencia vigente, no un dato meramente informativo. No se propone una tabla de pertenencias muchos-a-muchos. La unicidad `Price(productId, priceListId)` sirve como base para un precio vigente por producto/tarifa, con revisiones separadas e historial; las relaciones auxiliares de lista deben coincidir con la pertenencia única.

Esta decisión reemplaza los supuestos de multilistado de las propuestas anteriores y revisa ese punto de [ADR-002](ADR-002-biblioteca-vitrina.md), que conserva su contexto histórico. Permanece vigente la separación entre identidad permanente de Biblioteca y precios actualizables de las listas.

## Comprobación

- Recargar una lista actualiza sin duplicar productos.
- Una segunda lista no puede tomar una referencia ya asignada.
- Varias tarifas del producto son válidas dentro de la misma lista.
- Archivo, duplicación, restauración, API directa e importación de Biblioteca no eluden la regla.
- Cargas concurrentes no logran asignar el producto a dos listas.
- Los precios anteriores siguen consultables como historial autorizado, sin cambiar facturas/cotizaciones históricas.

Detalle en el [diseño del panel](../DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md) y la [carga de precios](../DISENO-IMPORTACION-PRECIOS-2026-10-14.md).
