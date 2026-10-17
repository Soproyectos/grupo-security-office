# Comercial: paquetes de trabajo y sus herramientas

**Estado:** diseño de trabajo actualizado el 13 de octubre de 2026 a partir de la revisión del usuario. La estructura de diez paneles está aprobada; los hijos de Comercial siguen sujetos a revisión antes de implementar permisos. Los procesos reales indicados por el usuario se documentan como reglas confirmadas. Las funciones nuevas siguen pendientes de implementación.

Comercial se propone con **Vendedor, Supervisor comercial y Gestión comercial**. Un paquete contiene herramientas y acciones, no una posición de la empresa. Dos personas con el mismo cargo pueden recibir selecciones diferentes. Super Admin ve lo que incluye cada paquete, ajusta las acciones y los datos autorizados y guarda la asignación. La consulta de solo lectura puede darse como acciones concretas dentro de estos paquetes, sin crear por ahora un cuarto hijo independiente.

## La operación que explicó el usuario

1. **El vendedor crea la factura en Yéminus.** No hay una persona que apruebe cada venta. La plataforma debe reflejar automáticamente las ventas reales a partir de esa fuente cuando se implemente su integración.
2. **Si no hay stock, la solicitud se registra en el Excel «Pedidos».** Es un pendiente comercial por falta de producto; no una venta facturada ni una salida de inventario.
3. **Supervisar no significa aprobar ventas.** El supervisor acompaña al equipo, revisa resultados, agenda y pendientes.

La API de Yéminus, la forma de obtener sus datos y el formato del Excel todavía no están disponibles en esta revisión. Que ese sea el proceso de la empresa no confirma que ya esté conectado al software de Grupo Security.

Una cotización marcada como ganada puede indicar que la oportunidad se cerró. El código actual crea además un pedido interno al marcarla ganada; ese registro no sustituye una factura de Yéminus ni el Excel de pedidos por falta de stock. Los indicadores de venta facturada se deben alimentar de facturas reales, evitando contar la cotización y la factura como dos ventas.

## Árbol inicial

Las casillas representan la selección que verá Super Admin. Mostrar una función en este diseño no la hace asignable antes de implementarla y verificarla.

```text
Comercial
├── [ ] Vendedor
│   ├── Mi resumen
│   │   └── Ver clientes, cotizaciones, ventas, avances y pendientes autorizados
│   ├── Mis clientes y prospectos
│   │   ├── Ver y buscar
│   │   ├── Crear
│   │   └── Editar datos y notas
│   ├── Mis cotizaciones
│   │   ├── Ver y crear
│   │   ├── Editar productos y cantidades
│   │   └── Cambiar estado sin aprobación de venta
│   ├── Mis ventas y facturas
│   │   ├── Consultar lo facturado por el vendedor en Yéminus
│   │   └── Consultar meta y avance
│   ├── Mis pedidos por falta de stock
│   │   ├── Ver pendientes
│   │   └── Registrar, actualizar o cancelar mis solicitudes autorizadas
│   ├── Mi agenda
│   │   ├── Ver llamadas, visitas y seguimientos
│   │   ├── Crear actividades propias
│   │   └── Marcar actividades propias como completadas
│   └── Promociones internas
│       └── Ver avisos y piezas vigentes autorizados
├── [ ] Supervisor comercial
│   ├── Resumen del equipo
│   ├── Consulta de integrantes y clientes del equipo
│   ├── Seguimiento de cotizaciones
│   ├── Consulta de ventas y facturas del equipo
│   ├── Seguimiento de pedidos por falta de stock
│   ├── Agenda del equipo y asignación de actividades
│   └── Seguimiento de metas
├── [ ] Gestión comercial
│   ├── Organización de cartera y responsables
│   ├── Gestión de metas
│   ├── Gestión de avisos comerciales internos
│   └── Importación y exportación del Excel de estadísticas «Pedidos»
```

## 1. Vendedor: trabajar su propia cartera

**Selección base propuesta:** trabajar con sus clientes, cotizaciones, actividades y solicitudes; consultar su facturación y metas. El catálogo y sus precios se consultan dentro de las Listas autorizadas. Crear o editar información del catálogo pertenece a otro paquete.

### Clientes y prospectos

Registrar empresa/persona, identificación cuando corresponda, contacto, ciudad, origen del contacto y notas. Permitir buscar, crear un prospecto y actualizar sus datos. Mostrar quién es su responsable y el último contacto.

Editar datos de contacto no debe permitir cambiar el responsable, convertir el prospecto o desactivar el registro a escondidas. Esas acciones se separan si se delegan. La ficha del cliente puede enlazar cotizaciones, facturas y pendientes, siempre dentro del mismo alcance autorizado.

**Base:** módulos actuales de clientes. **Adaptación:** separar modificación de datos de cambio de responsable y de estado; los DTO actuales admiten esos campos dentro de una edición general.

### Cotizaciones

Permitir seleccionar un cliente propio, productos y una tarifa vigente autorizada; agregar y quitar líneas, cambiar cantidades, consultar totales, condiciones y vencimiento. Mantener los precios capturados para no alterar documentos históricos al cambiar una tarifa.

Estados actuales: borrador, enviada, negociación, ganada, perdida y cancelada. Vencida es una condición calculada. Las transiciones válidas se conservan y las acciones sobre una cotización propia no requieren una aprobación de venta por parte del supervisor. Marcar «enviada» registra un estado; no confirma por sí solo el envío de un correo o un PDF.

Los descuentos se tratan como una acción con reglas propias, no como una consecuencia de poder editar cantidades. El porcentaje y las condiciones empresariales deben definirse antes de delegar descuentos. El código actual valida un rango de 0 a 100, pero esa validación numérica no define el límite comercial de cada vendedor.

**Base:** cotizaciones y tarifas actuales. **Adaptación:** transición por permisos/alcance en lugar de rol; separación de descuentos y datos configurables. **Pendiente:** emisión/descarga/envío de documentos si se incluyen como herramientas; no se presentan como funciones existentes por el cambio de estado.

### Ventas y facturas de Yéminus

Mostrar las facturas del vendedor, su fecha, cliente, valor y estado, conservando el identificador de origen. La factura se crea en Yéminus. La consulta en Grupo Security no da permiso para cambiar su número, importe o estado fiscal.

La sincronización debe identificar vendedor y cliente mediante claves acordadas con el ERP; una coincidencia de nombre no basta. Debe mostrar cuándo se actualizó la información y si la conexión está pendiente. Una factura recibida dos veces se actualiza o ignora de forma controlada, sin duplicar la venta. Anulaciones o ajustes deben reflejar lo confirmado por la fuente.

**Pendiente:** conexión y modelo de consulta/sincronización. El código actual solo registra manualmente una referencia de factura externa en un pedido interno. Esa referencia no es una integración automática ya terminada.

### Pedidos por falta de stock

Mientras se define y construye el flujo digital, el Excel «Pedidos» mantiene su función actual. La primera incorporación al panel debe respetar sus columnas y responsables, evitando editar una copia sin control y presentar después dos versiones distintas como oficiales.

Campos iniciales propuestos para una solicitud: identificador, fecha, vendedor, cliente, producto/referencia, cantidad solicitada, estado y observaciones. La relación con una cotización o factura es opcional y no inventa un documento de origen. Los campos y estados definitivos se ajustan al Excel real.

Estados de seguimiento propuestos: pendiente de stock, disponible para gestionar, atendido y cancelado. La disponibilidad no se inventa con una etiqueta: debe venir de una consulta o confirmación autorizada. «Atendido» requiere registrar cómo se resolvió; no significa necesariamente «entregado» si todavía no existe el flujo de despacho. Una solicitud pendiente no cuenta como venta facturada.

El vendedor consulta y registra sus solicitudes. Actualizar cantidades o cancelar exige su acción correspondiente y conserva historial. Una solicitud de varias líneas permite controlar pendientes parciales sin cerrarlo todo por recibir una sola referencia.

**Base:** procedimiento de empresa confirmado por el usuario. **Pendiente en la plataforma:** modelo, pantalla, API, importación/exportación y estados. El modelo actual `SalesOrder`, vinculado obligatoriamente a una cotización ganada, no representa directamente todas estas solicitudes.

### Agenda, promociones y metas

La agenda incluye llamadas, visitas y seguimientos, vistas por fecha, pendientes y completadas. El vendedor crea y completa actividades propias. Reprogramar, cancelar y vincular una actividad estructuradamente con cliente/cotización son mejoras pendientes: no existen en el controlador de agenda revisado.

Las promociones internas muestran los avisos vigentes y sus piezas para la audiencia autorizada. La pantalla ya existe en el layout del vendedor de S3. Consultar esos avisos no habilita editar campañas ni aplicar descuentos.

Las metas y el avance se consultan desde «Mis ventas y facturas»; asignar Vendedor no permite cambiar la meta propia. El avance por facturación se calcula sobre la fuente acordada de Yéminus, separado del volumen de oportunidades cotizadas.

## 2. Supervisor comercial: acompañar al equipo autorizado

**Selección base propuesta:** consultar el equipo autorizado, sus clientes, cotizaciones, ventas, pendientes y metas; revisar la agenda y asignar actividades; crear y seguir sus solicitudes administrativas. No existe una bandeja de aprobación obligatoria de ventas.

- **Resumen real del equipo:** facturación, avance de metas, cotizaciones abiertas, pendientes de stock y actividades pendientes. La pantalla de supervisor actual usa datos ficticios y debe conectarse a fuentes reales.
- **Clientes y cotizaciones:** consultar el seguimiento del equipo. Editar datos, reasignar cartera o trabajar una cotización en nombre de otra persona son acciones explícitas adicionales, no consecuencias de poder supervisar.
- **Ventas y pendientes:** consultar facturas de Yéminus del equipo y las solicitudes de stock autorizadas. Registrar observaciones de seguimiento sería una acción separada.
- **Agenda del equipo:** ver actividades y asignar llamadas, visitas y seguimientos. Completar una actividad ajena requiere permiso específico; el vendedor puede completar las propias.
- **Metas:** consultar las del equipo. Fijar o editar metas se asigna mediante las acciones de Gestión comercial cuando esa persona tiene ese trabajo.
El supervisor no crea usuarios, cambia jerarquías ni reparte paquetes por tener este hijo. La aprobación administrativa de cuentas/accesos es diferente de la venta del vendedor, que no tiene ese paso.

## 3. Gestión comercial: organizar el trabajo

El paquete reúne tareas operativas configurables. Super Admin puede delegar el paquete o seleccionar únicamente las herramientas que necesita esa persona.

- **Cartera:** consultar responsables y asignar/reasignar clientes dentro del ámbito autorizado, con motivo e historial. Cambiar la cartera de un cliente no cambia el cargo ni los paneles de un integrante.
- **Metas:** fijar/importar cuando exista esa función y editar metas por integrante y periodo. Mostrar quién las fijó; auditar los cambios. La API actual permite fijar metas, pero la pantalla de supervisor no la usa todavía.
- **Avisos internos:** Ver, Crear, Editar, Publicar y Retirar como acciones separadas, con audiencia, fechas y piezas autorizadas. El módulo actual publica al crear: separar borrador y publicación es una adaptación pendiente. Publicar una promoción interna no modifica el slider público.
- **Excel «Pedidos»:** previsualizar e importar filas autorizadas con reporte de errores; exportar solicitudes permitidas. Elegir el criterio de actualización y duplicados antes de guardar. Este trabajo requiere acciones nuevas, no el permiso de importación del catálogo.

El alcance empresarial completo se elige por separado y no se concede automáticamente por el nombre Gestión comercial.

## Cómo se combinan paquetes y alcances

Un ejemplo que debe funcionar: Ana recibe Vendedor para editar sus clientes y Supervisor para consultar los de su equipo. **Puede leer el equipo, pero solo editar sus propios clientes**, salvo que Super Admin le dé también edición del equipo.

Los alcances deben asociarse a cada concesión/herramienta y acción, no sumar primero todas las acciones y después aplicar un alcance global más amplio a todas. La versión local actual tiene casillas de alcance comercial por usuario; por ello se necesita adaptar esa parte al combinar paquetes con distintos alcances. La misma revisión debe aplicarse al importador de Excel y a las consultas de facturas.

Cada asignación conserva el paquete, su versión, las acciones y alcance aprobados y los ajustes personales. Si una acción proviene de dos paquetes, retirar uno conserva el acceso que sigue concediendo el otro, con su alcance correspondiente. Un cargo, una nueva herramienta o una nueva versión no amplían el acceso automáticamente.

## Reutilización y cambios necesarios

- **Clientes y cotizaciones:** reutilizar servicios/pantallas, adaptando acciones y campos especiales de estado, responsable y descuentos.
- **Catálogo y precios:** consultar desde Comercial las mismas herramientas autorizadas; conservar sus Listas y tarifas. No duplicar la ficha del producto.
- **Configuración de la página y promociones:** banners, secciones, contenido y promociones públicas pertenecen a este panel, aunque la persona también trabaje en Comercial. Avisos internos del equipo sí siguen en Gestión comercial.
- **Tienda online:** administra la operación del canal de compra y las cuentas web. El contenido visual se gestiona en Configuración de la página; productos y fichas permanecen en Catálogo y precios.
- **Agenda y solicitudes:** reutilizar el módulo de S3, sustituir dependencias operativas del rol por acciones/alcances y completar auditoría. Edición/cancelación de agenda son ampliaciones futuras.
- **Promociones internas:** reutilizar S3 y separar preparación de publicación. Su vista de vendedor sí se muestra desde `SalesLayout`.
- **Supervisor:** conectar el prototipo a datos reales; las facturas deberán venir de la fuente acordada con Yéminus.
- **Ventas de Yéminus:** implementar conexión y consulta con claves de origen, responsables, control de duplicados y estado de sincronización.
- **Pedidos sin stock:** confirmar el Excel y construir su representación operativa, distinta de la cotización ganada y de una factura.
- **Paquetes:** construir selección/procedencia/versiones y acciones con alcances por concesión. La pantalla actual por acciones no implementa paquetes reutilizables.

## Auditoría y estadísticas

Registrar creación/edición de cliente y cotización, cambios de estado, aplicación de descuentos cuando se delegue, reasignación, metas, agenda, avisos, solicitudes sin stock e importaciones/exportaciones. Los cambios de asignaciones incluyen paquete, versión, alcance y ajustes personales. Los registros identifican actor, elemento, momento, resultado y origen sin guardar secretos o copias innecesarias de datos personales.

Las facturas sincronizadas registran el proceso de integración como actor técnico y mantienen separado al vendedor responsable de la venta. La facturación se cuenta por identificador único de factura de origen y su estado, con los ajustes que suministre el ERP. No se suma otra vez por la cotización ganada ni por el pedido interno. Pedidos sin stock, cotizaciones, actividades y avisos tienen indicadores propios; su cantidad no demuestra la calidad del trabajo.

## Primera unidad de construcción

1. Cerrar este árbol y definir las selecciones base disponibles en cada hijo.
2. Construir paquetes/versiones y sus alcances por acción sobre una versión de código consolidada, conservando los módulos existentes del servidor.
3. Habilitar Vendedor con sus funciones ya disponibles: clientes, cotizaciones, consulta del catálogo, agenda y promociones internas. Las facturas y pedidos sin stock quedan identificados como pendientes hasta tener conexión/datos/API completos.
4. Conectar Supervisor y Gestión comercial con agenda/metas reales y acciones explícitas; conservar la venta sin aprobación.
5. Incorporar Yéminus y Excel «Pedidos» cuando se confirmen sus contratos y datos.

## Referencia técnica de acciones y alcances

Este apartado conecta los nombres humanos con los permisos que deberán comprobar pantalla y servidor. Los IDs nuevos son propuesta; no se agregaron al catálogo ni se pueden asignar como si ya existieran. Las acciones de modificación requieren la lectura correspondiente y el alcance de su concesión.

**Acciones existentes en el catálogo local que se reutilizan:**

- Resumen: `dashboard:read`, `commercialInsights:read` y `teamInsights:read`, según el resumen que se asigne. Los valores de facturación se adaptan a la fuente ERP antes de presentarlos como sincronizados.
- Clientes: `customers:read`, `customers:create`, `customers:edit`. `customers:convert` y `customers:delete` se seleccionan de forma independiente; la eliminación actual desactiva el registro, no borra su historia.
- Cotizaciones: `quotes:read`, `quotes:create`, `quotes:edit`, `quotes:status`. Separar el descuento de edición y comprobar cada transición/alcance; no introducir una aprobación de venta.
- Catálogo de consulta: `products:read`, `prices:read`, `listas:read`, además de las Listas autorizadas para ver precios. Nunca agregar creación, edición o publicación del producto por querer cotizarlo.
- Metas: `targets:read`, `targets:edit`. Vendedor incluye lectura; la edición se delega para los integrantes permitidos.
- Pedidos internos: `orders:read`; `orders:invoice` es el registro manual de la referencia externa existente, no el permiso de emitir una factura en Yéminus ni la integración automática.

**Acciones nuevas propuestas para herramientas del servidor o procesos pendientes:**

- Agenda: `activities:read`, `activities:create`, `activities:assign`, `activities:complete`. Asignar a otra persona requiere Crear, Asignar y acceso al integrante. `activities:edit` y `activities:cancel` son ampliaciones pendientes; no se inventa una operación de edición a partir de Completar.
- Solicitudes administrativas: `teamRequests:read`, `teamRequests:create` para las propias solicitudes. `teamRequests:review` sigue reservado a Super Admin y no ejecuta una operación de identidad por marcar Aprobada.
- Avisos internos: `commercialPromotions:read`, `commercialPromotions:create`, `commercialPromotions:edit`, `commercialPromotions:publish`, `commercialPromotions:withdraw`. Cambiar la audiencia es una decisión explícita que no concede datos de clientes o permisos de otra herramienta.
- Reasignación de cartera: `customers:reassign`, con lectura de cliente y consulta autorizada del responsable. Cambiar de responsable no puede enviarse bajo una edición de contacto sin este permiso.
- Descuentos de cotización: `quotes:discount`, además de edición de la cotización y la regla comercial vigente. No equivale a cambiar precios base, impuestos o totales de una factura externa.
- Facturación ERP: `erpSales:read`. Sus registros se actualizan mediante la integración autorizada, no mediante una edición libre del vendedor.
- Solicitudes sin stock: `stockRequests:read`, `stockRequests:create`, `stockRequests:edit`, `stockRequests:cancel`, `stockRequests:resolve`. La confirmación de disponibilidad debe conservar su fuente y permiso operativo; no se infiere de Editar.
- Excel de solicitudes: `stockRequests:import`, `stockRequests:export`, con previsualización y alcance de filas. No reutilizar `products:import`, que trabaja sobre productos, marcas y precios.
- Parámetros comerciales: `commercialSettings:read`, `commercialSettings:edit`, en el ámbito de configuración explícitamente concedido. No concede lectura de toda la cartera.

**Cómo identificar los datos de cada herramienta:**

- Clientes y cotizaciones: responsable comercial del registro.
- Agenda: persona asignada a la actividad; el creador se conserva aparte.
- Ventas ERP: clave de vendedor de Yéminus vinculada al integrante de Grupo Security.
- Pedidos sin stock: responsable de la solicitud y sus clientes/líneas autorizados.
- Metas: integrante destinatario y periodo; poder leer la propia no habilita modificarla.
- Avisos: audiencia acordada (equipo/global); leer un aviso global no da acceso global a ventas.
- Solicitudes administrativas: solicitante; las decisiones reservadas de Super Admin no se conceden mediante un alcance de equipo.

Los parámetros `ownerId`, `assigneeId`, filtros del equipo o IDs de cliente/factura no amplían permisos por venir en la petición. Cada lectura, modificación y exportación comprueba el alcance correspondiente. Los botones reflejan ese resultado.

## Checklist de aceptación

- [ ] Un usuario normal nuevo conserva solo Inicio y Mi cuenta hasta asignarle trabajo.
- [ ] Seleccionar un hijo muestra herramientas, acciones, dependencias y datos antes de guardar.
- [ ] Vendedor consulta y trabaja solo sus registros autorizados.
- [ ] Cambiar cantidades o datos de contacto no concede descuentos, reasignación o modificación de estado del cliente.
- [ ] No se añade aprobación de ventas por parte del supervisor.
- [ ] Consultar ventas no permite editar facturas emitidas en Yéminus.
- [ ] El tablero distingue facturación real, cotizaciones y pedidos sin stock; no duplica importes.
- [ ] Se prueba la combinación de edición propia y lectura de equipo sin ampliar la edición.
- [ ] Retirar un paquete conserva únicamente las concesiones y alcances que aún tienen otra fuente.
- [ ] Los cambios de acceso bloquean nuevas operaciones con la sesión existente y quedan auditados.
- [ ] El supervisor muestra fuentes reales y no los datos del prototipo.
- [ ] Excel: revisar mapeo, validaciones, permisos de filas y duplicados antes de importar; exportar solo datos autorizados.
- [ ] Los procesos nuevos tienen pantalla, API, persistencia, permiso, alcance, auditoría y pruebas antes de ofrecerse como funcionales.

## Evidencia para implementar

- Local: `src/backend/src/common/security/access-catalog.ts` y `data-scope.ts`; servicios/DTO de `src/backend/src/modules/commercial/`; `src/frontend/src/pages/QuoteDetailPage.tsx`.
- Servidor S3: `src/frontend/src/features/sales/SalesLayout.tsx:90`, `SalesHomePage.tsx`; `features/supervisor/AgendaCalendarPage.tsx`, `SupervisorWorkspacePage.tsx`, `TeamWorkflowPage.tsx`; `src/backend/src/modules/team-workflow/workflow.service.ts`, `workflow.dto.ts`, `modules/promotions/` y `modules/commercial/quotes/quotes.service.ts:342`.
- Modelo actual: `UserPermission` solo conserva una concesión por usuario/acción; `SalesOrder` corresponde a una cotización ganada. No representan por sí solos paquetes con diferentes alcances ni las solicitudes del Excel.
- Fuente de negocio: respuesta del usuario del 13 de octubre de 2026 sobre facturación en Yéminus sin aprobación y Excel «Pedidos» cuando falta stock.
- [Estructura principal aprobada](PROPUESTA-ARBOL-PANELES-2026-10-13.md).
- [Comparación de versiones](COMPARACION-10-PANELES-2026-10-13.md).

Este documento define el trabajo para construir Comercial. No certifica conexiones de Yéminus/Excel ni modifica accesos reales por su existencia.
