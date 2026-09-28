# Feature: storefront-homecenter-parity

## Objective
Llevar el storefront público al nivel de completitud de Homecenter (https://www.homecenter.com.co/homecenter-co/): home con vitrina y tiles de categoría, búsqueda funcional, footer completo, canales de venta, selector de cobertura y dropdown de cuenta.

## Problem / Why
Coordinador pidió copiar de Homecenter lo que falte. Estado actual del storefront (rama `worktree/pagina-pp`): mega menú de categorías (e720dbd), landing de categoría `/catalogo/categoria/:slug` (510f2b0), fotos reales de tiles (ac70b3e), `StorefrontChrome` con topbar/header/search decorativo y footer de una sola línea. La home pública no existe, la búsqueda no navega a resultados, el footer no da seriedad comercial.

## Authorized scope (coordinador: "implementa todas para yo verlas, delega el trabajo a los diferentes agentes")
- [x] **HOM-01** — Página de inicio de tienda `/tienda`: hero vitrina, fila de botones de categoría con las fotos reales (reutilizar `useCategoryMenu` + tiles de MENU-07), secciones temáticas (marcas destacadas / ofertas / novedades con datos demo). Route en `App.tsx`; logo del header → `/tienda`.
- [x] **HOM-02** — Búsqueda funcional: página de resultados `/catalogo/buscar?q=...`. Explorar y elegir el camino más pequeño correcto: preferir endpoint público de lectura mínima `GET api/public/products?q=` (solo publicados, límite de paginación); si resulta demasiado amplio, buscar categorías vía el menú existente. Conectar el input del header (navegar con submit).
- [x] **HOM-03** — Footer completo: columnas de enlaces (Servicio al cliente, Medios de pago, Cambios y devoluciones, Términos, Mapa del sitio), contacto (teléfonos demo, email demo), redes sociales (íconos), info legal (NIT demo, estatuto del consumidor). Reemplazar el footer de una línea en `StorefrontChrome`.
- [x] **HOM-04** — Canales de venta: sección de servicios con íconos (WhatsApp, venta telefónica, proyectos, al por mayor) + botón flotante de WhatsApp en `StorefrontChrome`. Números demo (sin PII real).
- [x] **HOM-05** — Selector de cobertura: dropdown en header "Ciudades de cobertura" con lista estática demo (componente, sin backend).
- [x] **HOM-06** — Dropdown "Mi Cuenta": opciones (Ingresar, Crear cuenta, Rastrea tu pedido) en el header.

## Constraints
- Reglas AGENTS.md: sin secretos/PII real en Git (datos demo en componentes/fixtures), cambios mínimos, validación antes de "terminado" (lint + typecheck + vitest pertinentes).
- Sin push ni PR sin autorización explícita.
- Trabajar en la rama `worktree/pagina-pp` (no es la default; contiene la cadena mega-menu).
- Un work-unit commit por tarea, Conventional Commit, sin trailer de IA.
- Tareas que tocan `App.tsx`/`StorefrontChrome` en secuencia para evitar conflictos entre escritores.

## Route declarations
- Ruta elegida: **delegated direct** — un writer agent por tarea, a petición explícita del coordinador ("delega el trabajo a los diferentes agentes"). Trigger evidence: writer trigger (cada tarea toca 2+ archivos no triviales) + instrucción explícita del usuario.
- TDD: **OFF** — fuente: patrón establecido en la feature mega-menu-categorias (MENU-01..07, writer agents sin RED/GREEN); runner: Vitest (frontend), Jest (backend). Se corren checks funcionales y specs pertinentes por tarea, no RED obligatorio.
- Estrategia de entrega: **feature-branch-chain** (establecida en esta rama para la feature anterior con consentimiento del coordinador). Forecast de líneas autoradas: ~900–1100 → supera ~400 → chain aplicado; commits apilados en `worktree/pagina-pp`; PR slicing solo a petición del usuario.

## Acceptance criteria
- HOM-01: `/tienda` renderiza hero, fila de categorías con fotos y secciones; logo navega a `/tienda`; lint+typecheck+vitest pasan.
- HOM-02: submit del buscador navega a `/catalogo/buscar?q=...`; resultados visibles (productos o categorías); estado vacío/sin conexión manejado.
- HOM-03: footer con columnas de enlaces + contacto + redes + legal; reemplaza la línea actual.
- HOM-04: sección de canales visible en `/tienda` + botón flotante de WhatsApp en el chrome.
- HOM-05: dropdown de cobertura funcional en header (desktop y mobile).
- HOM-06: dropdown de cuenta funcional en header con las 3 opciones.

## Progress
- 2026-09-25: feature creada; inicio de HOM-01.
- 2026-09-25: HOM-01 completada — commit `dc54246` `feat(storefront): add home page with vitrina and category tiles` (8 archivos, +685/-2). Typecheck OK, storefront 70/70 tests, lint con solo warnings preexistentes ajenos. RDD: assess medium/687 → slice_budget_reached → review concedido (consent del coordinador, RDD ON global) → lente review-reliability sin hallazgos → acknowledge aprobado. Running count: 685.
- 2026-09-26: HOM-03 completada (reconciliada en esta sesión; la sesión previa no actualizó este documento) — commit `f73db00` `feat(storefront): add full footer with links and contact` (3 archivos, +256/-1: StorefrontFooter.tsx, StorefrontFooter.spec.tsx, integración en StorefrontChrome). Footer Homecenter-style: 4 columnas responsivas (Servicio al cliente, Compañía, Legal, Contacto), contacto demo, © + NIT demo + 5 íconos SVG sociales. Enlaces internos `<a href>` con destino previsto (rutas aún no existen; swap a `Link` documentado en el componente). TDD OFF, checks funcionales OK.
- Running count of authored changed lines (work-unit commits): 2275 (685 + 833 + 256 + 188 + 159 + 156)
- 2026-09-26: HOM-04 completada — commit `da09fc5` `feat(storefront): add sales channels section and floating WhatsApp button` (5 archivos, +188: StorefrontSalesChannels.tsx + spec, botón flotante en StorefrontChrome, sección en StorefrontHome + aserción en storefront-home.spec). 4 canales demo (WhatsApp `wa.me/576011234567` externo, tel `+5761234567`, `/proyectos` y `/ventas-al-por-mayor` internos con `<a>`), botón flotante fixed bottom-right z-50 `#25D366`. TDD OFF, tsc OK, vitest 136/136 (9 archivos), lint con baseline intacto (2 errores / 9 warnings preexistentes).

- 2026-09-26: HOM-05 completada — commit `9365c9f` `feat(storefront): add city coverage selector to header` (3 archivos, +159: CoverageSelector.tsx, CoverageSelector.spec.tsx, integración en StorefrontChrome). Dropdown Homecenter-style en el header row (después del buscador, antes de Mi Cuenta — el topbar es desktop-only): disparador con pin + "Ciudades de cobertura" o la ciudad elegida, 8 ciudades demo (Bogotá, Medellín, Cali, Barranquilla, Bucaramanga, Pereira, Manizales, Cartagena), a11y (aria-haspopup/aria-expanded, listbox oculto siempre en DOM, Escape y click-outside cierran). TDD OFF, tsc OK, vitest 141/141 (10 archivos), lint baseline intacto (2 errores / 9 warnings).

- 2026-09-26: HOM-06 completada — commit `5449ecb` `feat(storefront): add Mi Cuenta dropdown to header` (3 archivos, +154/-2: AccountMenu.tsx, AccountMenu.spec.tsx, integración en StorefrontChrome). Dropdown Homecenter-style en el header row después del CoverageSelector: disparador con ícono de usuario + "Mi Cuenta", 3 opciones (Ingresar → `/login` con `Link`, ruta existente App.tsx; Crear cuenta → `/crear-cuenta` y Rastrea tu pedido → `/rastrea-tu-pedido` con `<a href>`, rutas aún no existen, consistente con el footer HOM-03), a11y (aria-haspopup="menu"/aria-expanded, menú oculto siempre en DOM, Escape y click-outside cierran). Reemplazó el link "Mi Cuenta" (`/clientes/login`) y el botón independiente "Crear cuenta" (`/clientes/solicitar-acceso`) — duplicaban las opciones del dropdown con destinos distintos. Specs con `MemoryRouter` (el `Link` interno lo exige). TDD OFF, tsc OK, vitest 145/145 (11 archivos), lint baseline intacto (2 errores / 9 warnings).

## Verification evidence
- HOM-01: commit dc54246150d473f7df27132576b91437a553cc26; vitest storefront 70/70; tsc --noEmit OK; review review-reliability aprobado sin hallazgos (lineage review-52af9aeef24f2e80).
- HOM-02: commit 7fbe7e0 (13 archivos, +833/-7); endpoint público GET api/public/products (PUBLISHED, sin precios, límite 24-50); jest 8/8, vitest 123/123; curl pendiente en ambiente del coordinador; review review-reliability aprobado (1 SUGGESTION cosmético) + acknowledge (lineage review-ce78aebc40f684a0).
- HOM-03: commit f73db00612bc4d8db4b82ce878e4a84b301c2edc; spec StorefrontFooter (columnas, enlaces, externo SIC, contacto demo, copyright, íconos); lint/tsc OK en sesión previa; re-verificado en esta sesión: tsc --noEmit OK, vitest 130/130 (8 archivos).
- HOM-04: commit da09fc53a5ea58523b6a38315284245c1ad297bb; spec StorefrontSalesChannels (4 canales, títulos, hrefs demo, externo wa.me con target/rel, 4 íconos h-6 w-6) + aserción de integración en storefront-home.spec; tsc --noEmit OK, vitest 136/136 (9 archivos), eslint 2 errores / 9 warnings = baseline documentado sin desviaciones.
- HOM-05: commit 9365c9f3ef9a6b46d12060641f02a1ac4ed66cc0; spec CoverageSelector (disparador con pin/etiqueta y aria, ciudades demo declaradas en listbox oculto, ciudad elegida vía defaultCity, conteo aria-selected 1/7); interacción documentada como wiring (patrón mega-menu.spec); tsc --noEmit OK, vitest 141/141 (10 archivos), eslint 2 errores / 9 warnings = baseline intacto.
- HOM-06: commit 5449ecb2c5b93c42fcb662127d430fdc4b5f5dbb; spec AccountMenu (disparador con ícono/etiqueta y aria-haspopup="menu", 3 opciones declaradas en menú oculto, hrefs `/login`, `/crear-cuenta`, `/rastrea-tu-pedido`, menú oculto cerrado); render dentro de `MemoryRouter` (convención mega-menu.spec para `Link` interno); tsc --noEmit OK, vitest 145/145 (11 archivos, re-verificado en esta sesión), eslint 2 errores / 9 warnings = baseline intacto.

## Next step
- Feature storefront-homecenter-parity completa (HOM-01..06, commits dc54246, 7fbe7e0, f73db00, da09fc5, 9365c9f, 5449ecb).
- 2026-09-26: PUSH a origin autorizado por el coordinador ("si hazlo, para yo ensayarlo") — fast-forward `ac70b3e..5449ecb` `worktree/pagina-pp -> main`, verificado en origin/main. PR slicing no requerido (entrega única a main).

## Ajustes aceptados del coordinador (2026-09-27)
- **Logo restablecido**: `logo-grupo-security.webp` nunca se commiteó (solo el `.png`); el `<picture>` del chrome lo referencia para ≥1024px, así que en desktop el logo se veía roto en el worktree. Copiado desde el árbol principal a `src/frontend/public/` (sin commit aún, pendiente autorización).
- **Slider de fotos** (reemplaza el hero estático de `hero-vitrina.svg`): replica el banner slider de la web anterior gruposecurity.co — 2 banners 1500x400 descargados a `public/images/home/` (`banner-hikvision-distribuidor.png`, `banner-ezviz-nuevas.png`), autoplay 5 s, pausa al hover, flechas adentro, paginación de puntos abajo, sin overlay de texto (el mensaje va en las imágenes). Componente `HeroSlider` en `StorefrontHome.tsx` sin librería de carrusel (timer + track con translate, convención de FeaturedCategoryRow). `h1` sr-only conservado para a11y.
- **Selector de ciudades retirado del header** (HOM-05): `CoverageSelector` quitado de `StorefrontChrome.tsx` (import + uso). Los archivos del componente y su spec permanecen (posible reuso futuro).
- Verificación: vitest storefront 103/103 (9 archivos), `tsc --noEmit` OK, eslint sin desviaciones del baseline. Cambio sin commit — pendiente autorización del coordinador para commitear.
