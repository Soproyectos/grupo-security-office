# Recuperación de contraseña del portal de clientes

Desde el inicio de sesión del portal, el cliente abre `/clientes/recuperar`. La solicitud usa `POST /api/customer-portal/accounts/forgot-password` con `email`. La API confirma la solicitud de forma genérica y las sesiones previas siguen activas.

El correo abre `/clientes/restablecer`. El formulario envía `email`, `token` y `password` a `POST /api/customer-portal/accounts/reset-password`. La autorización de una hora se consume en la misma transacción que actualiza la contraseña y revoca las sesiones del cliente. El formulario confirma el cambio o dirige al cliente a solicitar otro enlace si la autorización caducó. El acceso de empleados usa su canal de soporte.

En producción, configurar `STOREFRONT_URL` con el origen HTTPS del portal y el transporte SMTP. Mantener la base del dominio operativo. La migración `20261119120000_portal_password_resets` prepara la tabla dedicada de autorizaciones.

La validación de integración requiere Prisma 6.19.3, PostgreSQL y un buzón de prueba. Comprobar dos confirmaciones simultáneas, dos sesiones del cliente y un empleado con el mismo correo. Tras una solicitud las tres sesiones siguen activas. Tras un cambio válido se cierran las del cliente. Un segundo uso o una autorización vencida se rechazan. Verificar el escenario de correo fallido con respuesta pública uniforme.
