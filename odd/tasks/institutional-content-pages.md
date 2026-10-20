# ODD — Contenido institucional de la vitrina (páginas en base de datos)

## Objetivo

Migrar el **contenido institucional** del sitio real `https://gruposecurity.co` a la web en
desarrollo, de forma **editable desde el panel** (opción B: páginas en base de datos), y
renderizarlo en la tienda pública. **Fuera de alcance:** catálogo comercial y lista de precios.

## Problema / por qué

La tienda pública ya está construida (`src/frontend/src/features/storefront/`) pero el
contenido institucional (Nosotros, Servicios, Soluciones, Contacto, secciones del home) **no
tiene casa**: hoy no existen esas páginas, y lo que existe está hardcodeado o en fixtures
temporales. El usuario aprobó (2026-10-13) la vía **B**: páginas persistidas en PostgreSQL y
administradas desde el panel, alineadas con el **Panel 4 — Configuración de la página y
promociones → Editor de contenido** (`docs/PROPUESTA-ARBOL-PANELES-2026-10-13.md`).

## Alcance autorizado

- Extraer y normalizar el contenido institucional del sitio real (sin precios).
- Modelo `ContentPage` en Prisma + migración + módulo NestJS (CRUD admin Super Admin + lectura pública).
- Editor en el panel (Super Admin) + ruta + ítem de navegación.
- Páginas públicas del storefront para el contenido (Nosotros, Servicios, Soluciones, Contacto).
- Datos reales de contacto y sedes (rellenar `StorefrontSettings` + `CoverageSelector`).
- Secciones del home institucional (copy, marcas, destacados) alineadas al contenido real.

**No autorizado:** tocar catálogo/productos/tarifas, crear nuevas herramientas de flujo, desplegar.

## Restricciones

- Cambios mínimos; seguir patrones existentes (ver `brands/`, `public-categories.controller.ts`,
  `CommercialSettingsPage.tsx`, `StorefrontChrome`).
- Sin secretos/PII reales en el repo (AGENTS.md). Datos de contacto del sitio público == datos
  comerciales publicados; aun así, no inventar ni hardcodear credenciales.
- Todo local; nada a producción sin autorización humana.
- `RolesGuard` NO es global: aplicarlo explícitamente en el controlador admin; `@Public()`
  solo exime del `JwtAuthGuard` global.
- Respuestas envueltas en `{ data }` (TransformInterceptor); el cliente `api.ts` pela una capa.

## Entorno (resuelto)

- **Rama actual:** `feat/storefront-public-pricing` (NO es la rama por defecto). No se hace push/PR/merge.
- **Árbol sucio (preexistente, ajeno a esta tarea):** `src/backend/src/modules/storefront/` (untracked),
  `prisma/migrations/20261007120000_customer_access/` (untracked), `schema.prisma`, `app.module.ts`,
  `products.module.ts`, `public-products.controller.ts`, `HomeHero.tsx` (modificados), docs de hoy.
  → **Bloquea commits limpios.** Resolver base antes de commitear esta tarea.
- **Modo TDD:** no hay marcador/config explícito en el repo → se asume **DESACTIVADO**. Verificación
  funcional: backend `npm test` (jest) y lint/typecheck; frontend `npm run test` (vitest) y lint/build.
  (Si el usuario quiere TDD estricto, activarlo explícitamente.)
- **Estrategia de entrega:** `ask-on-risk`. Pronóstico > ~400 líneas cambiadas → preguntar estrategia
  de cadena (stacked-to-main | feature-branch-chain) antes del commit que cruce el presupuesto.

## Checklist

- [ ] **T1 — Extraer contenido institucional del sitio real** (sin precios) a
      `src/backend/prisma/seeds/data/institutional-pages.json`. Páginas: home (secciones, marcas,
      sedes, estadísticas), Nosotros + políticas (garantías/devoluciones, términos de promociones),
      Servicios (PSTAH, Soporte Técnico, Certificaciones, Desarrollo de Proyectos), Soluciones,
      Contacto. Texto fiel, con URL de origen; marcar lo ausente; NO inventar.
- [ ] **T2 — Backend: modelo `ContentPage` + migración** en `schema.prisma` (`uuid`, `slug` único,
      `title`, `excerpt?`, `body @db.Text`, `isPublished`, `sortOrder`, timestamps, `@@map`).
      Migración `add_content_pages`.
- [ ] **T3 — Backend: módulo `content-pages`** — CRUD admin (`api/content-pages`, `RolesGuard` +
      `@Roles('Super Admin')`) y lectura pública (`api/public/content-pages`, `@Public()` + `@Throttle`).
      DTOs con class-validator. Registro en `app.module.ts`. Specs (jest).
- [ ] **T4 — Frontend admin: editor de contenido** — `ContentPagesPage.tsx` (tabla + modal +
      react-query) al patrón `CommercialSettingsPage`; `services/content-pages.service.ts`; ruta en
      `App.tsx`; ítem de navegación en `Header.tsx` (solo Super Admin).
- [ ] **T5 — Vitrina pública: renderizar páginas** — `ContentPageView.tsx` dentro de
      `StorefrontChrome`; `services/public-content.service.ts` + hook; rutas públicas en `App.tsx`
      (`/nosotros`, `/servicios`, `/soluciones`, `/contacto`); enlazar en `StorefrontFooter.tsx`.
- [ ] **T6 — Contacto y sedes reales** — rellenar `StorefrontSettings` (supportEmail, whatsapp,
      hours, about, privacy, terms, warranty) y `CoverageSelector` con las sedes reales
      (Armenia, Cali, Manizales, Pereira); renderizar en la vitrina.
- [ ] **T7 — Cargar el contenido en la base** (seed/import desde el JSON de T1) y verificar render
      end-to-end local.
- [ ] **T8 — Home institucional** — alinear copy, franja de marcas, destacados y estadísticas del
      home al contenido real (evaluar si va a datos o a constantes).

## Criterios de aceptación

- El contenido institucional institucional del sitio real está representado en la app y es visible
  en la tienda pública local.
- El Super Admin puede crear/editar/publicar páginas de contenido desde el panel.
- Contacto y sedes reales se muestran en la vitrina.
- Lint + typecheck + tests pertinentes en verde; sin tocar catálogo/tarifas.
- Sin secretos/PII no autorizados en el repo.

## Progreso y evidencia

- 2026-10-13 — Documento creado. Exploración completa (mapa de origen de contenido del storefront;
  patrones backend/frontend). Pendiente resolver base limpia para commits. Nada implementado aún.

## Siguiente paso

T1: extracción del contenido institucional. Luego T2 (modelo + migración).
