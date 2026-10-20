# `src/backend/` — Backend NestJS

API REST de Grupo Security Office. Construida con NestJS, Prisma ORM y PostgreSQL.

## Archivos clave

| Archivo | Descripción |
|---|---|
| `Dockerfile` | Imagen Docker del backend. |
| `Dockerfile.bak` | **Backup obsoleto.** Candidato a eliminación. |
| `eslint.config.mjs` | Configuración de ESLint. |
| `jest.config.ts` | Configuración de Jest para tests. |
| `nest-cli.json` | Configuración del CLI de NestJS. |
| `package.json` | Definición del paquete backend con dependencias NestJS y Prisma. |

## Subcarpetas

| Ruta | Descripción |
|---|---|
| `src/` | Código fuente del backend (módulos, controllers, servicios, DTOs). |
| `prisma/` | Esquema Prisma (`schema.prisma`) y migraciones. |
| `tests/` | Tests unitarios (si existen). |

## Relación con otros directorios

- `src/frontend/` — Frontend React que consume esta API.
- `gs-db-public/` — PostgreSQL de producción para esta API.
- Ver [README del proyecto](../README.md) y [docs/00-INDEX.md](../docs/00-INDEX.md).
