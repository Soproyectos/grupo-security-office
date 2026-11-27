# Recuperación de contraseña del portal de clientes

Desde el inicio de sesión del portal, el cliente abre `/clientes/recuperar`. La solicitud la atiende Better Auth en `/api/portal-auth/*`; el correo abre `/clientes/restablecer`, que confirma el cambio con `POST /api/portal-auth/reset-password` (ver `portal-auth-better-auth.md`). Las rutas antiguas `POST /api/customer-portal/accounts/register`, `forgot-password` y `reset-password` fueron retiradas; la tabla `PortalPasswordReset` permanece en el esquema sin uso.

En producción, configurar `STOREFRONT_URL` con el origen HTTPS del portal y el transporte SMTP.
