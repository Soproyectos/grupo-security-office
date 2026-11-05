# Panel Biblioteca: qué se hizo y qué sigue (26/10/2026)

Resumen para quien decide. Está en lenguaje simple; los nombres técnicos van entre paréntesis o en el apéndice (sección 8).

**Cómo leer las marcas:** **Comprobado** = lo registran los documentos de trabajo con el comando que se ejecutó, o se vio en el código. **Inferido** = sale de leer el código, nadie lo ejecutó. **Pendiente** = no se ha hecho o no se ha probado.

**Importante:** nada de esto está guardado en el repositorio (no hay commit), ni publicado en el servidor real. Todo vive en copias de trabajo locales.

## 1. Qué es el panel Biblioteca y cómo debe funcionar

Es el lugar donde se ve, se corrige y se publica el catálogo de productos. Tiene tres pestañas:

| Pestaña | Para qué sirve | Quien la tiene puede |
|---|---|---|
| **Productos** | Mirar | Ver catálogo con precios y características. No cambia nada |
| **Actualización** | Modificar | Editar fichas, fotos, PDF, cargar precios por Excel, quitar/archivar. Un solo permiso: editar |
| **Publicación** | Publicar | Publicar, retirar y programar |

**Reglas v1 decididas por el usuario (24/10/2026):**
1. Las notas internas solo las ve quien tenga su permiso.
2. El cargo (Super Admin, Supervisor, etc.) ya no da permisos. Todo sale de los paneles asignados. El cargo solo decide qué paneles vienen puestos por defecto.
3. Cargas masivas y edición, solo en Biblioteca > Actualización.
4. Los precios solo cambian por carga masiva o desde la ficha del producto.
5. Las Listas ya no existen. Ninguna función de Biblioteca debe depender de ellas.
6. Actualización tiene un solo permiso (editar) y todo queda registrado en el historial.
7. Dar el panel Biblioteca sin más da solo Productos (mirar).

## 2. Lo que ya está hecho

### 2.1 Menú (fase 1)

| Qué | Estado |
|---|---|
| Menú «Catálogo y precios» reemplazado por «Biblioteca» con tres pestañas: Productos, Actualización, Publicación | Hecho |
| Nueva pantalla Actualización con «Carga de precios» | Hecho |
| «Listas» deja de ser pestaña | Hecho |

Comprobado (según `biblioteca-menu-fase1.md`): revisión de tipos (`tsc`) sin errores; 6 archivos de prueba, 43 pruebas pasan (`vitest`).
No probado: la revisión manual en el navegador (tarea T6) quedó sin hacer.
Fallos conocidos sin corregir: el menú «Biblioteca» no se resalta en algunas rutas; la pantalla de asignar accesos aún dice «Catálogo y precios».

### 2.2 Cola y editor de fichas (fase 2)

| Qué | Estado |
|---|---|
| Subnavegación en Actualización: Carga de precios, Fichas de producto, Historial (este último «Próximamente») | Hecho |
| Cola de productos pendientes con filtros rápidos (sin imagen, sin marca, sin precio, borrador) y botón «Siguiente pendiente» | Hecho |
| Botón «Editar ficha» en Productos (solo con permiso de editar) y regreso conservando los filtros | Hecho |
| Editor de ficha por producto, con barra «Guardar cambios / Descartar» y contador de cambios sin guardar | Hecho |
| Vista previa Cliente / Tienda / Vendedor | Solo maqueta, marcada «pendiente» |

Cambio aprobado por el usuario: la pestaña Actualización pasó de exigir el permiso viejo de Listas a exigir «Editar productos».
Comprobado (`biblioteca-fichas-fase2.md`): `tsc` sin errores, `eslint` limpio en los archivos tocados, `vitest` 33 archivos / 286 pruebas pasan.
No probado: navegador. Las interacciones (guardar, descartar, aviso al salir, ventanas) solo tienen pruebas de pantalla estática, no de clics.
Límites: los filtros de la cola solo miran la página ya cargada (el servidor no filtra por esos campos). No hay reordenar imágenes (no existe esa función en el servidor).

### 2.3 Precio único (carga de precios para proveedores sin escalafones)

Permite subir un archivo con una sola columna `PRECIO UNICO (CON IVA)`, elegir en pantalla a cuáles de los cinco escalafones se copia (por defecto los cinco), ver el resultado antes de aplicar y recibir un aviso de que es precio de proveedor, no de venta.

Comprobado (`biblioteca-precio-unico.md`, repetido por el hilo principal):
- Servidor: `tsc` sin errores; `eslint` limpio; `jest` en `src/modules/prices/import`: 16 suites pasan, 438 pruebas pasan (2 suites y 16 pruebas omitidas).
- Pantalla: `tsc`, `eslint` sin errores; `vitest` 20 archivos / 140 pruebas pasan.
- Archivo de prueba `5_precio_unico.xlsx` creado y releído (los cuatro originales intactos). Verificado hoy: existe en la carpeta de Descargas.

No probado: el servidor real, el navegador, un Excel completo de punta a punta. El servidor que se ve en pantalla es el de la VPS, que no tiene este código.

### 2.4 Mapa de permisos

Documento `mapa-de-permisos-biblioteca.md`: compara lo que el usuario quiere con lo que el sistema hace hoy, acción por acción. Comprobado leyendo código; nada se ejecutó contra una base real. Los huecos más graves:

| # | Hueco |
|---|---|
| 1 | Las notas internas se filtran a cualquiera que vea el producto |
| 2 | Un Admin Comercial sin ningún permiso edita, archiva y borra; el permiso «Eliminar producto» no controla nada |
| 3 | Cargas masivas y consulta de precio por SKU no piden permisos |
| 4 | Los precios se pueden cambiar al guardar un producto sin permiso de precios |
| 5 | El historial de un producto no pide permisos |
| 6 | La lista de productos sale vacía con solo «Consultar productos» (depende del permiso viejo de Listas) |
| 7 | Botones según cargo, pestañas según permiso |
| 8 | Productos más vistos / programadas / tablero inicial se muestran a cualquier cargo |
| 9 | Fotos y PDF públicos con el enlace (probablemente correcto; es decisión del usuario) |

Inferido: que el paquete «Publicación del catálogo» no pueda publicar productos que estén en una Lista.

## 3. En curso o en pausa

| Tema | Estado | Por qué |
|---|---|---|
| **Historial de cambios (fase 3)** | **En pausa** desde el 24/10. Sin una línea de código escrita | El usuario dijo que las Listas ya no existen y que primero se cierre la estructura de permisos. El diseño de seguridad del historial usaba permisos de Listas y hay que rehacerlo |
| **Acceso solo por paneles** | Solo la tarea T30 (registrar reglas) está hecha. T31 a T37 sin empezar | T31 necesita aprobación para instalar dependencias del servidor |

Aclaración sobre el historial: hoy solo existe un historial por producto individual. Cambios de fichas e imágenes no se registran. El diseño propuesto lista cambios de precios, fichas y publicación, con detalle «antes y después».
Aclaración sobre dependencias: el avance de la regla de precio único ya instaló dependencias con aprobación del usuario (lo dice ese documento). El documento de paneles, que es posterior en su redacción, aún las lista como pendientes. No verificado cuál está vigente hoy en este directorio.

## 4. Lo que se planea, en orden

| Paso | Tarea | Depende de | Riesgo principal |
|---|---|---|---|
| 1 | Preparar entorno de pruebas del servidor (T31) | Aprobación del usuario | Sin esto no se pueden verificar los pasos 2 a 4 |
| 2 | Revisión de permisos en el servidor: un solo control por permiso del panel, sin cargo ni Listas (T32) | Paso 1 | **Quien hoy edita o publica por su cargo pierde ese acceso hasta que se le asigne el panel** |
| 3 | Reglas de datos: quitar notas internas sin permiso; bloquear cambio de precios fuera de los dos caminos; borrar/archivar con el permiso de Actualización (T33) | Paso 2 | Posible rechazo de flujos que hoy «funcionan» sin permiso |
| 4 | Tres paquetes de asignación (Productos, Actualización, Publicación) sin Listas; la pantalla de asignación muestra «Biblioteca» con una casilla por pestaña (T34) | Paso 2 | Hay que conservar los identificadores viejos para que las asignaciones actuales sigan visibles |
| 5 | Botones de las pantallas según permisos, igual que las pestañas (T35) | Paso 4 | Bajo; no toca el servidor |
| 6 | Historial completo y visible (T36), reanudando la fase 3 | Pasos 2 a 4 | Escaneos pesados entre productos (faltan índices; requeriría migración, que hoy no está autorizada) |
| 7 | Paneles por defecto según cargo, como acción de Super Admin, sin migración silenciosa (T36) | Qué paneles lleva cada cargo (se propondrá) | Asignar mal deja a gente sin acceso |
| 8 | Verificación final e instrucciones de prueba local (T37) | Todo lo anterior | — |

**Antes de desplegar:** hay que asignar el panel a quienes hoy editan o publican por cargo. Si no, pierden el acceso el día del despliegue.

## 5. Decisiones

**Tomadas por el usuario** (24/10/2026): las seis reglas de la sección 1 y la opción B del precio único (columna única, exclusiva con las de escalafones). También se aprobó que Actualización exija «Editar productos».

**Supuestos míos, pendientes de confirmar:**
- Super Admin conserva acceso total (si no, nadie podría asignar paneles).
- «Quitar» y «archivar» van dentro del permiso de Actualización, con confirmación y registro.
- Las notas internas siguen con su permiso propio ya existente.
- Quien hoy edita por cargo perderá la capacidad hasta recibir el panel.
- Fotos y PDF siguen públicos por enlace salvo los marcados privados (confirmar).
- Qué paneles lleva cada cargo por defecto (a proponer).
- Precios visibles con el permiso de Productos, sin un «Ver precios» aparte (el usuario lo dio por hecho; dejarlo escrito).

## 6. Aprobaciones necesarias para probarlo de verdad

Por las reglas del proyecto (`AGENTS.md`) nada de esto se ha ejecutado ni se ejecutará sin una orden explícita, cada vez:

| Acción | Para qué |
|---|---|
| Instalar dependencias del servidor y generar el cliente de base de datos | Correr revisión de tipos y pruebas del servidor (T31). Para precio único ya se aprobó una vez; la aprobación de una vez no se traslada |
| Levantar un servidor local con su base de datos | Ver el historial y los permisos funcionando con datos |
| Despliegue a la VPS | Que la pantalla de la VPS tenga el código nuevo. Hasta entonces el navegador contra la VPS no verá el precio único ni el historial |
| Commit, push, PR | Guardar el trabajo en el repositorio |
| Migraciones | Solo si se decide agregar índices al historial |

## 7. Cómo probar hoy lo que ya existe

Requisito: sesión iniciada en la pantalla (http://localhost:5174). Las credenciales las pone el usuario.

| Qué probar | Ruta | Qué esperar |
|---|---|---|
| Menú | `/commercial/products` | Entrada «Biblioteca» con Productos, Actualización, Publicación |
| Solo mirar | `/commercial/products` | Botón «Editar ficha» solo si tienes «Editar productos» (hoy el botón se decide por cargo, ver hueco 7) |
| Carga de precios | `/commercial/library/update` | Pantalla con «Carga de precios» |
| Cola de fichas | `/commercial/library/update/products` | Filtros rápidos y «Siguiente pendiente» |
| Editor | `/commercial/library/update/products/<id>` | Secciones, barra de guardar, vista previa maqueta |
| Historial | pestaña en Actualización | Aparece deshabilitada «Próximamente» |

**Precio único:** `C:\Users\sopor\Downloads\pruebas-carga-precios\5_precio_unico.xlsx` (SKUs `WD122PURP`, `WD102PURP`, `UY2` y uno inexistente). Qué esperar: el sistema reconoce la columna única, muestra la selección de escalafones (los cinco marcados), pide aviso de precio de proveedor y marca el SKU inexistente como problema.
**Advertencia:** el servidor al que se conecta la pantalla es el de la VPS y no tiene el código del precio único. Para probarlo hace falta un servidor local (sección 6). Hasta entonces, la prueba real no es posible.
Puede que las interacciones (guardar, descartar, ventanas) fallen: solo tienen pruebas estáticas.

## 8. Apéndice técnico: mapa de archivos

Rutas relativas a `src/backend/src` (BE) y `src/frontend/src` (FE). Resumen de `git status` (172 entradas): el árbol tiene mucho trabajo sin guardar de **dos hilos**. No hay forma de saber por el estado a cuál pertenece cada archivo modificado; lo siguiente se basa en lo que declaran los documentos de tarea.

### Del hilo de esta tarea (Biblioteca: menú, fichas, precio único, permisos)

| Área | Archivos |
|---|---|
| Documentos | `odd/tasks/biblioteca-menu-fase1.md`, `-fichas-fase2.md`, `-historial-fase3.md`, `-acceso-por-paneles.md`, `-precio-unico.md`; `docs/biblioteca-dominio/mapa-de-permisos-biblioteca.md`; este resumen |
| Menú y acceso (FE) | `features/users/access.ts` (+ `.spec`), `components/layout/CommercialLayout.tsx`, `Header.tsx` (+ specs), `App.tsx`, `App.spec.tsx` |
| Pantallas nuevas (FE) | `pages/LibraryUpdatePage.tsx`, `LibraryUpdateLayout.tsx`, `LibraryProductQueuePage.tsx`, `LibraryProductEditorPage.tsx` (+ specs), `features/products/lib/library-nav.ts`, `products-list-url.ts`, `sheet-dirty.ts` (+ specs) |
| Modificados (FE, ojo: compartidos con el otro hilo) | `pages/ProductsPage.tsx`, `ProductDetailPage.tsx`, `features/products/components/ProductCard.tsx`, `ProductTableRow.tsx`, `features/products/sheet/ProductSheetEditor.tsx`, `ProductSheetTab.tsx` |
| Precio único (FE) | `features/price-import/SinglePriceSelector.tsx`, `singlePrice.spec.tsx`, `PriceImportFlow.tsx`, `PriceImportRevisionsSection.tsx`, `flow.utils.ts`, `services/price-import.service.ts` |
| Precio único (BE) | `modules/prices/import/price-template.ts`, `price-import.controller.ts`, `price-import.service.ts`, `price-import.types.ts` (+ specs) |
| Historial (BE) | Ningún código: el módulo `library-history` no existe (verificado) |

### Del otro hilo (constructor de la base de datos dedicada de Biblioteca): no reclamar

`deploy/biblioteca/`, `deploy/dev/`, `docs/adr/ADR-20261022-...`, `docs/biblioteca-dominio/` (excepto el mapa y este resumen), `docs/bitacora/2026-10-2*`, `prisma/biblioteca*/`, `prisma/poc-dos-clientes/`, `BE/__integration__/`, `BE/prisma/biblioteca-*.ts`, `BE/modules/library-audit/`, `library-review/`, `*.library.spec.ts`, `product-library*.ts`, `FE/features/library-review/`. Además, muchos archivos modificados del servidor (control de accesos, productos, marcas, categorías, archivos, listas, cotizaciones, tablero, tienda) parecen pertenecer a ese hilo por el tema, pero **no verificado** archivo por archivo.

### Puntos de código relevantes para el plan (según el mapa de permisos)
Historial por producto sin permiso: `modules/audit/audit.controller.ts:47-48`. Permiso «Eliminar» sin uso: `common/security/access-catalog.ts:113`. Rutas actuales: `FE/App.tsx:89-95`.
