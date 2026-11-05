# 2026-10-22 — Diseño documental de la biblioteca dedicada

**Quién / dónde:** agente de Claude en el PC de trabajo; worktree `nifty-robinson-8a8974`, rama `Esnaider/nifty-robinson-8a8974`, base `cb230aa` (`main` estaba en `437ebc2`). Sin commit ni push.

**Qué cambió (solo documentación):**
- Nuevo: `docs/adr/ADR-20261022-biblioteca-postgresql-dedicado.md` y la carpeta `docs/biblioteca-dominio/` (README con índice y estado, modelo de datos, diccionario generado, reglas de publicación, infraestructura e integración, transición de datos, plan de implementación, instrucciones para agentes, `herramientas/`).
- Editado: `AGENTS.md` (se corrigió «Prisma 5.x» por «Prisma 6.x», verificado en `src/backend/package-lock.json`, y se añadió una sección breve que apunta al índice), `docs/00-INDEX.md` y `docs/adr/README.md` (enlaces).

**Qué se comprobó:** clasificación de los 63 modelos y llaves foráneas, leídas de `schema.prisma` con un script; inventario de módulos por escaneo estático (con límites declarados en el documento); versión de Prisma (6.19.3) en el lockfile; el parche SQL aplica limpio sobre `437ebc2` (índice temporal de git).

**Qué NO se comprobó:** ninguna base de datos ni la VPS (todo es lectura de repo y documentos previos); que dos esquemas Prisma coexistan (tarea T02); la prueba de integración del parche SQL; volúmenes y tiempos reales; el comportamiento de producción.

**Pendiente:** aprobación del ADR; decisiones D1, D3, D4, D5 y D7 (bloquean); aviso al equipo de seguridad antes de cualquier prueba en la VPS; el parche SQL (T00) por su carril.

**Cómo revertir:** borrar los archivos nuevos y deshacer las cuatro ediciones (`git checkout -- AGENTS.md docs/00-INDEX.md docs/adr/README.md`) mientras no haya commit.
