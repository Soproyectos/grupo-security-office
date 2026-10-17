# Organizar Grupo Security en diez paneles de trabajo

**Estado: estructura principal aprobada por el usuario el 13 de octubre de 2026.** El usuario confirmó que le gusta la organización en diez paneles y solicitó conservarla como documento en el servidor. Los paquetes hijos y sus acciones siguen pendientes de detalle. Los paquetes de trabajo descritos aquí todavía no están implementados.

La decisión está registrada en [ADR: paneles y paquetes de trabajo](adr/ADR-20261013-paneles-y-paquetes-de-trabajo.md). La [comparación con el servidor y la versión local](COMPARACION-10-PANELES-2026-10-13.md) distingue qué está disponible en cada versión. Las referencias «Base actual» de esta propuesta se elaboraron inicialmente sobre el worktree local; no deben interpretarse como un inventario de todas las ramas del servidor. Por ejemplo, el servidor sí contiene promociones internas y pantallas de vendedor que no están en ese worktree.

Se proponen diez paneles para la plataforma administrativa y la tienda completa. Cada panel reúne un tipo de trabajo. Dentro tiene paquetes, como Vendedor, Supervisor comercial o Editor de banners. Al seleccionar un paquete, Super Admin ve las herramientas, acciones y datos que recibiría esa persona antes de guardar. Puede ajustar la selección a su trabajo particular.

Inicio y Mi cuenta son accesos básicos fuera de estos diez paneles. Inicio solo muestra información autorizada; sin asignaciones muestra «Sin paneles asignados». Mi cuenta permite gestionar la identidad y seguridad propias, sin administrar a otras personas. Los visitantes y compradores usan la tienda pública y una cuenta de cliente separada.

## Cuatro niveles para entender el árbol

```text
Panel: Comercial
└── Paquete de trabajo: Vendedor
    ├── Herramienta: Mis clientes
    │   ├── Ver
    │   ├── Crear
    │   └── Editar
    ├── Herramienta: Mis cotizaciones
    │   ├── Ver
    │   ├── Crear
    │   ├── Editar
    │   └── Cambiar estado
    ├── Herramienta: Catálogo autorizado
    │   ├── Ver productos y Listas asignadas
    │   └── Ver precios autorizados
    ├── Herramienta: Mis pedidos
    │   └── Ver
    └── Herramienta: Mi resumen y metas
        └── Ver
```

Este ejemplo es una selección propuesta, no la asignación actual de una cuenta. Un mismo permiso puede usarse desde varios paquetes sin duplicar la herramienta ni el permiso real. Vendedor es el nombre del paquete: poner Vendedor como cargo en el perfil no concede sus herramientas automáticamente.

## Los diez paneles aprobados como estructura principal

### 1. Comercial

**Para qué sirve:** conseguir clientes, preparar cotizaciones y acompañar las ventas.

- **Vendedor:** clientes y prospectos propios, cotizaciones, consulta del catálogo y precios autorizados, seguimiento de sus pedidos, resumen y metas personales.
- **Supervisor comercial:** consulta del equipo permitido, seguimiento de cotizaciones y resultados, metas del equipo. Las acciones de modificación se eligen por separado y la jerarquía determina a quién puede supervisar.
- **Gestión comercial:** configuración de metas y organización del proceso comercial. No incluye crear usuarios ni cambiar accesos de otras personas.

**Base actual:** módulos de clientes, cotizaciones, pedidos de venta, metas y resúmenes. El pedido actual nace de una cotización ganada. La ficha única del pedido corresponde al panel Pedidos y despachos; Comercial ofrece el seguimiento permitido.

### 2. Catálogo y precios

**Para qué sirve:** mantener la información de los productos y sus precios.

- **Editor de catálogo:** productos, descripciones, imágenes, marcas y categorías.
- **Responsable de precios y Listas:** tarifas, precios, vigencias, Listas y accesos a Listas autorizadas.
- **Publicador de catálogo:** publicar y retirar productos o Listas, con permisos distintos de editar.
- **Importador de datos:** previsualizar, validar e importar archivos con las dependencias actuales visibles.
- **Consulta de catálogo:** lectura de productos y, cuando se asigne, precios.

**Base actual:** Productos, Categorías, Marcas, Tarifas, Listas, Acceso a Listas, publicación e importaciones. Los precios base pertenecen aquí. Gestionar accesos a una Lista no concede permisos administrativos nuevos.

### 3. Tienda online

**Para qué sirve:** gestionar la compra y la cuenta de las personas que llegan por la web.

- **Gestor de cuentas web:** solicitudes profesionales, aprobación, rechazo y suspensión. El catálogo actual agrupa estas decisiones en un permiso de aprobación; la futura separación debe revisarse.
- **Operador de tienda:** seguimiento de compras web y resultados de pago, sin acceso a credenciales de la pasarela.
- **Supervisor de tienda:** seguimiento de la operación de ventas por la web.
- **Configuración de compra:** formas de compra, medios de pago disponibles, zonas y opciones de entrega.

**Base actual:** tienda pública, catálogo, precios públicos/profesionales y cuentas profesionales. **Por diseñar y construir:** carrito, finalización de compra, pagos y pedidos nacidos directamente de una compra web. No se encontraron módulos operativos de estos procesos en el alcance revisado.

### 4. Configuración de la página y promociones

**Para qué sirve:** cambiar lo que ve el visitante y preparar campañas.

- **Editor de banners:** imágenes para escritorio y móvil, textos, botones, enlaces, posición y borradores.
- **Gestor de campañas:** promociones visuales, piezas y productos destacados, fechas y ubicaciones de campaña.
- **Editor de contenido:** presentación de la empresa, contactos, horarios, ayuda, documentos oficiales, secciones de inicio, menús y enlaces.
- **Publicador de contenido:** revisar la versión preparada, publicarla o retirarla, sin recibir edición automáticamente.
- **Gestor de descuentos:** reglas de ofertas y cupones, elegibilidad, vigencia y límites, con aprobación de precios cuando corresponda.

**Base actual:** banners con edición y publicación separadas, información comercial y documentos oficiales. **Por diseñar y construir:** editor general de secciones y menús, campañas programadas, productos destacados administrables y motor de promociones/cupones. Un banner que anuncia una oferta no aplica un descuento a una compra; esa regla debe existir en el servidor y relacionarse con los precios.

### 5. Pedidos y despachos

**Para qué sirve:** llevar una venta confirmada hasta su entrega.

- **Gestor de pedidos:** consulta y gestión del estado de pedidos autorizados.
- **Registro de facturación:** número y fecha de factura emitida por el sistema externo.
- **Preparador de pedidos:** selección de productos, preparación y comprobación del paquete.
- **Responsable de despachos:** transportadora, guía, salida y confirmación de entrega.
- **Supervisor de operación:** seguimiento de pendientes e incidencias de entrega.

**Base actual:** lectura de pedidos comerciales y registro manual de la referencia de factura externa. **Por construir:** estados operativos de preparación/despacho/entrega, guías y sus acciones. No es una implementación de facturación electrónica. Tienda y Comercial consultan el mismo pedido autorizado, sin mantener copias separadas.

### 6. Inventario y abastecimiento

**Para qué sirve:** saber qué hay disponible y gestionar la reposición necesaria.

- **Consulta de existencias:** unidades disponibles, reservadas y ubicación.
- **Operador de bodega:** entradas, salidas, reservas y movimientos autorizados.
- **Responsable de abastecimiento:** necesidades de reposición, proveedores y compras, si corresponde gestionarlos desde esta plataforma.
- **Supervisor de inventario:** revisión y aprobación de ajustes y diferencias.

**Base actual:** modelo Stock en la base de datos. Eso no equivale a tener un panel, API o flujo operativo de inventario. **Condición de diseño:** confirmar qué administra Yéminus. Si el ERP lleva stock y compras, la web debe consultar/sincronizar esa información y ofrecer solo las operaciones acordadas; no crear un inventario paralelo contradictorio.

### 7. Servicio al cliente

**Para qué sirve:** atender preguntas y resolver problemas después de una venta.

- **Asesor de consultas:** consultas de visitantes y seguimiento de atención.
- **Soporte técnico:** solicitudes técnicas y seguimiento de solución.
- **Garantías y devoluciones:** recepción de solicitudes, evidencias, aprobación o rechazo y seguimiento.
- **Supervisor de atención:** casos pendientes, responsables y tiempos de atención.

**Base actual:** recepción y marca de atención de consultas de visitantes. **Por construir:** tickets de soporte, asignación de responsables, garantías, devoluciones y sus estadísticas operativas. Tener una página pública de garantías no significa que exista un proceso administrativo de garantías.

### 8. Informes y auditoría

**Para qué sirve:** entender resultados y consultar el historial de acciones.

- **Consulta personal:** resultados y actividad permitida de la propia persona.
- **Consulta de equipo:** metas y resultados dentro del equipo autorizado.
- **Análisis de negocio:** indicadores comerciales, catálogo, tienda, promociones y operación, según las fuentes disponibles.
- **Consulta de auditoría:** quién hizo una acción, cuándo, sobre qué elemento y con qué resultado, dentro del alcance autorizado. No incluye editar o borrar historial.
- **Exportación de informes:** permiso separado para descargar datos, cuando esa función se implemente.

**Base actual:** resumen de trabajo, indicadores de catálogo y comerciales, resumen de integrantes y auditoría. **Por construir:** estadísticas de procesos futuros y exportaciones granulares. Los informes respetan los alcances y no conceden acciones de trabajo sobre los módulos consultados.

### 9. Usuarios y accesos

**Para qué sirve:** crear integrantes y decidir qué trabajo puede hacer cada uno.

- **Consulta de integrantes:** lectura de la información permitida del equipo.
- **Gestión de integrantes:** crear, modificar, desactivar y administrar la identidad de usuarios; reservado actualmente a Super Admin.
- **Asignación de trabajo:** asignar paquetes, revisar y ajustar sus acciones, retirar accesos; reservado a Super Admin.
- **Diseño de paquetes:** definir la lista de herramientas y acciones de cada paquete y su versión; propuesta nueva, reservada a Super Admin.
- **Alcances:** asignar Listas y autorizar cartera propia, del equipo o de la empresa; cada alcance se revisa separado de las acciones.

**Base actual:** Usuarios y asignaciones individuales de acciones. **Por construir:** paquetes reutilizables como Vendedor y Supervisor con versiones y desglose previo al guardado. Los roles siguen describiendo el cargo; no sustituyen la asignación de trabajo.

### 10. Configuración técnica e integraciones

**Para qué sirve:** mantener las conexiones y funciones técnicas de la plataforma.

- **Correo y notificaciones:** estado del servicio, configuración operativa y plantillas cuando exista su editor.
- **Integración con Yéminus:** sincronización acordada de productos, precios, inventario y referencias de facturas.
- **Integraciones de tienda:** pasarela de pagos y transportadoras cuando se construyan.
- **Mantenimiento y diagnóstico:** estado de integraciones, procesos fallidos y operaciones de mantenimiento específicamente autorizadas.

**Base actual:** variables de entorno de correo, autenticación, archivos y rutas de salud. No existe un panel técnico completo con estas herramientas. La API de Yéminus sigue pendiente de confirmación. Los secretos no se publican en el frontend ni se guardan como contenido de la página. Este panel queda reservado inicialmente a Super Admin y las tareas delegables se definen de forma explícita.

## Límites que evitan repetir trabajo

1. Catálogo y precios conserva productos y tarifas base; Configuración de la página conserva piezas de campañas y, en el diseño futuro, las reglas de promoción vinculadas al precio.
2. Tienda online administra el canal de venta y las cuentas web. Servicio al cliente administra consultas, soporte y posventa.
3. Pedidos y despachos conserva una sola operación de pedido. Vendedor y Operador de tienda acceden a esa misma herramienta con su alcance.
4. Inventario conserva los movimientos y cantidades acordados con el ERP. Pedidos solo solicita reservas/salidas dentro del flujo permitido.
5. Configuración de la página cambia contenido visible. Configuración técnica administra conexiones y parámetros técnicos.
6. Informes consulta resultados; Usuarios y accesos asigna las capacidades de trabajo.

## Cómo se seleccionaría un paquete

1. La persona se crea sin paneles, salvo la excepción de Super Admin.
2. Super Admin abre Usuarios y accesos y elige a la persona.
3. Abre Comercial y selecciona Vendedor.
4. La pantalla despliega las herramientas y acciones propuestas del paquete, sus dependencias y el alcance.
5. Super Admin puede ajustar las casillas para esa persona. Si se retira una dependencia, se informa qué acciones dejarían de estar disponibles.
6. Al guardar, se concede la selección explícita y queda registrada la versión del paquete y los ajustes personales. Esta parte es diseño pendiente de implementación.

El panel principal agrupa los paquetes; abrir Comercial no concede todos sus hijos. Seleccionar Vendedor concede exclusivamente las acciones incluidas en esa selección. Herramientas y acciones nuevas no se suman automáticamente a personas ya asignadas: Super Admin revisa la diferencia antes de aplicarla. Si una acción proviene de dos paquetes, retirar uno conserva el acceso que sigue concediendo el otro. El servidor debe comprobar siempre la acción y los datos autorizados.

Ejemplo de publicación: Editor de banners recibe Ver, Crear y Editar; Publicador de contenido recibe Ver y Publicar/retirar. Se puede asignar ambos paquetes a una persona. Ninguno recibe Eliminar por estar cerca de Publicar en el árbol.

## Qué está observado y qué está propuesto

La lectura inicial del catálogo de acciones, enlaces y módulos locales confirma la base indicada en cada panel. Después de aprobar la estructura, se revisó también el código del servidor y su API activa; los hallazgos están en el documento comparativo enlazado arriba. No se inspeccionaron datos de usuarios reales. Esta clasificación es una revisión de diseño, no una nueva prueba integral de todas las funciones.

El catálogo actual tiene 20 apartados operativos y un apartado separado de alcances. Agruparlos en diez paneles principales y añadir paquetes de trabajo es una propuesta nueva. Una capacidad futura no se ofrece como asignable hasta contar con pantalla, servidor, datos, permisos, alcance, auditoría y verificación.

## Checklist para cerrar la siguiente etapa

- [x] Revisar y aprobar los diez nombres y la organización principal.
- [ ] Precisar qué procesos futuros entran en cada etapa de implementación.
- [ ] Definir los paquetes hijos de cada panel y los trabajos reales de la empresa que representan.
- [ ] Definir, por cada paquete, herramientas, acciones, dependencias y datos autorizados.
- [ ] Separar acciones reservadas a Super Admin de las delegables.
- [ ] Conectar cada acción existente con pantalla, API, datos, auditoría y evidencia de verificación.
- [ ] Identificar las funciones por construir y resolver la responsabilidad de Yéminus.
- [ ] Diseñar versiones, personalizaciones y superposición de paquetes antes de migrar asignaciones.

## Evidencia y fuentes

- Catálogo local de apartados, acciones y rutas: `src/backend/src/common/security/access-catalog.ts`.
- Enlaces administrativos locales: `src/frontend/src/lib/admin-access.ts`.
- Regla aprobada de permisos individuales: `docs/PANELES-Y-PERMISOS.md` del worktree local.
- Implementación local y límites de verificación: `docs/IMPLEMENTACION-ACCESO-POR-USUARIO.md` del worktree local.
- Banners e información comercial: `docs/BANNERS-Y-CONFIGURACION-PAGINA.md` del worktree local.
- Tienda pública y acceso profesional: `docs/ACCESO-CLIENTES.md` del worktree local.
- Modelo de datos local: `src/backend/prisma/schema.prisma`, modelos Stock y SalesOrder.
- Controlador de pedidos de venta: `src/backend/src/modules/commercial/sales-orders/sales-orders.controller.ts`.
- [Comparación actual de versiones, con rutas y evidencias del servidor](COMPARACION-10-PANELES-2026-10-13.md).
- [OWASP: autorización](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), consultado el 13 de octubre de 2026: definir usuarios, recursos y acciones; dar los accesos necesarios; comprobar permisos en cada solicitud. El número y los nombres de paneles son una propuesta específica para Grupo Security, no un estándar establecido por OWASP.
