# Piloto de enriquecimiento y marcas excluidas

Rama `Esnaider/validacion-biblioteca`. La exclusión de Dahua e Imou se aplica al inventario web, al recolector, a la exportación revisada, a las transiciones de publicación y a las lecturas de catálogo público, vitrina y portal. El servidor comprueba la marca relacionada, la etiqueta comercial y la identidad congelada en la revisión. Las fichas excluidas conservan su registro interno.

El lector de las 39 listas confirmó 5.367 filas, 5.038 SKU únicos y 329 apariciones adicionales. El inventario resultante tiene 3 exclusiones explícitas, 1.563 referencias en revisión de identidad y 3.472 candidatos de investigación. El cruce usó `biblioteca-import-web.json`, una referencia histórica de fichas públicas. La Biblioteca actual requiere un snapshot autorizado completo para confirmar qué SKU existen y cuáles faltan.

El piloto seleccionó 15 SKU Hikvision y 15 Ciles. El directorio local `scraper-fichas/data/piloto-hikvision-ciles-verificado` contiene el resumen, las 30 referencias, cuatro conflictos de marca con fuente del fabricante y evidencia inicial de ocho fichas para revisión. El catálogo de Ciles es público y consultable. Los datos de un certificado de tercero alojado por Ciles se registran como evidencia secundaria. [Catálogo de Ciles](https://ciles.co/productos/) · [Catálogo de Paradox](https://www.paradox.com/CATA2016_rev00.pdf)

Primera pasada con prioridad Hikvision. `revision-hikvision.json` cubre los 15 SKU del piloto con 13 modelos identificados y dos casos apartados para confirmar identidad. El riel 3U/4U necesita equivalencia oficial con el código del distribuidor. El manual de la campana HF-CAB1 no identifica el sufijo `(O-STD)` y hay discrepancia en el rango sonoro entre documentos consultados. El archivo reúne 99 registros de evidencia con decisión pendiente. Se verificó que coincide uno a uno con el piloto de Hikvision. Quedan pendientes imágenes principales, permisos de reutilización y revisión de Compras. [Distribuidor del riel](https://www.syscomcolombia.com/producto/DS-ADAPTER-RACK-HIKVISION-159647.html) · [Manual HF-CAB1](https://assets.hikvision.com/prd/normal/all/doc/m000168255/HF-CAB1-user-manual.pdf)

## Carga autorizada en QA local

Se guardaron 13 revisiones `SIN_REVISAR` en `gs_qa_compras` de `127.0.0.1`. El lote `HIKVISION-PILOTO-20261104` contiene 48 especificaciones y 12 referencias a documentos dentro de la evidencia. Las dos fichas con identidad pendiente quedaron fuera de la escritura. El nombre, modelo y especificaciones del DVR con revisión pública fijada se guardaron como propuesta separada para conservar el contenido completo que ya tenía.

El ejecutor local `cargar-qa-hikvision.cjs` simuló primero la operación y después la aplicó en una transacción. Antes de confirmar, comparó las huellas de filas vivas, revisiones públicas, imágenes y recursos de los 15 SKU. Una conexión independiente confirmó 13 revisiones y cero revisiones publicadas de este lote. `resultado-qa-hikvision.json` conserva el resultado por SKU. Para revertir, localizar exclusivamente las revisiones no publicadas marcadas con ese lote y validar que Compras no las haya editado o vinculado antes de cualquier eliminación.

## Imágenes del piloto Hikvision

Se contrastaron los 15 SKU con el catálogo público de Grupo Security (94 productos) y con sus vínculos de imagen en `gs_qa_compras`. El paquete local `imagenes-hikvision.zip` incluye dos fotos reutilizables de Grupo Security, once imágenes externas correspondientes al modelo y dos referencias separadas pendientes de confirmar identidad. La foto secundaria del DVR era un gráfico de prueba y quedó excluida. Las imágenes externas conservan su origen y el estado de permiso de reutilización en `mapa-imagenes.csv`. Se verificaron la decodificación de los 15 archivos y la integridad del ZIP. [Ficha de la PTZ en Grupo Security](https://gruposecurity.co/product/camara-domo-ptz-turbo-hd-2mp-ds-2ae4215ti-de/)

## Ampliación a las referencias Hikvision de las 39 listas

El censo enlazó 1.025 referencias con QA local y contrastó marca de hoja, estado, nombre comercial, grupos técnicos, medios y tarifa vigente. 209 quedaron en revisión de identidad, incluidas 72 atribuidas a Hikvision por el nombre del archivo pero procedentes de una hoja HiLook. Las 816 restantes se cruzaron con los índices de Hikvision, Grupo Security y distribuidores. Se consultaron 525 candidatos de fichas oficiales y familias. Los modelos de una familia solo aportan identidad cuando la variante figura explícitamente, y los datos técnicos de familia requieren cotejo por SKU.

`lote-hikvision/lote-hikvision-revision.zip` incluye la matriz, evidencia por campo, resumen y cola pendiente. La primera ronda documentó identidad en 536 referencias y especificaciones con fuente en 440. De los 202 SKU con archivo principal de firma válida en QA, 107 comparten el archivo con otro SKU. La identidad de la foto se revisa por separado. Se validaron la unicidad de los 1.025 SKU, las columnas del CSV, la trazabilidad de cada registro de evidencia y la integridad del ZIP. Esta etapa recopiló datos y dejó la aprobación de Compras y la carga web como pasos posteriores.

Para el primer grupo de revisión se intentó recuperar una imagen por SKU en 101 casos. Se descargaron 28 archivos legibles y el cotejo visual descartó seis iconos de soporte y una foto reutilizada de una variante distinta. `fotos-hikvision-para-revision.zip` conserva 21 fotos y el mapa de descarga. La correspondencia visual por variante y el permiso siguen pendientes para esos archivos.

## Inventario fotográfico de las 1.025 referencias

El cruce de Biblioteca QA, la tienda y los medios de Grupo Security, las galerías de Hikvision y las fichas de distribuidores dejó 542 SKU con archivo decodificable y 483 sin archivo. De los recuperados, 13 conservan la validación del piloto, 247 tienen una foto candidata con fuente, 92 tienen una asociación en QA por cotejar, 188 requieren confirmar la referencia o variante y dos requieren conciliar su marca con la evidencia oficial de Paradox. La selección incluye 68 archivos procedentes de la tienda o los medios de Grupo Security. Se muestrearon visualmente 72 archivos de los grupos pendientes de cotejo.

El servidor de medios de Hikvision denegó la descarga automática. Para 169 SKU sin archivo se conserva el enlace a la galería oficial y se indica si corresponde al modelo o a su familia. Los 314 restantes requieren otra fuente. Las hojas de origen se conservan como evidencia de la lista y no determinan por sí solas la marca. Dahua e Imou quedaron fuera de la búsqueda y del paquete.

`lote-hikvision/fotos-1025/fotos-1025-hikvision.zip` incluye un archivo seleccionado por SKU cuando existe, `mapa-1025.csv` con procedencia, estado y dimensiones, `sin-foto.csv` para continuar la búsqueda y `pendientes.csv` para revisar las fotos y variantes. Se verificaron la unicidad de los 1.025 registros y la integridad del ZIP. Esta ronda no escribió en Biblioteca ni publicó imágenes.

## Piloto de exportación de 20 fichas

Se seleccionaron 20 SKU identificados como Hikvision, incluidos ocho sin foto en el inventario anterior. Se recuperaron 20 fichas técnicas con el código dentro del PDF, 17 desde Hikvision y tres desde copias públicas de distribuidores. El cotejo visual seleccionó la foto de producto de la portada cuando correspondía, con una imagen de distribuidor de mayor resolución para DS-KAB673-P. Se exportaron 20 fotos. Una, de DS-7608NI-K2, queda en revisión hasta distinguir las revisiones D y E. La foto del DS-K1T321MFWX-B mide 200 × 111.

`lote-hikvision/piloto-20/piloto-20-hikvision.zip` contiene una carpeta por modelo, mapa CSV y 848 registros de especificaciones con fuente para revisión. El generador local es `preparar-piloto-20.py`. Pasó `py_compile` y se verificaron los 20 modelos únicos, las huellas de los archivos, la decodificación de las fotos y la integridad de las 64 entradas del ZIP. La aprobación de atributos, permisos y publicación queda en Compras. No se usaron las piezas promocionales LATAM ni se escribió en la base. Para revertir, retirar únicamente el paquete, sus archivos de trabajo y el generador local.

## Extensión local para recolectar por SKU

`scraper-fichas/browser-extension` incorpora una cola local de Chrome que toma el manifiesto de las 39 listas, reutiliza las fuentes oficiales investigadas y busca en Grupo Security y el distribuidor Hikvision Colombia. Guarda por SKU la evidencia de identidad, especificaciones, precios observados y archivos candidatos. El límite de foto se aplica al lado largo del área estimada del equipo cuando el fondo permite medirla. El PDF queda pendiente de validar por contenido. La cola pausa ante verificación y reanuda usando la sesión del perfil de Chrome.

El manifiesto real cargó en Chrome 5.038 referencias y conservó el estado al recargar. Dejó 3 excluidas por marca, 1.394 en revisión de identidad y 3.641 pendientes. Pasaron cinco pruebas de reglas y una prueba de extremo a extremo con fuentes simuladas en un perfil temporal de Chrome. Se comprobó en dos fichas públicas la detección del modelo exacto y sus imágenes. El recorrido de una tanda completa en sitios reales queda pendiente. La prueba de Chrome no modificó el perfil habitual ni Biblioteca. Para revertir el prototipo, retirar la carpeta de la extensión y deshabilitarla en el perfil de trabajo si se cargó.

La versión 0.1.1 muestra avance de tanda, actividad por fuente, motivos de descarga y la ruta devuelta por Chrome. El diagnóstico guarda un JSON de prueba al pulsar **Probar Descargas**. La prueba de navegador comprobó progreso en pausa y al reanudar, cuatro archivos del SKU, historial después de recargar y diagnóstico visible ante una descarga bloqueada. El diagnóstico del perfil habitual requiere recargar la extensión y ejecutar esa prueba allí.

## Verificación

- Se ejecutó dos veces la preparación con los mismos 39 Excel, el snapshot histórico y las cuatro discrepancias manuales. El resultado quedó en 30 trabajos pendientes, sin duplicados.
- `python -m unittest tests.test_enrichment -v` pasó 4 pruebas de conciliación, exportación, reanudación SQLite y generación de `catalogo-v1`. `python -m compileall -q scraper_fichas tests` terminó con código 0.
- Pasaron 230 pruebas de Jest de catálogo público, detalle, revisión, filtros, publicación, programación, vitrina, portal, reglas de validación y plantilla de importación. `tsc -p tsconfig.build.json --noEmit` y ESLint de los archivos productivos tocados terminaron con código 0. La comprobación completa de tipos del worktree también incluye errores previos en pruebas de precios y de productos.
- Pendientes la corrida automática de las fuentes, una sesión HiTools autorizada, la revisión de fichas por Compras y la comprobación con PostgreSQL local y la tienda navegable. El Python disponible no incluye `requests` y `beautifulsoup4`.

## Reversión

El trabajo es local. Para revertir el flujo de captura, retirar los módulos nuevos de preparación y exportación y sus integraciones del recolector. Para revertir la política web, retirar el predicado compartido y sus llamadas en los servicios de publicación y lectura. La cola SQLite está aislada en la carpeta del piloto y puede conservarse como evidencia. La generación de archivos y las pruebas no escribieron en Biblioteca.
