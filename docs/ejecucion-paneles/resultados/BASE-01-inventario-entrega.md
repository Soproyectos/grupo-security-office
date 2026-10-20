# Entrega BASE-01/inventario

Estado: LISTO PARA AUDITORÍA

## Resultado

Se guardó el inventario corto pantalla/API/modelo/permiso/prueba y la propuesta de base en `docs/ejecucion-paneles/contratos/BASE-01.md`, con rutas de evidencia verificable y comandos reproducibles (§11 del contrato). Paso de solo documentación: no se modificó la aplicación, la base de datos ni los servicios activos, y no se ejecutaron commits.

Cubre los tres casos obligatorios del paso: (1) el contrato distingue el preview temporal de la aplicación de precios y registra que **ninguno de los dos existe como módulo de revisión en S3** (el importador general de productos es otro flujo); (2) agenda/promociones internas/ficha técnica **no se declaran completas por documentación**: solo se registra el código observado en S3 y la advertencia `docs/ejecucion-paneles/CONTEXTO.md:13` de que sus piezas no están todas en este checkout; (3) la propuesta de base (§9, PROP) preserva IDs, medios y funciones públicas, incorpora piezas de L por contratos y deja **9 diferencias sin resolver explícitas** (D1-D9). Todo dato distingue hecho observado (OBS) de informe previo (IP) y propuesta (PROP).

## Base y cambios

- **Base utilizada:** encargo BASE-01/inventario (ficha y `PRIMER-ENCARGO.md`), `docs/ejecucion-paneles/CONTEXTO.md`, `AGENTS.md`, `docs/COMPARACION-10-PANELES-2026-10-13.md` (sección S3/S4/L y diferencias por módulo), `docs/IMPLEMENTACION-REVISION-PRECIOS-2026-10-14.md` (estado y evidencia del preview). Código consultado de forma acotada: `src/backend/src/app.module.ts`, `src/frontend/src/App.tsx`, `src/backend/prisma/schema.prisma`, guards/decoradores de permisos y `@Controller(` vía `rg`. Sin contrato previo aceptado (`contrato_aceptado: null`).
- **Estado inicial:** rama `feat/storefront-public-pricing`, HEAD `f6311b5c4cca31274b622bfd76628e0f406bb9c5`, 28 entradas de árbol sucio ajenas (10 modificadas, 18 sin rastrear). Se conservaron intactas: sin `reset/clean/revert/checkout`; la firma `git status --porcelain | sha256sum` es idéntica antes y después (`59b2c613b28429ea497aa1e6fb244c7fc76596018518e4fdc5fbc6b4452c57b9`, 28 entradas).
- **Archivos creados por esta entrega (los dos permitidos por la ficha):** `docs/ejecucion-paneles/contratos/BASE-01.md` (inventario + propuesta de base) y `docs/ejecucion-paneles/resultados/BASE-01-inventario-entrega.md` (este informe). No hay otros archivos tocados.
- **Sin cambios** de permisos, datos, API, esquema, migraciones ni dependencias. `estado.json` y `tareas.json` no se editaron; ninguna tarea se marcó aceptada.

## Pruebas ejecutadas

Ambiente: LOCAL, sin Docker, sin base de datos, sin sesión de usuario. Fecha: 2026-10-14. Al ser una tarea solo documental se validaron referencias y el paquete (no se ejecutó la aplicación).

| Comando | Resultado |
|---|---|
| `node docs/ejecucion-paneles/preparar-tarea.mjs --check` | exit 0 — «Plan válido: 30 paquetes, 99 pasos; referencias y dependencias comprobadas» |
| `node --test docs/ejecucion-paneles/preparar-tarea.test.mjs` | 13/13 pass, 0 fail (duración ~163 ms) |
| Verificación `test -e` de las 47 rutas citadas en el contrato | 47 OK, 0 faltantes |
| `git status --porcelain \| sha256sum` (antes y después) | idéntico: `59b2c613…c57b9`, 28 entradas — árbol ajeno intacto |

**No ejecutado (y por lo tanto no acreditado):** suites jest/vitest (no hay cambios de código), llamadas HTTP con permisos, pruebas con PostgreSQL desechable, recorrido de navegador y consulta de clientes, usuarios o credenciales. Los conteos 332 backend/13 frontend (preview, worktree L) y 1102/377 (2026-10-07) quedan registrados en el contrato como **informes previos**, no como verificación de esta entrega. `gentle-ai` no está en el PATH de este shell; además no hay commits que evaluar (la entrega es documental y queda para la auditoría del coordinador).

## Pendientes

- **D1** — El preview de precios no está en S3: decidir si se traslada el código del worktree L o se reimplementa (bloquea la ruta IMP).
- **D2** — `access-catalog.ts` / `AdminAccessGuard` / `UserAccessAssignments` solo existen en L; BASE-02 (contrato de acceso) depende de esa decisión.
- **D7** — Piezas de agenda/promociones/ficha técnica documentadas pero no todas inventariadas; no se consultó la base de datos ni archivos externos.
- **D8** — Las skills `gs-user-access-design`, `gs-access-inventory` y `gs-access-verification` no se encontraron en el repo ni en el entorno (`~/.claude/skills`, `~/.gentle-ai`).
- **D9** — El segundo `@Controller('api/listas')` de `products.controller.ts:319` no se verificó en runtime.
- Diferencias **D3-D6** (dos familias de cuentas de cliente, procedencia de paquetes en `UserPermission`, límite de precios sin unificar, prototipo `/supervisor`) quedan documentadas en el contrato para decisión del coordinador.
- No se inició ninguna tarea posterior (BASE-02, IMP, CAT, COM, QA).

## Para el auditor

- **Dif:** dos archivos nuevos bajo `docs/ejecucion-paneles/` (`contratos/BASE-01.md`, `resultados/BASE-01-inventario-entrega.md`); el resto del árbol sucio es ajeno y no se tocó.
- **Evidencia:** `docs/ejecucion-paneles/contratos/BASE-01.md` §11 (comandos reproducibles de solo lectura) y §1 (estado de versión).
- **Riesgos concretos:** `docs/ejecucion-paneles/contratos/BASE-01.md` §12 — consolidar desde L sin contrato puede perder IDs/medios/funciones; aplicar el control de acceso de L sin clasificar rutas de S3; tomar informes de pruebas de L como estado de S3; declarar piezas «presentes» por documentación.
- **Marca:** LISTO PARA AUDITORÍA. No es aceptación: el paso no se marcó aceptado y `estado.json` permanece sin cambios; la decisión corresponde al coordinador.
