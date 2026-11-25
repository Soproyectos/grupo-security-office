# Tienda pública · bloque 1 · 23 de noviembre de 2026

El visitante recorre el catálogo, reconoce el producto por su foto y abre una cotización desde el celular.

Trabajo local en `sad-golick-8a6b22`, rama `Esnaider/sad-golick-8a6b22`, base `bce9b1d1`. Se usó la integración que indica la guía del 23 de noviembre y se conservó el visor de imágenes presente en esa carpeta.

## Cambios

- Las tarjetas reservan un marco de proporción fija con fondo blanco y muestran las fotos completas. Si falta la imagen o falla la carga, aparece el marcador de producto.
- Catálogo y subcategorías usan las imágenes disponibles del menú. Una categoría sin foto muestra un icono.
- La tarjeta mantiene su enlace a la ficha y destaca «Cotizar» cuando el producto admite cotización y carece de precio público. Los importes, IVA y mensajes de ficha informativa siguen su lógica existente.
- La ficha omite miniaturas fallidas, muestra una imagen disponible y conserva el visor ampliable. Cuando no queda ninguna, muestra «Imagen no disponible».
- En la ficha, el botón «Cotizar» abre el canal de WhatsApp del producto. En móvil ocupa una fila de ancho completo y el acceso flotante queda visible a partir de 1024 px. La navegación principal conserva Catálogo, Soluciones y Soporte.
- La pestaña usa «Grupo Security» mientras la aplicación carga y en el acceso de clientes. Las páginas con título propio lo mantienen.

## Evidencia

| Vista | Antes | Después |
|---|---|---|
| Cámaras, 1440 px | Subcategorías vacías, fotos recortadas y texto «Precio a consultar» en cada tarjeta visible. | Las tres subcategorías muestran icono. Las cuatro primeras fotos usan `contain`, incluido el cable que aparecía recortado. |
| Ficha DS-A81024S, 390 px | CTA fijo de 150 × 32 px y solapamiento con WhatsApp flotante. | CTA de 343 × 44 px, flotante oculto. El visor abre y cierra con Escape. |
| Catálogo y búsqueda | El informe previo registró fotos rotas en la búsqueda Hikvision. | Las nueve fotos de categoría cargaron desde el directorio del menú. La búsqueda mostró 24 tarjetas, dos con marcador y cero imágenes rotas visibles en el DOM inspeccionado. |
| Teclado y título | El título inicial incluía «Panel de Administración». | A 375 px no hubo desbordamiento horizontal en búsqueda. Se comprobó «Grupo Security» en `/clientes/login` y el título del panel en `/login`. |

Las capturas de antes y después se tomaron en el navegador integrado durante la revisión. Los resultados se verificaron con contenido público en modo lectura. En móvil aparece el control de anotaciones de desarrollo. No se provocó una falla de todas las imágenes en la ficha conectada.

## Verificaciones de diseño

| Ley | Resultado | Evidencia |
|---|---|---|
| Fitts | Cumple | CTA fijo de 44 px de alto y ancho disponible en móvil. |
| Hick | Cumple | Una acción visible de cotizar por tarjeta elegible. |
| Jakob | Cumple | Se reutilizó la navegación, el buscador, el visor y el canal de atención existentes. |
| Miller | No aplica | El bloque no reorganiza las especificaciones del producto. |
| Parkinson | No aplica | No se midieron tiempos de tarea ni se modificó el registro. |
| Prägnanz | Cumple | Marcos uniformes, pictogramas en subcategorías sin imagen y dos marcadores de producto observados en búsqueda. |
| Proximidad | Cumple | Imagen, nombre, SKU, precio o cotización permanecen juntos en cada tarjeta. |
| Tesler | Cumple | La presentación conserva los importes y el IVA recibidos. |
| Von Restorff | Cumple | La barra de la ficha destaca el botón de cotización y evita el solapamiento con WhatsApp. |
| Zeigarnik | No aplica | El cambio no introduce tareas con progreso pendiente. |
| Posición serial | Cumple | Catálogo abre la navegación y Soporte la cierra. |
| Pareto | Cumple | El bloque facilita reconocer y cotizar productos dentro del flujo existente. |

Se reutilizaron tipografía, radios y colores del proyecto. La decisión visual fue reservar la proporción de las tarjetas y ajustar las fotos con CSS de soporte amplio. Las transiciones de página y un sistema de componentes nuevo quedaron fuera de este bloque. El mínimo táctil del proyecto coincide con el criterio mejorado AAA del W3C. [MDN sobre ajuste de imágenes](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/object-fit) · [MDN sobre proporciones](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/aspect-ratio) · [W3C sobre tamaño de interacción](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)

## Verificación técnica

- `tsc --noEmit` completado sin errores.
- ESLint en los archivos modificados completado con cero errores y un aviso preexistente en `Login.tsx` por la dependencia `submitError`.
- Vitest en tienda, ficha, portal y App completado con 815 pruebas en 75 archivos.
- `git diff --check` completado para los archivos del bloque.
- Contraste calculado del botón móvil a partir de los colores comprobados en el navegador, 4,83:1. El foco de la cabecera y el cierre del visor con Escape se verificaron manualmente.

## Fases restantes de la web local unificada

| Fase | Resultado |
|---|---|
| Productos descontinuados | La ficha ofrece «Preguntar por un equivalente» con la referencia en el mensaje comercial. Se conservan la publicación, los importes existentes y la condición informativa. |
| Campaña | La integración ya contempla una aparición por campaña y revisión en cada sesión, una demora de tres segundos y cierre con Escape. Comprobado en el código y en las pruebas de campañas. |
| Portal de clientes | Una cuenta con acceso básico puede pedir precios mediante el canal comercial existente. Los fallos de conexión, servicio y credenciales reciben mensajes distintos. El cambio de contraseña confirmado muestra un aviso y retira los requisitos anteriores. |
| Portada y pie | Se amplió el texto secundario de portada, se dio más espacio táctil a los enlaces del pie y se añadió el aviso de nueva pestaña al Estatuto del consumidor. El pie llega al fondo en páginas cortas. |
| Imágenes y fuentes | La primera fila de la cuadrícula se carga de inmediato, con dos, tres o cuatro imágenes según las columnas. Las filas siguientes conservan la carga diferida. La hoja de fuentes y sus conexiones se inician desde el HTML. |
| Ficha técnica | Los tres primeros grupos se muestran abiertos y los demás se pueden desplegar. El menú lateral también abre el grupo elegido. Se deduplican documentos con la misma URL y se reemplaza `UND` por un aviso comprensible. La ficha usa los destacados o la descripción que ya aporta el producto. |
| 404 y errores | Aplicado al final. Una URL desconocida muestra la marca Grupo Security y enlaces para regresar. Un fallo al cargar categorías ofrece reintentar y una categoría ausente conserva el mensaje de recurso no encontrado. |

### Evidencia final

- 404 observado a 1440 y 390 px. Conserva la URL, carga el logotipo, presenta acciones de al menos 44 px y se ajusta al ancho de ambas ventanas. A 1440 px el pie llega al borde inferior.
- En la ficha DS-A81024S se comprobó la oferta de equivalente con la referencia en el enlace, un botón móvil de 343 × 44 px y tres grupos abiertos de trece en escritorio. El grupo Hardware abrió al seleccionarlo en el índice.
- En Cámaras se observaron cuatro imágenes con carga inmediata a 1440 px y dos a 390 px. Las demás conservaron la carga diferida. Una recarga de la web pública mostró la primera tarjeta en aproximadamente 3 s en una observación. El entorno local tardó más de 28 s en la primera medición del día. Las cifras corresponden a entornos distintos y a una muestra puntual.
- TypeScript, ESLint y `git diff --check` pasaron. Vitest pasó con 818 pruebas en 75 archivos de tienda, ficha, portal y App.

Los cambios reutilizan controles nativos para plegar grupos y los puntos de quiebre existentes para dar prioridad visual a las primeras imágenes. Las comprobaciones incluyen tamaño de los objetivos táctiles, reducción de opciones simultáneas y navegación reconocible. [HTML Standard sobre detalles desplegables](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-details-element) · [web.dev sobre carga de la imagen principal](https://web.dev/articles/optimize-lcp) · [MDN sobre conexiones anticipadas](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preconnect)

### Pendientes de publicación

- El 404 se validó en la interfaz local. Queda por verificar el código HTTP que responderá el servidor publicado.
- El portal autenticado se comprobó con pruebas automatizadas. El registro y las operaciones con cuentas reales requieren un entorno autorizado con las migraciones y servicios correspondientes.
- Según la guía, quedan por autorizar las migraciones `20261120090000_portal_auth_better_auth` y `20261120130000_portal_account_rules`, además de commit, PR y despliegue. Los cambios están guardados en el worktree local.

## Vista pública de subcategorías · 23 de noviembre de 2026

El cliente llega desde el menú a una subcategoría, entiende dónde está y encuentra un producto por nombre, referencia, marca o especificación disponible.

La referencia inicial mostraba el título de la familia, círculos y un selector repetido antes de llegar a los productos. La vista nueva muestra la ruta de ubicación, el título exacto y una cuadrícula de resultados. Reutiliza `SearchFilterBar` y `ProductPagination` del catálogo interno, con datos del catálogo público. La búsqueda, el tamaño de página y los filtros quedan en la URL y preservan la subcategoría.

| Criterio UX | Comprobación |
|---|---|
| Fitts | Anterior y Siguiente miden 44 px de alto a 375 px. |
| Hick | Marca y especificaciones disponibles aparecen agrupadas en Filtros. |
| Jakob | Ubicación enlazada, búsqueda y navegación de página siguen los controles conocidos. |
| Miller | La jerarquía de la familia se concentra en la ruta de ubicación. |
| Parkinson | No aplica. El flujo no impone tiempos. |
| Prägnanz | A 1430 px se observaron cuatro tarjetas de 206 px por fila. En la última página las tarjetas conservaron ese ancho. |
| Proximidad | El conteo aparece junto a la cuadrícula y cada ficha mantiene foto, referencia y acción agrupadas. |
| Tesler | El sistema conserva la subcategoría al paginar o aplicar filtros. |
| Von Restorff | Se conserva una acción de cotización destacada en cada tarjeta que la admite. |
| Zeigarnik | No aplica. No hay pasos de una tarea guardada. |
| Posición serial | La ruta empieza en Inicio y termina en la subcategoría seleccionada. |
| Pareto | Buscar, afinar los resultados y pasar de página quedan accesibles en la misma vista. |

Comprobación de navegador en Cámaras especiales y para vehículos. Se observó un total de 23 productos, repartidos en 20 y 3 con el tamaño inicial. Al elegir 40 se vieron los 23 en una sola página. Con Hikvision y la búsqueda «cable» aparecieron tres resultados de la misma subcategoría. Se revisaron 1430 × 721, 390 px y 375 px sin desbordamiento horizontal. Se verificó la presencia del filtro de marca. Esta subcategoría no ofrece facetas técnicas en el catálogo actual.
