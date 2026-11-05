# 2026-10-22 — T02: prueba local de dos esquemas y dos clientes Prisma

**Dónde:** worktree `nifty-robinson-8a8974`, rama `Esnaider/nifty-robinson-8a8974`, base `cb230aa`. Sin commit ni push. Autorizado por el usuario con alcance local, sin instalaciones, bases, Docker ni SSH.

**Qué cambió:** carpeta nueva `src/backend/prisma/poc-dos-clientes/` (dos esquemas mínimos, un comprobador en JavaScript, un `tsconfig.json` y un `.gitignore`), más `docs/biblioteca-dominio/poc-t02-dos-clientes.md` y ediciones en `docs/biblioteca-dominio/README.md` y `infraestructura-e-integracion.md`. Ningún archivo existente de código, esquema, dependencias, lockfile, CI o despliegue se modificó (25 huellas SHA-256 idénticas antes y después).

**Qué se probó:** `prisma validate` y `prisma generate` de ambos esquemas (sin red); `node comprobar-clientes.js` (8 comprobaciones ok, sin instanciar clientes); `tsc -p` de la prueba y `tsc --noEmit -p tsconfig.json` del proyecto: código 0.

**Qué NO se probó:** Linux/Alpine y `binaryTargets`, adaptador `pg` en ejecución, `nest build`, `docker build`, `lint`, `migrate` por esquema. Por eso T02 no se marca como cerrada.

**Cómo revertir:** `rm -r src/backend/prisma/poc-dos-clientes` (no usar `git clean`).
