# Web local unificada (2026-11-23)

Carpeta: `.claude/worktrees/sad-golick-8a6b22` (rama `Esnaider/sad-golick-8a6b22`, base `main` = `bce9b1d1`). Nada está en commit.

## Qué entró de cada fuente

| Fuente | Qué trae | Cómo entró |
| --- | --- | --- |
| `main` (`bce9b1d1`) | Incluye ya los PR #97, #98, #99 (publicación masiva de fichas) y #100 (búsqueda exacta/prefijo). | Base del worktree. |
| `integracion-tienda-recuperacion` (sin commit) | Catálogo por marca/cámaras, menú, recuperación de contraseña, Better Auth + Google, perfil del portal, política de privacidad, migraciones `20261119120000`, `20261120090000`, `20261120130000`, handoffs y `odd/tasks`. | `git diff` aplicado + archivos nuevos copiados (`customer-portal/`, `portal-auth/`, páginas `ClientForgot/Reset…`, `PrivacyPolicyPage`, etc.). |
| `Esnaider/bold-kirch-bb1685` (2 commits + sin commit) | Scroll al inicio (`ScrollToTop`), footer sin «Vende con nosotros», texto neutro de soporte en la portada, menú de categorías con fotos (`CategoryDetailPanel`, `menu-images.ts`, `public/images/menu/*`). | `git diff bce9b1d1` aplicado salvo 4 archivos del menú, resueltos a mano (abajo). |
| PR #99 (`Esnaider/practical-chaplygin-cca608` / `feat/biblioteca-publicacion-masiva`) | Publicación masiva en Biblioteca → Fichas. | Ya estaba en `main`; no hubo que traer nada. |
| `optimistic-roentgen-d4c7d7` (fichas pendientes primero, sin commit) | Filtros de fichas pendientes. | **Fuera**: no es de las sesiones pedidas; se puede sumar si se pide. |
| banners / cuenta-clientes / páginas institucionales | Sin ramas propias con trabajo de hoy (carpetas ya no existen o sin cambios). Lo de cuenta de clientes vive en `integracion-tienda-recuperacion`. | Fuera / ya cubierto. |
| Ramas Codex ya integradas, `validacion-biblioteca`, `friendly-yalow`, `musing-bhabha` | Trabajo no relacionado o ya contenido. | Fuera. |

## Conflictos resueltos (menú de categorías)

Ambas ramas tocaron `mega-menu/`. Se conservaron las dos intenciones:

- Diseño de `bold-kirch`: panel con fotos (`CategoryDetailPanel`), `MegaMenu.tsx` suyo, `SubcategoryColumns.tsx` eliminado, `navigableRoots` = raíces con productos (con o sin hijas).
- Lógica de integración: `categoryNodeHref` (las subcategorías persistidas enlazan a `?tipo=`), usado ahora también en `CategoryDetailPanel`; `featuredTiles` ignora nodos sin productos.
- `mega-menu.spec.tsx`: base de `bold-kirch` + prueba de `categoryNodeHref`; los nodos destacados del helper llevan 1 producto.

## Verificación observada

- `tsc --noEmit` frontend y backend: sin errores.
- ESLint (zonas tocadas): 0 errores, 2 avisos preexistentes (`Login.tsx`, `portal-auth.service.ts`).
- Vitest (storefront, customer-portal, services, App, components): todo en verde tras el ajuste del spec del menú.
- Jest (customer-portal, categories, products/public): 25 suites, 314 pruebas en verde.

## Cómo está corriendo

- Web: http://127.0.0.1:5181 (la tienda está en `/catalogo`; la raíz `/` muestra el login del panel).
- API local: puerto 3010 (`src/backend/dist/src/main`, modo `legacy` de Biblioteca = misma BD).
- Túnel SSH solo de puente: `127.0.0.1:55432 -> 172.18.0.2:5432` (contenedor `gs-db`), base `grupo_security`.
- `src/backend/.env` (ignorado por git): `DATABASE_URL` de producción vía túnel, secretos locales aleatorios, sin SMTP, sin Google.
- Todo lo que se haga aquí se guarda en datos reales.

## Cómo detenerlo y dónde seguir editando

- Se sigue editando en esta carpeta/sesión. El frontend corre con Vite en el 5181: los cambios de `src/frontend` se ven al guardar.
- El backend corre desde `dist` en el 3010: los cambios de `src/backend` exigen recompilar y reiniciar.
- Para detener: Vite 5181, API 3010 y túnel SSH 55432. NO cerrar 4173, 3000 ni 4175 (son de otras sesiones).
- Nada está en commit ni en main.

## Diferencia con producción

- Producción corre código de `feat/integracion-tienda-recuperacion` desplegado desde local, no de `main`.
- Esta carpeta añade encima el menú con fotos y el pie sin «Vende con nosotros».
- Un deploy automático desde `main` no incluiría nada de esto hasta que haya commit y PR.

## Limitaciones

- Producción solo tiene aplicada la migración `20261119120000_portal_password_resets`. Faltan `20261120090000_portal_auth_better_auth` y `20261120130000_portal_account_rules`: Better Auth / Google y las reglas de cuenta no funcionarán contra esa base hasta que se migre (no se migró).
- `MFA_ENCRYPTION_KEY` es local, no la de producción: el personal con MFA activo no podrá iniciar sesión en el panel (Biblioteca).
