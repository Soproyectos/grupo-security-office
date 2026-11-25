# Evaluación local de Better Auth

Better Auth es MIT y se puede autoalojar. Su infraestructura gestionada tiene precios separados. El portal usa PortalAccount y PortalSession. El acceso de empleados usa User, JWT, MFA y los permisos de NestJS. La recuperación actual se implementa sobre el portal para mantener su identidad comercial y sus guardas.

| Capacidad | Estado | Comprobación del piloto |
|---|---|---|
| Licencia | Comprobada en el repositorio oficial | Usar el framework autoalojado sin plugins de infraestructura gestionada. |
| Prisma 6.19.3 | Pendiente | Preparar un esquema aislado y probar el adaptador con PostgreSQL local y cuentas ficticias. |
| Contraseñas bcrypt | Soporte de verificación personalizada documentado | Verificar hashes existentes y la representación de contraseñas largas del portal. |
| Correo y revocación | Opciones documentadas | Conectar el SMTP de prueba, pedir un enlace, restablecer y comprobar que las sesiones previas caducan. |
| Separación de ámbitos | Pendiente | Crear un empleado con MFA y un cliente con el mismo correo. Restablecer al cliente y comprobar que el empleado conserva acceso, MFA y permisos. |

El piloto requiere un entorno aislado. Añadir dependencias y aplicar migraciones de prueba requiere aprobación separada. Revertir el piloto consiste en retirar la configuración local y conservar los accesos actuales. La adopción para empleados se decide después de validar MFA y el control de permisos. Estimar el costo del SMTP y operación según los proveedores que Grupo Security ya use.

Fuentes

- [Licencia MIT](https://raw.githubusercontent.com/better-auth/better-auth/main/LICENSE.md)
- [Infraestructura y precios](https://better-auth.com/pricing)
- [Recuperación por correo](https://better-auth.com/docs/authentication/email-password)
