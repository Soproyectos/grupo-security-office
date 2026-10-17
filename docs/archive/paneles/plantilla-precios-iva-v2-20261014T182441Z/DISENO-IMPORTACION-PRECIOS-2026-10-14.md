# Subir precios en tres pasos sin volver a mapear columnas

**Estado: diseño y plantilla de revisión, 14 de octubre de 2026.** Desarrolla la carga de listas del [panel Catálogo y precios](DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md). No modifica el importador de la web ni procesa archivos comerciales. La [plantilla XLSX](plantillas/PLANTILLA-PRECIOS-GRUPO-SECURITY-v1.xlsx) es un artefacto para revisar el nuevo contrato; el importador actual todavía necesita adaptación para reconocerlo y ejecutar solo precios.

## Decisiones confirmadas por el usuario

- Cada fila necesita una referencia/SKU que identifique el producto y al menos un precio nuevo para una tarifa.
- Compras prepara los **precios finales de cada tarifa**; el sistema no calcula márgenes desde el costo del proveedor.
- Los precios COP se manejan en **pesos enteros, sin decimales**, de manera uniforme en la plataforma.
- El objetivo es reducir los pasos para relacionar columnas, mediante una plantilla reconocible que Compras pueda rellenar según lo recibido del proveedor.
- Las listas actualizan precios. No importan ni alteran nombre, marca, categoría, imágenes, documentos o demás identidad de Biblioteca.

Instalador, Tienda, Oro y Platino se llaman **tarifas** o niveles de precio. La categoría del producto es otra cosa: cámaras, cables, alarmas, etc. La carga de precios no necesita esa categoría.

## 1. Recomendación: dos entradas, una misma revisión

**Primera etapa: plantilla estándar.** Compras descarga la plantilla, copia las referencias y los precios finales, la sube, revisa y aplica. No elige encabezados, categoría, marca, documentación ni mapeos. Es la vía más sencilla de construir y comprobar primero.

**Segunda etapa: formato guardado por proveedor.** Para un proveedor que entrega el mismo Excel repetidamente se configura una vez qué hoja, encabezado, referencia y columnas de tarifas utiliza. Después Compras sube el archivo original y revisa el resultado. Ahorra también el trabajo de copiar precios a otra hoja. Cambios de estructura se detectan y requieren revisar el perfil; no se adivina una columna nueva en silencio.

Ambas entradas terminan en el mismo conjunto de propuestas SKU + tarifa + precio y usan idénticas validaciones, permisos, redondeo, auditoría y confirmación. La segunda no es permiso para importar identidad, ni para calcular nuevas tarifas a partir de costos. Un archivo con solo costo o descuentos requiere preparación por Compras hasta que exista un módulo separado de cálculo aprobado.

No se recomienda obligar a rehacer todos los archivos de proveedores para siempre. Empezar con plantilla ofrece un contrato claro; los perfiles reutilizables se añaden a los proveedores más frecuentes una vez estable ese contrato.

## 2. Pantalla propuesta

Desde **Catálogo y precios → Listas → Importar**, o desde una lista ya abierta:

1. **Subir archivo:** lista destino o Crear lista, archivo y modalidad Plantilla Grupo Security / Formato de proveedor. Cuando se entra desde una lista, el destino ya está elegido. Moneda, fecha de vigencia y tarifas se muestran sin repetirlas por fila.
2. **Revisar cambios:** cantidad de referencias, precios nuevos/modificados/sin cambios, redondeos, advertencias y errores. Una sola pantalla paginada permite filtrar por problema y descargar sus filas con el motivo.
3. **Aplicar actualización:** confirmar la revisión concreta, con resumen de la lista y sus tarifas. Si tiene permiso de preparar y de aplicar, la misma persona termina el proceso; si no, deja el trabajo preparado para quien sí lo tenga.

Las etapas técnicas Parsear, Validar y Normalizar siguen ejecutándose en el servidor. Se eliminan pantallas innecesarias del recorrido, no los controles. Progreso e historial siguen disponibles al cerrar y volver a abrir la pestaña.

**Descargar plantilla** permite elegir las tarifas que actualizará. Ofrece «Vacía» o «Con las referencias de esta lista»; esta última puede incluir valores actuales como referencia si la persona tiene lectura/exportación. Referencias y tarifas omitidas conservan sus valores. No se deja que un archivo elija otra lista destino o consiga acceso adicional.

## 3. Qué contiene la plantilla

Hoja principal **PRECIOS**, encabezados en la fila 1, una fila por referencia. Requiere `REFERENCIA` y al menos una columna de tarifa reconocida. Se pueden rellenar varias tarifas en la misma fila, sin repetir la referencia por cada tarifa.

La muestra contiene los siete códigos que reconoce el normalizador local:

- `INSTALADOR_IVA`: Instalador (con IVA).
- `TIENDA_IVA`: Tienda (con IVA).
- `DPP_ORO_IVA`: DPP Oro (con IVA).
- `DPP_PLATINO_IVA`: DPP Platino (con IVA).
- `CLIENTE_FINAL_IVA`: Cliente Final (con IVA).
- `ORO_SIN_IVA`: Oro (sin IVA).
- `INSTALLER_SIN_IVA`: Installer (sin IVA).

Esto no confirma cuáles existen o están activas en la BD real. La plantilla descargada por el sistema se genera con las tarifas configuradas/autorizadas, sus códigos estables y tratamiento de IVA. No crea tarifas automáticamente por encontrar un encabezado desconocido ni confunde Oro con DPP Oro.

La hoja **TARIFAS** explica los códigos. **INSTRUCCIONES** contiene la guía. **EJEMPLO** usa referencias ficticias y nunca se procesa como datos. **CONTRATO** identifica `GS_PRICE_UPDATE`, versión 1, hoja PRECIOS, COP, precios finales, política de vacíos y precisión. Estos metadatos se validan contra reglas del servidor; editarlos no concede accesos ni cambia el redondeo autorizado.

La plantilla entregada contiene 2 000 filas vacías preparadas por comodidad, sin datos comerciales ni fórmulas. Ese tamaño no fija el límite de la futura importación. La plantilla futura debe tener nombre de hoja/cabeceras reconocidos para saltarse el mapeo; no basta cambiar la extensión de cualquier Excel.

### Requisitos de identificación

- SKU/referencia como texto: conserva ceros iniciales, guiones y sufijos. No usar la descripción como clave ni añadir ceros que ya se perdieron.
- Si el proveedor usa otra referencia, mantener una equivalencia explícita y autorizada proveedor + referencia externa → producto, configurada una vez. Sin correspondencia única se deja pendiente.
- No eliminar caracteres internos o aplicar coincidencia aproximada sin avisar. Una corrección de espacios exteriores puede proponerse con su comparación; colisiones o identificadores ambiguos se bloquean.
- Las referencias desconocidas quedan pendientes: no se crean productos desde esta carga. Resolverlas en Biblioteca requiere permiso explícito y no se exige ese permiso a quien solo actualiza precios.

## 4. Datos numéricos y redondeo

**Confirmado:** COP tiene cero decimales en el resultado. **Regla recomendada para concretarlo:** redondeo al peso más cercano, empate hacia arriba para importes positivos (HALF_UP). No se redondea a centenas/miles ni se fija la misma longitud para todos los precios.

- 123456,49 recibido → 123456 guardado → $123.456 mostrado.
- 123456,50 recibido → 123457 guardado → $123.457 mostrado.
- 800 recibido → 800 guardado → $800 mostrado.

Guardar y mostrar son cosas diferentes: ocultar decimales con formato de Excel no redondea el valor real. La plantilla muestra las fracciones de entrada si existen para no esconderlas antes de la revisión. El servidor muestra precio recibido, valor interpretado, ajuste por redondeo y precio final, además del anterior y su diferencia.

**Plantilla:** preferir celdas numéricas de Excel y copiar/pegar solo valores. No ejecutar fórmulas, macros ni enlaces externos, ni confiar en resultados calculados guardados dentro del archivo. Si Compras calcula precios en su archivo de trabajo, pega el resultado como valor en PRECIOS.

**Formato de proveedor:** el perfil declara separadores, moneda y hoja; no usar heurísticas distintas por fila. Un texto ambiguo como `1.234` no se interpreta unas veces como 1234 y otras como 1,234 sin una convención explícita. Texto con sufijos inválidos como `120000abc` se rechaza completo, no se rescata su prefijo numérico.

El contrato decimal usa representación exacta: no usar `parseFloat` como validación ni cálculos monetarios con aproximación binaria. La política versionada de COP debe ser común a importación, edición manual, API y presentación. Para esta etapa se puede conservar `Decimal(12,2)` en BD escribiendo enteros con fracción `.00`; no hace falta cambiar el tipo de todas las tablas para mostrar cero decimales. Los cálculos de cantidades/totales tienen su propio contrato y no deben redondearse en pasos distintos silenciosamente.

Los valores se validan antes y después de redondear: finitos, positivos, dentro del rango permitido. Si 0,40 termina en cero o el redondeo desborda el rango de almacenamiento se informa error. No aplicar valores negativos, cero, NaN o infinito. El límite operativo final debe ser único en validadores, API y BD; el actual `Decimal(12,2)` tiene diez dígitos enteros, pero el validador existente usa un límite menor.

No migrar precios ya almacenados ni recalcular cotizaciones/facturas históricas por adoptar la política. Primero presentar el impacto de redondear precios vigentes y revisar la migración necesaria. El contrato de esta plantilla es exclusivamente COP; no aplicar automáticamente precisión cero a USD u otras monedas.

### IVA, tarifas y celdas vacías

- Los precios ya son finales para su tarifa: no sumar IVA, aplicar márgenes ni convertir monedas automáticamente. Cada tarifa conserva su base con/sin IVA de manera explícita. Si sus metadatos no están configurados, se bloquea esa tarifa hasta definirlos.
- Una celda vacía significa «no actualizar». No es cero ni eliminar.
- Una columna de tarifa no incluida conserva esa tarifa; una referencia ausente conserva su producto y precios.
- Una fila sin referencia y sin precios se ignora. Si tiene precios y carece de referencia, es un error. Una referencia sin ningún precio se informa como incompleta, no como actualización exitosa.
- Repetir una referencia en el archivo se bloquea, incluso si trae valores iguales, para que Compras resuelva la duplicación. No sumar precios ni usar la última fila silenciosamente.

## 5. Comparación y aplicación

Revisar **todas** las filas incluidas, no solo la muestra de pantalla. Comparación por producto, lista destino y tarifa: nuevo precio normalizado, precio anterior, diferencia absoluta/porcentual y advertencias de cambios llamativos. Un aumento grande no es necesariamente un error; se señala y la persona confirma sin inventar una aprobación obligatoria de ventas.

Las filas con errores quedan visibles con celda/fila/motivo. La actualización seleccionada solo se aplica cuando sus filas están correctas. Excluir incidencias exige elección expresa y muestra los totales pendientes; jamás decir «todo actualizado» si quedaron filas sin aplicar. Generar una lista nueva no implica publicar productos ni crear sus fichas.

Aplicar confirma una revisión comercial concreta. Conservar archivo original, hash, autor, lista, perfil/plantilla y sus versiones, política de redondeo, tarifas autorizadas, vigencia, valores recibidos/normalizados/anteriores y resultado por fila. No guardar todo el Excel en campos públicos del producto.

Si cambiaron precios, referencias o configuración entre revisar y aplicar, señalar conflicto antes de sobrescribirlos. Verificar nuevamente permisos y alcance al ejecutar; revocar permisos impide los cambios todavía no confirmados. Un reintento no duplica la actualización ni eventos de éxito.

## 6. Qué se aprovecha del importador y qué se separa

Revisión estática local, sin importaciones reales ni consulta de BD:

- `src/frontend/src/features/products/import/components/ImportWizard.tsx`: nueve etapas visibles (carga, encabezados, mapeo, secciones, documentar, validación, confirmación, ejecución, resultado). La vía de plantilla elimina las pantallas de encabezados/mapeo/secciones/documentación, conservando la revisión.
- `ImportMapping` y `import.service.ts:641–728`: ya guardan pares columna → campo, nombre y usuario. No representan por sí solos un formato completo de proveedor. Ampliar con proveedor, hoja, fila, locale, moneda, referencias, esquema esperado, versión y tarifas; no prometer reconocimiento robusto del archivo con lo que hoy guardan.
- `sources/excel-adapter.ts:65–82`: toma la primera hoja y usa lectura de texto formateado (`raw:false`). La vía de plantilla debe leer PRECIOS y los valores numéricos reales, ignorando ejemplos y guías sin heurísticas de encabezado.
- `numeric-parser.ts` infiere separadores y usa `parseFloat`; `row-validator.service.ts` tiene otro parser. Pueden discrepar: el caso `1,5` se trata de forma distinta. Reemplazar esa divergencia por un único contrato de importación de precios.
- `row-normalizer.service.ts:24–31`: siete códigos hardcoded; no prueba su presencia en BD. `prisma/seed.ts:268` deja las tarifas fuera del seed actual.
- `batch-executor.service.ts:253–350`: puede resolver/crear marcas/categorías, modificar identidad no bloqueada y crear productos. **No sirve sin cambios como ejecutor exclusivo de precios.** El nuevo ejecutor no llama esas rutas de escritura ni necesita nombre/marca/categoría.
- `schema.prisma:289–310`: precio único por producto + tarifa, no por lista comercial. `upsertPrices` no escribe `listaId` en el camino revisado. Antes de permitir precios diferentes del mismo producto/tarifa en listas distintas, resolver la pertenencia y selección de oferta descritas en el diseño principal. No crear un nuevo botón que siga sobrescribiendo un precio global bajo otra lista.

La separación propuesta incorpora: reconocimiento de plantilla/perfil → propuesta de precios tipada → validación y normalización decimal única → comparación → revisión comercial persistida → aplicación autorizada y auditada. Reutiliza carga, sesiones, progreso y almacenamiento cuando sus contratos sean compatibles; evita reescribir el importador de Biblioteca.

## 7. Orden de construcción

1. Cerrar el contrato de tarifas autorizadas, IVA, identificadores y la regla HALF_UP propuesta. Copiar el precio final de Compras no exige configurar márgenes.
2. Resolver el modelo precio/lista/tarifa y las revisiones comerciales antes de escribir el nuevo ejecutor.
3. Implementar el contrato de plantilla y el generador personalizado en la web; mantener la plantilla versionada, sin tarifas nuevas por encabezados desconocidos.
4. Implementar normalización decimal y revisión completa de filas con errores accionables; comparador paginado sin limitar la validación a las primeras filas.
5. Implementar aplicación por permisos y alcance, concurrencia, reintentos, eventos e historial; conectar la pantalla de tres pasos.
6. Validar localmente. Después añadir perfiles completos para los proveedores recurrentes, utilizando el mismo motor. Publicación a producción requiere su autorización propia.

No se han asignado permisos ni delegado implementación en este trabajo. La inspección auxiliar del código fue de solo lectura.

## 8. Comprobaciones antes de considerarlo funcional

- [ ] La plantilla se reconoce sin mapear; las tarifas no seleccionadas o vacías conservan su precio.
- [ ] SKU textual conserva ceros y sufijos; referencias desconocidas/ambiguas quedan pendientes sin crear productos.
- [ ] No se modifican nombres, marcas, categorías, imágenes, atributos ni documentos al cargar precios.
- [ ] COP termina en pesos enteros mediante la misma política en carga, edición y API. Mostrar el valor recibido y cada redondeo antes de aplicar.
- [ ] Fallan textos inválidos/ambiguos, fórmulas no admitidas, precios no finitos, ceros/negativos y valores fuera de rango antes/después del redondeo.
- [ ] Las tarifas con IVA y sin IVA no se confunden; no se aplica IVA/margen/conversión automáticamente.
- [ ] Las filas de ejemplo, hojas auxiliares y filas realmente vacías no se importan.
- [ ] Se comprueban todas las filas aunque la revisión tenga paginación; excluir errores es explícito.
- [ ] Una tarifa/lista no autorizada se rechaza por API y por archivo, incluso al ejecutar un perfil antiguo.
- [ ] La misma referencia/tarifa en otra lista no recibe cambios por accidente; no se alteran cotizaciones/facturas históricas.
- [ ] Reintento, reinicio, cambio concurrente o revocación no duplica ni sobrescribe operaciones indebidamente.
- [ ] Un proveedor con formato cambiado pide revisar el perfil y no asigna precios a otra tarifa por similitud del encabezado.

## 9. Fuentes y límite de las recomendaciones

Consultadas el 14 de octubre de 2026; documentación oficial como apoyo al contrato, sin enviar datos de proveedores a servicios externos:

- [Microsoft: conservar ceros iniciales y números grandes](https://support.microsoft.com/en-us/excel/keeping-leading-zeros-and-large-numbers). Excel puede perder ceros o precisión en códigos numéricos. Apoya tratar referencias como texto; el sistema no puede reconstruir caracteres que se perdieron antes de subir el archivo.
- [Microsoft: función ROUND](https://support.microsoft.com/en-us/excel/functions/round-function?ns=NULL&version=undefined). Distingue redondear valores de elegir dígitos o múltiplos. No obliga a usar fórmulas en la plantilla; el redondeo oficial se propone en servidor.
- [PostgreSQL 16: tipos numéricos](https://www.postgresql.org/docs/16/datatype-numeric.html). Fundamenta representación decimal exacta y diferencias de redondeo frente a flotantes. Conservar precisión en BD no impone el formato visible; Grupo Security decide COP entero.

La plantilla y los perfiles de proveedor son recomendaciones para esta operación. Su reconocimiento automático, importación solo precios y política uniforme aún deben implementarse y verificarse en el ambiente elegido.
