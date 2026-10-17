# TANDA-01 — Incidente: helpers con riesgo de conexión a BD de producción

**Fecha:** 2026-10-16 · **Checkout:** S3 (documento canónico) · **Alcance:** solo documentación. Clasificación: incidente de ENTORNO DE PRUEBAS (helpers en `/tmp`), no de la aplicación.

**Estado del incidente: CONTENIDO, PENDIENTE DE AUDITORÍA del coordinador.** No se cierra aquí: el caso A incluyó **escrituras exitosas conocidas** en producción (limpiadas después); los casos B y C quedan descritos con sus resultados. **No se realizaron ni se realizarán nuevas conexiones, limpiezas ni correcciones en producción sin autorización.**

## 1. Resumen

Varios helpers de verificación de la tanda (scripts Node en `/tmp/gs-tanda-logs`) podían resolver `DATABASE_URL` desde el `.env` de la copia, que apunta a la base **Neon de producción**. Se detectaron, contuvieron y corrigieron.

## 2. Cronología de exposiciones

| # | Cuándo | Qué helper | Operaciones intentadas contra producción | Resultado |
|---|---|---|---|---|
| A | 2026-10-16 ~15:30 (tanda, unidad backend COM-03) | primer borrador de `e2e-com03.cjs`: `new PrismaClient()` sin URL (cwd = `src/backend` → `.env` → Neon) | **ESCRITURAS EXITOSAS:** INSERT de 1 categoría, 1 marca, 3 Listas, 1 tarifa, 3 productos y 1 precio (fixtures) contra Neon. El subagente lo detectó con `current_database()` y **ejecutó su limpieza posterior** (borró esas filas). Verificación independiente posterior (conexión de solo lectura, ~19:30): 0 filas nuevas en las últimas 16 h en las 29 tablas con `createdAt` de `neondb` | Escrituras ocurrieron y fueron limpiadas. La ventana posterior a la limpieza quedó verificada vacía; **la auditoría integral de la ventana completa queda para el coordinador** |
| B | 2026-10-16 21:11–21:14 | `login.cjs` (versión con `env('DATABASE_URL')` = `.env`) | `SELECT current_database()`; `SELECT id FROM users WHERE email='admin@…'` (lectura); `SELECT secret FROM user_mfa` (lectura); **`INSERT INTO user_mfa`** del admin con secreto nuevo | El SELECT de `user_mfa` devolvió la fila **original del 2026-09-21T15:49Z** (id `9c624014-…`). El INSERT chocó con la restricción única (`userId` unique) → sin fila nueva observable. El `verify` posterior falló 401 porque la API de revisión (local) no tiene ese MFA |
| C | 2026-10-16 20:30–20:45 (varias corridas) | primeras versiones de `e2e-imp01.cjs` (mismo `env()` defectuoso) | `DELETE`s de limpieza filtrados por IDs/emails de fixture (`e2eimp-*`, `e2e-imp-%`) — **datos que no existen en producción** → 0 filas; la sentencia `DELETE … access_grants` falló con `relation "access_grants" does not exist` (Neon no tiene esa tabla) y abortó el script antes de cualquier fixture | Sin escritura efectiva observable; el script pasó a URL inline a continuación |

## 3. Conclusión (corregida)

- **Caso A: SÍ hubo escrituras exitosas en producción** (fixtures de COM-03) con limpieza posterior documentada por el subagente y verificación de ventana posterior vacía.
- **Casos B y C: sin escritura exitosa observable** (B: INSERT rechazado por unique según la evidencia de la fila original; C: DELETEs sin matches + sentencia fallida).
- **No se emite conclusión global de «sin escritura»**: el incidente queda como **CONTENIDO, PENDIENTE DE AUDITORÍA** del coordinador, que incluye validar en producción la ventana completa de A (antes y después de su limpieza) y la de B/C. Sin autorización no se harán conexiones, limpiezas ni correcciones adicionales en producción.

## 4. Contención y aislamiento (medidas aplicadas)

1. **Pausa** de helpers/pruebas con escritura hasta auditarlos todos (directriz 1). Trabajo de frontend/documentación no se detuvo.
2. **Auditoría completa** de los 20 helpers de `/tmp/gs-tanda-logs`:
   - **HTTP-only (sin BD):** `e2e-com01.cjs`, `e2e-com01-frontend.cjs`, `e2e-com02-frontend.cjs`.
   - **psql vía docker con BD explícita `grupo_security_tanda`:** `e2e-alternativas`, `e2e-borradores`, `e2e-lente-publico`, `e2e-cat01`, `evidence-cat01-frontend`, `e2e-com08`, `e2e-com08v2`.
   - **Prisma con URL inline + guard `current_database()`:** `e2e-com03(+frontend)`, `e2e-com04(+frontend)`, `e2e-imp01` (override inline de DATABASE_URL), `del-mfa`, `inspect03`.
   - **INSEGUROS detectados y CORREGIDOS:** `e2e-com02.cjs` (`new PrismaClient()` sin URL; usos solo-lectura, pero la conexión apuntaba a Neon) y `e2e-base03.cjs` (`process.env.E2E_DB_URL` opcional → fallback implícito a `.env`; con escrituras reales) → ambos ahora usan URL de prueba explícita + `assertTestDb` al inicio.
   - `login.cjs`: corregido (URL inline + guard) — el defecto del incidente B.
3. **Configuración aislada** — `/tmp/gs-tanda-logs/testdb.cjs`: exporta `TEST_DB_URL` (localhost:54331/grupo_security_tanda), `testPrisma()` (nunca lee `.env`) y `assertTestDb()` que **aborta** si: nombre de BD ≠ `grupo_security_tanda`, o el host del servidor no es local/contenedor (`172.17.*`, `10.*`, `127.0.0.1`, `::1`, unix). Verificado: **positivo** (db correcta) y **negativo** (otra BD local → aborta). Nota: con Docker mapeado, el servidor reporta IP interna del contenedor (172.17.0.3:5432) — por eso el criterio de host incluye la red del contenedor.
4. **Specs del backend auditados (solo lectura):** 0 specs leen `.env` (`dotenv`/`readFileSync .env` → vacío); 0 construyen `new PrismaClient()` sin URL; 6 specs usan URL inline de BDs desechables. **Pausa levantada** para el entorno desechable.
5. **Evidencia sin secretos:** este documento no incluye credenciales, URLs completas con password ni claves MFA. Los tokens JWT de prueba viven en `/tmp` y caducan (<2 h). `MFA_ENCRYPTION_KEY` se lee del `.env` local por algunos helpers para cifrar/descifrar fixtures con el mismo esquema que la API (lectura de archivo local, sin conexión).

## 5. Reglas permanentes (a partir de este cierre)

1. Ningún script de prueba crea `PrismaClient` sin `datasources.db.url` explícito de prueba; todo pasa por `testdb.cjs` o URL inline + guard.
2. Antes de CUALQUIER escritura: `assertTestDb` (nombre de BD + host local/contenedor).
3. El `.env` de la copia es **solo** para la API de revisión (que lo carga en su propio proceso); los helpers jamás lo usan para DB.
4. Incidentes de entorno: documentar comandos, operaciones intentadas y evidencias; sin secretos; sin conexiones de producción nuevas sin autorización.

## 6. Pendiente para el coordinador (auditoría)

El incidente queda **CONTENIDO** (§4) pero **no cerrado**: su verificación y aceptación pertenecen al coordinador.

- **Caso A:** validar en producción la ventana completa — escrituras exitosas conocidas (fixtures INSERT) **y** su limpieza posterior por el subagente; la verificación de las 16 h posteriores (solo lectura) cubre solo la ventana posterior, no la anterior.
- **Casos B y C:** revisar que el INSERT rechazado por la única y los DELETEs sin matches no hayan dejado efectos colaterales (p. ej. `updated_at` u triggers).
- **Sin nuevas conexiones, limpiezas ni correcciones en producción** hasta que el coordinador lo autorice; los helpers ya no pueden apuntar a ella (§4).
