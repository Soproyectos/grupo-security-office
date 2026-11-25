# Selector por requisitos técnicos

> La información de puertos y de cobertura de facetas de este documento corresponde a etapas anteriores. Energía ya cuenta con atributos y los datos tipados fueron cargados a WORKING. Consultar el [estado vigente del 24/11](2026-11-24-tienda-local-estado-vigente.md). Las validaciones visuales de abajo se mantienen como evidencia de su etapa.

Estado integrado y verificado en código y API local, en el puerto 5181.

El visitante elige dispositivos por características técnicas de la familia, combina requisitos y consulta resultados paginados. El usuario delegó el análisis y la implementación el 23 de noviembre de 2026, usando HiTools Designer como referencia funcional.

## Contrato de diseño

La categoría aprovecha el ancho disponible. Categoría y marca ocupan un lateral compacto. Los requisitos técnicos se abren dentro de Filtros en el lateral. El móvil tiene un botón Requisitos técnicos en la fila de filtros sobre los productos. Cada opción tiene su casilla y conteo. Los grupos largos permiten ver más opciones y las selecciones se pueden quitar desde los filtros activos.

Las opciones proceden exclusivamente de fichas públicas. El nombre comercial y el SKU no justifican deducir atributos. Un dato ausente o desconocido no equivale a una respuesta negativa. La publicación de fichas conserva su flujo existente.

## Contrato funcional

Endpoint de lectura implementado `GET /api/public/catalog/requirements?category=<slug>&subcategory=<slug opcional>` con respuesta `products` y `facets`. Cada faceta contiene `specKey`, `label`, `dataType`, `unit` y opciones con `value`, `label` y `count`. Los valores mantienen las unidades para distinguir magnitudes diferentes.

El listado admite parámetros `requirement=<clave>:<valor>` repetidos. Se combinan los parámetros entre sí. Dentro de cada parámetro se acepta cualquiera de los valores marcados, salvo Protocolos, donde deben cumplirse todos. Protocolos se separan en opciones individuales y las variantes descriptivas de Zonas se agrupan por la capacidad indicada. El servidor sigue aceptando valores completos de enlaces anteriores. La comparación y el conteo se aplican en servidor antes de paginar y conservan la visibilidad pública existente. La consulta usa la revisión publicada de grupos y especificaciones, con el mismo fallback de las fichas existentes para revisiones históricas.

Los consumidores afectados son CategoryPage, SubcategoryProducts, public-catalog.service del frontend y las consultas paginadas públicas. Los filtros `keySpec` existentes conservan su contrato.

## Verificación

La compilación del backend pasó. Las seis pruebas nuevas comprobaron selección exacta, conteo sin duplicados, cobertura por familia, ausencia de inferencia, unidades distintas y aislamiento de la revisión publicada. Las pruebas existentes del servicio público y paginación del frontend pasaron con 26 casos. ESLint pasó para los archivos modificados de backend y frontend. TypeScript del frontend detectó seis errores fuera del selector en comparación/precios y pruebas de sesión. La revisión visual a 1440/375 quedó pendiente porque el servicio del navegador no respondió.

La consulta real por cámaras analógicas devolvió ocho facetas. La selección de lente fijo indicó tres productos y el listado filtrado devolvió total tres con una página de un producto. La consulta con categoría de tipo array fue rechazada con HTTP 400.

Cobertura observada por categoría el 23 de noviembre de 2026

| Categoría | Parámetros disponibles |
|---|---|
| Cámaras | Alimentación, resolución máxima, tipo de lente, protección, audio, distancia focal, alcance IR, sensor |
| Alarmas | Zonas, protocolo |
| Audio y perifoneo | Respuesta de frecuencia, sensibilidad, impedancia, potencia |
| Cableado | Categoría, longitud, conductor |
| Control de acceso | Protección, capacidad, comunicación |
| Redes y Wi-Fi | Puertos |
| Monitores y pantallas | Tamaño, resolución, brillo, frecuencia de actualización |
| Energía y electricidad, parqueaderos | Sin parámetros coincidentes en las fichas públicas consultadas |
| Casa inteligente, cerrajería y herrajes | Sin productos públicos en la consulta |

La cobertura se amplía cuando la ficha publicada incorpora datos con etiquetas compatibles. La implementación no migra el esquema ni completa o publica automáticamente datos de productos.

## Entorno de validación

La rama activa es `Esnaider/sad-golick-8a6b22`. La web de trabajo sigue en `http://127.0.0.1:5181`. Vite incorpora `VITE_CATALOG_API_TARGET=http://127.0.0.1:4314` para listado público y requisitos. El portal conserva `VITE_PORTAL_API_TARGET=http://127.0.0.1:4312` y el resto usa `VITE_API_TARGET=http://127.0.0.1:3010`. La API de requisitos solo escucha en loopback y comparte la base existente mediante el túnel existente.

La compilación temporal está en `%TEMP%/gso-requirements-build`. El lanzador local `%TEMP%/gso-5181-portal/launcher.cjs` inicia la API de requisitos en 4314. El retorno OAuth de 4173 y la API del portal de 4312 continúan como procesos independientes. El reinicio del equipo requiere volver a iniciar los procesos según la documentación de consolidación local.

## Revisión en la vista local del 24 de noviembre de 2026

- Alarmas muestra Zonas y Protocolos como casillas dentro de Filtros. En escritorio están en el lateral y en móvil se abren desde Requisitos técnicos.
- Con datos reales, la API reportó 4, 48, 64 y 96 zonas. Marcar 48 y 64 a la vez devolvió cinco productos. La combinación TCP y HTTPS también devolvió cinco.
- Chrome verificó Alarmas a 1430 y 375 px, incluidos clics sucesivos conservados y objetivos de 44 px. Control de acceso mostró sus casillas a 768 px.
- Pasaron 69 pruebas de frontend, 32 de backend, el lint de los archivos editados y TypeScript del backend. El chequeo global del frontend conserva los seis errores previos de precios, comparación y autenticación.


## Casillas y desplazamiento por categoría

Revisión del 24 de noviembre de 2026. Las once categorías se consultaron por la API local. Hay facetas en Cámaras, Alarmas, Audio y perifoneo, Cableado, Control de acceso, Redes y Wi-Fi, Monitores y pantallas y Parqueaderos. Energía devuelve cero facetas; Casa inteligente y Cerrajería tienen cero productos publicados.

Marcas y las especificaciones de subcategoría usan casillas. Marca conserva una selección activa por consulta. El panel lateral tiene cabecera estable con Limpiar y una única zona desplazable para las opciones. Su altura se limita a la ventana con un margen de 16 px y overscroll contenido.

La prueba Chrome a 1430 × 721 llevó el scroll interno de 0 a 3454 px con End. La página conservó su posición en 554 px. Después de desplazar la página, el panel quedó entre 16 y 705 px, completo dentro de la ventana. Se verificó casilla de Marcas. ESLint y 51 pruebas pertinentes pasaron.

Fundamento del comportamiento
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior
- https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html
