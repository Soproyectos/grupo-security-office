# Handoff 2026-11-04: demo en VPS, sesiones paralelas y pendientes

Estado: operación de la demo en curso. Fecha de redacción: 2026-11-04. Nada de lo descrito está guardado en git (sin commits en ninguna carpeta de trabajo). Los hechos del VPS los verificó la sesión principal el 2026-11-04; este documento los transcribe y no se reverificaron al redactarlo.

Documentos relacionados: [`HANDOFF_ACTUAL.md`](HANDOFF_ACTUAL.md) (estado verificado el 2026-10-07; describe otra rama y no se modifica aquí), [`../MAPA-TIENDA-PUBLICA.md`](../MAPA-TIENDA-PUBLICA.md) (mapa de páginas públicas y plantilla común), `odd/tasks/marketing-campanas.md` (plan del panel de Marketing; ruta desde la raíz del worktree).

## 1. Resumen de hoy

1. Se desplegó el backend con el módulo de marketing a la demo del VPS como contenedor nuevo, `gs-test-demo-api-marketing`, junto al contenedor original `gs-test-demo-api`, que no se tocó. El usuario aprobó el despliegue de forma explícita.
2. Se levantó la web local con Vite en el puerto 5175, apuntando a esa API por un túnel SSH (`localhost:8080`).
3. Se borraron de la base de la demo (`gs_api_copy`) los 2 banners heredados de `storefront_banners`.
4. Desde el panel de administración se crearon y publicaron 3 banners y 1 pop-up de PRUEBA, que hay que retirar tras la validación del usuario.
5. Se generó una llave SSH nueva para acceder al VPS; hay que retirarla al terminar.
6. Hay tres sesiones paralelas de Claude Code con trabajo propio (sección 8).
7. No se aplicó ninguna migración de Prisma. A la demo le faltan dos (sección 7).
8. Los horarios y teléfonos de las 4 sedes se leyeron el 2026-11-04 de las fichas públicas de Google Maps con el navegador integrado (el modo de lectura web automático no puede leer Maps). El negocio no los ha confirmado.

## 2. Reglas que no se rompen (AGENTS.md)

Fuente: `AGENTS.md` en la raíz del worktree `validacion-biblioteca`. En el worktree `grupo-security-tienda-publica-0c2c95`, `.claude/CLAUDE.md` indica además que ante conflicto prevalece `AGENTS.md`.

- Regla 1 (`AGENTS.md` línea 24): sin secretos en Git; tokens, passwords, API keys, teléfonos, comprobantes reales y PII van en variables de entorno. Datos ficticios en fixtures, tests y seeding.
- Regla 2 (línea 25): todo corre local primero; nada llega a producción sin aprobación humana explícita; sin cambios de credenciales sin autorización.
- Regla 3 (línea 26): cambios mínimos; sin commits ni push sin autorización explícita del usuario.
- Regla 4 (línea 27): validación (lint, typecheck, tests pertinentes) antes de dar algo por terminado.
- Líneas 39-46, aprobación explícita del usuario, en cada ocasión, antes de: commits o push (incluido el commit automático del protocolo ODD); despliegues; migraciones; cambiar servicios o contenedores (detener, eliminar, reiniciar, recrear o reconfigurar). La aprobación de un cambio documental no autoriza ninguna de esas operaciones.
- Línea 34: no instalar herramientas sin aprobación del usuario.
- Línea 35: las búsquedas amplias de solo lectura se delegan al agente `Explore` (solo lectura).
- Línea 54: antes de editar `src/frontend/` se lee `.claude/skills/gs-disenador-web/SKILL.md`; antes de editar `src/backend/` o `prisma/`, `.claude/skills/gs-funcionalidad-web/SKILL.md`.
- `docs/MAPA-TIENDA-PUBLICA.md` sección 1: no inventar teléfonos, correos, NIT ni direcciones; lo no confirmado se deja como `[Confirmar]` y no se publica.
- Estado actual: todo sigue sin commit en las carpetas de trabajo. Cada acción sobre el VPS de esta lista se hizo con aprobación explícita del usuario; cualquier acción nueva sobre contenedores o bases necesita aprobación nueva.

## 3. Carpetas y ramas

| Carpeta (git worktree) | Rama | Contenido |
|---|---|---|
| `C:\Users\sopor\grupo-security-office\.claude\worktrees\validacion-biblioteca` | rama de trabajo `Esnaider/validacion-biblioteca` (verificada con `git branch --show-current` el 2026-11-04) | Código que sirve la web. Todo el trabajo está sin commit. Contiene `.impeccable/` y `odd/tasks/marketing-campanas.md`. |
| `...\worktrees\grupo-security-tienda-publica-0c2c95` | `Esnaider/grupo-security-tienda-publica-0c2c95` | Portada vieja. Sin commit solo tiene `PRODUCT.md` (verificado que existe), `.impeccable/` y la instalación de la herramienta de diseño `impeccable` (`.claude/skills/impeccable`, `.claude/agents/impeccable-*`, `.github/`, `.opencode/`). |
| `...\worktrees\vigorous-hellman-afc315` | `Esnaider/vigorous-hellman-afc315` | Carpeta propia de una sesión. NO contiene el trabajo sin commit. |

Para trabajar sobre la web, usar siempre `validacion-biblioteca`. En el contenido de la herramienta `impeccable` de `tienda-publica-0c2c95` solo se verificó la existencia de `PRODUCT.md`; el resto de rutas viene del encargo [no verificado].

## 4. Cómo levantar el entorno local (paso a paso)

Todos los comandos corren en la máquina local (Windows). Rutas absolutas.

1. Confirmar que existe la llave: `C:\Users\sopor\.ssh\gs_demo_claude` (ed25519, sin contraseña, generada el 2026-11-04). Su parte pública está instalada en `~/.ssh/authorized_keys` del VPS.
2. Obtener la IP actual del contenedor nuevo (cambia si se recrea; fue 172.20.0.5 al crearlo):

   ```
   ssh -i C:\Users\sopor\.ssh\gs_demo_claude -o IdentitiesOnly=yes -o BatchMode=yes dev@57.131.50.38 'docker inspect gs-test-demo-api-marketing --format "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}"'
   ```

3. Abrir el túnel (queda en primer plano; muere si se cierra la sesión que lo lanzó). Sustituir `172.20.0.5` si la IP cambió:

   ```
   ssh -i C:\Users\sopor\.ssh\gs_demo_claude -o IdentitiesOnly=yes -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -N -L 8080:172.20.0.5:3000 dev@57.131.50.38
   ```

4. Verificar el túnel:
   - `curl http://localhost:8080/api/health` debe devolver 200.
   - `curl http://localhost:8080/api/storefront/campaigns` debe devolver `{"data":{"hero":[...],"popup":...}}`.
5. Levantar Vite desde `C:\Users\sopor\grupo-security-office\.claude\worktrees\validacion-biblioteca\src\frontend`, en PowerShell:

   ```
   $env:VITE_API_TARGET = "http://localhost:8080"
   npx vite --port 5175 --strictPort
   ```

   Equivalente en bash: `VITE_API_TARGET=http://localhost:8080 npx vite --port 5175 --strictPort`.
6. Abrir `http://localhost:5175`.

Cómo funciona el destino de la API: `src/frontend/vite.config.ts` línea 6 define `const apiTarget = process.env.VITE_API_TARGET ?? 'http://api:3000'`; las líneas 14-21 usan ese valor como `target` del proxy de `/api` y de `/uploads` (con `changeOrigin: true`). El comentario de las líneas 4-5 explica que para trabajar contra otra API, por ejemplo un túnel SSH, se usa `VITE_API_TARGET=http://localhost:8080`. El puerto por defecto del archivo es 5173 (línea 12); `--port 5175 --strictPort` lo sustituye y falla si 5175 está ocupado. Sin la variable, el proxy apunta a `http://api:3000`, que solo resuelve dentro de Docker Compose.

## 5. VPS de demo (mapa de contenedores)

Host: `dev@57.131.50.38`. Comando base:

```
ssh -i C:\Users\sopor\.ssh\gs_demo_claude -o IdentitiesOnly=yes -o BatchMode=yes dev@57.131.50.38 '<comando>'
```

Llave pública instalada (línea de `authorized_keys` a retirar al cerrar): `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN7TsHM3std6OaUp2jU4GlcxGw58PKu1qLQMqGQxbsEb claude-code-demo-vps`.

| Contenedor | Imagen | Nota | Tocar |
|---|---|---|---|
| `gs-test-demo-web` | `gs-test-demo-web:local` (nginx) | Estaba `unhealthy` al inspeccionarlo. No se investigó la causa. | No sin aprobación |
| `gs-test-demo-api` | `gs-test-demo-api:local` | Construida el 2026-10-30. API de demo original, SIN el módulo de marketing. Intacta. | No |
| `gs-test-demo-api-marketing` | `gs-test-demo-api:marketing` (id `8aaf61370acf`) | Creado hoy. Sin puertos publicados. Healthy con las rutas de marketing mapeadas. | Es el que se puede recrear o eliminar (con aprobación) |
| `gs-test-demo-ops-db` | `postgres:18-alpine` | Contiene las bases `gs_api_ops` y `gs_api_copy`. La API de demo usa `gs_api_copy`. | Solo `gs_api_copy` y con aprobación |
| `gs-test-biblioteca-gs-test-biblioteca-db-1` | no indicada | Base `gs_test_biblioteca_dev`. | No |
| `gs-frontend` | `ghcr.io/soproyectos/grupo-security-office/frontend:437ebc2f` | No es de la demo. | No |
| `gs-api` | `ghcr.io/soproyectos/grupo-security-office/api:437ebc2f` | No es de la demo. | No |
| `gs-db` | postgres (imagen no indicada) | Base `grupo_security`: parece PRODUCCIÓN. | NO TOCAR NUNCA sin autorización explícita |

Red de la demo: `gs-test-demo-net`.

## 6. Despliegue de marketing a la demo

Hecho el 2026-11-04 con aprobación explícita del usuario.

### Qué se hizo, en orden

1. Se empaquetó `src/backend` excluyendo `node_modules`, `dist`, `coverage` y `*.log` en `~/gs-backend-marketing-20261104.tgz` (en el VPS).
2. Se extrajo en `~/gs-marketing-build-20261104/backend`.
3. Se construyó con `src/backend/Dockerfile` la imagen `gs-test-demo-api:marketing` (id `8aaf61370acf`). El Dockerfile tiene 2 etapas, ambas `node:20-alpine`:
   - Etapa `build` (líneas 8-20): instala `openssl python3 make g++` (módulos nativos como bcrypt), copia `package.json`, `package-lock.json` y `prisma/`, ejecuta `npm ci`, copia `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `src/` y `scripts/copy-library-client.cjs`, y ejecuta `npm run build`.
   - `npm run build` (`src/backend/package.json` línea 6) = `prisma generate && node prisma/biblioteca/ejecutar-local.js generate && nest build`; el script `postbuild` (línea 7) corre `node scripts/copy-library-client.cjs`.
   - `scripts/copy-library-client.cjs` copia el cliente Prisma de la biblioteca ya generado (`prisma/biblioteca/generated/client`) a `dist/prisma/biblioteca/generated/client`, porque los imports en runtime quedan relativos tras compilar. Lanza error si falta `index.js` del cliente. No se conecta a la base ni migra.
   - Etapa `runner` (líneas 23-45): `NODE_ENV=production`, crea el usuario `nestjs` (uid 1001) y `/app/uploads` con permisos para él, copia `node_modules`, `prisma`, `dist` y `package.json` desde la etapa anterior. Mantiene `node_modules` completo a propósito para poder ejecutar la CLI de Prisma en migraciones aprobadas aparte (comentario de las líneas 4-5: los despliegues de solo código no ejecutan migraciones). Expone el 3000. `HEALTHCHECK` cada 15 s contra `http://127.0.0.1:3000/api/health`. Arranque: `node dist/src/main.js`.
4. Se creó `~/gs-marketing-build-20261104/api.env` (permisos 600) copiando las variables de entorno del contenedor original. Contiene secretos: no imprimirlo, no copiarlo a git ni a este repositorio.
5. Se levantó el contenedor:

   ```
   docker run -d --name gs-test-demo-api-marketing --network gs-test-demo-net --env-file ~/gs-marketing-build-20261104/api.env --restart no gs-test-demo-api:marketing
   ```

   Sin puertos publicados. IP interna 172.20.0.5 al crearlo.
6. Resultado: `healthy`, con las rutas de marketing mapeadas.

### Repetirlo (con aprobación explícita nueva)

1. Reempaquetar `src/backend` con las mismas exclusiones, copiarlo al VPS y extraerlo en una carpeta nueva con fecha.
2. Construir una imagen nueva (por ejemplo con otra etiqueta) con `docker build` sobre el Dockerfile del backend.
3. Reutilizar `~/gs-marketing-build-20261104/api.env` con `--env-file`.
4. Recrear el contenedor: `docker rm -f gs-test-demo-api-marketing` y `docker run` como en el paso 5. Obtener la IP nueva (sección 4, paso 2) y reabrir el túnel con ella.

### Revertirlo

```
docker rm -f gs-test-demo-api-marketing
```

La imagen original `gs-test-demo-api:local` y el contenedor `gs-test-demo-api` quedan intactos. Opcionales (con aprobación): `docker rmi gs-test-demo-api:marketing`, y borrar en el VPS `~/gs-backend-marketing-20261104.tgz`, `~/gs-marketing-build-20261104/` (incluye `api.env`, con secretos).

### Efectos laterales

- Los contenedores `gs-test-demo-api` y `gs-test-demo-api-marketing` comparten la base `gs_api_copy`. Si el backend tiene tareas programadas (`@nestjs/schedule` está en las dependencias de `src/backend/package.json`), correrían dos veces. No se verificó si hay tareas programadas activas [no verificado].
- La web nginx de la demo (`gs-test-demo-web`) sigue hablando con la API original; la web local por el túnel habla con la nueva.

## 7. Datos tocados en la demo y cómo deshacerlos

### 7.1 Banners heredados borrados de `gs_api_copy`

- Se borraron con `DELETE ... RETURNING` las dos filas de `storefront_banners` con ids `3f7e1741-886c-4c54-931c-7aa577035e01` (Hikvision y HiLook) y `3f7e1741-886c-4c54-931c-7aa577035e02` (EZVIZ; ambos ids verificados en `src/backend/prisma/migrations/20261009160000_storefront_banners/migration.sql`). Las sembró la migración `20261009160000_storefront_banners`.
- Siguen existiendo en `gs_api_ops` y en `grupo_security`, que no se tocaron.
- El archivo `src/backend/prisma/migrations/20261104090000_remove_legacy_storefront_banners/migration.sql` está redactado pero NO aplicado vía Prisma; por eso `_prisma_migrations` no lo registra. Aplicarlo después es inocuo (borra filas que ya no existen).
- Deshacer: reinsertar las filas a partir de la migración `20261009160000_storefront_banners` o de `gs_api_ops`. Requiere aprobación.

### 7.2 Migraciones pendientes en la demo (no aplicadas)

| Migración | Efecto de que falte |
|---|---|
| `20261028120000_product_internal_notes` | Las notas internas de productos fallan en el contenedor nuevo. |
| `20261104090000_remove_legacy_storefront_banners` | Ninguno funcional; el borrado ya se hizo a mano (7.1). |

Aplicar migraciones exige aprobación explícita (`AGENTS.md` líneas 39-46).

### 7.3 Contenido de PRUEBA creado desde el panel de administración

- Sesión: Super Admin que el usuario abrió en el navegador integrado.
- Creados y publicados: 3 banners «PRUEBA banner 1 - Cámaras», «PRUEBA banner 2 - Alarmas», «PRUEBA banner 3 - Control de acceso» (orden 0, 1, 2) y 1 pop-up «PRUEBA pop-up - Promoción».
- Deshacer: tras la validación del usuario, retirarlos (despublicar) y eliminarlos desde el panel Marketing, pestaña Banners.
- Técnica para subir imágenes sin selector de archivos: generar un PNG en un `<canvas>`, envolverlo en un `File`, asignarlo con `DataTransfer` al `input[type=file]` y disparar el evento `change`. Funciona en el navegador integrado.

## 8. Sesiones y su estado

| Sesión | Id | Qué hizo | Qué queda |
|---|---|---|---|
| `paginas-institucionales` | `local_deb63d75-1463-4c88-b54d-fd6f26108f32` | Creó `/soluciones`, `/nosotros`, `/sedes` y `/garantias`. Ajustó pie y menú. Política de garantías y PDFs propios en `/documentos/`. Horario y teléfono por sede. Rehízo la portada con mosaicos. | BLOQUEADO: publicar 8 productos de ejemplo en la Biblioteca de la demo (no hay productos publicados; cada producto requiere nombre, marca, subcategoría, foto principal y precio; el panel solo permite subir fotos con selector de archivos del equipo). Confirmar datos reales de contacto. Definir destino de «Contactar al personal de soporte técnico». |
| `cuenta-clientes` | `local_3b950e54-f5c4-43d1-adee-062e3c92ee7b` | Mapeó la cuenta de clientes. Dejó el menú «Mi cuenta» con detección de sesión. | Decidir si el registro necesita aprobación previa (toca base de datos). Mensaje de error genérico del registro. Tres archivos sin uso y colores antiguos. Revisión móvil. |
| `banners-y-campa-as-valid` | `local_15638515-b2aa-4339-a516-4eb573738a7f` | Rediseñó el panel de banners. | Revisar en tablet. Pop-up en móvil. Banner sin imagen. Cabecera en la vista previa móvil. |

## 9. Decisiones del usuario

Las fechas 2026-11-03 y 2026-11-04 salen de `odd/tasks/marketing-campanas.md` y `docs/MAPA-TIENDA-PUBLICA.md`; las que no tienen fecha específica en esos archivos se asignan a 2026-11-04 por el encargo.

| Decisión | Fecha |
|---|---|
| La portada vigente se perfecciona, no se reemplaza. | 2026-11-04 |
| Encabezado y pie comunes a toda la web. | 2026-11-03 (`MAPA-TIENDA-PUBLICA.md` sección 3) |
| En login y registro no hay buscador. | 2026-11-04 |
| El pop-up muestra solo la imagen; puede llevar enlace al hacer clic. | 2026-11-03 |
| Medidas de imagen: banner escritorio 1200 x 520 (ancho mínimo 1000), móvil 900 x 675, pop-up 900 x 900 con proporción flexible, máximo 3 MB. | 2026-11-04 |
| El panel de Marketing abre con la pestaña «Banners» (Banner del título y Pop-up); «Campañas» queda para después. | 2026-11-04 |
| Horarios por sede, no unificados. | 2026-11-04 |
| Borrar los 2 banners heredados (Hikvision y EZVIZ). | 2026-11-04 |
| «Soporte» del menú principal lleva a `/servicios/soporte`; la cuenta es siempre «Mi cuenta» con menú; barra roja y buscador de cabecera solo en páginas interiores. | 2026-11-03 |
| Código sin uso (`HomeHero`, `StorefrontSalesChannels`, etc.): se borra en una tarea aparte, tras la plantilla común. | 2026-11-03 |
| Revisión móvil general y limpieza de código muerto: las pedirá el usuario más adelante. | 2026-11-04 |
| Guardar (commits), organizar, borrar lo no usado y desplegar la web al VPS: cuando el usuario lo indique; antes quiere dejar definido lo que verá el cliente. | 2026-11-04 |

## 10. Pendientes priorizados

1. Validación del usuario de lo que verá el cliente (banners, pop-up, portada, páginas institucionales). Bloquea el resto.
2. Retirar los banners y el pop-up de PRUEBA (7.3) una vez validado.
3. Confirmar con el negocio horarios y teléfonos de las 4 sedes (leídos de Google Maps), el número de WhatsApp, el correo, el NIT y la URL oficial de garantías (`MAPA-TIENDA-PUBLICA.md` sección 5).
4. Destino de «Contactar al personal de soporte técnico» (sesión `paginas-institucionales`).
5. Decidir si el registro de clientes necesita aprobación previa (sesión `cuenta-clientes`; toca base de datos).
6. Publicar los 8 productos de ejemplo en la Biblioteca de la demo: bloqueado por la subida de fotos con selector de archivos.
7. Decidir cuándo aplicar las migraciones pendientes de la demo (7.2) y verificar tareas programadas duplicadas (sección 6).
8. Revisión visual pendiente del panel de banners: tablet, pop-up en móvil, banner sin imagen, cabecera en la vista previa móvil.
9. Mensaje de error genérico del registro; tres archivos sin uso y colores antiguos; revisión móvil general.
10. Cuando el usuario lo indique: commits, organización, borrado de código sin uso (T10 de `MAPA-TIENDA-PUBLICA.md`) y despliegue de la web al VPS.
11. Avisos de `impeccable` (sección 11): sin acción pendiente salvo confirmar la fuente Roboto con el usuario.
12. Hacer el cierre de la sección 13.

## 11. Avisos de la herramienta de diseño `impeccable`

Archivo `.impeccable/config.json` del worktree `validacion-biblioteca`, clave `detector.ignoreValues`. Contiene cuatro entradas:

| Regla | Valor | Alcance | Fecha | Motivo registrado |
|---|---|---|---|---|
| `overused-font` | `roboto` | global | 2026-11-03 | Roboto es la fuente existente de la tienda (`src/index.css` y `tailwind.config.js`); no es una elección nueva ni está confirmada por el usuario. |
| `buried-raster` | `*` | solo `.impeccable/mocks/banner/portada-banner.html` | 2026-11-03 | Las diapositivas inactivas tienen opacidad 0 por diseño; boceto desechable. |
| `design-system-font` | `poppins` | global | 2026-11-04 | Dirección A reproduce el titular Poppins 900 del prompt de referencia; solo boceto exploratorio (decisión del agente, no confirmada por el usuario). |
| `design-system-font` | `fraunces` | global | 2026-11-04 | Dirección C, titular serif editorial exploratorio; solo boceto (decisión del agente, no confirmada por el usuario). |

Las dos últimas entradas no estaban en el encargo; se transcriben porque están en el archivo. Aviso falso positivo conocido, no persistido en la configuración: `src/frontend/src/components/layout/Header.tsx`, subrayado de pestaña activa [no verificado].

## 12. Riesgos

1. `gs-db` (base `grupo_security`) parece producción. Un error con el contenedor o el comando equivocado la afectaría. Verificar siempre el nombre antes de ejecutar `docker` o `psql`.
2. Dos APIs (`gs-test-demo-api` y `gs-test-demo-api-marketing`) escriben en la misma base `gs_api_copy`. Tareas programadas podrían ejecutarse dos veces [no verificado].
3. La base de la demo no tiene las migraciones `20261028120000_product_internal_notes` y `20261104090000_remove_legacy_storefront_banners`. El código nuevo puede fallar donde dependa de ellas (notas internas de productos).
4. `~/gs-marketing-build-20261104/api.env` contiene secretos copiados del contenedor original. Quedan en el disco del VPS con permisos 600 hasta que se borren.
5. La llave `C:\Users\sopor\.ssh\gs_demo_claude` no tiene contraseña y su parte pública da acceso a `dev@57.131.50.38`. Si no se retira, el acceso sigue vigente.
6. El túnel y Vite mueren al cerrar la sesión que los lanzó. La IP interna del contenedor (172.20.0.5) cambia si se recrea; el túnel apuntaría a una dirección equivocada.
7. El contenedor nuevo se creó con `--restart no`: no vuelve solo tras reiniciar el VPS ni tras una caída.
8. `gs-test-demo-web` estaba `unhealthy` y no se investigó.
9. Los banners y el pop-up de PRUEBA están publicados en la base de la demo; cualquiera que abra la web de la demo los vería.
10. Todo el trabajo está sin commit, repartido entre worktrees. Un `git clean`, un cambio de rama o borrar la carpeta lo perdería. El trabajo sin commit de `validacion-biblioteca` no está en `vigorous-hellman-afc315`.
11. Horarios y teléfonos de las sedes vienen de Google Maps y no están confirmados por el negocio; publicarlos tal cual puede mostrar datos incorrectos.
12. El SQL a medida de M1 de marketing no se probó contra Postgres real antes de este despliegue (`odd/tasks/marketing-campanas.md` línea 25); la prueba actual en la demo es la primera contra Postgres real [no verificado].
13. `odd/tasks/marketing-campanas.md` conserva casillas de tareas sin marcar y el texto «Sin código escrito» en el encabezado (líneas 3 y 34-39) aunque M1 está hecho (línea 25); no es un reflejo fiel del avance.

## 13. Checklist de cierre

Marcar cada punto solo tras observarlo. Cada acción sobre el VPS requiere aprobación explícita del usuario.

- [ ] El usuario validó lo que verá el cliente.
- [ ] Retirar y eliminar los 3 banners y el pop-up de PRUEBA (7.3).
- [ ] Retirar la llave del VPS: quitar de `~/.ssh/authorized_keys` la línea que termina en `claude-code-demo-vps`. Después, borrar la llave local `C:\Users\sopor\.ssh\gs_demo_claude` y su `.pub`.
- [ ] Decidir con el usuario qué hacer con `gs-test-demo-api-marketing`: conservar, o `docker rm -f gs-test-demo-api-marketing`.
- [ ] Decidir si borrar `~/gs-backend-marketing-20261104.tgz` y `~/gs-marketing-build-20261104/` (incluye `api.env`) del VPS.
- [ ] Apagar el túnel SSH (proceso `ssh ... -L 8080:...`).
- [ ] Apagar Vite (puerto 5175).
- [ ] Confirmar que nada se guardó en git: `git status` en las tres carpetas; ningún commit ni push hecho sin aprobación.
