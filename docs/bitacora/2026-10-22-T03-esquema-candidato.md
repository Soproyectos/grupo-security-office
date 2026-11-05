# T03 — Separación candidata de biblioteca sin bases

**Fecha:** 22/10/2026 · **Agente:** Codex · **Rama/HEAD:** `Esnaider/nifty-robinson-8a8974` / `cb230aa6fa206f142d4cdf8caf7a6a11fe3ebf00`.

## Qué cambió

Autorización explícita para recepción en solo lectura y T03 local. Tras contrastar el traspaso externo con el repo, se confirmó que T03 no existía. Se reclamó en el índice antes de escribir. Explore se usó para las búsquedas amplias conforme a AGENTS; Haiku no está disponible en este runtime y se usó el explorador disponible con modelo heredado, solo lectura.

Se añadieron exclusivamente los archivos de `src/backend/prisma/biblioteca-candidata/`: esquema, `.gitignore`, SQL inicial e historial propio, complemento histórico, ejecutor local, comprobador y configuración de tipos. Cliente generado ignorado, independiente del actual. Se actualizaron README, plan y estado/corrección histórica del modelo en `docs/biblioteca-dominio/`; se añadieron el [informe T03](../biblioteca-dominio/t03-esquema-candidato.md) y dos JSON de evidencia.

No se cambiaron el parche T00, T02, esquema productivo, PrismaService, módulos, dependencias, lockfile ni migraciones históricas. Se conservaron los cambios previos recibidos. Engram no expuso herramientas en esta sesión; no se instaló ni reconfiguró nada para habilitarlo. La evidencia de continuidad queda en el repositorio.

## Qué se comprobó

Los comandos exactos y huellas están en el informe. Prisma instalado **6.19.3**: validate, generate y migrate diff desde vacío → código 0. Cliente candidato: 23 modelos, cinco enums, 280 campos escalares, 19 FK internas; comparación fuente/metadatos e índices → código 0. No se instanció cliente alguno.

TypeScript del candidato (incluye ambos scripts con `checkJs`) y del backend (`--noEmit --incremental false`) → código 0. `npm run lint` → código 0, cero errores, seis advertencias en archivos sin cambios. `node --check` de scripts y `git diff --check` → código 0. Regeneración de SQL: hash idéntico. Se registraron 115 huellas antes de editar; 112 archivos protegidos permanecen idénticos y los otros tres son los documentos modificados deliberadamente.

Dos ajustes durante la comprobación local: (1) la primera validación de Prisma fue correcta, pero el ejecutor terminó con error al intentar retirar su cwd temporal porque Prisma creó `node_modules/.cache`; se ajustó para conservar esa caché sin borrado recursivo y la repetición terminó en 0; no fue instalación de paquetes. (2) Al incluir el ejecutor en `checkJs`, TypeScript señaló `Object.hasOwn` fuera de ES2021; se sustituyó por `hasOwnProperty.call`, y la repetición pasó. Quedan pequeñas cachés temporales con prefijo `gs-t03-offline-`, fuera del repositorio; no se hizo limpieza recursiva.

La inspección histórica detectó que los GIN se retiraron en `20260908172738`; se reincorporan explícitamente por el criterio T03. El CHECK real de lifecycle admite siete estados, conservados; se corrigió el resumen documental de tres. Se preservan CHECK de tamaño y unicidad del SKU normalizado. No se transformaron comentarios de propuestas en constraints efectivos.

## Qué no se comprobó

No se conectó a ninguna BD ni se ejecutó SQL. No hay evidencia de ejecución PostgreSQL, Linux/Alpine, copia de datos, restauración, `pg_trgm` real, runtime `pg`, build real ni producción. No se usaron Docker/SSH/VPS, suites globales o `gs-tanda-db`. No se instaló/actualizó nada; sin commit, push, merge o despliegue. El estado de producción de la sesión anterior no se volvió a verificar.

## Pendientes y reversión

T03 queda **preparada sin ejecutar**, pendiente de revisión humana del SQL. D1/D3/D4/D5/D7 continúan abiertas; eventos propios (T07), snapshots/copia (T11), faltantes/evidencia/costos/archivos (T13, T08) se registran sin implementarlos. T00 sigue por su carril. No se inició T04.

Retirada: solo carpeta candidata, informe y JSON T03, esta bitácora y los párrafos T03 de README/plan/modelo; preservar los cambios previos de diseño y seguridad. Sin reversión en BD porque no hubo aplicación. No usar operaciones globales de Git. La siguiente tarea requiere aprobación independiente del usuario.
