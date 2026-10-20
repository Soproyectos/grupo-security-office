# Estado de los dos paneles de trabajo

**Revisión local, 19 de octubre de 2026.** La implementación y las pruebas se hicieron en la copia aislada `gs-tanda-01` de `srv-soporte`. La web principal `:5173`, la API `:3000` y la base de producción no se desplegaron ni modificaron en esta continuación.

## Cómo se asigna el trabajo

En **Asignar paneles** (`/users/access`), Super Admin puede asignar a cada persona un paquete y revisar sus acciones una por una. Dos integrantes con el mismo cargo pueden tener permisos distintos. Cada acción tiene alcance propio, de equipo, de una lista o producto concreto, o global, según corresponda. El cargo ordinario no abre un panel por sí solo. Un usuario nuevo sin asignaciones ve **Sin paneles asignados**.

La API vuelve a consultar las concesiones en cada petición. Quitar la última concesión impide la siguiente operación aun con la misma sesión. Asignar, cambiar y retirar fuentes deja un registro de operación y un evento en Auditoría global. Super Admin es la excepción explícita para administrar el sistema.

## Comercial

| Hijo que se asigna | Trabajo conectado hoy | Límite visible |
| --- | --- | --- |
| Vendedor | Sus clientes y prospectos, cotizaciones, lectura de metas, agenda y avisos vigentes. Puede cambiar una cotización a ganada con `quotes:status`; no hay aprobación de venta. | La cotización ganada no se presenta como factura de Yéminus. |
| Supervisor comercial | Consulta de clientes y cotizaciones del equipo, metas, resumen y actividades asignables, siempre dentro del alcance concedido. | Las cifras de facturas externas no se inventan. |
| Gestión comercial | Reasignación de cartera, edición de metas y preparación, edición, publicación y retiro de avisos internos como acciones separadas. | El Excel «Pedidos» y Yéminus quedan fuera de este trabajo. |

Clientes, cotizaciones, metas y avisos comprueban el permiso en el servidor. Sus rutas ya no se autorizan por el nombre del cargo; cada lectura y escritura aplica el alcance vigente. La pantalla de avisos muestra los controles correspondientes a las acciones de la persona. **Mi resumen** y **Agenda y tareas** son herramientas personales compartidas, no un cuarto hijo de Comercial.

## Catálogo y precios

| Hijo que se asigna | Trabajo conectado hoy | Límite visible |
| --- | --- | --- |
| Gestión de listas y precios | Crear y administrar listas, importar/descargar plantilla, revisar precios, guardar revisión, aplicar precios e historial, con permisos separados. | La plantilla solo maneja precios finales con IVA y COP enteros. |
| Biblioteca de productos | Casillas para leer, escribir y validar, preparadas para delegar esta área. | No se construyó ni cambió ahora la exportación/reimportación completa, fichas ni medios. Las casillas reservadas de exportar/importar siguen deshabilitadas. |
| Publicación del catálogo | Consulta, validación y publicación mediante acciones separadas y alcance explícito. | Las modificaciones de una ficha publicada se revisan antes de pasar a la versión pública. |

No existe un cuarto paquete «Supervisor de catálogo y precios». Una persona que supervisa recibe las acciones y alcances concretos de los tres hijos anteriores.

## Comprobaciones y revisión

- Comercial: **6 suites, 151 pruebas** focales aprobadas antes del ajuste de destinatarios de avisos; su suite específica volvió a pasar con **39 pruebas** después del ajuste.
- Auditoría y asignaciones: **2 suites, 57 pruebas** aprobadas con PostgreSQL desechable.
- Backend completo, antes del último ajuste focal de avisos: **105 de 106 suites**; 1852 pruebas aprobadas. Las 12 fallas están en `public-products.spec.ts`, un fallo previo de inyección de dependencias que no afecta las suites de estos paneles. Después del ajuste, la suite de avisos, typecheck, lint focal y compilación volvieron a aprobarse.
- Frontend completo: **84 suites, 861 pruebas** aprobadas; typecheck, lint focal y compilación aprobados.
- La API de revisión `:3001` responde con su base desechable `:54331`; la web de revisión `:5180` responde en la IP Tailscale. No se realizó en esta continuación un recorrido autenticado de navegador por cada botón. La UI y el servidor se probaron por separado; ese recorrido sigue siendo una tarea de QA, no una prueba ya hecha.
- Prueba HTTP real en la base desechable: un usuario ficticio obtuvo **403** en Clientes, Cotizaciones y Metas sin concesiones; **200** al recibir las tres acciones de lectura; y **403** después de retirar la fuente, usando la misma cookie. **9 de 9** respuestas esperadas. El usuario ficticio se eliminó al terminar.

Para revisar: abrir `http://100.87.48.41:5180/login` con una cuenta de la **copia aislada** y entrar a **Asignar paneles**. El botón antiguo **Paneles** dentro de la ficha de Usuarios configura bloques del resumen y no representa el nuevo árbol de acciones. Asignar primero un hijo a un usuario sin permisos y comprobar menú, página y API; después retirar su fuente y repetir la petición con la misma sesión. La revisión no cambia el entorno principal.

### Acceso de revisión de Super Admin

Se creó una identidad ficticia de Super Admin **solo** en la base desechable `grupo_security_tanda`. Sus credenciales no se guardan en este documento ni en Git. El ingreso por contraseña devuelve `MFA_ENROLLMENT_REQUIRED`: el revisor debe configurar su propia aplicación Authenticator antes de recibir una sesión administrativa. La cuenta Operador de demostración no puede gestionar accesos.

Durante esta prueba se detectó una carrera en `MfaService.startEnrollment`: dos peticiones simultáneas para generar el QR intentaban crear la misma fila y una fallaba con `P2002`. La copia aislada ahora reutiliza el secreto pendiente cuando ocurre ese conflicto; la prueba focal pasó, junto con typecheck, lint y compilación, y el API de revisión volvió a responder `health=200`. El navegador mostró el QR correctamente en el siguiente ingreso. El recorrido autenticado después de confirmar el código MFA sigue pendiente de la revisión humana.
