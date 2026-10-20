# Revisión inicial de paneles y permisos

**Fecha:** 9 de octubre de 2026
**Alcance:** lectura estática del worktree local de Grupo Security Office. No se consultaron usuarios ni permisos de una base de datos o servidor en vivo. No se ejecutaron pruebas de seguridad ni pruebas del producto.

## Lo principal

Ya existe **Usuarios → Paneles**, pero hoy agrega bloques del dashboard además de los accesos del rol. No es todavía el sistema para repartir por persona acciones como Ver, Crear, Editar y Publicar en toda la administración.

El API y el resto de la aplicación combinan permisos de rol, permisos por acción, asignaciones de listas y reglas de alcance comercial. Para que se cumpla la nueva regla, habrá que unificarlos con cuidado. El cambio no es solo añadir casillas a la pantalla.

## Cómo funciona hoy

- `UsersPage.tsx` ofrece una acción «Paneles» a Super Admin y abre `DashboardGrants.tsx`.
- La pantalla dice expresamente que los paneles elegidos se agregan a los que ya vienen con los roles.
- Hay nueve paquetes de dashboard: Ventas, Cotizaciones, Clientes, Catálogo, Listas, Publicación, Usuarios, Auditoría y Operación. Cada paquete puede elegirse completo o por bloques.
- Los permisos guardados por usuario tienen prefijos `dashboard:pack:` y `dashboard:block:`. El backend valida que el paquete exista, pero no comprueba que cada ID individual de bloque pertenezca al catálogo.
- `UserPermission` admite el valor `REVOKE` en el modelo, pero el inicio de sesión solo suma las concesiones `GRANT` a todos los permisos de los roles. El guard no aplica revocaciones.
- Al guardar un cambio, la pantalla informa que se aplica al volver a iniciar sesión. El API incluye los permisos dentro del JWT.
- Se guarda el cambio en `user_permissions` y después se escribe el evento de auditoría en otra operación. Si el registro falla después de guardar los permisos, hay que decidir cómo garantizar que quede evidencia del cambio.

Esto describe el **dashboard**. No significa que asignar un bloque habilite las operaciones del módulo de Catálogo, Usuarios o Publicación.

## Cómo se reparte el acceso en el resto del sistema

Los roles actuales son Super Admin, Supervisor, Admin Comercial, Vendedor, Operador y Consulta. El servicio de inicio de sesión combina los permisos asociados a los roles con las concesiones individuales. Por eso, una persona con un rol operativo puede heredar acciones aunque no tenga paneles extra.

El API tiene 21 controladores de módulos. En la lectura del código, los permisos por acción aparecen en cuatro controladores: Productos, Listas, Asignaciones y Dashboard. Otros controladores aplican sus rutas por listas de roles, incluso en funciones de lectura o modificación. La cantidad de controladores no equivale a una auditoría completa de cada operación; es un conteo estático de decoradores.

Áreas encontradas:

- **Catálogo:** Productos, Categorías, Marcas, Precios e importación. La mayoría de operaciones se limita por rol. Productos separa algunas acciones de publicación y Lista tiene acciones como crear, duplicar, archivar y eliminar.
- **Trabajo comercial:** Clientes, Cotizaciones, pedidos y metas. Las rutas usan grupos de roles. Servicios de listas y jerarquías limitan algunos datos a listas asignadas, la propia cartera o subordinados.
- **Listas y asignaciones:** hay permisos por acción y además reglas de acceso a cada Lista. Se deben conservar y armonizar ambas capas, no reemplazarlas por una casilla de página.
- **Usuarios y roles:** operaciones como consultar usuarios, crear, editar, eliminar y gestionar roles se limitan por rol. La pantalla también tiene grupos de permisos de rol. Estos nombres y los permisos del API no forman un catálogo único de acciones.
- **Auditoría:** lectura del registro limitada por roles y con ámbitos distintos para Super Admin, Supervisor y Admin Comercial. El evento tiene actor, acción, entidad, identificador, valores anteriores y nuevos, fecha y resultado. El modelo no declara una versión ni un identificador de correlación del evento; conviene decidirlo al diseñar estadísticas.
- **Tienda y acceso de clientes:** las cuentas públicas de clientes tienen rutas y sesión separadas. El controlador administrativo de tienda limita todas sus operaciones a Super Admin y Admin Comercial; todavía no separa por persona acciones como consultar solicitudes, aprobar cuentas, editar información y resolver consultas.
- **Sesiones y seguridad:** hay rutas de autenticación, sesiones y MFA, que necesitan una regla de acceso propia. Los archivos y rutas de salud también deben clasificarse como públicos o protegidos, según su función.

## Diferencias entre la interfaz y el API

La aplicación React protege el área de administración comprobando que haya una sesión. Las rutas internas no se ocultan individualmente según permisos. Los enlaces de Usuarios y Auditoría sí usan comprobaciones de rol o permiso, pero las pestañas comerciales están declaradas como visibles para todos.

Esto es principalmente una diferencia de navegación: **la interfaz por sí sola no autoriza las operaciones**. El API aplica sus guardias por rol y, solo en rutas marcadas, también el permiso por acción. Al rediseñar el acceso habrá que filtrar menús y proteger las rutas para orientar a cada persona, y además comprobar cada acción y dato en el servidor.

Hay documentación de acceso que describe una lista de roles antigua (Admin, Gerente, Operator y Viewer). El código actual tiene seis roles con otros nombres. Hay que actualizar o señalar esa documentación para que nadie diseñe la migración usando la matriz vieja.

## Riesgos y decisiones que faltan

1. **Permisos heredados:** definir cómo retirar los permisos operativos que hoy llegan por rol sin dejar a personas sin herramientas esenciales.
2. **Guardias mezcladas:** en rutas con `@Roles` y `@Permissions`, cumplir el permiso granular puede no bastar si el rol no está en la lista. Decidir un solo catálogo efectivo, con Super Admin como excepción controlada.
3. **Datos y alcances:** documentar por módulo si se ven datos propios, del equipo, de una sede o globales. El sistema actual ya usa roles y asignaciones para algunos de esos alcances.
4. **Revocación inmediata:** elegir cómo refrescar o invalidar permisos en sesiones activas. Hoy la pantalla indica que hay que iniciar sesión de nuevo.
5. **Catálogo de permisos:** comprobar cada identificador permitido y definir quién puede crear acciones nuevas. El backend debe rechazar identificadores inventados.
6. **Auditoría completa:** considerar dentro de una misma operación los cambios de acceso y su evento, así como actor, destinatario, resultado y relación con el trabajo realizado.
7. **Usuarios existentes:** comparar accesos actuales y propuestos antes de migrar. Probar respaldo y reversión con datos de desarrollo.
8. **Administrar permisos:** determinar qué puede hacer un administrador delegado, si existe esa necesidad. La decisión actual reserva las asignaciones al Super Admin.

## Recomendación inicial

Conservar **Usuarios → Paneles** como el lugar donde se asigna el trabajo a cada persona, pero convertir sus selecciones en acciones operativas controladas por el servidor. Separar en esa misma experiencia los niveles **Área → Apartado → Acciones**, hacer visible el alcance de datos y mantener el rol como información organizativa, sin usarlo como acceso automático al trabajo.

Antes de modificar el software, producir una matriz completa que conecte cada operación con pantalla, ruta del API, permiso, alcance, auditoría y pruebas. Luego diseñar una migración que mantenga los accesos necesarios hasta que el Super Admin revise la equivalencia.

## Fuentes revisadas

La guía oficial de OWASP recomienda conceder lo mínimo necesario, rechazar por defecto y verificar el permiso en cada solicitud. Su guía de pruebas sugiere una matriz de autorizaciones que conecte capacidades, usuarios y datos. La documentación oficial de NestJS explica los permisos por acción. Se debe volver a comprobar la versión instalada antes de aplicar ejemplos.

Un tutorial de Wanago sobre NestJS (2021) muestra roles y permisos mediante guards. Un hilo de Reddit (consulta de diseño, no evidencia de seguridad) muestra dudas similares sobre guards, permisos por miembro y alcance de datos. Se consideran experiencias para investigar, no autoridad para definir la solución.

- [OWASP: autorización](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP: registro de eventos](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP: pruebas de autorizaciones](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html)
- [NestJS: autorización](https://docs.nestjs.com/v11/security/authorization)
- [Gentle-AI: registro de habilidades](https://github.com/Gentleman-Programming/gentle-ai/blob/main/docs/skill-registry.md)
- [Wanago: roles y permisos en NestJS](https://wanago.io/2021/11/15/api-nestjs-authorization-roles-claims/)
- [Reddit: diseño de autorización en NestJS](https://www.reddit.com/r/nestjs/comments/1tc5z24/authorization_when_should_i_reach_for_library/)

## Archivos principales revisados

- `src/frontend/src/pages/UsersPage.tsx`
- `src/frontend/src/features/users/components/DashboardGrants.tsx`
- `src/frontend/src/features/dashboard/registry/blocks.ts`
- `src/frontend/src/lib/rbac.ts`
- `src/frontend/src/App.tsx`
- `src/frontend/src/components/layout/CommercialLayout.tsx`
- `src/backend/src/common/security/user-permissions.service.ts`
- `src/backend/src/common/security/dashboard-permissions.ts`
- `src/backend/src/common/guards/roles.guard.ts`
- `src/backend/src/common/guards/permissions.guard.ts`
- `src/backend/src/modules/auth/auth.service.ts`
- `src/backend/src/modules/users/users.controller.ts`
- Controladores de los 21 módulos en `src/backend/src/modules/`.
- `src/backend/prisma/schema.prisma`
- `docs/backend-access-governance.md`
- `docs/ACCESO-CLIENTES.md`
