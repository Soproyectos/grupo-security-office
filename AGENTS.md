# AGENTS.md — Grupo Security Office

Plataforma Comercial Grupo Security: panel administrativo interno + catálogo comercial integrado con ERP Yéminus (pendiente confirmación de su API).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React + TypeScript + Vite + Tailwind CSS (PWA, mobile-first) |
| Backend | NestJS + TypeScript |
| Database | PostgreSQL 16 (única fuente de verdad) |
| ORM | Prisma 5.x (migraciones versionadas) |
| Auth | JWT + bcrypt + RBAC (Super Admin, Supervisor, Admin Comercial, Operador, Consulta) |
| Data Fetching / Estado | TanStack Query / Zustand |
| API docs / Testing | Swagger (OpenAPI) / Jest-Vitest + Playwright |
| Contenedores | Docker + Docker Compose (local/dev) |
| Python | Solo auxiliar (Excel parsing/mapping/import) |
| ERP | Yéminus |

Código e identificadores en inglés; comunicación con el coordinador en español.

## Reglas del proyecto

1. **Sin secretos en Git** — tokens, passwords, API keys, teléfonos, comprobantes reales y PII van en variables de entorno. Datos ficticios en fixtures, tests y seeding.
2. **Ambientes LOCAL/PROD** — todo corre local primero (Docker); nada llega a producción sin aprobación humana explícita. No deploy a prod, no cambios de credenciales, sin autorización.
3. **Cambios mínimos** — resolver la tarea con el menor cambio coherente posible; sin reescrituras, refactors masivos ni cambios de stack no solicitados. Sin commits/push sin autorización explícita del usuario.
4. **Validación antes de "terminado"** — lint + typecheck + tests pertinentes; compilar no es terminar.

## Flujo de trabajo

**Gentle-AI es la capa de flujo/memoria/review** (ODD/SDD/RDD, Engram, skills, CodeGraph, personas) para Claude Code, Kilo Code y OpenCode. **No hay orquestación automática**: las sesiones son dirigidas por el humano, una tarea a la vez. Contexto de la migración: `docs/MIGRACION-GENTLE-AI.md`.

## Importación masiva de productos

La fuente canónica del lote de biblioteca son exactamente los 39 Excel de `D:\Empresa\web-gruposecurity\listas\LISTA_DE_PRECIOS_EXCEL`. No se deben mezclar con archivos históricos de otras carpetas. La auditoría reproducible está en [`docs/procedimientos/auditoria-biblioteca-39-listas.md`](docs/procedimientos/auditoria-biblioteca-39-listas.md): 5.367 filas de producto, 5.038 SKU únicos y 329 apariciones duplicadas.

El artefacto de carga es `biblioteca-import-39-listas.json` y su evidencia detallada es `biblioteca-import-39-listas.report.json`. Se regeneran con `scripts/generar_manifiesto_biblioteca.py --lists-dir <carpeta> --expected-files 39`. Las fichas de `biblioteca/*.json` solo enriquecen SKU coincidentes; no agregan referencias ausentes de los 39 Excel y nunca se copian precios.

El contrato y los comandos están en [`docs/procedimientos/importacion-masiva-biblioteca-vitrina.md`](docs/procedimientos/importacion-masiva-biblioteca-vitrina.md). Una ficha con solo SKU queda `DRAFT`, inactiva y en `pendiente_enriquecimiento`, para completarla después. Ningún agente debe publicar esos registros ni aplicar el lote en producción sin aprobación humana explícita.

`biblioteca-import-web.json` contiene los 497 productos que ya estaban publicados; 479 coinciden con el lote oficial y 18 no aparecen en las 39 listas. No es el inventario maestro y esos 18 externos no deben borrarse. `--updates-only` se usa únicamente cuando la intención es actualizar SKUs existentes sin crear los faltantes.

Para completar posteriormente los nombres de vitrina, usar [`docs/procedimientos/enriquecimiento-nombres-biblioteca.md`](docs/procedimientos/enriquecimiento-nombres-biblioteca.md). `scripts/proponer_nombres_vitrina.py` crea propuestas en `biblioteca-nombres-propuestos.csv` dentro del proyecto; solo una columna `nombre_aprobado` rellenada tras revisión produce fichas `parcial` importables con `--updates-only`. Mantener scripts, reportes y documentación de este flujo dentro de este repositorio para que otros agentes puedan consultarlos por GitHub.
