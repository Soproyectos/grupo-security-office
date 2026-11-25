# Portal de clientes: login con Better Auth + Google

Objetivo: reemplazar el login/registro/recuperación del portal de clientes por Better Auth (correo+clave y Google), manteniendo `PortalAccount` como registro de negocio. Empleados NO cambian.

## Decisiones (usuario, 2026-11-19)
- Better Auth autoalojado (MIT) para el portal de clientes; empleados aparte.
- Google: cuenta nueva queda **ACTIVA como usuario básico** (sin nivel/tier). Un empleado le abre cotizaciones y precios asignando tier (endpoint existente `admin/accounts/:id/tier`).
- Producción tiene 0 cuentas del portal: no hay migración de claves.
- Local primero (AGENTS.md): se prueba en 127.0.0.1:4173 con base local `gs_web_local`; nada a producción sin aprobación.

## Diseño
- Backend: Better Auth montado en `/api/portal-auth/*` (NestJS, antes de los parsers de body). Tablas propias `portal_auth_user|session|account|verification` + `PortalAccount.authUserId` (único, nullable). Hook `user.create.after` crea el `PortalAccount` (ACTIVE, FINAL_CUSTOMER, sin tier).
- `PortalAuthGuard` acepta la sesión de Better Auth y entrega el mismo `req.portalAccount`. El flujo legacy (JWT propio) queda dormido, no se borra aún.
- Claves: hash = `sha256:` + bcrypt(sha256(clave)) (igual que la recuperación actual). Mín. 12 / máx. 128.
- Recuperación: Better Auth (`request-password-reset` / `reset-password`), token hasheado (`verification.storeIdentifier: hashed`), 1 h, revoca sesiones, `transaction: true`.
- Google: `socialProviders.google` (scopes básicos); vinculación conservadora (solo `email_verified`).
- Frontend: login con botón Google, registro, recuperar, restablecer, cierre de sesión contra `/api/portal-auth/*`; sesión sigue leyéndose de `/api/customer-portal/auth/me`.
- Redirect URI de Google: `/api/portal-auth/callback/google` (local y producción) — hay que registrarla en Google Cloud (distinta de la del piloto).

## Tareas
- [x] T1 Entorno: dependencias aisladas (sin compartir node_modules del repo principal), `better-auth` 1.7.26 exacto, base local `gs_web_local`
- [x] T2 Backend: esquema Prisma + migración, módulo/servicio de auth, montaje en main.ts, guard, hook de creación de PortalAccount, correo de recuperación
- [x] T3 Frontend: login/registro/recuperar/restablecer/logout con Better Auth, botón Google
- [ ] T4 Arranque local: API en :3000 + Vite en :4173, admin de pruebas, prueba de punta a punta
- [ ] T5 Revisión, pruebas y reporte (docs/handoffs/portal-auth-better-auth.md)

- T4: API en :3000 corriendo y smoke 23/23 OK; FALTA arrancar Vite en :4173 (lo ocupa el piloto; detenerlo fue denegado por permisos, lo debe autorizar el usuario).
- T5: handoff escrito en docs/handoffs/portal-auth-better-auth.md.

Notas: la cuenta del portal se crea en el hook de alta (funciona dentro de la transaccion) con respaldo en el guard. Sin commits (AGENTS.md).

- Auditoría de seguridad (2026-11-20): corregido verificación de correo obligatoria, `type` bloqueado, URL/secreto obligatorios en producción, tokens de Google cifrados. Smoke 29/29, jest 59, vitest 572. Pendiente: Nginx (X-Forwarded-For, límites), fijar versión de Node en Docker, decidir aprobación manual de cuentas. Despliegue NO autorizado aún (el usuario indicó esperar).

## Plan de cuentas y acceso del portal (versión 1, 2026-11-20)

Principio: crear una cuenta es fácil; ver precios exige que un empleado lo habilite. La cuenta nueva no da acceso a nada que no sea ya público.

### 1. Crear cuenta
| Paso | Correo y clave | Google |
|---|---|---|
| Datos obligatorios | nombre, empresa, correo, clave (12-128) | nombre y correo (los da Google) |
| Datos opcionales | NIT, teléfono | completar empresa, NIT y teléfono después |
| Confirmación | enlace al correo (1 h); sin confirmar no entra | Google ya entrega el correo verificado |
| Resultado | cuenta ACTIVA básica, cliente final, sin escalafón | igual |
Hecho: todo lo anterior. Pendiente: aceptación de la política de datos, captcha y completar perfil tras Google.

### 2. Niveles de acceso
| Nivel | Quién lo da | Qué ve |
|---|---|---|
| Básico | automático al confirmar el correo | catálogo, sus datos, aviso «un asesor puede habilitarte precios» |
| Con escalafón | un empleado (`admin/accounts/:id/tier`) | precios y cotizaciones de su escalafón |
| Suspendida | un empleado | no puede entrar |

### 3. Entrar, salir y recuperar
- Sesión de 8 h en cookie segura (`httpOnly`, `secure` en producción). Al salir se cierra en el servidor.
- Recuperación: enlace de un solo uso, 1 h, guardado cifrado; al cambiar la clave se cierran todas las sesiones.
- Ninguna pantalla ni respuesta revela si un correo tiene cuenta.

### 4. Controles contra abuso
- Hecho: límite de intentos en la app, verificación de correo, `type` bloqueado, tokens de Google cifrados, secreto y URL obligatorios en producción.
- Pendiente (despliegue): Nginx con IP real, `limit_req` y tamaño máximo de petición.
- Pendiente (decidir): captcha en registro y recuperación.
- Riesgo conocido: el buzón de Hostinger envía 100 correos al día; un ataque de registros masivos lo agota.

### 5. Datos personales (Ley 1581)
- Pendiente: casilla obligatoria de aceptación de la política de tratamiento de datos en el registro, guardando fecha y versión aceptada.
- Pendiente: forma de pedir la eliminación de la cuenta.
- Pendiente: política oficial (hoy solo hay borrador de prueba).

### 6. Para el futuro (no ahora)
- Validación contra la base de clientes de la empresa (Yéminus): la coincidencia propone, un empleado confirma; solo se concede automáticamente si el correo verificado coincide con el registrado. Falta definir de dónde salen los clientes.
- Doble factor para clientes con escalafón.

## Fase 2: reglas de registro (aprobado por el usuario 2026-11-20)
- [ ] R1 Política de datos: casilla obligatoria; se guarda fecha y versión (`PRIVACY_POLICY_VERSION`) en PortalAccount.
- [ ] R2 Captcha Cloudflare Turnstile en registro, entrada y recuperación (obligatorio en producción; local con claves de prueba).
- [ ] R3 Completar perfil tras Google (empresa, NIT, teléfono y política); sin eso no ve el catálogo de cliente (403 PROFILE_INCOMPLETE).
- [ ] R4 Suspender y reactivar cuentas desde el panel (estado SUSPENDED, cierra sesiones, auditoría).
- [ ] R5 Pedir eliminación de la cuenta (se registra la solicitud; un empleado la ve en el panel).
- [ ] R6 Correo repetido: respuesta igual para todos y aviso por correo al dueño real (`onExistingUserSignUp`).
- [ ] R7 Reglas de clave en servidor y pantalla: 12-128, minúscula, mayúscula, número, símbolo, sin el correo ni el nombre, sin 4 caracteres iguales seguidos, no filtrada (haveibeenpwned).
- [ ] R8 Mostrar/ocultar clave al escribir y lista de requisitos en vivo.
Migración nueva aditiva (enum SUSPENDED + columnas de consentimiento y solicitud de eliminación): aplicada solo a la base local; producción exige aprobación.
Ruta: backend y frontend con un escritor delegado cada uno (2+ archivos no triviales); revisión y pruebas por el orquestador.
