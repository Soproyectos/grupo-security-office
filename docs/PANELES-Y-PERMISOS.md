# Cómo se asignará el trabajo en la administración

<!-- biblioteca-vigente-20261103 -->
**Biblioteca ya tiene una pantalla de asignación en `/users/access`.** El Super Admin usa **Guardar Biblioteca** para las pestañas y **Guardar acciones individuales** para las estadísticas en Mi resumen. Consulta la [guía vigente de Biblioteca](biblioteca-dominio/mapa-de-permisos-biblioteca.md#guía-vigente-del-panel-biblioteca). El acuerdo original de producto se conserva a continuación.

<!-- sin-paquetes-20261126 -->
**Sin paquetes: todo se asigna acción por acción (26 de noviembre de 2026).** Los «paquetes de paneles» (Vendedor, Jefe de equipo, Marketing, Biblioteca por pestaña y los demás) dejaron de existir. En **Asignar paneles** (`/users/access`) el Super Admin marca cada acción que la persona puede hacer y elige con qué alcance: propio, equipo o global, según lo que permita cada acción. Así queda la regla:

- Nada se asigna solo, ni por rol ni por paquete. Un usuario nuevo sigue sin paneles.
- Cada casilla se puede marcar y desmarcar siempre. La pantalla solo añade lo que la acción necesita (por ejemplo, editar requiere ver) y respeta los alcances que ofrece el catálogo.
- Un panel o una pestaña aparece cuando la persona tiene asignada su acción, con alcance global en Biblioteca y Marketing. Super Admin conserva su excepción explícita. No hay otra puerta: ni un paquete ni un rol abren nada por sí solos, y el servidor sigue comprobando cada acción.
- **Biblioteca** se asigna por pestaña dentro de su bloque (Productos, Fichas, Precios, Importaciones y Catálogos maestros) con **Guardar Biblioteca**. «Publicar en tienda» es una casilla más del bloque, junto a las estadísticas de Mi resumen, y se guarda con **Guardar acciones individuales**; necesita «Editar fichas» ya guardado. Marcar Fichas o Precios incluye «Ver productos», que también abre la pestaña Productos.
- **Marketing y mercadeo**: Banners aparece con la acción «Ver campañas» (`marketing:read`, alcance global); las demás acciones de marketing se suman a esa.
- Quien tenía paneles solo por un paquete los pierde: el Super Admin debe asignárselos de nuevo, acción por acción.
- Lo que el sistema calcula por la jerarquía (la agenda del equipo para quien tiene personas a cargo) se sigue mostrando como «por personas a cargo» y no se cambia desde esta pantalla.
- Si una persona conserva asignaciones manuales antiguas que el editor no muestra, la pantalla lo avisa y pide retirarlas antes de cambiar sus casillas.

**Diseño de las pestañas de cada panel.** Todo panel interno con dos o más páginas usa el mismo diseño de pestañas que Biblioteca (icono, nombre corto y texto de ayuda a la derecha), y cada pestaña se asigna por separado. Ver [Patrón de paneles con pestañas](PATRON-PANELES-CON-PESTANAS.md).

**Panel «Usuarios».** Reúne en un solo panel las pestañas **Usuarios** (`/users`, requiere `users:read`) y **Asignar paneles** (`/users/access`, solo Super Admin). El menú tiene una sola entrada, «Usuarios». Quien solo puede ver Usuarios no ve la barra de pestañas. **Roles** sigue dentro de la página de Usuarios y pasará a la barra más adelante.

<!-- comercial-portal-vigente-20261126 -->
**Panel «Comercial» (26 de noviembre de 2026).** «Clientes del portal» ya no es un panel aparte: se fusionó en Comercial para que cada dato viva en un solo lugar. Comercial queda con las pestañas **Clientes** (`customers:read`), **Solicitudes** (`portalAccounts:read`), **Cotizaciones** (`quotes:read`), **Metas**, **Resumen** y **Zonas** (`portalZones:manage`). Las pestañas de promociones ya no están aquí: pasaron a Marketing y mercadeo (ver más abajo). El permiso y su alcance (propio, equipo o global) deciden cuánto ve cada persona; ocultar una pestaña no autoriza nada porque el servidor vuelve a comprobar cada acción.

- **Solicitudes** muestra las cuentas creadas en la tienda: aprobar, rechazar, vincular un cliente, tarifa, asesor, suspender y reactivar, cada botón con su propio permiso (`portalAccounts:manage` y `portalAccounts:assign`). La antigua pestaña «Sin asesor» es ahora un filtro dentro de Solicitudes, visible solo con `portalAccounts:assign`, y conserva su contador.
- **Zonas** administra las ciudades que reparten los registros nuevos entre asesores y se asigna por separado (`portalZones:manage`).
- En **Asignar paneles**, el bloque Comercial trae los grupos «Solicitudes del portal» y «Zonas»; ya no existe el bloque «Clientes del portal».
- La dirección `/customer-accounts` redirige a `/commercial/portal` para los enlaces guardados.

<!-- marketing-vigente-20261104 -->
**Marketing y mercadeo también es un panel asignable (4 de noviembre de 2026).** Se delega en `/users/access` (**Asignar paneles**), en el bloque «Marketing y mercadeo», con acciones que se marcan por separado (desde el 26 de noviembre ya no hay paquetes):

| Acción | Qué permite |
|---|---|
| Ver campañas | Entrar al panel y ver los banners y pop-ups con su estado. |
| Crear campaña | Preparar un borrador nuevo. No publica. |
| Editar campaña | Cambiar nombre, enlace, fechas e imágenes de un borrador. No publica. |
| Publicar y retirar campañas | Hacer que una campaña se vea en la tienda o quitarla. No crea ni edita. |
| Eliminar campaña | Borrar una campaña que ya no está publicada. |

El panel aparece en el menú, y su ruta `/marketing/banners` se abre, cuando la persona tiene asignada «Ver campañas» con alcance global; las demás acciones se suman a esa. El servidor comprueba cada acción por separado. Ninguna acción se asigna automáticamente. Guía de uso: [Marketing y banners](MARKETING-BANNERS.md). Para quien programa: acciones `marketing:read|create|edit|publish|delete` (alcance global).

<!-- marketing-pestanas-20261126 -->
**Marketing y mercadeo reúne tres pestañas (26 de noviembre de 2026).** Las pestañas «Promociones internas» y «Gestionar avisos» salieron de Comercial y viven ahora junto a Banners, para que cada dato viva en un solo lugar. La barra de pestañas sigue el [patrón de paneles](PATRON-PANELES-CON-PESTANAS.md), y cada pestaña se muestra solo con su propio permiso:

| Pestaña | Dirección | Qué se ve y quién la ve |
|---|---|---|
| Banners | `/marketing/banners` | Banners y pop-ups de la tienda. Exige `marketing:read` con alcance global. |
| Promociones internas | `/marketing/promotions` | Avisos vigentes para consultar antes de cotizar. Exige `commercialPromotions:read`. |
| Gestionar avisos | `/marketing/notices` | Crear, publicar y retirar avisos para el equipo. Se muestra con `commercialPromotions:create`; la página se abre con cualquiera de las acciones de gestión de avisos, como antes. |

- Quien solo tiene permiso sobre avisos ve el panel Marketing con sus pestañas de avisos y no ve Banners; quien solo tiene banners no ve las pestañas de avisos. Ocultar una pestaña no autoriza nada: el servidor vuelve a comprobar cada acción y su alcance, y esos permisos no cambiaron.
- Las acciones `commercialPromotions:*` se asignan ahora en el bloque «Marketing y mercadeo» de **Asignar paneles** (grupo «Avisos internos»), ya no en el bloque Comercial.
- La entrada «Marketing y mercadeo» del menú aparece con cualquiera de las tres pestañas y abre la primera que la persona tenga.
- Las direcciones antiguas `/promotions` y `/sales/promotions` redirigen a `/marketing/notices` y `/marketing/promotions` para los enlaces guardados.


Cada integrante tendrá las herramientas y acciones que el Super Admin le asigne en **Usuarios → Paneles**. Dos personas con el mismo rol podrán hacer trabajos diferentes. Esta regla se aplica a toda la administración interna.

**Estado:** acuerdo de producto del 8 de octubre de 2026. Describe el comportamiento que queremos; todavía no certifica que esté implementado. El inventario, las decisiones técnicas y la migración deben prepararse antes de cambiar el software.

## Una caja de herramientas por persona

El acceso se organiza en tres niveles:

1. **Área:** agrupa el trabajo, por ejemplo, Gestión de tienda.
2. **Apartado o panel:** una herramienta concreta, por ejemplo, Banners.
3. **Acciones:** lo que puede hacer la persona, por ejemplo, Ver, Crear, Editar, Publicar o Eliminar.

Asignar un apartado **no concede todas sus acciones**. Se seleccionan las que necesita la persona. Esta definición reemplaza la idea inicial de que un panel asignado daba acceso completo.

Ejemplo: Ana y Luis tienen el mismo rol. Ana puede ver, crear y editar banners. Luis puede verlos y publicarlos. Ana prepara el contenido y Luis decide cuándo aparece en la tienda. Publicar no concede editar o eliminar.

Los permisos autorizan herramientas y acciones; asignarlos no crea automáticamente una lista de tareas con responsables y fechas. **Ampliación solicitada el 14 de octubre:** se diseñará una herramienta personal independiente Agenda y tareas, con historial, junto con Mi resumen fuera de los paneles. Su existencia no concede acceso a los productos/listas enlazados ni a datos del equipo. Ese sistema de tareas está en diseño y no se declara implementado; el detalle se recoge en [Catálogo y precios](DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md).

## Reglas acordadas

- Un usuario nuevo, salvo la excepción de Super Admin, empieza sin apartados ni permisos de trabajo. Su inicio muestra «Sin paneles asignados» y no revela datos internos.
- Siempre conserva el acceso necesario a su propia cuenta, inicio y cierre de sesión y recuperación de acceso. Mi resumen y Agenda y tareas se diseñan como herramientas personales fuera de los paneles; sin asignaciones no muestran datos administrativos. Esto no habilita administrar cuentas ajenas ni consultar actividades de equipo.
- Los roles describen la posición de la persona; dejan de conceder acceso operativo automáticamente. No se eliminan los roles por esta decisión.
- El Super Admin administra las asignaciones y conserva el acceso necesario para gestionar el sistema. Los límites y la protección de esa excepción se documentarán.
- Se muestran las páginas, herramientas y botones correspondientes a los permisos asignados. El servidor comprueba también cada acción y los datos a los que se aplica.
- Tener permiso para ver información no significa poder ver la de todos. Cuando corresponda, se define si puede usar sus datos, los de su equipo, una sede o todos los autorizados.
- Las dependencias son explícitas: si editar requiere ver, la pantalla lo explica. Nunca se agregan permisos amplios de forma silenciosa.
- Conceder o retirar permisos debe reflejarse sin exigir otro inicio de sesión. Retirar un permiso bloquea las nuevas operaciones aunque haya una pestaña abierta o un token anterior. Se definirá cómo tratar operaciones ya iniciadas.
- Si dos asignaciones conceden el mismo permiso, retirar una conserva el permiso mientras la otra siga vigente.
- Una función nueva no se habilita automáticamente para usuarios normales. No hay paquetes ni plantillas: el Super Admin marca cada acción concreta.
- Cualquier acción administrativa debe quedar identificada como asignable, reservada a Super Admin o necesaria para la propia cuenta. No debe quedar acceso sin explicar.

## Nombres que se entiendan

Cada apartado tendrá solamente las acciones que realmente existen. Evitaremos una casilla genérica «Escritura» cuando no explique si permite crear, editar o ambas cosas. Podrán existir acciones como Aprobar, Exportar o Importar cuando el trabajo lo requiera.

Un panel informativo del dashboard puede mostrar cifras. Una página de gestión permite trabajar. Revisaremos ambas cosas por separado para que ver una cifra no permita modificar datos ni muestre información ajena.

## Qué quedará en auditoría

Se registran dos tipos de hechos:

- **Asignar trabajo:** quién concedió o retiró un permiso, a quién, cuándo, qué cambió y el motivo cuando corresponda.
- **Hacer el trabajo:** quién realizó una acción relevante, en qué apartado, sobre qué elemento, cuándo y con qué resultado.

El registro se genera desde el servidor y debe permitir comprobar lo que ocurrió. No guarda contraseñas, tokens, secretos ni copias innecesarias de datos personales. Los permisos ordinarios no permiten modificar o borrar ese historial. Las acciones del Super Admin también se registran.

Los eventos permitirán preparar estadísticas como publicaciones por periodo o solicitudes atendidas. Se definirán las reglas para no contar dos veces una acción reintentada. La cantidad de acciones no demuestra por sí sola la calidad del trabajo.

## Qué revisar antes de implementar

El inventario debe indicar qué apartados existen, cuáles funcionan, cuáles necesitan cambios y cuáles faltan. La [revisión inicial del 9 de octubre](./REVISION-PANELES-PERMISOS-2026-10-09.md) documenta hallazgos estáticos del worktree local; no es una auditoría dinámica. El inventario completo debe conectar cada acción con su página, botón, API, comprobación de seguridad, datos y evento de auditoría.

También hay que comprobar los permisos heredados por rol, las diferencias entre versiones del frontend y el API, los accesos directos y los permisos guardados dentro de las sesiones. La documentación antigua y los prototipos sirven como pistas; no prueban el comportamiento actual.

Para los usuarios existentes se preparará una comparación del acceso actual y el propuesto, una migración y una forma de volver atrás. No se borrarán sus accesos sin revisar ese cambio. El catálogo público y las cuentas de clientes siguen separados de la administración interna.

## Cómo sabremos que funciona

- Dos usuarios del mismo rol tienen accesos diferentes según sus asignaciones.
- Un usuario sin asignaciones no obtiene datos administrativos por menú, enlace directo, API, búsqueda, descarga ni dashboard.
- Cada acción asignada funciona; cada acción no asignada se rechaza, incluso si se intenta directamente contra el API.
- Cambiar el identificador de un elemento no permite usar datos ajenos.
- Cambiar una asignación actualiza la sesión y queda registrado en auditoría.
- Publicar, editar y eliminar se comprueban por separado.
- Se preservan los datos existentes y el funcionamiento del catálogo público.

El [prompt para el agente Gentle-AI](./prompts/gentle-ai-paneles-y-permisos.md) indica cómo investigar, documentar y preparar este cambio.
