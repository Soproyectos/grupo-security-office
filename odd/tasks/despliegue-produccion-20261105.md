# Despliegue a producción: Biblioteca + tienda + Marketing + cuenta de clientes

Estado (2026-11-05): en curso. Autorizado por el usuario: guardar (commits en rama nueva), abrir pull request y desplegar a `dev.gruposecurity.cloud` («junto, lo que hoy se levanta en el puerto 5175»). **El merge a `main` (que es lo que despliega) solo se hace con el visto bueno final del usuario tras ver el resumen.** Rige `AGENTS.md`.

## Objetivo
Llevar a producción lo que hoy corre en `http://localhost:5175` desde `C:\Users\sopor\grupo-security-office\.claude\worktrees\validacion-biblioteca` (rama `Esnaider/validacion-biblioteca`, sin commit), dejando fuera lo que no sirve para la web.

## Hechos verificados
- Despliegue oficial: PR a `main` → CI (`.github/workflows/ci.yml`: servidor `npm run lint`, `npx tsc --noEmit`, `npm run build`; pantalla `npm run lint`, `npm run build`) → CD construye imágenes en GHCR y actualiza el VPS (`docs/procedimientos/deploy-vps.md`): copia de seguridad previa, `prisma migrate deploy` (todas las pendientes), reinicio con espera de salud y rollback de imágenes (las migraciones NO se revierten).
- `origin/main` (`437ebc2`) tiene 4 commits que la rama no tiene (arreglos de catálogo/productos ya en producción). Hay que integrarlos.
- Línea base del CI hoy: **falla** (servidor lint 1 error; `tsc` 17 errores en `price-import.*`/`products.service.spec.ts`; pantalla lint 1 error; vitest 1 prueba `product-detail.spec.tsx:125`; el build de pantalla falló por bloqueo de archivo en Windows, a repetir).
- La Biblioteca usa `LIBRARY_DATABASE_MODE` con valor por defecto `legacy` (misma base, sin variables nuevas): producción arranca sin configuración extra.
- Cambios de build: `src/frontend/Dockerfile` pasa de `node:20-alpine` a `node:24-alpine` y copia `src/frontend/.env.production` (archivo versionado); `src/backend/package.json` añade `postbuild` y `prisma/biblioteca/ejecutar-local.js generate`.
- Migraciones nuevas a aplicar: `20261028120000_product_internal_notes`, `20261029150000` a `20261029150400` (solo agregan o relajan reglas). **`20261104090000_remove_legacy_storefront_banners` (DELETE por id) NO entra en este despliegue**: el código ignora esas filas; borrarlas en producción se hace aparte.
- Manifiesto de cambios y línea base del CI: informes de la sesión (scratchpad); resumen en `docs/handoffs/2026-11-04-INDICE.md`.

## Qué entra y qué se queda fuera
Entra: `src/backend/**` (src, prisma con migraciones y `prisma/biblioteca`, scripts, `package*.json`, `Dockerfile`), `src/frontend/**` (src, public, scripts, `vite.config.ts`, `package*.json`, `nginx.conf`, `Dockerfile`), `docs/**` de hoy y de Biblioteca (sin `docs/biblioteca-dominio/evidencia/`), `odd/tasks/**`.
Fuera (no se versiona; se añade a `.gitignore` solo lo pesado/generado): `docs/biblioteca-dominio/evidencia/` (2.903 archivos, tarballs, `.env.production` de copia), `scraper-fichas/`, `output/`, `salida-anexos/`, `salida-lista/`, `data/import/` generado, `previous_biblioteca.json`, `prueba_api*.json`. No se agrega: `.agents/`, `.impeccable/`, instalaciones y bocetos generales de `.claude/`, `.github/` de la herramienta de diseño, `tools/bot-biblioteca`, scripts de QA de la raíz, `deploy/biblioteca`, `deploy/dev`, `PRODUCT.md`, `validate_export.py`, `setup-laboratorio.bat`. Excepción documental específica: `AGENTS.md`, `.claude/CLAUDE.md` y las dos skills `gs-*` con sus referencias entran juntos, como indicó el resumen de continuidad; no se incluyen otras instalaciones.

## Tareas
- [x] D0 Congelar: el usuario confirmó a Codex que esta es la única sesión editando `validacion-biblioteca` (05/11/2026).
- [ ] D1 Arreglos para que el CI pase (lint servidor y pantalla; 17 errores `tsc`; prueba `product-detail.spec.tsx:125`; repetir build de pantalla).
- [x] D2 Rama nueva `release/web-20261105`; exclusiones guardadas en `3d85280`.
- [x] D3 Preservados los cuatro commits de Claude: `3d85280` (exclusiones), `a9e6ead` (esquema), `fc6476f` (backend), `bb6afde` (frontend). El cierre documental y de validación continúa con rutas explícitas; nunca `git add -A`.
- [x] D4 `origin/main` (`437ebc2`) integrado y cinco conflictos resueltos; commit de merge y cierre validado `6cecf64`.
- [ ] D5 Repetir localmente lo que corre el CI (lint, `tsc`, build, pruebas) y dejarlo en verde.
- [ ] D6 Revisión nativa pendiente: evaluación alta; START del candidato final no pudo iniciar por `lens_context_budget_exceeded` (718 archivos, 154.578 líneas). No se creó autoridad ni receipt. Las revisiones manuales acotadas no sustituyen ese control.
- [ ] D7 Push de la rama y pull request a `main` con resumen, migraciones y riesgos. **Parar aquí.**
- [ ] D8 Con el visto bueno del usuario: merge, seguir CI y CD, smoke test.
- [ ] D9 Verificar `dev.gruposecurity.cloud/tienda` y registrar el resultado.

## Reglas de ejecución
Agentes baratos con instrucciones precisas; yo verifico cada resultado. Un solo escritor a la vez sobre el árbol. Sin `git add -A`, sin `--force`, sin tocar `main` ni la base de producción por mi cuenta. Plan de reversa: el despliegue repone las imágenes anteriores si falla la salud; las migraciones solo avanzan y hay un `pg_dump` previo en el VPS.

## Continuación de Codex — 05/11/2026

- Se continúa el trabajo existente. Aunque la ruta recibida fue `grupo-security-tienda-publica-0c2c95`, Git confirmó que la release y sus cuatro commits están en `validacion-biblioteca`. No se recreó ni se reescribió la rama.
- `git fetch origin main` confirmó `437ebc2`. El merge quedó guardado en `6cecf64` con cinco conflictos resueltos: se conserva Biblioteca independiente de Listas, la búsqueda SQL parametrizada y la interfaz de la release. Las regresiones de `main` para publicación sin Lista se conservaron en las pruebas.
- Copia de validación: instantánea de archivos versionados de `bb6afde`, actualizada exclusivamente con las fuentes y pruebas seleccionadas de esta continuación. Usa las dependencias locales existentes mediante enlaces; **no equivale a un `npm ci` nuevo**. No contiene los archivos sin seguimiento excluidos ni configuraciones locales privadas.
- Defecto de CI reproducido: `tsc --noEmit` falló en la instantánea por ausencia de `prisma/biblioteca/generated/client`. Tras `npm run db:generate:library`, salió 0. CI ahora genera ambos clientes antes del typecheck. No se ejecutó ninguna migración.
- Precios: la batería completa original sin PostgreSQL reprodujo **39 fallos de 578 pruebas**. Las cinco suites afectadas tenían mocks de tarifas incompletos o expectativas de cinco tarifas fijas, cabeceras antiguas y una dependencia de `listas:read` que el controlador ya no exige. Se corrigieron solo pruebas, conservando los controles actuales, los casos 403 y la ausencia de escrituras de precios. Las **21 suites de precios quedaron 579/579**, incluida una regresión adicional de tarifa no disponible.
- Permisos: la batería amplia inicial dio **3.006/3.030**, con 24 fallos en siete suites que aún concedían alcances por Lista/producto a Biblioteca. Se contrastó con `access-catalog.ts` y la guía vigente: Biblioteca solo admite concesiones globales y Publicar requiere consulta y edición explícitas. Solo se actualizaron pruebas; se mantienen rechazo de alcances antiguos, aislamiento por Lista donde sí aplica, dependencias y revocación inmediata. Cierre observado en la instantánea: **168 suites, 3.031/3.031 pruebas aprobadas**.
- Frontend: el único conflicto de `ProductsPage` se resolvió sin diferencias respecto a `bb6afde`. La instantánea limpia descubrió una exclusión incorrecta: `App.tsx` sí monta `LibraryCatalogImportPage`, que depende de seis módulos de `template-import` sin versionar. Se incluyen esos seis módulos y sus tres specs, conservando fuera el flujo CSV separado. Tras incluirlos: **typecheck y lint aprobados (0 errores, 20 avisos), 1.666 pruebas aprobadas**. Build local bloqueado por el borrado de temporales de esbuild en Windows; reproducido con otra carpeta temporal y fuera del sandbox. No se atribuye a código sin evidencia; falta el build en CI Linux.
- Backend versionado: build y postbuild aprobados en la instantánea tras generar ambos clientes. Se amplía la validación unitaria omitiendo diez suites que pueden conectarse a PostgreSQL real; las pruebas `*.pgint.ts` tampoco se ejecutan. Sin cambios de servicios, datos reales, credenciales ni VPS.
- T00: el parche SQL ya está en `fc6476f` con regresiones unitarias de entradas maliciosas. Esta continuación no representa una prueba PostgreSQL de ese parche.
- Exclusiones conservadas: migración `20261104090000_remove_legacy_storefront_banners`, artefactos/evidencia generada, herramientas de laboratorio y componentes sin conexión a rutas. La excepción del importador conectado está explicada arriba. Los cinco borrados locales de manifiestos y scripts quedan sin incluir en el índice.
- Se incluyen las dos skills `gs-*` junto con sus referencias y las instrucciones que las requieren. Es una excepción concreta a la exclusión general de instalaciones `.claude/`, coherente con el resumen de continuidad del usuario.
- Revisión nativa: modo global `on` confirmado fuera del sandbox. Candidato `origin/main..6cecf64`: evaluación alta; START no inició por límite de contexto (718 archivos, 154.578 líneas). El rechazo señala que repetir ese candidato no puede funcionar y que se necesitan candidatos menores; no se truncó evidencia ni se creó autoridad, aprobación o receipt. Se conserva la historia de Claude. Se prepara un PR **borrador** y revisiones manuales acotadas para disponer de CI Linux y evidencia revisable; falta decidir cómo satisfacer o declinar el control nativo antes del merge. Engram no está expuesto en esta sesión: espejo pendiente.
- Reversión local: los commits iniciales se conservan; la continuación afecta el CI, cinco suites de precios, regresiones de validación y documentación. No revertir archivos ajenos ni los cinco borrados locales sin una decisión separada.

### Comandos de comprobación de esta continuación

- Backend: `npm run lint` (0 errores, 11 avisos); `node_modules/.bin/tsc --noEmit` (salida 0); `npm run build` (build y postbuild, salida 0; conexión ficticia, sin consultar una base).
- Backend unitario, desde `src/backend`: `npm test -- --runInBand --testPathIgnorePatterns='(\.db\.spec\.ts$|catalog-jobs\.spec\.ts$|access-assignments\.service\.spec\.ts$|listas-conservation\.spec\.ts$|workflow-links\.spec\.ts$|workflow-convert\.spec\.ts$|product-revisions\.backfill\.spec\.ts$|batch-executor\.service\.spec\.ts$)' --silent` (168 suites, 3.031 pruebas, salida 0). Las diez suites omitidas requieren o pueden alcanzar PostgreSQL real; no se ejecutaron ni se alteraron para omitirlas en el proyecto.
- Frontend, desde `src/frontend`: `npm run lint` (0 errores, 20 avisos); `node_modules/.bin/tsc -b` (salida 0); `npm test -- --silent --reporter=json` (1.666 pruebas aprobadas, salida 0). En Windows se usaron los ejecutables `.cmd` equivalentes.
- `git diff --cached --check`: salida 0 tras corregir únicamente espacios finales y líneas vacías adicionales al final de cuatro archivos nuevos.
- `npm run build` del frontend: fallo de acceso denegado al borrar el temporal de esbuild; el build Linux del PR sigue pendiente. Sin prueba visual nueva: no se rediseñó la interfaz y la continuación solo recuperó dependencias ya conectadas.
