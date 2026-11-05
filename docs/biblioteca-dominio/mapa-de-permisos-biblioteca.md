# Mapa de permisos de Biblioteca (24/10/2026)

Para seguir pantallas, endpoints y fuentes de datos, consulta el [mapa técnico del panel](panel-biblioteca-referencias-tecnicas.md).

<!-- biblioteca-vigente-20261103 -->
## Guía vigente del panel Biblioteca

Verificado contra el código de `validacion-biblioteca` el 3 de noviembre de 2026. El panel muestra las pestañas que permite la asignación de cada persona. El Super Admin administra las asignaciones en **Asignación de paquetes de acceso** (`/users/access`).

| Pestaña | Qué permite según las casillas asignadas |
|---|---|
| Productos | Ver el catálogo y consultar precios. |
| Fichas | Ver fichas, crear y editar, validar, gestionar notas internas y eliminar productos. |
| Precios | Consultar precios y perfiles de proveedor, revisar un archivo, guardar la revisión y aplicar precios. |
| Importaciones | Consultar importaciones y cargar datos de productos. La carga requiere permiso para editar fichas. |
| Catálogos maestros | Consultar o editar catálogos maestros y aprobar datos clave. Aprobar datos clave requiere permiso para editar fichas. |

**Publicar en tienda** se asigna como complemento de Fichas y requiere que **Editar fichas** ya esté guardado.

### Asignar acceso a una persona

1. Como Super Admin, abre `/users/access` y selecciona a la persona.
2. En el bloque **Biblioteca**, marca las acciones necesarias y pulsa **Guardar Biblioteca**. El servidor completa las dependencias de las acciones seleccionadas.
3. Si la persona también necesita cifras en **Mi resumen**, abre **Acciones individuales → Estadísticas en Mi resumen**. Conserva las demás acciones individuales que deba mantener, marca las estadísticas necesarias con alcance **Global** y pulsa **Guardar acciones individuales**.
4. Comprueba con la cuenta destinataria que aparecen las pestañas y las cifras esperadas. Si aparece «Tu panel de Biblioteca no tiene estadísticas habilitadas», revisa el paso 3.

| Estadística en Mi resumen | Acceso requerido |
|---|---|
| Estadísticas de Productos | Ver productos (`products:read`). |
| Estadísticas de Fichas | Editar fichas (`products:write`). |
| Estadísticas de Publicar en tienda | Publicar en tienda (`products:publish`). |

Código de referencia: [casillas de Biblioteca](../../src/frontend/src/features/users/library-permissions.ts), [asignación individual](../../src/frontend/src/features/users/components/UserAccessAssignments.tsx) y [dependencias del servidor](../../src/backend/src/common/security/access-catalog.ts).

## Registro histórico de decisiones y auditorías

El contenido a continuación registra versiones anteriores, incluido el panel de tres pestañas y el paquete «Actualización». Para operar el panel actual, sigue la guía vigente de arriba.


**Decisión y corrección posterior (26/10/2026):** el usuario confirmó que se muestran únicamente las pestañas asignadas explícitamente: Productos, Actualización y Publicación (esta última sustituida el 28/10, ver abajo). La lectura necesaria para trabajar en Actualización/Publicación no concede la pestaña Productos ni sus rutas. Super Admin conserva acceso total. Productos es siempre consulta; edición, notas internas e historial pertenecen a Actualización, y las acciones de publicación a Publicación. Al modificar un paquete vigente se retiran las concesiones anteriores de Biblioteca del mismo usuario, conservando otros paneles y paquetes vigentes; los cambios se notifican a las sesiones abiertas. Código verificado localmente y cargado en QA con autorización; búsqueda y permisos comprobados con servicios reales. **Pendiente aceptación visual y actualización entre dos sesiones**. [Evidencia y límites](../bitacora/2026-10-26-biblioteca-correcciones-aceptacion.md). Las tablas «hoy» de abajo conservan el diagnóstico histórico del 24/10 y no sustituyen este estado posterior.

**Decisión posterior (28/10/2026):** la pestaña «Publicación» se quitó. Publicar, programar y despublicar se hace en la sección «Dónde se muestra» del editor de la ficha (Actualización > Fichas). «Publicar en tienda» es un **complemento de Actualización**: se asigna aparte, pero solo a quien ya tiene Actualización (el sistema rechaza darlo sin poder editar). Quien edita sin «Publicar en tienda» sigue viendo el estado (Publicado o Borrador) y la programación, sin poder cambiarlos. El editor muestra el estado en el encabezado. Las rutas viejas `/catalog-management/publication*` redirigen a las fichas de Actualización. Versión del catálogo de accesos: `panels-20261028-1`. Los componentes del tablero de publicación (`PublicationBoardPanel`, `LibraryProductPublicationPage`) quedaron desconectados, sin borrar. Las tablas siguientes conservan el diagnóstico del 24/10 y la corrección del 26/10 en lo que no contradiga este párrafo.

**Decisión del usuario (28/10/2026, tres pestañas independientes):** Biblioteca tiene tres pestañas que se asignan por separado o juntas: **Productos** (solo mirar), **Fichas** (crear/editar fichas, borrar, validar, notas internas) y **Precios** (revisar archivos de precios, guardar y aplicar revisiones, perfiles de proveedor). La web muestra solo las pestañas asignadas; si la persona entra por URL a una que no tiene, se la lleva a una que sí tenga. «Actualización» deja de existir como lugar, pestaña o paquete asignable. Paquetes nuevos: `biblioteca-fichas` y `biblioteca-precios`; `biblioteca-consulta` (Productos) no cambia; «Publicar en tienda» (`biblioteca-publicacion`) es complemento de Fichas. `biblioteca-actualizacion` pasa a «Actualización (anterior)»: no se puede asignar, pero quien lo tiene conserva Fichas y Precios y se le puede retirar. Versión del catálogo: `panels-20261028-2`. Al aplicar un paquete vigente NO se vacía el paquete anterior (sigue contando como vigente hasta retirarlo); sí se siguen purgando los permisos de Biblioteca de asignaciones manuales y de los otros paquetes anteriores, y esos permisos purgados ya no cuentan para cubrir la dependencia de «Publicar en tienda». Los botones de Precios usan solo el permiso asignado (revisar = `prices:preview`, guardar = `prices:save`, aplicar = `prices:apply`), ya no el cargo. Pendiente de diseño: casillas finas por permiso dentro de cada pestaña en la pantalla de usuarios.

Documento para decidir. Solo describe; **no cambia ningún permiso ni ningún código**. Está escrito en lenguaje simple. Los nombres técnicos van al final, en el apéndice.

**Palabras que uso**
- **Permiso:** lo que le das a una persona en la pantalla de asignación de accesos (por ejemplo «Editar productos»).
- **Cargo:** Super Admin, Admin Comercial, Supervisor, Vendedor, Operador, Consulta.
- **Permiso viejo de Listas:** los permisos que nacieron para las Listas de precios. Tú dijiste que las Listas ya no existen.

## 1. Lo que quieres (el modelo)

Biblioteca es un panel que se le puede dar a cualquier persona. Tiene tres pestañas:

| Pestaña | Para qué sirve | Quien la tiene puede | Quien la tiene NO puede |
|---|---|---|---|
| **Productos** | Mirar | Ver el catálogo completo con precios, características, fotos y PDF | Cambiar nada |
| **Actualización** | Modificar | Cambiar precios, datos, imágenes, especificaciones y PDF de un producto | Publicar |
| **Publicar en tienda** (complemento de Actualización, ya no es pestaña) | Publicar | Publicar, retirar y programar la publicación desde la ficha | Ser asignado sin Actualización |

Regla de entrada: **dar el panel Biblioteca = dar solo Productos (mirar).** Actualización se da aparte y «Publicar en tienda» se suma encima de Actualización.

## 2. Cómo está hoy (resumen de una frase)

El sistema usa **dos cosas a la vez para decidir** y a veces se contradicen: los **permisos** que das en el panel y el **cargo** de la persona. Además, varias acciones todavía dependen de los **permisos viejos de Listas**, y algunas **no revisan ningún permiso**.

## 3. Qué pasa hoy con cada acción

«Coincide» = hoy funciona como tú quieres. Todo lo de esta tabla se **comprobó leyendo el código**; nada se ejecutó contra una base real.

### Pestaña Productos (mirar)

| Qué hace la persona | Qué exige hoy el sistema | ¿Coincide? | Qué pasa en la práctica |
|---|---|---|---|
| Ver la lista de productos | Estar dentro con cualquier cargo **y el permiso viejo de Listas**. «Consultar productos» no basta | **No** | Con solo «Consultar productos» la lista sale **vacía**. Con solo el permiso viejo de Listas ve **todo**, borradores incluidos |
| Abrir un producto | El permiso «Consultar productos» sobre ese producto | Parcial | Se contradice con la lista: puede ver la lista y no poder abrir el producto, o al revés |
| Ver precios | Nada aparte: los ve cualquiera que vea el producto | Parcial | Sirve para tu caso (todos los que miran ven precios). Pero no existe forma de dar «ver producto sin precios» |
| Ver fotos y PDF | Nada: los archivos son públicos para quien tenga el enlace (salvo los marcados privados) | A decidir | Es correcto para un catálogo público. Si quieres que pidan sesión, hay que decidirlo |
| Ver notas internas de la ficha | Debería exigir el permiso «Notas internas» | **No** | La lista y la ficha del producto **devuelven la nota interna a cualquiera que vea el producto**. Hay una fuga |
| Ver el historial de un producto | Solo Super Admin y Admin Comercial, **sin pedir ningún permiso** | **No** | Muestra valores anteriores y nuevos, precios incluidos |

### Pestaña Actualización (modificar)

| Qué hace la persona | Qué exige hoy el sistema | ¿Coincide? | Qué pasa en la práctica |
|---|---|---|---|
| Cambiar datos del producto (nombre, marca, categoría) | Cargo Super Admin o Admin Comercial. «Editar productos» solo se revisa si el producto pertenece a una Lista (y entonces pide además un permiso viejo de Listas) | **No** | Un Admin Comercial **sin ningún permiso** edita los productos sin Lista. Un Vendedor con el permiso «Editar productos» recibe «prohibido» |
| Cambiar precios al guardar un producto | No revisa ningún permiso de precios | **No** | Se pueden cambiar precios sin el permiso de precios |
| Subir, cambiar o borrar fotos y PDF | Cargo Admin Comercial o Super Admin **y** el permiso «Editar productos» | Parcial | Es lo más cercano a tu modelo: el permiso sí se revisa. Lo único que sobra es el cargo |
| Editar la ficha pública (textos, especificaciones) | Cargo Admin Comercial o Super Admin **y** «Editar productos». Las notas internas piden «Notas internas» | Parcial | Igual: el permiso se revisa, el cargo sobra |
| Quitar (borrar) un producto | Cargo Super Admin o Admin Comercial y una confirmación | **No** | El permiso «Eliminar producto» **no se revisa en ninguna parte**: existe en la pantalla pero no hace nada |
| Cargar precios desde Excel | Cargo Super Admin, Supervisor o Admin Comercial **y** los permisos de precios (ver, previsualizar, guardar, aplicar) **y** el permiso viejo de Listas | Parcial | Los permisos de precios sí se revisan. El permiso viejo de Listas sobra |
| Cambiar un precio suelto | Solo los permisos de precios, con cualquier cargo | **Sí** | Es el único caso totalmente por permisos |
| Validar fichas | Cinco cargos (sin Vendedor) y el permiso «Validar ficha» | Parcial | El cargo sobra |
| Importar productos por Excel (carga masiva) | Cargo Super Admin o Admin Comercial. **Ningún permiso** | **No** | Crea y cambia productos y precios sin permisos |
| Consultar el precio de un SKU (herramienta de importación) | Cualquier cargo. **Ningún permiso** | **No** | Devuelve nombre y precio, incluso de borradores |

### Pestaña Publicación (publicar)

| Qué hace la persona | Qué exige hoy el sistema | ¿Coincide? | Qué pasa en la práctica |
|---|---|---|---|
| Publicar o retirar | Cargo Super Admin, Supervisor o Admin Comercial **y** «Publicar producto». Si el producto está en una Lista, además un permiso viejo de Listas | Parcial | El paquete «Publicación del catálogo» no trae ese permiso viejo. Por lectura del código, **no podría publicar productos que estén en una Lista** |
| Archivar o restaurar | Cargo Super Admin o Admin Comercial. **Ningún permiso** | **No** | Un Admin Comercial sin permisos archiva y restaura productos sin Lista |
| Programar una publicación | Dos capas: un permiso que viene con el cargo **y** el permiso del panel | Parcial | Hay que tener las dos; si se desfasan, falla sin explicación |
| Ver el tablero de publicación | Cinco cargos. **No pide el permiso de publicar** y depende del permiso viejo de Listas | **No** | Sin el permiso viejo de Listas el tablero sale vacío |

### En las pantallas (botones y pestañas)

| Qué | Qué pasa hoy | ¿Coincide? |
|---|---|---|
| Los **botones** (Editar ficha, Importar precios, Quitar producto) | Se muestran según el **cargo** | **No** |
| Las **pestañas y rutas** | Se abren según los **permisos** | — |
| Resultado | Un Vendedor con el permiso de Actualización ve la pestaña pero **ningún botón**. Un Admin Comercial con solo «Consultar productos» ve «Editar ficha» y al pulsar aparece «No tienes acceso» | **No** |

Esto último también afecta a las pantallas de Actualización que se construyeron en esta sesión (editar ficha, cola, importar precios): usan el cargo para los botones. Se puede corregir sin tocar el servidor.

## 4. Huecos, del más grave al menos grave

1. **Las notas internas se filtran** a cualquiera que pueda ver un producto.
2. **Un Admin Comercial sin ningún permiso** puede editar, archivar y borrar productos sin Lista. Y el permiso «Eliminar producto» no controla nada.
3. **Cargas masivas por Excel y la consulta de precio por SKU** funcionan sin pedir permisos.
4. **Los precios se pueden cambiar** al guardar un producto sin el permiso de precios.
5. **El historial de un producto** no pide permisos y muestra valores anteriores y nuevos.
6. **La lista de productos sale vacía** si solo tienes «Consultar productos», porque aún depende del permiso viejo de Listas. El tablero de publicación tiene el mismo problema.
7. **Botones por cargo, rutas por permiso:** pantallas que se abren y no dejan hacer nada, o que ofrecen algo que el sistema rechaza.
8. **Productos más vistos, publicaciones programadas y un bloque del tablero inicial** muestran precios, SKU, nombres y estados (incluidos borradores) a cualquier cargo.
9. **Fotos y PDF públicos** con solo tener el enlace (probablemente está bien, pero debe ser una decisión tuya).

## 5. Cómo quedaría (propuesta para que decidas)

**Una sola regla:** manda el permiso del panel. El cargo solo describe a la persona; no decide lo que puede hacer. La única excepción es Super Admin.

**Reglas de seguridad que se cumplirían siempre**
- Sin permiso no hay acción, sea cual sea el cargo.
- Cada acción se revisa **en el servidor**, no solo en la pantalla.
- Las notas internas solo se entregan con su permiso.
- Nada depende de Listas.
- Cada pantalla muestra los botones según los permisos, igual que se abren las pestañas.

**Permisos por pestaña (propuesta)**

| Pestaña | Permisos |
|---|---|
| Productos | Consultar productos (incluye precios y características) |
| Actualización | Editar productos · Cambiar precios y cargar precios por Excel · Validar fichas · Notas internas · Cargar productos por Excel · Quitar y archivar productos |
| Publicar en tienda (complemento de Actualización) | Publicar y retirar · Programar publicación |

## 6. Decisiones que necesito de ti

Una por una, con lo que recomiendo:

1. **¿Manda solo el permiso del panel y el cargo deja de limitar?** Recomendado: sí.
2. **Quitar y archivar productos:** ¿dentro de Actualización con un permiso propio, o solo para Super Admin? Recomendado: permiso propio dentro de Actualización.
3. **Precios:** ¿se ven con el permiso de Productos (como dijiste) o con un permiso «Ver precios» aparte? Recomendado: con Productos, dejándolo escrito de forma explícita.
4. **Notas internas:** ¿permiso aparte dentro de Actualización? Recomendado: sí.
5. **Fotos y PDF:** ¿públicos con el enlace (como hoy) o con sesión iniciada? Recomendado: públicos, salvo los marcados como privados.
6. **Cargas por Excel (productos y precios):** ¿permiso propio dentro de Actualización? Recomendado: sí.

## 7. Decisiones del usuario (24/10/2026)

Respuestas a los seis primeros huecos. Son las **reglas de Biblioteca v1**:

1. **Notas internas:** solo las ven quienes tengan el permiso correspondiente. Hay que corregir la fuga.
2. **Cargos:** ya no dan permisos. Todos los permisos se dan **solo desde los paneles**. Tener un cargo no exime de nada. El cargo solo define qué paneles vienen anclados por defecto.
3. **Cargas masivas y edición:** solo desde el panel Biblioteca > pestaña Actualización. Nadie más puede hacerlas.
4. **Precios:** solo cambian por carga masiva o desde la ficha del producto. No hay otro camino.
5. **Listas:** ya no existen. Se eliminan los permisos y dependencias de Listas. Con el panel, la pestaña y el acceso asignados, la persona tiene derecho a eso y nada más.
6. **Actualización:** tiene **un solo permiso, el de editar**. Con él se puede modificar, editar y cargar de forma masiva. **Todo queda registrado en el historial.**

**Supuestos míos (a corregir si no es lo que quieres):**
- Super Admin conserva acceso total; si no, nadie podría asignar paneles.
- «Quitar» y «archivar» un producto van dentro del permiso de Actualización (porque dijiste que tiene un solo permiso), siempre con confirmación y registro en el historial.
- Las notas internas siguen con su permiso propio, ya existente.
- Quien hoy edita por su cargo **dejará de poder** hasta que se le asigne el panel. Hay que asignarlos antes de desplegar.

## 8. Qué se comprobó y qué no

**Decisiones posteriores confirmadas, 26/10/2026:** Super Admin conserva acceso total y administración de asignaciones. Actualización incluye las notas internas, sin una casilla adicional para ellas. El usuario pide retirar Listas de las nuevas opciones de asignación, navegación y flujos de Biblioteca; los escalafones siguen siendo datos de precios. Las tablas, relaciones e historial existentes no se borran y las fuentes de acceso anteriores deben seguir siendo retirables. El estado del código actual debe verificarse: las tablas anteriores de este documento describen la revisión del 24/10, no sustituyen las pruebas actuales.

- **Comprobado (lectura del código):** todo lo de las tablas. Los tres puntos más graves los verifiqué dos veces (permiso «Eliminar producto» sin uso, notas internas sin filtro, lista que depende del permiso viejo de Listas).
- **Inferido:** que el paquete «Publicación del catálogo» no pueda publicar productos de una Lista. Sale de leer el código, no se ejecutó.
- **No ejecutado:** ninguna prueba contra una base real ni contra el servidor. Tampoco se comprobó si hoy hay productos marcados como visibles en el catálogo público por la marca `extraAttributes.biblioteca`.
- **Aviso:** el servidor tiene cambios sin commit de otra línea de trabajo (por ejemplo en el control de accesos y en productos). Si cambian, hay que repetir esta lectura.

## 9. Casillas por permiso dentro de cada pestaña (28/10/2026)

Decisión del usuario: en la pantalla de accesos de usuarios (solo Super Admin), Biblioteca es **un bloque con tres secciones** (Productos, Fichas, Precios) y una casilla por permiso, en lugar de un botón «Asignar» por paquete. Antes de esto cada pestaña se daba entera (paquete) y la sección 3 de este mapa describía una pestaña «Actualización» que ya no existe.

| Sección | Casillas (lo que ve la persona que administra) |
|---|---|
| Productos | Ver productos · Ver precios |
| Fichas | Ver fichas · Editar fichas · Validar ficha · Notas internas · Eliminar producto |
| Precios | Ver precios · Revisar archivo de precios · Guardar revisión · Aplicar precios · Ver perfiles de proveedor · Editar perfiles de proveedor |

Cómo se comporta:
- La casilla de cada sección marca o desmarca todas las suyas (queda a medias si hay parciales); después se afina. Quitar una sección no borra lo que otra sección marcada todavía necesita.
- Marcar una casilla marca sola lo que necesita (editar, validar, notas y eliminar necesitan ver; guardar revisión necesita revisar archivo, que necesita ver precios; aplicar necesita ver precios; editar perfiles necesita ver perfiles). Desmarcar algo desmarca lo que dependa de ello. El servidor vuelve a calcularlo: no se confía en la pantalla.
- Un solo botón **Guardar Biblioteca** y un resumen de cómo quedará («Verá las pestañas: …», lo que se agrega y se quita).
- La persona ve solo las pestañas que sus permisos abren: **Productos** con «Ver productos», **Fichas** con «Editar fichas», **Precios** con «Revisar archivo de precios». Un permiso suelto sin pestaña (por ejemplo solo «Ver precios») no abre nada.
- «Publicar en tienda» sigue aparte, como complemento de Fichas. Si se quita «Editar fichas» mientras tenga ese complemento, el servidor lo rechaza con «Quita primero Publicar en tienda: necesita poder editar fichas.»
- Quien ya tenía Productos, Fichas, Precios o el paquete anterior «Actualización» aparece con las casillas que esos paquetes ya le daban, sin perder nada al abrir. Al guardar, la selección **reemplaza** esos paquetes y los permisos de Biblioteca de asignaciones manuales o anteriores (los accesos comerciales y el complemento «Publicar en tienda» no cambian). Selección vacía = sin acceso a Biblioteca.
- Se registra en la auditoría igual que las demás operaciones de accesos.

Detalle técnico y consumidores: [`docs/handoffs/2026-10-28-biblioteca-casillas-por-pestana.md`](../handoffs/2026-10-28-biblioteca-casillas-por-pestana.md).

## Apéndice: dónde está cada cosa (para quien programa)

Rutas relativas a `src/backend/src` (BE) y `src/frontend/src` (FE). Líneas del árbol de trabajo del 24/10/2026.

- Lista de productos por Listas: `modules/products/products.service.ts:505-508`, `common/acl/acl.service.ts:127-145` (`getAllowedListaIds` usa `listas:read`).
- Abrir producto: `products.service.ts:710-712`, `acl.service.ts:268-304`.
- Precios sin permiso: `products.service.ts:574-577, 625-627, 696-698`. Notas internas sin filtro: `products.service.ts:548-557` (`p.*`), `:690-700` (`findOne` sin `select`); columna `prisma/schema.prisma:196`; filtradas solo en `modules/products/sheet/product-sheet.service.ts:444-445`.
- Archivos públicos: `modules/files/files.service.ts:74`, `files.controller.ts:44-46, 77-84`; `/uploads` estático en `main.ts:21`.
- Historial: `modules/audit/audit.controller.ts:47-48` (sin permiso); `modules/products/product-changes.controller.ts:26-27` (con permiso, sin pantalla que lo use).
- Editar producto: `products.controller.ts:106-107`, `products.service.ts:885-899` (permiso solo si hay `listaId`), `:976-978` (precios sin permiso). Fotos: `:2083-2088, 2179-2182, 2221-2225, 2265-2266`. Ficha: `product-sheet.service.ts:220-237`.
- Borrar: `products.controller.ts:200-201`, `products.service.ts:1970-1994`. `products:delete` solo aparece en `common/security/access-catalog.ts:113` y el seed.
- Precios por Excel: `modules/prices/import/price-import.controller.ts:155-157`, `price-import.service.ts:178-190, 724-728, 1049-1050`. Precio suelto: `modules/prices/price-action.guard.ts:24-45`.
- Cargas masivas y consulta por SKU: `modules/products/import/import.controller.ts:53-55, 109-111, 163-165, 186-188`; `products.controller.ts:211-212`.
- Publicar: `products.controller.ts:143-158`, `products.service.ts:997-1012, 1121, 1181-1183`. Archivar y restaurar: `modules/products/lifecycle.types.ts:54, 72-81`, `products.service.ts:1446-1448, 1548-1564`. Programar: `products.controller.ts:309-358` (+ `common/guards/permissions.guard.ts`). Tablero: `modules/products/validation/publication-board.controller.ts:17-19`, `publication-board.service.ts:39-41`.
- Permisos por cargo en el arranque de datos: `prisma/seed.ts:90-151`. Paquetes: `common/security/access-catalog.ts:236-281`.
- Pantallas: `FE/App.tsx:54-109`; botones por cargo en `pages/ProductsPage.tsx:104`, `pages/LibraryUpdateLayout.tsx`, `pages/LibraryUpdatePage.tsx`, `pages/LibraryProductEditorPage.tsx:268-270`; pestañas por permiso en `features/users/access.ts:45-49, 134-146`.
- Otros puntos abiertos a cualquier cargo: `products.controller.ts:40-61` (más vistos, programadas), `modules/dashboard/dashboard.controller.ts:58-63`.
