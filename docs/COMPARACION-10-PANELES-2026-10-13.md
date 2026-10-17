# Qué tenemos y qué falta para organizar los diez paneles

**Revisión del 13 de octubre de 2026.** La plataforma ya tiene una base comercial y de catálogo aprovechable. El cambio central pendiente es convertir herramientas dispersas, accesos por rol y paneles extra en paquetes de trabajo por persona. También faltan procesos completos de compra online, despacho, inventario y posventa.

Esta comparación acompaña la [estructura principal aprobada](PROPUESTA-ARBOL-PANELES-2026-10-13.md) y la [decisión de organización](adr/ADR-20261013-paneles-y-paquetes-de-trabajo.md). No calcula un porcentaje de avance: todavía no se ha cerrado el conjunto de acciones de los paquetes hijos.

**Actualización al definir Comercial:** el usuario confirmó que el vendedor factura en Yéminus sin aprobación de venta y que las solicitudes sin stock se anotan en el Excel «Pedidos». El [diseño detallado de Comercial](DISENO-PANEL-COMERCIAL-2026-10-13.md) incorpora ese proceso. También se corrigió la lectura de `/sales/promotions`: el layout muestra el panel aunque el elemento de la ruta sea vacío.

## Cómo leer el estado

- **Base existente:** hay código conectado a pantallas o endpoints registrados. Eso no significa que todo el panel propuesto esté terminado.
- **Parcial:** una parte existe, pero faltan procesos, pantallas, permisos o conexión con datos.
- **Prototipo:** usa datos ficticios o cambios que solo duran en la pantalla.
- **Por construir:** no se encontró un flujo operativo en los módulos y rutas revisados.
- **Pendiente de verificar:** no se probó la acción con sesión y datos en esta revisión.

## Tres versiones que hay que tener presentes

**Servidor principal S3:** `/home/soporte/office_ai/grupo-security-office`, rama `feat/storefront-public-pricing`. Sirve el frontend 5173. El contenedor `gs-api` monta el código de backend de este proyecto y expone el API en el puerto 3000. Su inventario OpenAPI respondió y contiene 154 rutas distintas; no es un conteo de funciones probadas. El frontend `/tienda` respondió HTTP 200.

**Worktree del servidor S4:** `/home/soporte/.herdr/worktrees/grupo-security-office/worktree-dashboards`, rama `worktree/dashboards`. Es el código usado anteriormente para el frontend 5174. Durante la revisión, `http://127.0.0.1:5174/tienda` rechazó la conexión; se revisó su código, no una interfaz en ejecución. Tiene diferencias frente a S3 y no se debe tratar como una copia idéntica. El API activo se toma de S3.

**Worktree local L:** `C:/Users/sopor/.codex/worktrees/25d1/grupo-security-office`. Contiene el control por acciones individuales, guardias y navegación protegida, además del gestor de banners. S3 y S4 no contienen `access-catalog.ts`, `AdminAccessGuard` ni `UserAccessAssignments`. El API activo no registra las nuevas rutas de asignación individual ni de banners. L tampoco contiene todos los módulos que hoy tiene S3.

La revisión leyó código, modelos, pruebas existentes, montajes del contenedor y el inventario público del API. No consultó usuarios ni registros comerciales en la base, no cambió permisos, no reinició servicios y no ejecutó operaciones funcionales con sesiones reales.

## Comparación panel por panel

### 1. Comercial — base existente, integración parcial

**Ya hay:** clientes y prospectos, cotizaciones, jerarquía, pedidos de venta derivados de cotizaciones ganadas y metas. En S3 existe `/sales` con clientes propios y cotizaciones conectadas a servicios, además de agenda y solicitudes de equipo con endpoints. S4 tiene clientes y cotizaciones, pero no las mismas pantallas de vendedor. L ofrece páginas separadas de pedidos y metas con acciones individuales.

**Lo que requiere corrección:** la pantalla principal `/supervisor` de S3 es un prototipo: muestra vendedores, metas y facturas ficticios; editar una meta cambia el estado local y se pierde al recargar. Que exista la API de metas no conecta automáticamente ese formulario a datos reales. La página `/sales/promotions` sí muestra promociones: `SalesLayout.tsx:90` renderiza `SalesPromotionsPanel` según la ruta; el elemento vacío de `App.tsx` no prueba ausencia de la función.

**Para llegar al diseño:** definir los paquetes Vendedor, Supervisor comercial y Gestión comercial; reutilizar agenda y solicitudes; conectar el resumen del supervisor con las herramientas reales; aplicar permisos y alcances por persona. Tener el rol Supervisor hoy no equivale a recibir el paquete futuro Supervisor comercial.

**Evidencia:** S3 `src/frontend/src/App.tsx:90`, `src/frontend/src/features/sales/SalesHomePage.tsx:23`, `src/frontend/src/features/supervisor/SupervisorWorkspacePage.tsx:31`, `src/backend/src/modules/team-workflow/workflow.controller.ts:8`. L `src/frontend/src/App.tsx:61` y `src/backend/src/common/security/access-catalog.ts:28`.

### 2. Catálogo y precios — base amplia, organización por adaptar

**Ya hay:** productos, categorías, marcas, imágenes, tarifas, Listas, accesos a Listas, importaciones y publicación. S3 incluye también edición de ficha técnica y detalle público con modelos de especificaciones y recursos. El API activo registra `/api/products/{id}/sheet` y `/api/public/products/{idOrSlug}/detail`. S4 conserva el catálogo público y su presentación propia. L separa acciones de lectura, creación, edición, publicación, archivo, eliminación e importación.

**Para llegar al diseño:** reorganizar bajo Catálogo y precios; definir paquetes de edición, tarifas/Listas, publicación, importación y consulta; preservar el acceso a cada Lista y a sus precios. Reutilizar la ficha técnica y los recursos de S3 al consolidar el código. La versión local no debe usarse para reemplazar funciones del catálogo que solo estén en S3.

**Evidencia:** API activo: rutas de productos/ficha técnica, categorías, marcas, tarifas y Listas. S3 `src/backend/src/modules/products/sheet/product-sheet.controller.ts` y `src/backend/prisma/schema.prisma` (modelos `ProductCatalogSpecGroup`, `ProductCatalogSpecItem`, `ProductCatalogResource`). L `src/backend/src/common/security/access-catalog.ts:21`.

### 3. Tienda online — catálogo y cuentas existentes; compra completa pendiente

**Ya hay:** catálogo público, precios públicos/profesionales, registro y acceso de clientes, aprobación de solicitudes y asignación de tarifas. El API activo contiene dos familias de acceso de clientes: `/api/customer-portal` y `/api/customer-access`. El portal incluye niveles de cuenta (`PortalTier`) y asignación de nivel; la tienda nueva tiene verificación/recuperación y sus propias sesiones.

**Lo que requiere decisión:** esos dos sistemas tienen modelos y flujos distintos. Hay que definir cuál es la experiencia oficial y cómo se conservan las cuentas y tarifas antes de integrarlos. No se deben considerar simples nombres alternativos del mismo flujo.

**Falta:** carrito, finalización de compra, pago online y creación de pedidos desde la compra web. No aparecen endpoints de esos procesos en OpenAPI ni módulos operativos correspondientes en el código revisado.

**Para llegar al diseño:** consolidar la gestión de cuentas; separar las acciones de ver, aprobar, rechazar, suspender y asignar tarifa/nivel según el flujo elegido; definir Operador de tienda y Configuración de compra.

**Evidencia:** S3 `src/backend/src/modules/customer-portal/customer-portal.controller.ts:41` y `:125`; `src/backend/src/modules/storefront/storefront.controller.ts:80` y `:166`. OpenAPI activo de ambas familias de rutas.

### 4. Configuración de la página y promociones — piezas existentes en versiones distintas

**Ya hay en el servidor:** configuración de información comercial, contactos, horarios, documentos y tarifa pública. S3 tiene promociones internas con título, mensaje, flyer, inicio/fin, audiencia global o de equipo, edición y retirada. Hay una página `/promotions`, servicio, modelo `SalesPromotion` y rutas registradas en el API activo. El slider público de S3 conserva una lista de imágenes escrita en `HomeHero.tsx`.

**Ya hay en L:** gestor de banners con imágenes de móvil y escritorio, botones/enlaces, borrador y copia publicada independientes, revisión de concurrencia y auditoría. Sus acciones son Ver, Crear, Editar, Publicar/retirar y Eliminar. No está registrado en el API activo del servidor.

**La diferencia:** las promociones de S3 son avisos internos para vendedores. No son un editor del slider público ni un motor que aplica descuentos al precio de una compra. Sus acciones y permisos todavía dependen del rol. Crear y publicar un aviso se manejan juntos en ese flujo.

**Falta:** conectar el gestor de banners con la versión oficial, organizar ambos tipos de campaña bajo paquetes claros, editor general de secciones/menús/destacados y reglas de cupones/descuentos. Programar fechas de un aviso interno no equivale a programar un banner público.

**Evidencia:** S3 `src/frontend/src/features/storefront/components/HomeHero.tsx:5`, `src/frontend/src/features/promotions/PromotionManagerPage.tsx:15`, `src/backend/src/modules/promotions/promotions.controller.ts:11` y `promotions.service.ts:55`. L `src/backend/src/modules/storefront/banners.service.ts:40` y `src/frontend/src/pages/PageConfigurationPage.tsx`.

### 5. Pedidos y despachos — pedidos y referencia de factura parciales

**Ya hay:** pedidos derivados de cotizaciones ganadas, lectura de pedidos y registro del número/fecha de factura externa. El API activo contiene esas tres rutas; L ofrece una página de pedidos protegida por su permiso. La navegación principal de S3/S4 no contiene esa misma página administrativa separada.

**Falta:** preparación del pedido, reservas operativas de unidades, transportadora, guía, salida, entrega e incidencias. Tampoco hay una implementación completa de emisión de factura electrónica; registrar su referencia es una operación distinta.

**Para llegar al diseño:** una única ficha de pedido, accesible desde Comercial y Tienda con alcance autorizado; paquetes de gestión, registro de facturación, preparación y despachos.

**Regla de empresa confirmada después:** la venta real se factura en Yéminus por el vendedor, sin aprobación de un supervisor. Las solicitudes por falta de stock se registran hoy en Excel «Pedidos». La sincronización de facturas y la representación digital de esas solicitudes son trabajo pendiente; no se sustituyen por el pedido interno nacido de una cotización ganada ni se deben contabilizar como ventas duplicadas.

**Evidencia:** S3 `src/backend/src/modules/commercial/sales-orders/sales-orders.controller.ts`; modelos `SalesOrder` y `Quote`. API activo `/api/commercial/sales-orders`, `/{id}` y `/{id}/invoice`. L `src/frontend/src/App.tsx:63`.

### 6. Inventario y abastecimiento — modelo de datos, operación por construir

**Ya hay:** modelo `Stock` con unidades disponibles, reservadas y ubicación. S3 tiene además una función auxiliar de notificación de stock en su servicio de notificaciones.

**Falta:** panel/API operativos de movimientos, reservas, entradas, salidas, compras, proveedores y aprobación de ajustes. Un modelo de datos o una función de aviso no realizan esas operaciones. OpenAPI no registra rutas de stock/inventario en la revisión.

**Para llegar al diseño:** confirmar si Yéminus será responsable de existencias y compras. Definir consulta/sincronización y las operaciones permitidas antes de crear un segundo flujo de inventario.

**Evidencia:** modelos `Stock` de S3/S4/L. S3 `src/backend/src/modules/notifications/notification.service.ts:218`. Inventario de módulos y rutas del API activo.

### 7. Servicio al cliente — consultas existentes, posventa pendiente

**Ya hay:** formulario de consultas de visitantes, persistencia y marca de atención desde administración. L separa Ver y Atender consultas. En el servidor se administra desde Tienda y acceso.

**Falta:** casos de soporte técnico, asignación de responsables, historial de seguimiento, garantías y devoluciones con decisiones y estados. El documento público de garantías explica condiciones, pero no gestiona una solicitud de garantía.

**Para llegar al diseño:** trasladar la herramienta de consultas al área de Servicio al cliente y definir los paquetes de consultas, soporte y posventa, reutilizando la información de clientes.

**Evidencia:** S3 `src/backend/src/modules/storefront/storefront.controller.ts:70` y `:187`, `StorefrontInquiry`. L `src/backend/src/common/security/access-catalog.ts:36`.

### 8. Informes y auditoría — base existente; cobertura que completar

**Ya hay:** dashboard, indicadores comerciales/de catálogo, resúmenes y lectura de auditoría. L separa sus permisos de consulta, guarda asignaciones con auditoría en la misma transacción y tiene eventos de banners. S3 registra cambios de promociones en transacciones con auditoría.

**Lo que requiere revisar:** el resumen del supervisor usa cifras ficticias. En el servicio de agenda/solicitudes de S3 no se encontraron llamadas a `AuditService`/`auditLog`; no se puede afirmar con ese archivo que sus operaciones tengan eventos auditables. Tampoco se verificó en esta revisión cada ruta alternativa de auditoría.

**Falta:** informes de compras web, despachos, inventario, garantías y campañas según se implementen; exportaciones con su permiso separado; catálogo de eventos y reglas que eviten contar dos veces una operación.

**Para llegar al diseño:** paquetes de consulta personal/equipo/negocio y auditoría independiente, con datos autorizados y definición de estadísticas por proceso.

**Evidencia:** S3 `src/backend/src/modules/audit/audit.controller.ts`, `dashboard/dashboard.controller.ts`, `promotions/promotions.service.ts:66`, `team-workflow/workflow.service.ts`. L `access-assignments.service.ts:40` y `banners.service.ts:58`.

### 9. Usuarios y accesos — dos modelos actuales; paquetes nuevos pendientes

**En el servidor:** Usuarios y roles existen. La pantalla Paneles extra asigna paquetes/bloques del dashboard que se suman a los roles. El inicio de sesión combina permisos de roles y concesiones individuales. La interfaz indica que los cambios se aplican al volver a iniciar sesión. Ese mecanismo no reparte por sí solo acciones de todos los procesos de la plataforma.

**En L:** la selección es Área → Apartado → Acción. Un usuario normal nuevo comienza sin acciones; el rol es descriptivo. Super Admin conserva la administración de identidad y asignaciones. Se validan acciones/dependencias, alcances y concurrencia; el servidor usa las asignaciones vigentes. El catálogo tiene 20 apartados operativos y tres casillas de alcance en un apartado separado.

**Falta en ambos:** seleccionar un paquete de trabajo Vendedor/Supervisor/Editor y guardar su procedencia, versión y ajustes por persona. La tabla local `UserPermission` tiene una sola concesión por usuario/permiso; no conserva la procedencia de varios paquetes. Esa parte debe diseñarse para retirar un paquete sin quitar accesos que aún concede otro.

**Para llegar al diseño:** consolidar primero las funciones del servidor que no están en L; conectar los diez paneles con un único catálogo de acciones; implementar paquetes y alcances revisables; comparar accesos antes de trasladar cuentas reales. No habilitar todo a partir del nombre del rol.

**Evidencia:** S3/S4 `src/frontend/src/features/users/components/DashboardGrants.tsx`. S3 `src/backend/src/modules/auth/auth.service.ts:84`, `src/backend/src/common/security/user-permissions.service.ts:17`, `src/frontend/src/lib/workspace.ts:6`. L `src/frontend/src/features/users/components/UserAccessAssignments.tsx:23`, `src/backend/src/common/security/access-assignments.service.ts:40`, `src/backend/prisma/schema.prisma:399`.

### 10. Configuración técnica e integraciones — servicios existentes, panel incompleto

**Ya hay:** autenticación, MFA, sesiones, archivos, salud del API, configuración de correo por variables de entorno y notificaciones personales. S3 contiene rutas de autorización/conexión con Notion. Esa presencia no confirma una sincronización externa funcionando ni constituye integración con Yéminus.

**Falta:** un panel técnico con acciones delegables, diagnóstico de conexiones, plantillas cuando exista su editor, integración confirmada con la API de Yéminus, pasarela de pagos y transportadoras. La configuración de canales/horarios de la página pertenece al panel de contenido; las credenciales pertenecen a la configuración técnica del servidor.

**Para llegar al diseño:** reservar inicialmente las funciones críticas a Super Admin y definir cada tarea delegable. Las notificaciones propias son transversales a los trabajos y no otorgan acceso adicional al recurso que mencionan.

**Evidencia:** API activo `/api/notifications`, `/api/auth/notion*` y `/api/health*`. S3 `src/backend/src/modules/notifications/notification.service.ts` y `src/backend/src/modules/auth/notion-auth.controller.ts`. L `src/backend/src/common/security/` y `src/backend/src/modules/storefront/storefront-mail.service.ts`.

## Lo que conviene hacer primero

1. **Conservar la base de las versiones actuales.** Mantener las funciones de vendedor, agenda, promociones, portal y ficha técnica de S3, además del acceso granular y banners de L. Registrar qué versión es oficial antes de integrarlas.
2. **Cerrar el árbol de paquetes.** Empezar por Vendedor, Supervisor comercial, Editor de banners y Publicador de contenido. Definir acciones, alcances, dependencias y ajustes personales.
3. **Completar el inventario de accesos de S3.** Clasificar las rutas de promociones, agenda/solicitudes, notificaciones, portal de clientes, ficha técnica y conexión con Notion antes de aplicar el control local a toda esa versión. El guard local rechaza rutas sin clasificación.
4. **Construir asignación y procedencia de paquetes.** Conservar versiones, aportes de varios paquetes y cambios personales; auditar concesiones/revocaciones y mostrar la diferencia antes de guardar.
5. **Ordenar la navegación en diez paneles y conectar los prototipos.** El menú depende del trabajo asignado. Reutilizar herramientas y proteger enlaces/API con el mismo catálogo.
6. **Precisar la tienda oficial y el ERP.** Resolver las dos familias de cuentas de clientes y confirmar la responsabilidad de inventario, facturación y compras.
7. **Construir los procesos nuevos por etapas.** Compra online, pagos, despacho, soporte/garantías y reglas de promociones; cada uno con datos, acciones, auditoría y verificación propia.

## Qué se comprobó en esta revisión

- [x] Lectura del catálogo local de acciones y pantalla de asignación.
- [x] Lectura de código de S3 y S4, sus modelos y rutas.
- [x] Confirmación del backend montado por el contenedor activo.
- [x] Inventario del API activo: OpenAPI responde, 154 rutas.
- [x] Respuesta de `/tienda` en 5173 y ausencia de respuesta en 5174 durante la revisión.
- [x] Identificación del prototipo de supervisor y verificación de promociones del vendedor mediante su layout.
- [x] Detección de pruebas existentes de promociones, agenda/solicitudes y portal; no se ejecutaron en esta revisión.
- [ ] Recorrido funcional de cada pantalla y acción con sesiones autorizadas.
- [ ] Validación de los procesos con datos del ambiente elegido.
- [ ] Matriz completa pantalla → API → datos → permiso → alcance → evento para los paquetes finales.

Las pruebas históricas de L se documentan en `IMPLEMENTACION-ACCESO-POR-USUARIO.md` y `BANNERS-Y-CONFIGURACION-PAGINA.md` de ese worktree. No son pruebas de las funciones adicionales de S3 ni del estado actual de sus datos.

## Conservación documental en el servidor

La estructura, esta comparación y el ADR se conservan en `docs/` y `docs/adr/` del proyecto principal de S3, con una copia idéntica en S4. La integridad de las copias se comprueba por SHA-256 al transferirlas. Son documentos de organización y revisión; la transferencia no publica funcionalidades ni modifica usuarios, permisos o datos comerciales.
