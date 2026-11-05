# Biblioteca V2: decisión de diseño

El usuario rechazó el refinamiento conservador y delegó la elección de navegación en criterios de UX/UI. Se adopta un editor de secciones independientes, con menú lateral visible en escritorio y selector en móvil, sin obligar a recorrer pasos. Los borradores permanecen montados al cambiar de sección. La ficha pública del cliente conserva su diseño aprobado.

Referencias: [NN/g, formularios y carga cognitiva](https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/) y [NN/g, uso de pestañas](https://www.nngroup.com/articles/tabs-used-right/). Respaldan agrupar tareas y evitar navegación apilada; la solución concreta es una interpretación para Compras, pendiente de validación de uso con el usuario.

## Exploración de dirección

Mecanismo: un mismo producto reúne consulta, mantenimiento y publicación, con accesos independientes. Escena: Compras busca una referencia y resuelve sus datos pendientes. Se descartan como resultado el panel administrativo de tarjetas genéricas y su opuesto decorativo de pantalla técnica oscura.

Se consideraron estas siete fuentes, sin copiar su apariencia literalmente:

1. Catálogo profesional de distribución: referencias legibles, imágenes contenidas y búsqueda central; blanco, tinta y rojo, tipografía sans.
2. Señalización de un punto de venta: destinos cortos y jerarquía clara; fondo claro, azul profundo y rojo, rótulos legibles.
3. Hoja técnica normalizada: datos relacionados y unidades consistentes; blanco y gris azulado, escala tipográfica sobria.
4. Índice editorial de documentación comercial: entrada directa a cada tema; papel claro, tinta y bandas de selección, texto sans.
5. Registro de revisión de Compras: filas comparables y estado explícito; blanco y azul pálido, cifras tabulares.
6. Señalización de rutas de una sede: posición y destino reconocibles; azul de orientación y superficies claras, texto grande y contraste.
7. Índice de referencia técnica: capítulos accesibles, ficha abierta y estado de revisión persistente; cabecera azul tinta, fondo azul muy claro, hoja blanca y acciones rojas de marca. Firma: la sección seleccionada y su forma de guardado se reconocen a la vez.

Impeccable asignó la séptima dirección (`seed:46988c3f56945ea6`). La primera ejecución sin red se completó mediante la consulta autorizada al catálogo. Los seis contrastes ofrecidos se declinan para este caso: emisión espectral (conservar precisión de estados), mapa de jardines (conservar jerarquía espacial), manual sobre acetato (conservar descubrimiento de secciones), web japonesa densa (conservar economía de espacio), feed de vídeo (conservar foco en una tarea), carátula de casete (conservar jerarquía compacta). Sus tratamientos no mejoran identificación ni claridad para Compras. La dirección elegida incorpora esas disciplinas mediante controles web normales, sin metáforas decorativas.

La elección queda a cargo del agente por respuesta expresa del usuario; no se exige otra selección estética. Se construye directamente en código para poder revisar el editor completo y sus funciones reales.

## Direction contract

THESIS: Biblioteca se convierte en un espacio de trabajo por tareas, con destinos directos y un editor que muestra una sección cada vez; sustituye las filas de pestañas repetidas y el formulario interminable.

OWN-WORLD: cabecera azul tinta #183247, fondo #eef3f7, superficies blancas, rojo institucional para la acción principal, sans existente, divisiones claras y radios de 12px. La identidad se aísla dentro de Biblioteca.

STORY: buscar una referencia, entrar al editor, elegir datos/imágenes/ficha/precios y conocer qué falta para publicar. Carga masiva mantiene un destino propio. Solo aparecen destinos asignados explícitamente.

FIRST VIEWPORT: cabecera Biblioteca y navegación principal en una fila; lista buscable debajo. En el editor, identidad compacta arriba, índice de 185px a la izquierda y una hoja de edición amplia a la derecha, sin vista previa lateral que compita por espacio. En móvil, selector de sección con etiqueta y contenido en una columna. Publicación usa lista de revisión y acciones visibles.

FORM: índice de referencia técnica, séptima fuente; seed:46988c3f56945ea6. Firma: seleccionar una sección muestra su contenido y reglas de guardado, conservando los cambios de las otras. Movimiento discreto de controles, sin animación de entrada ni contenido oculto por tiempo.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Límites

No cambia el diseño de la ficha del cliente, contratos de API, base, transiciones ni reglas de publicación. No se inventan métricas globales a partir de una página de productos. Los guardados de datos generales, ficha pública y notas siguen siendo independientes y se comunican como tales. El historial global sin implementar no se presenta como enlace funcional; el historial real sigue disponible dentro de cada producto.

## Actualización 2026-10-27: ajuste a la identidad del manual de marca

El usuario confirmó los valores del manual de marca (`D:\Empresa\web-gruposecurity\MANUAL DE MARCA`, borrador) con lecturas directas del documento: rojo institucional `#CE0203` (RGB 206, 2, 3) y gris institucional `#484748` (RGB 72, 71, 72). El manual no define tipografía oficial, por lo que se mantiene la familia vigente de la aplicación (Roboto y Roboto Condensed).

Decisión: la identidad azul tinta del contrato original (`#183247`, azul de interacción `#24577a`, fondos azulados) se reemplaza por la identidad de marca en las superficies de Biblioteca V2. La cabecera y la tinta pasan al gris institucional, el rojo queda para acciones, enlaces y foco, y los fondos y bordes pasan a neutros cálidos derivados del gris. No cambian el layout, la navegación ni el resto de la aplicación; la ficha pública del cliente sigue intacta.

La dirección séptima se conserva en estructura y recorrido; solo cambia su acabado cromático y la familia de los títulos. Este archivo documenta la decisión original sin reescribirla; esta sección registra su revisión. El sistema actual está descrito en `DESIGN.md` y `.impeccable/design.json`.
