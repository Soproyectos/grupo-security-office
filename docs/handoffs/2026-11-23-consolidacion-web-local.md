# Consolidación de la web local

> Contexto histórico: la asignación de puertos cambió. Para API/catálogo 3010 y portal 4314, arranque y limitaciones actuales, consultar la [guía vigente del 24/11](2026-11-24-tienda-local-estado-vigente.md).

La dirección de trabajo es [http://127.0.0.1:5181](http://127.0.0.1:5181). Para validar el acceso con Google, abre [el ingreso de clientes](http://127.0.0.1:5181/clientes/login) desde esa misma dirección.

La integración activa está en `C:/Users/sopor/grupo-security-office/.claude/worktrees/sad-golick-8a6b22`, rama `Esnaider/sad-golick-8a6b22`, con base `bce9b1d1` y cambios locales sin commit.

## Estado comprobado

| Puerto | Uso |
|---|---|
| `5181` | Web unificada. Sirve el catálogo público y el ingreso de clientes con Google. |
| `3010` | API existente para el catálogo, el panel interno y las rutas administrativas. |
| `4312` | API auxiliar del portal, accesible por loopback. Usa el mismo PostgreSQL que `3010` mediante el túnel `55432`. |
| `4173` | Retorno OAuth local registrado en Google. Atiende únicamente `GET /api/auth/callback/google` y lo reenvía al portal en `5181`. Su raíz devuelve HTTP 404. |
| `4310`, `5183`, `5781` | Sin web ni API de pruebas disponible en estos puertos al terminar. |

`gs_ux_test` y `gs_web_local` tienen esquema de autenticación y cero productos. Las bases locales `gs_qa_compras` y `gs_local_vps` contienen 5.056 registros de producto, uno publicado en cada base, y carecen de las tablas de Better Auth.

## Consolidación elegida

El usuario eligió conservar `5181` y trabajar sin crear copias adicionales de la base.

1. `20261119120000_portal_password_resets` ya estaba aplicada. Con aprobación explícita del usuario se aplicaron `20261120090000_portal_auth_better_auth` y `20261120130000_portal_account_rules` en la base existente `grupo_security`.
2. Se ejecutaron los dos archivos SQL originales en una transacción y se verificó su registro en `_prisma_migrations` con las mismas sumas SHA-256 que en la base local de pruebas. Se confirmó la existencia de las tablas de usuarios y sesiones del portal.
3. Después de aplicar las migraciones, `5181` devolvió HTTP 200 en salud y catálogo. El catálogo público siguió informando 850 productos.
4. La consola de Google Cloud presentó un inicio de sesión administrativo. Se reutilizó el retorno ya registrado para retirar la web de pruebas sin interrumpir OAuth. Los inicios de sesión completados desde `5181` crean o vinculan cuentas en la base existente.
5. En `5181` se comprobaron HTTP 200 en ingreso, salud y catálogo, el total de 850 productos, y un inicio de OAuth que generó la cookie de estado y la URL de `accounts.google.com`. El perfil devolvió HTTP 401 sin sesión. Se comprobó que el retorno registrado reenvía a `5181`. La prueba con una cuenta personal queda para la validación del usuario. ESLint y TypeScript pasaron para `vite.config.ts`.

## Operación local

- Vite se ejecuta en `127.0.0.1:5181` con `VITE_API_TARGET=http://127.0.0.1:3010` y `VITE_PORTAL_API_TARGET=http://127.0.0.1:4312`. La segunda variable es opcional en `src/frontend/vite.config.ts`. Enruta las llamadas de autenticación y clientes del portal, con las rutas administrativas a cargo de `3010`.
- El lanzador temporal está en `%TEMP%/gso-5181-portal/launcher.cjs`. Recibe la conexión PostgreSQL por entrada estándar y adapta el destino al túnel existente. Carga en memoria el cliente OAuth local registrado y utiliza las variables `PORTAL_AUTH_URL` y `STOREFRONT_URL` con el origen de `5181`. El argumento `callback` inicia solo el retorno en `4173`.
- El lanzador reutiliza la compilación local de NestJS y arranca la API auxiliar con tareas programadas desactivadas. Las credenciales se suministran al proceso en memoria. Si el equipo se reinicia, hay que reactivar el túnel, la API existente, la API auxiliar, Vite y el retorno local.
- Para retirar también el puerto auxiliar, el cliente web de Google debe incluir `http://127.0.0.1:5181/api/portal-auth/callback/google`. La API debe usar entonces ese retorno directo y se puede cerrar el proceso auxiliar de `4173` tras verificar el flujo.

## Terminal de origen

Windows identifica a `node.exe` (PID 31460) como el proceso que escucha en `3010`. Su padre, `nohup.exe` (PID 32552), sigue ejecutándose. Ambos arrancaron el 23 de noviembre a las 09:35. El proceso que invocó `nohup` (PID 30652) ya terminó. La consulta del historial se completó en una transacción de solo lectura con la identidad SSH del túnel y `psql` dentro del contenedor.
