# Grupo Security Office — Aplicación Principal

Plataforma Comercial Grupo Security: backend NestJS + frontend React + PostgreSQL/Prisma.

## Estructura de carpetas

| Ruta | Descripción |
|---|---|
| `src/backend/` | Backend NestJS: API REST, autenticación, GraphQL, integración con PostgreSQL/Prisma. |
| `src/frontend/` | Frontend React: interfaz de usuario con Vite + Tailwind. |
| `docker/` | Configuración Docker (Dockerfile, nginx.conf, compose). |
| `data/` | Datos: imports, uploads, DB SQLite, logs de la aplicación. |
| `docs/` | Documentación técnica y arquitectura. |
| `prisma/` | Esquema Prisma y migraciones de la base de datos. |
| `agents/` | Agentes de IA para generación de fichas de producto. |

## Archivos clave

| Archivo | Descripción |
|---|---|
| `docker-compose.yml` | Orquesta backend + frontend + DB. |
| `.env` | Variables de entorno (incluye DB_PASS, JWT_SECRET). **Ignorado por git.** |
| `package.json` | Script raíz con workspaces (backend + frontend). |

Ver [docs/00-INDEX.md](docs/00-INDEX.md) para el índice de documentación.
