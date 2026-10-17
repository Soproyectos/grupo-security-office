# Cómo se asignará el trabajo en la administración

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
- Una función nueva no se habilita automáticamente para usuarios normales. Los paquetes o plantillas, si se usan, deben mostrar las acciones concretas que asignan.
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
