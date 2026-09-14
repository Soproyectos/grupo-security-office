---
id: FIX-LISTAS-DTO-CORP-001
title: Eliminar decoradores @IsUUID huérfanos en DTOs de Listas (400 "name must be a UUID") y habilitar CORP cross-origin en /api/files/:id (imágenes bloqueadas)
status: pending
assigned_tool: opencode
assigned_agent: backend-engineer
created_by: usuario (via solution-architect, diagnóstico aprobado)
created_at: 2026-09-14T00:00:00Z
---

## Diagnóstico (fondo, ya confirmado contra el repo)

### Bug 1 — 400 `name must be a UUID` en `POST /api/listas`

En `src/backend/src/modules/listas/dto/create-lista.dto.ts:30-41`, el PR #15
(`MERGE-PR15-REMOVE-SUPPLIERS-001`) eliminó la propiedad `supplierId` pero dejó su
bloque de decoradores (`@ApiPropertyOptional` + `@IsUUID()` + `@IsOptional()`).
En TypeScript los decoradores se aplican a la **siguiente propiedad declarada**,
así que `@IsUUID()` cayó sobre `name`. Todo `POST /api/listas` (crear lista
destino desde el wizard de importación) falla con 400 `name must be a UUID`.

`src/backend/src/modules/listas/dto/update-lista.dto.ts:64-70` tiene el mismo
patrón: un par huérfano `@IsUUID() @IsOptional()` que ahora aplica a
`validFrom`, rompiendo `PATCH /api/listas` cuando incluye fechas de vigencia.

### Bug 2 — `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` en `GET /api/files/:id`

`src/backend/src/main.ts:17` usa `helmet()` con defaults; Helmet 7 incluye
`Cross-Origin-Resource-Policy: same-origin`. Las imágenes/logos se sirven desde
`api-dev.gruposecurity.com.co` y se embeben en `dev.gruposecurity.com.co`
(origen distinto) → el navegador bloquea el recurso.

**Decisión aprobada (opción A)**: añadir el header
`Cross-Origin-Resource-Policy: cross-origin` **solo** en `FilesController.serve()`.
Los assets de files son públicos y contenido-inmutable por id (`@Public()` +
`Cache-Control: public, max-age=31536000, immutable`), así que exponerlos
cross-origin no añade superficie real. NO se toca la config global de helmet.

## Scope (Contrato de delegación)

### Objetivo único
Restaurar la creación/edición de Listas en producción eliminando decoradores
huérfanos de `supplierId`, y desbloquear la visualización de imágenes
producto/logo añadiendo `Cross-Origin-Resource-Policy: cross-origin` al
endpoint de files.

### Archivos permitidos
- `src/backend/src/modules/listas/dto/create-lista.dto.ts` (eliminar bloque huérfano líneas 30-36: el `@ApiPropertyOptional` de proveedor + `@IsUUID()` + `@IsOptional()`)
- `src/backend/src/modules/listas/dto/update-lista.dto.ts` (eliminar bloque huérfano líneas 64-70)
- `src/backend/src/modules/listas/dto/create-lista.dto.spec.ts` (crear; test de regresión con `plainToInstance` + `validate` de class-validator: `name` con string normal NO debe fallar; validar también que ningún DTO devuelva error "must be a UUID" para `name`/`validFrom`)
- `src/backend/src/modules/files/files.controller.ts` (añadir header `Cross-Origin-Resource-Policy: cross-origin` en el `res.set({...})` existente)
- `src/backend/src/modules/files/files.controller.spec.ts` (crear o extender si existe; verificar el header en la respuesta)
- `docs/agent-coordination/agent-status.md`, `docs/agent-coordination/file-ownership.md`, `docs/agent-coordination/work-log.md`
- `docs/agent-coordination/issues/fix-listas-dto-corp-001.md` (solo para actualizar `status`/`result_summary` al cerrar)

### Archivos prohibidos
- `src/backend/src/main.ts` (NO tocar la config global de helmet — decisión cerrada en opción A)
- `src/backend/prisma/schema.prisma` y cualquier migración
- `src/frontend/**`
- Cualquier otro DTO, servicio o módulo backend
- `.env`, credenciales, configuración de Hostinger

### Entradas disponibles
- Diagnóstico con líneas exactas en la sección "Diagnóstico" de este issue.
- Patrón de test existente: ver specs actuales del módulo listas/files como referencia de estilo.

### Salida esperada
- Los dos DTOs sin decoradores huérfanos.
- `FilesController` emitiendo `Cross-Origin-Resource-Policy: cross-origin`.
- Tests de regresión nuevos pasando.
- Entrada en `work-log.md` con hash de commit; actualización de `agent-status.md` y `file-ownership.md`.

### Criterios de aceptación
- [ ] `POST /api/listas` con payload `{ code, name }` válido → 201 (cubierto por test o verificación equivalente).
- [ ] Test de regresión: `name: "Lista X"` valida sin errores; DTO de update acepta `validFrom` ISO 8601.
- [ ] `GET /api/files/:id` incluye header `Cross-Origin-Resource-Policy: cross-origin`.
- [ ] `npx tsc --noEmit` 0 errores; `npm run lint` 0 errores; `npm run build` OK.
- [ ] Suite completa `npx jest`: no más fallos que el baseline preexistente documentado (10 fallos en `transition.service.spec.ts` y `listas.service.spec.ts`, contar con cuidado porque este issue toca listas — el baseline de `listas.service.spec.ts` es 1 fallo preexistente por ordenamiento ACL, NO introducir nuevos).
- [ ] Sin cambios fuera de archivos permitidos (`git status --short` limpio de extras).

### Comandos de validación
```
cd src/backend
npx tsc --noEmit
npm run lint
npm run build
npx jest src/modules/listas src/modules/files
npx jest
git status --short
git diff --check
```

### Riesgos conocidos
- **Revisión de patrón**: es la primera regresión por decoradores huérfanos tras eliminar una propiedad; durante la ejecución, verificar con un grep rápido (`@IsUUID()` seguido de línea en blanco sin propiedad) que no exista un tercer caso en otro DTO — si se encuentra uno, reportarlo como hallazgo pero NO corregirlo en este issue (abrir issue aparte; alcance cerrado).
- El baseline de tests tiene un fallo preexistente en `listas.service.spec.ts` (ordenamiento ACL, documentado desde BE-RBAC-001) — no confundirlo con una regresión de este cambio ni intentar arreglarlo aquí.
- El fix es backend-only; el despliegue a `api-dev` (Hostinger, zip manual) lo ejecuta el coordinador tras el merge — no es parte de este issue.

## Resultado (al completar)

completed_at: (pendiente)

### result_summary

(pendiente)
