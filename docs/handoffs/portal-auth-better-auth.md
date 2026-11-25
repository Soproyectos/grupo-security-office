# Traspaso: login del portal de clientes con Better Auth

Estado: respondido (backend listo y probado en local; frontend conectado)

## Qué hace
Los clientes entran con correo + clave o con Google. Los empleados NO cambian (`/api/auth/*`).
Better Auth vive en `/api/portal-auth/*`. La sesión sigue leyéndose en `GET /api/customer-portal/auth/me`.

## Contrato HTTP (verificado con `scripts/smoke-portal-auth.mjs`)
Todas las llamadas llevan cookies (`withCredentials`) y JSON. Prefijo: `/api/portal-auth`.

| Acción | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| Registrarse | `POST /sign-up/email` | `{name, email, password (12-128), companyName, documentId?, phone?, callbackURL:"/clientes"}` (el campo `type` se ignora) | 200 SIN sesión: se envía un correo de confirmación. Un correo repetido responde igual (no revela si existe) |
| Confirmar correo | enlace del correo `GET /verify-email?token=...` | — | 302 a `/clientes` y abre la sesión |
| Entrar | `POST /sign-in/email` | `{email, password}` | 200 con cookie `gs_portal.session_token`; 401 si son incorrectos; 403 `EMAIL_NOT_VERIFIED` si falta confirmar el correo (se reenvía el enlace) |
| Entrar con Google | `POST /sign-in/social` | `{provider:"google", callbackURL:"/clientes", errorCallbackURL:"/clientes/login?error=google"}` | `{url, redirect:true}`: el navegador debe ir a `url` |
| Salir | `POST /sign-out` | `{}` | 200 |
| Pedir enlace | `POST /request-password-reset` | `{email, redirectTo:"/clientes/restablecer"}` | 200 siempre igual (exista o no el correo) |
| Cambiar clave | `POST /reset-password` | `{newPassword, token}` | 200; 400 si el token es inválido, vencido o ya usado |
| Ver sesión | `GET /get-session` | — | sesión o `null` |

Errores: `{ "code": "...", "message": "..." }`. 400 = datos inválidos (clave corta, falta empresa), 401 = credenciales, 429 = demasiados intentos.

El correo trae un enlace `.../api/portal-auth/reset-password/<token>?callbackURL=...`; al abrirlo el servidor redirige (302) a `/clientes/restablecer?token=<token>`. La pantalla solo lee `token`.
Callback de Google: `/api/portal-auth/callback/google` (URI exacta a registrar en Google).

## Lo que ve un usuario básico
Toda cuenta nueva (correo o Google) queda ACTIVA como cliente final **sin escalafón**. Ve el catálogo. Ve precios solo si existe una lista de precios configurada para clientes finales; si no, el precio es `null`. Aunque pida ser "instalador", la cuenta nace como cliente final: el tipo pedido solo queda guardado en `portal_auth_user.type`. Un empleado le abre cotizaciones y precios asignando escalafón (`PATCH /api/customer-portal/admin/accounts/:id/tier`).
Una cuenta antigua con el mismo correo solo se vincula si el correo viene verificado (Google); si no, no se toca.

## Decisión técnica
La cuenta del portal se crea en el hook de alta (funciona dentro de la transacción). Como respaldo, si faltara, se crea en el primer acceso (guard). Es idempotente.

## Variables de entorno nuevas (producción)
`BETTER_AUTH_SECRET` (obligatoria), `PORTAL_AUTH_URL` (URL pública de la web), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STOREFRONT_URL`, `SMTP_*` (correo real), opcional `PORTAL_SESSION_HOURS` (8 por defecto). Sin SMTP en producción el reinicio de clave falla (nunca se registra el token).

## Dormido (no se borró)
Login/registro legacy con JWT propio (`customer_access_token`) y los endpoints `forgot-password` / `reset-password` de `customer-portal`: quedan redundantes.

## Seguridad aplicada tras la auditoría
- Correo verificado obligatorio para entrar con clave (evita pre-registrar el correo de otra persona). Google ya trae el correo verificado.
- `type` ya no lo fija el cliente; la cuenta nace siempre como cliente final sin escalafón.
- `PORTAL_AUTH_URL` y `BETTER_AUTH_SECRET` son obligatorias en producción (la API no arranca sin ellas).
- Tokens de Google cifrados en la base (`encryptOAuthTokens`).
- Correo de recuperación/confirmación: en producción sin SMTP falla y nunca escribe el enlace.
- Cupo de correo: el buzón de Hostinger permite 100 envíos al día; el registro y el login de cuentas sin confirmar envían correo.

## Nginx de producción (obligatorio, aún NO aplicado)
En el bloque que atiende `/api/portal-auth/`:
- `proxy_set_header X-Forwarded-For $remote_addr;` (hoy se usa `$proxy_add_x_forwarded_for`, que deja a un atacante inventar su IP y saltarse el límite de intentos).
- `client_max_body_size 64k;` y un `limit_req` por IP.
- Enviar `X-Forwarded-Proto` y `Host` para que las cookies `secure` funcionen.

## Pendientes para producción
- Node >= 20.19 / >= 22.12 en los Dockerfiles (better-auth es ESM y se carga con `require`). No se cambiaron.
- Registrar la URI de Google de producción.
- Política de privacidad oficial y SMTP real.
- Aplicar la migración `20261120090000_portal_auth_better_auth` (requiere aprobación).
- `docker compose`/Nginx: el proxy debe enviar `X-Forwarded-For` y `Host`.
