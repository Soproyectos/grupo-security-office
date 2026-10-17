# COM-08 — Avisos y promociones comerciales internos (paso: contrato)

**Fecha:** 2026-10-16 · **Checkout:** `/home/soporte/office_ai/grupo-security-office` (S3) · **Alcance:** solo documentación. Escribe únicamente `docs/ejecucion-paneles/contratos/COM-08.md`; sin código, sin commits, **sin tocar `estado.json`/`tareas.json`**, servicios activos (3000/5173/5432) ni `opencode.json`.

**Modalidad — tanda continua (PROP):** propuesta para la auditoría final del coordinador; **no es una decisión aprobada**.

## 1. Meta, dependencias y reglas de la ficha

- **Meta (ficha, textual):** «Concretar recuperar promociones S3 y separar preparar/publicar/audiencia. Fijar campos, rutas, acciones, alcance, errores y pruebas antes de implementar.»
- **dependsOn (ficha):** `BASE-01` (aceptado), `BASE-02` (PROP), `COM-01` (implementado_sin_auditar en copia). Este paso no verifica aceptaciones de `estado.json`.
- **Reglas (textuales):** (1) «Reconciliar módulo S3 existente antes de crearlo localmente.» (2) «Aviso interno no es banner público ni descuento de e-commerce.» (3) «Borrador/edición/publicación/retirada/audiencia/fechas con acciones separadas; preparar no publica.»
- **Aceptación del paso:** los 2 textuales de `contrato`.

## 2. Estado actual (OBS — copia de revisión, módulo S3 existente)

**Backend `modules/promotions/` (352 líneas total):**

| Ruta | Roles hoy | Comportamiento OBS |
|---|---|---|
| `GET /api/promotions` | VENDEDOR, SUPERVISOR, SUPER_ADMIN (`controller:18`) | Filtra `isActive && startsAt<=ahora && endsAt>ahora` **y audiencia** `GLOBAL` o `TEAM` con `createdById ∈ [yo, ancestros]` (`service:39-40`) → **vencidos y de otro equipo ya no aparecen en la lectura** |
| `POST /api/promotions` | SUPERVISOR, SUPER_ADMIN (`:26`) | **CREAR YA PUBLICA**: `publish()` crea activo en ventana (`service:55-72`); audiencia `GLOBAL` si Super Admin, si no `TEAM`; auditoría con actor+newValues (`:72`) |
| `PATCH :id` (edición) | SUPERVISOR, SUPER_ADMIN | Edita título/mensaje/vigencia con auditoría antes/después (`:80-92`); alcance por `createdById` salvo Super Admin |
| `POST/DELETE :id/flyer` | SUPERVISOR, SUPER_ADMIN | PNG/JPEG/WebP ≤2 MB guardado como data-URL (`service:94-121`); auditoría |
| `DELETE :id` | SUPERVISOR, SUPER_ADMIN | borrado |
| `PATCH :id/withdraw` | SUPERVISOR, SUPER_ADMIN | `isActive: false` + auditoría (`service:123-133`) |

- **Sin estado borrador**: no existe «preparar sin publicar» — el diseño lo llama «adaptación pendiente» (**IP** `DISENO-COMERCIAL:131`: «El módulo actual publica al crear: separar borrador y publicación es una adaptación pendiente»).
- **Acciones solo por rol**: ningún endpoint del módulo lleva `@Permissions`; la validación por concesión (`commercialPromotions:*`) no existe todavía (D5 heredado).
- **Frontend `features/promotions/` (existe):** `PromotionManagerPage`, `promotions.service`, `SalesPromotionsPanel` (ruta `/sales/promotions` vía `SalesLayout.tsx:90`, **IP** COMPARACION:33), `PromotionGallery`.
- **`src/backend/src/modules/storefront/banners.service.ts`: FALTA** — readPath de la ficha ausente (solo worktree L Windows, inaccesible; confirmado con `find` → vacío). **No se reimplementa** (bloqueo documentado, patrón IMP-01 §2).
- **Slider público:** lista de imágenes en `HomeHero.tsx` (**IP** COMPARACION:61) — módulo `storefront` fuera de los writePaths de COM-08; el módulo de avisos **no tiene ninguna ruta** hacia él ni hacia precios (verificado: el service solo toca `salesPromotion` y `auditLog`).

## 3. Campos y estados (PROP)

| Concepto | PROP | Base |
|---|---|---|
| Estado | `borrador` (preparado, NO visible) → `publicado` (ventana+audiencia) → `retirado`; «preparar no publica» (regla 3). Implementación mínima: `publishedAt DateTime?` (null = borrador) conservando `isActive` y la ventana actual — decisión técnica reversible registrada en el paso backend | `DISENO:131`; esquema actual solo `isActive`+ventana (OBS §2) |
| Publicación | Acción `commercialPromotions:publish` **explícita e independiente** de `create`/`edit` (endpoint nuevo o flag que lo exija) | catálogo `:103` ya existe |
| Audiencia | `GLOBAL`/`TEAM` existente; visible solo para autorizados (lectura actual ya filtra — conservar) | `service:39-40` |
| Fechas | `startsAt`/`endsAt` con validación actual (fin > inicio > ahora al crear) — conservar; vencido = no visible | `service:57-59` |
| Piezas | flyer con validación actual (≤2 MB) | `service:94-121` |
| Límites | Aviso interno **≠** banner público **≠** descuento (regla 2): este módulo jamás escribe en `storefront`/slider/precios — sin rutas nuevas hacia ellos | regla 2; §2 |

## 4. Acciones y alcance (PROP)

Catálogo YA definido (OBS `access-catalog.ts:92,101-104`): `commercialPromotions:read|create|edit|publish|withdraw`, todos con dependencia `read` y scopes `own|team|global`; paquetes: Vendedor recibe `read(own)`; Gestión comercial `read/create/edit/publish/withdraw(team)` (COM-01 §3.1). El backend valida por concesión con `resolveAccess`+grants (patrón COM-02..05) **sin quitar las capas de rol todavía** (transición D5, patrón COM-04/COM-05): con grants presentes manda la concesión; legados sin grants conservan la capa rol jerárquica. «Retirar exige permiso» = `commercialPromotions:withdraw` verificado por acción, no solo por rol.

## 5. Casos de paquete (los 3 textuales) y su acreditación

| # | Caso (ficha) | Acreditación prevista (PROP) |
|---|---|---|
| 5.1 | «Aviso vencido/de otro equipo no aparece.» | Specs con fixtures: (a) vencido (`endsAt` pasado) fuera de `GET` — el filtro existe (`service:39`) y se acredita con prueba nueva; (b) aviso `TEAM` de otro equipo/otros ancestros no aparece para un vendedor ajeno; (c) con concesiones, sin `commercialPromotions:read` la lectura no entrega avisos (403 o vacío — elegir y documentar en backend; patrón «omitir bloque» de COM-05 si aplica a listas). |
| 5.2 | «Editor sin publicar no activa; retirada exige permiso.» | (a) crear → **borrador**: `GET` público/panel NO lo lista; (b) `publish` con `commercialPromotions:publish` → visible; sin ella → **403**; (c) `withdraw` sin `commercialPromotions:withdraw` → **403** y el aviso sigue activo; (d) editar un borrador no lo publica (regla 3). |
| 5.3 | «Aviso interno no cambia slider ni precios públicos.» | Spec de no-impacto: el service de avisos no invoca módulos de precios/storefront (aislamiento por estructura + prueba de que `GET /api/public/*` y precios no cambian tras crear/publicar/retirar un aviso en e2e). Slider (`HomeHero.tsx`) y precios quedan fuera de writePaths — se comprueba por `git status` al final del backend. |

## 6. Errores (PROP)

`401` sesión · `400` fechas/pieza inválidas (validación actual conservada) · `403` acción sin concesión o fuera de alcance · `404` aviso inexistente/ajeno (ocultar existencia, patrón actual `NotFoundException`) · `409` si la transición de estado inválida lo requiere (patrón COM-03 F7).

### 6.1 Errores (OBS del patrón actual)

`BadRequestException` fechas (`service:59,84`), flyer ≤2 MB (`:110`), `NotFound` por `updateMany` sin match (`:105,130`), auditoría obligatoria en cada mutación.

## 7. Incrementos posteriores registrados (fichas textuales)

**Aceptación idéntica en backend y frontend:** los 3 casos de §5.

| Incremento | WritePaths (ficha) |
|---|---|
| **COM-08 `backend`** | `modules/promotions/**`, `prisma/schema.prisma`, `prisma/migrations/**`, `app.module.ts`(+spec), `access-catalog.ts`(+spec) |
| **COM-08 `frontend`** | `features/promotions/**`, `App.tsx`(+spec) |

**Solape:** `access-catalog.ts` (COM-01/CAT-01/COM-02..05 lo tocaron — entradas de `commercialPromotions` YA existen, no reescribir); `App.tsx` (rutas de COM-01/04/05); `storefront/HomeHero` **fuera de writePaths** (refuerza 5.3); `schema.prisma` compartido con CAT-*/COM-* (migración propia con timestamp, solo estructura, `prisma generate` obligatorio, BD desechable con URL inline).

## 8. Decisiones pendientes y bloqueos

| # | Decisión | Estado |
|---|---|---|
| J1 | Modelo del borrador: `publishedAt` vs enum `status` (§3 propone `publishedAt` por minimalismo) | Pendiente técnica del paso `backend` (reversible) |
| J2 | Comportamiento de lectura SIN `commercialPromotions:read` (403 vs lista vacía) | Pendiente de elegir en backend (patrón COM-05) |
| J3 | Capa de concesiones vs capa rol (D5) — ¿se sustituye `@Roles` del módulo o se añade concesión encima (transición)? | **Pendiente coordinador (D5)**; patrón transitorio permitido |
| B-L | `banners.service.ts` + `PageConfigurationPage.tsx` (L) | **Bloqueado** — fuente exacta registrada (§2); NO reimplementar |
| D5/E6 | Guards y revalidación JWT | Heredadas |
| B1-B4 | Yéminus/Excel/descuentos | Heredados (no aplican directamente aquí; descuentos ≠ avisos) |

## 9. Criterios de aceptación del paso

1. ✅ Contrato consistente con dependencias (`BASE-01` aceptado; `BASE-02`/`COM-01` registrados) y decisiones pendientes explícitas (§8).
2. ✅ Incrementos registrados con objetivo/archivos/aceptación antes de delegar código (§7 con fichas textuales).
3. Reglas 1-3 aterrizadas: §2 (reconciliación con el módulo existente, sin recrear), §3/§4 (acciones separadas, preparar no publica), §3 (aviso ≠ banner ≠ descuento).
4. Advertencia modalidad: PROP para auditoría; QA-01 del coordinador.

## 10. Evidencia reproducible

```bash
node docs/ejecucion-paneles/preparar-tanda.mjs COM-08 contrato
rg -n "@Roles|@Permissions" src/backend/src/modules/promotions/promotions.controller.ts   # solo @Roles
rg -n "isActive: true, startsAt|audience" src/backend/src/modules/promotions/promotions.service.ts  # :39-40
rg -n "commercialPromotions" src/backend/src/common/security/access-catalog.ts             # :92,101-104
find . -name 'banners.service*' -not -path '*/node_modules/*'                              # vacío (FALTA-L)
```
