# Correcciones a partir de las pruebas de Biblioteca

Rama `Esnaider/validacion-biblioteca`, 26/10/2026. Trabajo local sin commit, push ni cambios productivos. El usuario reportó fallos del checklist y confirmó que cerró e inició sesión después de retirar accesos.

## Causas comprobadas

- La API QA conserva, en uno de los perfiles Admin Comercial, una fuente manual anterior con permisos completos de Biblioteca y Listas, junto al paquete vigente Actualización. Retirar solo los paquetes nuevos conserva por diseño esa otra fuente. Se verificaron únicamente roles y fuentes, sin imprimir identidades ni credenciales. No se modificaron asignaciones de QA.
- La búsqueda de más de dos caracteres usaba solo un umbral de similitud, sin garantizar fragmentos o códigos equivalentes sin guiones.
- El detalle de Productos reutilizaba controles de edición de la ficha y precios según permisos globales, mezclando consulta con Actualización.
- El editor no exponía claramente notas internas y archivo/restauración. Su historial consultaba el registro de auditoría antiguo; la edición general escribe cambios en `product_changes`.
- La bandeja Publicación ofrecía filtros y enlaces a consulta, sin una entrada clara a las acciones de publicar o programar.

## Código implementado y verificado localmente

- Decisión posterior del usuario: mostrar **solo las pestañas asignadas explícitamente**. La dependencia de lectura de Actualización/Publicación sirve a sus propios flujos; no concede la pestaña Productos. Los accesos directos a cada panel comprueban su paquete vigente, además de sus acciones. Super Admin conserva todos.
- Al aplicar o retirar un paquete vigente de Biblioteca, depurar en la misma transacción las concesiones de Biblioteca anteriores del destinatario, preservando permisos de otros dominios y otros paquetes vigentes. OCC, idempotencia y registro de los permisos retirados. No es una purga automática de todos los usuarios ni se ejecutó sobre QA.
- Notificación de cambios de permisos a las sesiones abiertas; conservar revalidación al recuperar foco y consulta periódica de respaldo. Sin red disponible no puede garantizarse sincronización inmediata; la API sigue autorizando cada operación.
- Búsqueda literal insensible en nombre, nombre de vitrina, código y descripción; normalización de separadores para SKU. Conteo, filtros y páginas usan el mismo predicado parametrizado; signos como `%` y `_` son literales. Sin migraciones.
- Productos queda en consulta; nueva ruta protegida de publicación `/catalog-management/publication/products/:productId`, enlazada como «Revisar y publicar» desde la bandeja.
- Actualización muestra notas internas con guardado independiente y versión de ficha, historial de campos con paginación y archivo/restauración con motivo y confirmación. El historial exige permisos de Actualización y notas también en el servidor; resuelve el nombre visible del actor sin exponer correos.

## Verificación y límites

Resultados finales de la integración:

- Backend: Jest con `--runInBand --runTestsByPath` sobre `products.service.spec.ts`, `access-assignments.library.spec.ts`, `users.controller.access.spec.ts`, `product-change.service.spec.ts`, `product-changes.controller.spec.ts`, `auth.library-permissions.spec.ts`, `products.biblioteca-grants.spec.ts` y `audit.service.spec.ts`: **268/268, 8 suites**. El primer recorrido detectó una expectativa anterior de permisos del historial; se actualizó para exigir consulta, escritura y notas, y la batería completa pasó. Estas suites usan dobles y no escriben en bases.
- Frontend: `vitest run` dirigido sobre App, CommercialLayout, Header, AssignedHome, acceso/asignaciones, rbac, detalle de producto, editor, cola/layout/página de Actualización, listado, publicación, notas, historial, servicio de ficha, comparación/componente de fotos y formato de auditoría: **180/180, 20 archivos**.
- ESLint dirigido: sin errores. Las comprobaciones de agentes sobre archivos anteriores conservan advertencias preexistentes; el grupo final de archivos del coordinador pasó sin advertencias. `git diff --check` considerando `cr-at-eol` pasó en los archivos revisados; no se normalizaron archivos previos completos.
- Backend: `node node_modules/@nestjs/cli/bin/nest.js build` pasó. Frontend: TypeScript pasó; Vite minificado terminó con **532 módulos** y el aviso habitual de bundle mayor a 500 kB. El último build convencional de Windows falló al borrar el archivo temporal de transferencia de esbuild, incluso con carpeta local y permisos ampliados. Se validó el mismo `npm run build`, target y minificación usando un preload temporal fuera del repositorio (`esbuild-inline-transfer.cjs` en los artefactos de la sesión) que activa el fallback de transferencia por el pipe del servicio de esbuild. No modifica dependencias ni configuración de la aplicación; el comando convencional sin este ajuste sigue sujeto al bloqueo de temporales de Windows.
- Vista local/API existente: salud por `http://127.0.0.1:5173/api/health` devuelve OK, base conectada, entorno development.

En la última comprobación los procesos locales anteriores ya no escuchaban. Se volvieron a levantar, de acuerdo con la petición de dejar la vista previa navegable: Vite oculto PID `5732`, puerto `5173`, con `VITE_API_TARGET=http://127.0.0.1:3001`; túnel SSH oculto PID `27416`, puerto local `3001`, hacia la API QA existente. Un primer arranque de Vite sin esa variable usó el destino Docker `api` y falló la resolución; se sustituyó exclusivamente ese proceso local por el arranque con la variable correcta, sin editar la configuración. Salud final por la vista previa: OK y base conectada. Los PID y logs están en los artefactos de la sesión. No se reinició ningún contenedor de la VPS.

Backend preparado en los artefactos de la sesión: `biblioteca-qa-correcciones-api.tgz`, SHA-256 **`02C77C845C156197EF277EF30C79F95E78DC564AA2B9EE24097A50A5579DA238`**. Contiene `dist/src`, sin configuración ni credenciales. **Posteriormente cargado con autorización; ver «Carga autorizada y primera validación en QA».** La depuración de concesiones anteriores ocurre cuando el administrador vuelve a aplicar o retirar un paquete vigente de ese usuario, nunca al iniciar el servidor ni mediante una purga de todas las cuentas.

Estado al cerrar la preparación local: pendiente autorización de despliegue. Las dos autorizaciones posteriores y sus verificaciones constan más abajo; continúa pendiente comprobar en dos sesiones reales la actualización inmediata y repetir el checklist. No se afirma aceptación completa de navegador ni funcionamiento de la API QA con este backend antes de cargarlo. Las pruebas de render SSR no equivalen a clicks en navegador. La integración PostgreSQL de búsqueda está ampliada, todavía no ejecutada en este bloque. La vista previa no representa el cierre de todos los pendientes históricos del dominio.

Se intentó ejecutar el spec de integración de asignaciones antes de distinguirlo del unitario: usa explícitamente una base sintética local de pruebas, no la base viva de QA; se interrumpió al no producir salida. No se confirmó si alcanzó a ejecutar fixtures y no se contabiliza como validación. Después se sustituyó por pruebas con dobles de Prisma. No hubo retiro de asignaciones en QA.

No se publicaron productos ni se ejecutaron migraciones. Las consultas sobre QA fueron de solo lectura; el intento de prueba local está descrito arriba. Los dos despliegues y reinicios de `gs-test-demo-api` se realizaron únicamente tras sus autorizaciones explícitas, registradas más abajo.

## Carga autorizada y primera validación en QA

El usuario autorizó expresamente actualizar y reiniciar únicamente `gs-test-demo-api` y pasar a validación. Se verificó el SHA-256 `02C77C84…`, se transfirió a `/tmp/gs-test-biblioteca-correcciones-02c77c84.tgz`, se conservó el código anterior en `/tmp/gs-test-biblioteca-correcciones-02c77c84/previous-src`, se copió `dist/src` y se reinició exclusivamente ese contenedor. Configuración y bases conservadas, sin migraciones.

Conteos inmediatamente antes y después: **5055 productos / 4 usuarios / 52 concesiones**. La diferencia respecto a las 5056 unidades de una entrega anterior ya existía antes de esta carga; no se atribuye al despliegue. Salud por la página local: OK, base conectada, entorno development.

Comprobaciones dentro del contenedor con los servicios compilados, solo lectura, sin emitir sesiones ni iniciar Nest/schedulers:

- Búsqueda de una letra y búsqueda del símbolo `%`: ejecutadas correctamente.
- Usuario con cargo Admin Comercial y sin concesiones: consulta de productos rechazada con **403**.
- Historial con permisos vigentes de Actualización: página devuelta con campo `actorName`; historial sin concesiones y perfil solo lectura: **403**.
- SKU canónico de la prueba existe; versión de acceso numérica; modo continúa `legacy`.
- **Fallo real detectado:** términos largos fallan con Prisma `P2010`, PostgreSQL `42883`: `function similarity(text, text) does not exist`. La API QA no tiene disponible esa función. Se prepara fallback a coincidencia literal/normalizada sin modificar extensiones ni migraciones. El primer paquete aún conserva ese fallo; no se declara aceptada la búsqueda larga.

La herramienta de navegador disponible no tiene una sesión abierta; se detecta una ventana de la aplicación en Comet, pero ese navegador no está conectado mediante su API de automatización. La validación de asignación/revocación en dos sesiones sigue pendiente. No se cambiaron usuarios, concesiones ni productos durante estas comprobaciones.

La corrección quedó preparada en `products.service.ts` y su spec: fallback únicamente ante Prisma `P2010` + PostgreSQL `42883` + función `similarity(text,text)` ausente; reintento literal/normalizado una vez, recuerdo por instancia y aviso sin término de búsqueda. Los errores ajenos se propagan. Validación local: **126/126 pruebas del servicio**, ESLint y build backend pasan. No cambia extensiones, esquema, configuración ni dependencias. Paquete `biblioteca-qa-busqueda-fallback-api.tgz`, SHA-256 **`B34D4370CC23483A88DD33DDE92942E159E322E71B9D4DA60351927966DC08BB`**.

El usuario autorizó de nuevo «Sí, cargar la corrección y continuar validación». Se verificó el hash en la VPS y se cargó únicamente en `gs-test-demo-api`, con respaldo de la versión previa en `/tmp/gs-test-biblioteca-busqueda-b34d4370/previous-src`; se reinició solo ese contenedor. Sin migraciones ni cambios de configuración, credenciales o datos. Salud posterior: OK y base conectada.

Validación final con Prisma y servicios compilados reales, solo lectura:

- `IDS-E04HQHI-D` y `IDSE04HQHID` encuentran el producto existente y devuelven los mismos IDs, sin imprimirlos. Funciona el fallback por ausencia de `similarity`.
- Una letra, símbolo `%`, filtro de activos y límite de página: comprobados.
- Cargo Admin Comercial sin concesiones: productos rechazado con 403. Historial con Actualización: permitido; sin concesiones y perfil solo lectura: 403.
- Se tomó un producto existente con historial: una fila real devuelta con campo `actorName`. Un primer muestreo del cambio más reciente apuntaba a un producto de prueba ya eliminado y devolvió 404; se corrigió únicamente la selección de la muestra, sin tocar datos.
- Conteos finales conservados: **5055 productos / 4 usuarios / 52 concesiones**, modo `legacy`. Sin sesiones, credenciales ni identidades emitidas por el script.
- HTTP sin autenticar por la vista previa: salud 200, productos 401, evento de accesos 401 e historial 401.

El script reproducible de lectura está en los artefactos locales de esta sesión, `qa-biblioteca-readonly.cjs`; se ejecuta por stdin dentro de la API QA y no inicia Nest ni schedulers. **Pendiente** aceptación visual en dos sesiones y asignación/revocación efectuada por Super Admin. No se declara comprobado el SSE entre navegadores mediante estas pruebas de servicio.

Para revertir la corrección de búsqueda, restaurar únicamente `/tmp/gs-test-biblioteca-busqueda-b34d4370/previous-src`; para volver al código anterior a todo este bloque, usar `/tmp/gs-test-biblioteca-correcciones-02c77c84/previous-src`. Cada restauración/reinicio exige autorización; no restaurar bases.

## Aceptación visual: Productos

El usuario dejó abiertas sesiones independientes de Super Admin y Compras, asignó solo Productos y confirmó «sí, solo aparece la visualización», con capturas. Se observa únicamente la pestaña Productos y una ficha con Ficha/Precios en consulta, sin pestañas de auditoría o publicación.

Las mismas capturas revelaron controles que todavía sobraban en el listado: «Validar lo mostrado» y el componente de bandeja de publicación; también copia histórica que remitía a una Lista comercial dentro del detalle. Se corrigió exclusivamente el frontend: `ProductsPage` no monta validación/bandeja y no ofrece edición en tarjetas o filas, incluso con permisos completos o Super Admin. `ProductGeneralInfoSection` remite ahora a Actualización. Las herramientas se conservan en sus paneles correspondientes.

Verificación de este ajuste: **22 pruebas / 3 suites** (ProductsPage, permisos del detalle y frontend de publicación), ESLint dirigido y build TypeScript/Vite pasan (mismo ajuste temporal de esbuild ya descrito). El servidor local respondió 200 y sirvió el módulo del listado sin validación, bandeja ni `onEditSheet`, y el detalle sin «Lista comercial». Sin cambios backend, bases, permisos o reinicios de QA. La revocación en vivo sin recargar aún no se da por aceptada.

## Aceptación guiada posterior del usuario

Con sesiones independientes de Super Admin y Compras, el usuario confirmó:

- **Revocación completa sin recargar ni cerrar sesión:** desaparece Biblioteca del menú y la pantalla deja de mostrar catálogo/ficha («sí pasan las dos»).
- **Asignación de solo Actualización:** el usuario confirmó que puede entrar al editor de producto después del paso guiado. La confirmación explícita se refiere a la entrada al editor; no se da por comprobada cada pestaña mediante una captura nueva.
- **Edición, persistencia e historial:** al añadir temporalmente ` [QA]` al nombre de un producto de prueba, guardar y reabrir, confirmó las tres comprobaciones: mensaje de guardado, nombre conservado e historial con valor anterior y nuevo («sí todas pasan»).

- **Restauración del nombre de prueba:** el usuario confirmó haber retirado el sufijo ` [QA]` y guardado el nombre original.
- **Notas internas:** el usuario confirmó mensaje de guardado, persistencia al reabrir y conservación del nombre original al guardar la nota ficticia («sí, funcionan todas»). Pendiente comprobar ocultación al retirar Actualización y dejar solo Productos; la nota se mantiene temporalmente para esa validación.

- **Privacidad en consulta:** después de dejar solo Productos, el usuario confirmó pestaña única, ficha limitada a Ficha/Precios y ausencia de la nota ficticia, notas internas, historial y controles de edición («sí, es correcto»).
- **URLs directas:** con solo Productos, el usuario abrió Actualización y Publicación por dirección y confirmó que ambas quedan bloqueadas («sí, quedan bloqueadas»).

- **Archivo:** con solo Actualización, el usuario confirmó estado Archivado, disponibilidad de Restaurar producto y conservación de los datos y la nota interna («sí pasan»).
- **Restauración:** confirmó retorno a Borrador sin publicación automática, disponibilidad de Archivar producto y conservación de datos/notas («sí»).

Estos resultados son aceptación manual reportada por el usuario, no automatización de navegador del agente. Pendientes: Publicación, limpieza de la nota ficticia y comprobaciones restantes del checklist.

## Incidencia de clasificación de imágenes durante Publicación

El usuario pudo abrir Publicación con las acciones Publicar/Programar y Despublicar deshabilitada para el producto en Borrador, junto al historial de publicación. Ejecutó la validación desde Ficha: bloqueo por ausencia de imagen principal y aviso no bloqueante por PDF faltante. No se publicó el producto.

Al volver a Actualización, subió dos imágenes y reportó que la segunda no conserva Complementaria/Portada, sino Principal. Inspección: el frontend envía `type` al PATCH de imagen, pero el DTO y `ProductsService.updateImage` solo aceptaban/procesaban `alt` e `isPrimary`. El pipe global rechaza campos no declarados; `ProductPhotosSection` no mostraba el error de esa mutación.

Corrección preparada:

- DTO valida el enum existente y rechaza valores inválidos y `null`; PATCH persiste el tipo independientemente de `isPrimary` y registra antes/después en auditoría/eventos.
- Subir, editar y quitar fotos marcan pendiente la revisión de trabajo; en dedicado, dentro de la misma transacción. Se conserva el contrato de no sustituir la revisión publicada al editar media.
- Frontend verifica que la respuesta confirme el tipo, muestra errores de las mutaciones de fotos y refresca producto, validación y revisiones. Selector y acción de principal separados, con controles adaptados al ancho de la tarjeta.
- Verificación local: tres suites backend **146 pruebas** aprobadas; tras añadir un caso de transacción dedicada, el spec final de servicio pasó **131/131**. DTO, servicio y snapshots de revisión cubiertos. ESLint completo backend pasa con seis advertencias anteriores; `nest build` pasa. Frontend consolidado: **28 pruebas / 4 archivos**, lint y build TypeScript/Vite pasan con el ajuste temporal de esbuild ya descrito.
- Comprobación de solo lectura en QA: el enum PostgreSQL ya incluye PORTADA, LOGO, PRINCIPAL, COMPLEMENTARIA y EXTRA. No requiere migración ni cambios de esquema.

Paquete: `biblioteca-qa-imagenes-api.tgz`, SHA-256 **`A191C661711F416EB7E61DCCC63DD142C918B4F5123D469B2AEF9F80752090F2`**. Tras el mensaje del usuario «sí, autorizo», se verificó el hash en la VPS, se conservó el código previo en `/tmp/gs-test-biblioteca-imagenes-a191c661/previous-src`, se copió únicamente `dist/src` y se reinició exclusivamente `gs-test-demo-api`. Sin migraciones, cambios de configuración o cambios productivos.

Comprobación posterior: salud por la página local OK, base conectada, development. El DTO compilado dentro del contenedor, con `ValidationPipe` de transformación y whitelist, acepta los cinco tipos, no añade `isPrimary` al recibir solo tipo y rechaza tipo inválido o `null` con 400. Esta prueba no ejecutó un PATCH ni modificó imágenes: **pendiente confirmar persistencia de la segunda foto en navegador**.

Conteos antes/después conservados: **5055 productos / 4 usuarios / 29 concesiones / 464 imágenes**. Las concesiones ya habían cambiado respecto a la carga anterior por la validación manual de asignaciones; 29 es la referencia tomada inmediatamente antes de este despliegue. Sin cambios de imágenes o de base por los agentes. Para revertir esta carga, restaurar únicamente su `previous-src` y reiniciar solo la API QA con aprobación explícita.

**Aceptación manual posterior de imágenes:** el usuario cambió la segunda foto a Complementaria, dejó guardar automáticamente y reabrió la ficha. Confirmó las tres comprobaciones («sí pasan»): tipo conservado, misma imagen principal del producto y ausencia del error anterior. Se da por aprobada esa regresión de interfaz. Pendiente volver a validar la ficha y probar las acciones de Publicación.

## Incidencia: informe apto y bloqueo por precio al publicar

El usuario volvió a validar tras corregir imágenes: CAT-05 `cat05-r1` indicó lista para publicar, con solo aviso de PDF faltante. Al pulsar Publicar, recibió bloqueo por falta de al menos un precio vigente. No se publicó el producto.

Causa comprobada en código: CAT-05 solo comprobaba precio si el producto ya tenía `catalogPublished` o estado PUBLISHED; el gate de la transición PUBLISH lo exige también en Borrador. El ensamblado de CAT-05 además filtraba por la Lista histórica, omitía `validFrom` y difería en el límite de expiración. El usuario reconfirmó explícitamente «Exigir al menos un precio vigente».

Corrección implementada localmente: `price-validity.ts` comparte el predicado temporal entre Publicar y el ensamblado de CAT-05 (`validFrom <= ahora`, `validUntil > ahora`, extremos null abiertos). Se consultan precios del producto sin filtrar ni consultar Lista. El motor comprueba precio también en Borrador y conserva la validación existente de importe positivo/finito. Se eliminan incidencias de oferta sobre Listas y las reglas pasan a **`cat05-r2`**, para reconocer los informes anteriores como obsoletos. PDF faltante sigue siendo aviso.

Validación: **234/234 pruebas backend en seis suites** (`validation-rules`, `price-validity`, `validation.service`, `products.service`, `transition.service`, `products.scheduler`); ESLint y build Nest pasan (seis warnings anteriores ajenos). Las **16 pruebas frontend** de ValidationPanel, validation-model y validation-api pasan; no cambió el frontend en este bloque. Sin migraciones o escrituras en bases.

Paquete `biblioteca-qa-validacion-precio-api.tgz`, SHA-256 **`163119BE58088FF7D4CA21D7788E759959B98053AFBDAB0110B2785F6295C9E8`**. El usuario autorizó «sí autorizo»: se verificó el hash remoto, se respaldó la versión actual en `/tmp/gs-test-biblioteca-precio-163119be/previous-src`, se copió `dist/src` y se reinició únicamente `gs-test-demo-api`. Salud OK, development y base conectada. Sin migraciones ni cambios de configuración o producción.

Comprobación real de solo lectura: se ensambló el estado de `WD102PURP` mediante el servicio compilado y se ejecutó el motor puro, sin llamar `runFresh` ni persistir informes. Resultado `cat05-r2`, `CON_PROBLEMAS`, cero precios considerados y bloqueo `offer.price_valid`, coincidente con el gate de PUBLISH. PDF permanece warning, sin incidencias de Lista; informe r1 se reconoce obsoleto. Una simulación exclusivamente en memoria de precio válido elimina el bloqueo de precio; futuro y expiración exacta no cuentan como vigentes. No se publicó ni se insertó precio alguno.

Conteos antes/después conservados: **5055 productos / 4 usuarios / 29 concesiones / 2335 precios / 464 imágenes**. Pendiente aceptación del informe r2 en navegador y carga de un precio vigente por el flujo de Actualización para continuar la prueba de publicar. No se define tarifa de referencia o IVA ni se modifica política de stock. La diferencia heredada stock-cero (gate bloquea / CAT-05 informa) queda identificada como política pendiente; no se altera por inferencia en este ajuste.

No se cargarán precios ficticios directamente a la base ni se publicará de forma automática. Para revertir esta carga, restaurar únicamente `/tmp/gs-test-biblioteca-precio-163119be/previous-src` y reiniciar solo la API QA con autorización explícita, sin restaurar bases.

## Reversión

Revertir exclusivamente el delta de esta corrección, conservando la implementación previa y los cambios de Claude. No restaurar archivos completos desde HEAD. Guardar el código anterior de QA y verificar el hash del paquete en cada despliegue. La limpieza histórica solo se realiza tras una acción explícita del administrador en paquetes; después de ejecutarla, restaurar código no restaura esos grants: consultar la auditoría y reasignar únicamente accesos aprobados desde el panel.

## Petición posterior: precios editables desde Editar ficha

El usuario pidió explícitamente poder editar precios dentro de Editar ficha. Se implementa una sección de precios reutilizable: editable solo en Actualización con `products:write` y `prices:apply`, y consulta explícita en Productos, incluso para Super Admin. Se reutilizan los endpoints existentes de precios y las tarifas ya disponibles; no se elige una tarifa de referencia, no se calculan impuestos ni se modifica la política monetaria.

Implementado: sección compartida `features/products/prices/ProductPricesSection.tsx` y helpers `price-form.ts`, extraídos del detalle para reutilizar el CRUD existente. Modo editable solo en Actualización; modo readOnly explícito en Productos y sin mutaciones en Publicación. Consultas deshabilitadas sin lectura, botones/modal sujetos a permisos reactivos. Creación/edición/borrado con confirmación, errores visibles, selección de tarifa existente y guardado independiente. Vigencia en fecha/hora local convertida a ISO, preservando el timestamp original al editar otros campos sin tocar fechas.

Las invalidaciones refrescan precios, producto, listado, historial, informe y revisiones sin remontar el editor ni borrar los borradores de otros campos. Backend: CRUD manual marca pendiente la revisión mediante `ProductRevisionsService`, exportado desde ProductsModule y reutilizado por PricesModule, que ya importaba ProductsModule; no se añadió un ciclo. En dedicado se hace dentro de la misma transacción y en legacy tras la escritura, conservando la revisión publicada. No se toca importación masiva ni se escriben precios desde scripts de los agentes.

La revisión detectó un bloqueo heredado: solapamientos entre tarifas distintas por compartir una Lista histórica. Se corrigió para comparar solo el mismo producto y tarifa, conservando exclusión del precio editado, fechas y 409 para solapamientos de la misma tarifa. `listaId` permanece como metadato/compatibilidad y no decide ese bloqueo.

Verificación final: **97 pruebas backend / 5 suites** (prices.service, prices.service.library, prices.history, price-action.guard, product-revisions.service), lint y Nest build; seis warnings anteriores ajenos. **52 pruebas frontend / 9 archivos**, ESLint, TypeScript y build Vite pasan, con el ajuste local de esbuild ya documentado. Revisión independiente de lectura sin bloqueos de payload, permisos o preservación de borradores. La vista previa sirve el nuevo módulo de precios con HTTP 200.

Paquete `biblioteca-qa-precios-ficha-api.tgz`, SHA-256 **`50F6071F25B2713570AB6D825DFED83EF3051B76249652C5468DEA0267C97821`**. Tras la autorización explícita «sí», se verificó el hash remoto, se respaldó el código anterior en `/tmp/gs-test-biblioteca-precios-ficha-50f6071f/previous-src`, se copió `dist/src` y se reinició exclusivamente `gs-test-demo-api`. Salud OK, development y base conectada, sin migraciones o cambios de configuración/producción.

Comprobación del código desplegado sin escrituras: el proveedor de revisiones está exportado/importado y aparece en la metadata del constructor de PricesService; los payloads de alta, edición y limpieza de vigencia pasan el ValidationPipe real. Hay tarifas activas disponibles. No se ejecutaron createPrice/updatePrice/removePrice ni se guardaron informes.

Conteos antes/después conservados: **5055 productos / 4 usuarios / 29 concesiones / 2335 precios / 464 imágenes**. Pendiente prueba de alta/edición/borrado en navegador. Para revertir, restaurar únicamente `/tmp/gs-test-biblioteca-precios-ficha-50f6071f/previous-src` y reiniciar solo la API QA con autorización; no restaurar bases.

## Alcance UX confirmado: conservar el editor completo para Compras

**Aceptación manual posterior:** el usuario indicó «ya creé el precio y lo publiqué». Quedan confirmadas por su reporte el alta de precio desde la ficha y la publicación posterior en QA; no es una comprobación automatizada ni acredita edición/borrado de precios, programación o despublicación. Los conteos anteriores son la referencia del despliegue, no una medición posterior a esa prueba manual.

El usuario precisa que le gustan el diseño y la estructura actuales y que la ficha comercial que verá el cliente es su referencia aprobada. Se debe preservar su presentación y permitir editar los datos correspondientes desde el editor de Biblioteca. Se mantienen datos generales, imágenes, descripción y especificaciones, especificaciones técnicas, atributos extra, ficha pública, precios, notas internas, historial y mover/quitar. No se deben sustituir campos estructurados por un formulario genérico reducido.

La maqueta autónoma `biblioteca-unificada-propuesta.html` fue revisada y rechazada por omitir capacidades de edición. Sirvió para explorar navegación, no es una especificación aprobada ni un reemplazo del editor. No se aplicó a la web. La propuesta corregida parte del editor existente: catálogo común con búsqueda y filtros, entrada directa a cada producto, conservación de todas las secciones y acciones según permisos, y un recorrido de publicación dentro de Biblioteca que evite volver a la ficha antigua. La distribución precisa de navegación sigue siendo propuesta, no implementación terminada.

Carga de precios masivos conserva una pestaña propia y su flujo actual. Biblioteca es el catálogo compartido de todos los productos; los futuros vendedores de consulta podrán ver información comercial, precios y archivos sin edición, publicación o información interna. El foco de esta etapa es la experiencia de Compras. La unificación visual no implica conceder permisos adicionales ni cambiar reglas de publicación, datos o la arquitectura de bases.

Impeccable se evaluó mediante su documentación pública, incluyendo el modo Operate y las guías de simplificación y auditoría. No se instaló, no se ejecutó su launcher y no se añadieron hooks. Su posible uso debe conservar la identidad visual y funcionalidad acordadas; no se autorizó una sustitución de stack o de la ficha pública. La evaluación no habilita instalaciones, cambios de servicios o despliegues.

En este registro solo se modifican documentación e índice. Sin cambios de aplicación, migraciones, escrituras en bases, consultas a VPS, instalaciones, reinicios, commits o push. No corresponde ejecutar suites de aplicación por este ajuste documental. Pendiente inventario de correspondencia entre datos editables y ficha pública, implementación del recorrido acordado y aceptación con Compras. Reversión: retirar únicamente este apartado y la nota enlazada en el índice, conservando el resto de la bitácora.
