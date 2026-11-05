# Handoff 2026-11-04: tienda pública de Grupo Security

Estado: trabajo de los días 2026-11-03 y 2026-11-04, sin commit (todo figura como modificado o sin seguimiento en `git status`). Líneas verificadas el 2026-11-04 leyendo cada archivo en esta sesión; otros agentes siguen editando, así que releer antes de citar. Lo no comprobado se marca «[no verificado]». Sin contraseñas ni tokens en este documento.

Rutas relativas a la raíz del worktree `validacion-biblioteca`. Prefijo `F` = `src/frontend/src/features/storefront`, prefijo `P` = `src/frontend/src/features/customer-portal`.

## 1. Resumen

- Stack: React 18.3.1, TypeScript 5.9.3, Vite 6.4.3, Tailwind 3.4.19, react-router-dom 7.18.4 (versiones instaladas en `src/frontend/node_modules`). Pruebas con vitest 5.0.3 en entorno node (`src/frontend/vite.config.ts` no declara bloque `test`): se renderiza con `renderToStaticMarkup` de `react-dom/server` dentro de `MemoryRouter`; no hay jsdom.
- Hay una plantilla común (`StorefrontChrome`: cabecera única, `AccountMenu`, pie oscuro, botón flotante de WhatsApp) que usan la portada, el catálogo, las páginas de servicios, las institucionales, login, registro y el portal de clientes.
- Páginas nuevas (sin seguimiento en git): `/servicios`, `/servicios/proyectos`, `/servicios/soporte`, `/servicios/soporte/configurar`, `/servicios/certificaciones`, `/soluciones`, `/nosotros`, `/sedes`, `/garantias`.
- Verificación del 2026-11-04 (sección 9): `tsc` sin errores, `eslint` sin avisos, `vitest` 29 archivos y 299 pruebas pasadas.
- Hallazgos que contradicen `docs/MAPA-TIENDA-PUBLICA.md` (sección 11): el NIT demo y los correos `.example` ya no existen en el código; `ProductShelf` sí está en uso; el registro de clientes crea la cuenta activa, sin aprobación.
- El documento `docs/handoffs/2026-11-04-marketing-banners-y-paneles.md` no existe en este worktree al redactar [no verificado si existe en otro worktree]. El héroe de la portada integra `HeroBanner` y `CampaignPopup` (pertenecen al panel de Marketing); remitir a ese documento cuando exista.

## 2. Mapa de archivos

| Ruta | Líneas | Qué hace |
|---|---|---|
| `F/components/StorefrontChrome.tsx` | 1-151 | Plantilla común: cabecera, navegación, buscador, `AccountMenu`, pie, WhatsApp flotante |
| `F/components/AccountMenu.tsx` | 1-121 | Menú «Mi cuenta»; detecta sesión del cliente |
| `F/components/StorefrontFooter.tsx` | 1-184 | Pie oscuro compacto; columnas como datos |
| `F/components/PageIntro.tsx` | 1-56 | Banda roja con migas, h1 y frase |
| `F/components/ServiceCard.tsx` | 1-56 | Tarjeta con icono, texto y acción (interna o externa) |
| `F/components/mega-menu/CategoryMenuContainer.tsx` | 1-148 | Disparador «Catálogo» y región del mega menú |
| `F/components/mega-menu/CategorySidebar.tsx` | 1-116 | Lista de familias (escritorio) y `CategoryIcon` |
| `F/components/mega-menu/MobileCategoryDrawer.tsx` | 1-194 | Cajón móvil con dos pasos |
| `F/components/mega-menu/menu-model.ts` | 4-82 | `CATEGORY_ROUTE`, `PRODUCT_ROUTE`, `MENU_PANEL_ID`, `categoryHref`, `navigableRoots`, etc. |
| `F/pages/StorefrontHome.tsx` | 1-253 | Portada |
| `F/pages/ServicesPage.tsx` | 1-80 | Hub de servicios |
| `F/pages/ProjectsPage.tsx` | 1-118 | Asesoría para proyectos |
| `F/pages/SupportPage.tsx` | 1-126 | Soporte técnico |
| `F/pages/ConfigureEquipmentPage.tsx` | 1-94 | Configurar un equipo (mensaje de WhatsApp) |
| `F/pages/CertificationsPage.tsx` | 1-85 | Certificaciones HCSA Hikvision |
| `F/pages/SolutionsPage.tsx` | 1-67 | Soluciones por necesidad |
| `F/pages/AboutPage.tsx` | 1-108 | Nosotros |
| `F/pages/BranchesPage.tsx` | 1-79 | Sedes |
| `F/pages/WarrantyPage.tsx` | 1-222 | Garantías y devoluciones |
| `F/pages/ClientLoginPage.tsx` | 1-13 | Inicio de sesión de clientes |
| `F/pages/AccessRequestPage.tsx` | 1-13 | Registro de clientes |
| `F/constants/contact.ts` | 1-30 | WhatsApp y mensajes |
| `F/constants/branches.ts` | 1-69 | Sedes, teléfonos, horarios |
| `F/constants/home-catalog.ts` | 1-58 | Estantes y categorías de la portada |
| `F/hooks/useDocumentTitle.ts` | 1-14 | Título de la pestaña |
| `F/hooks/useStorefrontCampaigns.ts` | 1-127 | Campañas del héroe y pop-up (Marketing) |
| `src/frontend/src/App.tsx` | 184-206 | Rutas públicas |
| `P/pages/CustomerAccountPage.tsx` | 1-28 | `CustomerPortalShell` y página de cuenta |
| `P/pages/ClientCatalogPage.tsx` | 1-11 | Catálogo con sesión |
| `P/pages/PortalProductDetailPage.tsx` | 1-14 | Ficha de producto (privada y pública) |
| `P/pages/PortalAccountsAdminPage.tsx` | 1-18 | Administración interna de cuentas y escalafones |
| `src/frontend/src/services/customer-portal.service.ts` | 1-77 | Llamadas HTTP del portal |
| `src/frontend/src/stores/customer-portal-auth.store.ts` | 1-16 | Estado zustand de la cuenta |
| `src/backend/src/modules/customer-portal/customer-portal.controller.ts` | 40-136 | Endpoints del portal |
| `src/backend/src/modules/customer-portal/customer-portal.service.ts` | 32-48 | `register` |
| `src/frontend/public/documentos/` | 3 PDF | Política de garantías, formulario de cambio, portafolio |
| `src/frontend/tailwind.config.js` | 9-101 | Tokens |

El mapa `docs/MAPA-TIENDA-PUBLICA.md` es la fuente de rutas y decisiones; este documento no lo duplica.

## 3. Plantilla común

### 3.1 `StorefrontChrome` (`F/components/StorefrontChrome.tsx`)

| Prop | Tipo | Líneas | Efecto |
|---|---|---|---|
| `children` | `React.ReactNode` | 8 | Contenido entre cabecera y pie |
| `home` | `boolean`, por defecto `false` | 9, 43 | Marca «Catálogo» como activo (47) y apaga el buscador por defecto |
| `search` | `boolean` opcional | 11, 44 | `showSearch = search ?? !home`; `search={false}` oculta el buscador |

Estructura:

- Cabecera única (50-134), sin barra roja. Logo enlazado a `/tienda` (52-67), con `/logo-grupo-security.webp` en pantallas ≥ 1024 px y `/logo-grupo-security.png` en las demás.
- `<nav aria-label="Tienda">` (69-91): «Catálogo ▾» es el botón de `CategoryMenuContainer` (73-82), no un enlace; «Soluciones» va a `/soluciones` (83); «Soporte» va a `/servicios/soporte` (87). `/servicios` no está en la navegación; se llega desde el pie y desde enlaces internos.
- Estilos de navegación: `NAV_ITEM`, `NAV_ITEM_ACTIVE`, `NAV_ITEM_IDLE` (24-27). El activo usa `border-security-600` y 3 px de subrayado.
- Buscador (96-129): formulario `GET /catalogo/buscar` con campo `q`; el envío navega por SPA (100-109) y conserva `action`/`method` para funcionar sin JavaScript. Si `showSearch` es falso se pinta un espaciador flexible (92-94).
- `AccountMenu` (131).
- `{children}` (135), `StorefrontFooter` (136).
- Botón flotante de WhatsApp (137-148): `href={whatsappUrl()}`, clases `fixed bottom-5 right-5 z-50`, color `#25D366`. Acoplamiento: `F/hooks/useStorefrontCampaigns.ts:80` oculta `a.fixed.bottom-5.right-5` en la vista previa del panel de Marketing; cambiar esas clases rompe esa vista previa.
- La plantilla no pinta `<main>`: cada página pone el suyo (verificado en `StorefrontChrome.spec.tsx`, prueba «no agrega un <main> propio»).

Regla del buscador: `/clientes/login` y `/clientes/registro` pasan `search={false}` (`ClientLoginPage.tsx:12`, `AccessRequestPage.tsx:10`) porque el regreso es el enlace «← Volver a la tienda»; la portada tampoco lo muestra porque su héroe ya tiene buscador (`StorefrontHome.tsx:60-82`). Decisión registrada en `docs/MAPA-TIENDA-PUBLICA.md` §3. Cubierto por `client-access-pages.spec.tsx` (prueba «no muestra el buscador en la cabecera»).

Regla del `!` en colores de enlace: `src/frontend/src/index.css:112-118` define `a { color: var(--color-primary) }` y `a:hover` dentro de `@layer base`. Para que una utilidad de color gane sobre un `<a>` hay que escribirla con `!`: `!text-white`, `!text-security-600`, `hover:!text-white`, `!text-storefront-ink` (ejemplos: `StorefrontChrome.tsx:26-27`, `StorefrontFooter.tsx:90-91`, `ServiceCard.tsx:17`, `PageIntro.tsx:31`). Sin `!`, el enlace se pinta con el color global.

### 3.2 `AccountMenu` (`F/components/AccountMenu.tsx`)

- Siempre muestra el botón «Mi cuenta» (84) con un panel `#storefront-account-menu` que permanece en el DOM con `hidden` mientras está cerrado (86-90). Cierra con clic fuera y con Escape (51-68).
- Detección de sesión (28-44): `useContext(QueryClientContext)` (29). Sin `QueryClientProvider` se pinta la vista de visitante (30). Con provider, `SessionAccountMenu` llama a `useCustomerPortalSession()` (34), definido en `P/hooks/useCustomerPortal.ts:5-13`: consulta `['customer-portal','session']` con `getPortalSession` (`src/frontend/src/services/customer-portal.service.ts:55-58`, `GET /api/customer-portal/auth/me` con cookie `withCredentials`), `retry: false`, `staleTime: 0`, `refetchInterval: 30_000`.
- `signedIn = session.isSuccess && Boolean(session.data) && !session.isError` (38): sin parpadeo mientras carga.
- Con sesión: «Mi portal» (`/clientes`, 93) y «Salir» (96-106). «Salir» ejecuta `useCustomerPortalLogout` (`POST /api/customer-portal/auth/logout`), luego `navigate('/')` (39-42). Sin sesión: «Ingresar» (`/clientes/login`, 110) y «Crear cuenta» (`/clientes/registro`, 113).
- Cubierto por `AccountMenu.spec.tsx`.

### 3.3 `StorefrontFooter` (`F/components/StorefrontFooter.tsx`)

- Pie oscuro `bg-storefront-ink`, compacto (`px-5 py-6`, 134). El comentario de cabecera (4) dice «light surface-100 background»: está desactualizado; el pie es oscuro. Prueba `StorefrontChrome.spec.tsx:93` también dice «pie claro» en el título.
- Datos: `COLUMNS` (17-45), `SOCIAL_LINKS` (48-54), tipo `FooterLink = { label; href?; external? }` (14).
- Regla: un enlace sin `href` no se pinta. `hasHref` (86-88); columnas y redes se filtran en 128-131 y una columna sin enlaces desaparece. Publicar una entrada = darle `href`.
- Estado de columnas hoy:

| Columna | Con `href` (se pinta) | Sin `href` (oculta) |
|---|---|---|
| Servicio al cliente | «Cambios y devoluciones» → `/garantias` | Preguntas frecuentes, Rastrea tu pedido, Centro de ayuda |
| Compañía | Sobre nosotros `/nosotros`; Sedes `/sedes`; Vende con nosotros → WhatsApp (`WHATSAPP_MESSAGES.sellWithUs`, externo) | Trabaja con nosotros, Mapa del sitio |
| Legal | Estatuto del consumidor → `https://www.sic.gov.co/` (externo) | Términos y condiciones, Política de protección de datos |
| Redes | WhatsApp | Facebook, Instagram, X, YouTube |

- Columna «Contacto» fija (140-156): enlace de WhatsApp con `WHATSAPP_MESSAGES.contact` y `SALES_PHONE_DISPLAY`.
- Fila inferior (158-180): `© {año actual} Grupo Security S.A.S.`; sin NIT.
- Colores: `LINK_COLOR` con `!text-white/80` (91). Cuadrícula según nº de columnas: `GRID_BY_COLUMNS` (96-102).

### 3.4 `PageIntro` y `ServiceCard`

`PageIntro` (`F/components/PageIntro.tsx:10-14`): `{ breadcrumbs: { label: string; to?: string }[]; title: string; description?: string }`. Banda `bg-security-600` (19); migas en `<nav aria-label="Ruta">` (21); el último ítem sin `to` lleva `aria-current="page"` (36); un solo `<h1>` (51); descripción con `max-w-[65ch]` (52).

`ServiceCard` (`F/components/ServiceCard.tsx:3-14`): `{ title; description; actionLabel; iconPath; highlight? }` más exactamente uno de `to` (ruta interna, `Link`) o `href` (externo, `target="_blank" rel="noopener noreferrer"`, 45-48). `iconPath` es el atributo `d` de un SVG de 24×24. `highlight` pone `border-security-600` (29). El título es `<h2>` (43). Clase de acción: `ACTION_CLASS` (16).

### 3.5 Mega menú (`F/components/mega-menu/`)

| Componente | Props | Líneas |
|---|---|---|
| `CategoryMenuContainer` | `triggerClassName: string`, `triggerContent: ReactNode` | 18-23 |
| `CategorySidebar` | `roots`, `selectedId`, `onSelect`, `onHover`, `onLeave`, `onKeyDown(key)`, `onNavigate` | 4-12 |
| `MobileCategoryDrawer` | `roots`, `selectedRoot`, `view`, `onOpenDetail`, `onBack`, `onClose`, `onNavigate` | 7-15 |

- `CategoryMenuContainer` carga el árbol con `useCategoryMenu()` (24), maneja estado con `createMegaMenuStore` (25), cierra con Escape (42-51) y al cambiar de ruta (58-63), y devuelve el foco al disparador (71-80). Región `id={MENU_PANEL_ID}` = `'category-mega-menu'` (`menu-model.ts:10`).
- `CategorySidebar`: enlace final «Ver todo el catálogo» a `/catalogo` (105-111). `CategoryIcon` usa el SVG como máscara (20-39).
- `MobileCategoryDrawer`: pantalla completa < `lg`; paso 1 lista familias (151-193), paso 2 columnas con `<details>` (64-148).
- Estos tres archivos aún tienen colores `text-security-500` y `bg-security-500` (ver 7.5).

## 4. Rutas (`src/frontend/src/App.tsx`)

Las rutas públicas están en 184-206. Los `import` están en 1-6 y 14-27.

| Ruta | Componente | Archivo | Línea |
|---|---|---|---|
| `/tienda` | `StorefrontHome` | `F/pages/StorefrontHome.tsx` | 188 |
| `/servicios` | `ServicesPage` | `F/pages/ServicesPage.tsx` | 193 |
| `/servicios/proyectos` | `ProjectsPage` | `F/pages/ProjectsPage.tsx` | 194 |
| `/servicios/soporte` | `SupportPage` | `F/pages/SupportPage.tsx` | 195 |
| `/servicios/soporte/configurar` | `ConfigureEquipmentPage` | `F/pages/ConfigureEquipmentPage.tsx` | 196 |
| `/servicios/certificaciones` | `CertificationsPage` | `F/pages/CertificationsPage.tsx` | 197 |
| `/soluciones` | `SolutionsPage` | `F/pages/SolutionsPage.tsx` | 189 |
| `/nosotros` | `AboutPage` | `F/pages/AboutPage.tsx` | 190 |
| `/sedes` | `BranchesPage` | `F/pages/BranchesPage.tsx` | 191 |
| `/garantias` | `WarrantyPage` | `F/pages/WarrantyPage.tsx` | 192 |
| `/catalogo` | `CatalogIndexPage` | `F/pages/CatalogIndexPage.tsx` | 198 |
| `/catalogo/categoria/:slug` | `CategoryPage` | `F/pages/CategoryPage.tsx` | 199 |
| `/catalogo/buscar` | `SearchResultsPage` | `F/pages/SearchResultsPage.tsx` | 200 |
| `/catalogo/productos/:id` | `ProductDetailRoute` | `src/frontend/src/features/products` (import línea 27) | 201 |
| `/productos/:slug` | `ProductDetailRoute` | ídem | 203 |
| `/clientes/login` | `ClientLoginPage` | `F/pages/ClientLoginPage.tsx` | 184 |
| `/clientes/registro` | `AccessRequestPage` | `F/pages/AccessRequestPage.tsx` | 185 |
| `/clientes/solicitar-acceso` | redirige a `/clientes/registro` | — | 186 |
| `/clientes` (índice) | `CustomerPortalShell` > `CustomerAccountPage` | `P/pages/CustomerAccountPage.tsx` | 187 |
| `/clientes/perfil` | `CustomerAccountPage profile` | ídem | 187 |
| `/clientes/productos` | `ClientCatalogPage` | `P/pages/ClientCatalogPage.tsx` | 187 |
| `/clientes/productos/:productId` | `PortalProductDetailPage privateCatalog` | `P/pages/PortalProductDetailPage.tsx` | 187 |
| `*` | redirige a `/tienda` | — | 206 |

Interna relacionada: `/customer-accounts` (dentro del layout administrativo, solo Super Admin) → `PortalAccountsAdminPage`, línea 154.

## 5. Páginas

Todas usan `StorefrontChrome`. Convención: `<PageIntro>` con migas que empiezan en «Inicio» → `/tienda`.

| Página | Estructura de `<main>` / `PageIntro` | Título de pestaña |
|---|---|---|
| `ServicesPage`, `ProjectsPage`, `CertificationsPage` | `PageIntro` dentro de `<main>` | `useDocumentTitle` |
| `SupportPage`, `ConfigureEquipmentPage`, `SolutionsPage`, `AboutPage`, `BranchesPage`, `WarrantyPage` | `PageIntro` fuera de `<main>`, antes de él | sin `useDocumentTitle` |

Inconsistencia: ambas estructuras tienen un solo `<main>` y un solo `<h1>` (lo exigen las pruebas), pero solo 4 páginas fijan el título de la pestaña (`ServicesPage`, `ProjectsPage`, `CertificationsPage`, `StorefrontHome`). `ConfigureEquipmentPage.tsx:31` no incluye «Inicio» en las migas.

### 5.1 `StorefrontHome` (`F/pages/StorefrontHome.tsx`)

Ver sección 11.4.

### 5.2 `ServicesPage` — `/servicios`

Propósito: hub. Secciones: `PageIntro` (19-23); tres `ServiceCard` (26-47): Proyectos, Soporte técnico (`highlight`), Certificaciones; banda «¿Acabas de comprar una cámara?» con botón a `/servicios/soporte/configurar` (49-65); enlace de descarga `/documentos/portafolio-servicios-2026.pdf` con `download` (68-74, el texto dice «PDF, 15 MB»). Datos: texto fijo en el componente. Enlaces externos: ninguno. Spec: `service-pages.spec.tsx`.

### 5.3 `ProjectsPage` — `/servicios/proyectos`

Propósito: describir el proceso y cotizar. Secciones: `PageIntro` (31-39); texto institucional (41-64); lista ordenada `STEPS` de 4 pasos (6-23, render 65-83; nota: la prueba dice «tres pasos numerados» pero hay cuatro entradas, ver `service-pages.spec.tsx:74`); «Innovación y futuro» (84-94); botón «Cotizar por WhatsApp» con `WHATSAPP_MESSAGES.projects` (95-113). Textos copiados del sitio anterior (según comentarios del mapa) [no verificado el origen exacto]. Spec: `service-pages.spec.tsx`.

### 5.4 `SupportPage` — `/servicios/soporte`

Propósito: separar tres caminos. Secciones: tres `ServiceCard` (22-43): configurar (`/servicios/soporte/configurar`), diagnóstico (`/sedes`), garantías (`/garantias`); «Nuestro soporte» (45-71); PSTAH Hikvision con pasos de ingreso por garantía (72-109); banda «¿No sabes cuál elegir?» (110-122). Enlaces externos: ninguno. Spec: `support-pages.spec.tsx`.

### 5.5 `ConfigureEquipmentPage` — `/servicios/soporte/configurar`

Propósito: armar un mensaje de WhatsApp. `CONFIGURE_OPTIONS` exportado (8-13: `connect`, `firmware`, `password`, `other`, cada uno con `id`, `label`, `need`); `READY_ITEMS` (15-19). Estado `selectedId` (24); el mensaje sale de `configureSupportMessage(selected.need)` (26) y se muestra en `data-testid="configure-message"` (72) y en `whatsappUrl(message)` (76). Radios accesibles con `peer` (43-58). Spec: `support-pages.spec.tsx`.

### 5.6 `CertificationsPage` — `/servicios/certificaciones`

`CERTIFICATIONS_MESSAGE` (7), `TOPICS` (9: CCTV, Sistema de alarmas, Intercomunicaciones, Control de acceso, Hik-Central). Secciones 27-70; botón «Pedir fechas por WhatsApp» (62-69). Fechas y cupos no se publican (se piden por WhatsApp). Spec: `service-pages.spec.tsx` (prueba «no envía al sitio anterior»).

### 5.7 `SolutionsPage` — `/soluciones`

Cuatro tarjetas por necesidad (25-52) que llevan a búsquedas del catálogo con `searchUrl(q)` (13): `cámara`, `alarma`, `control de acceso`, `switch`. Párrafo a `/servicios/proyectos` (54-63). Los términos son búsqueda por texto, no categorías [la existencia de resultados depende del catálogo publicado]. Spec: `institutional-pages.spec.tsx` (describe «soluciones»).

### 5.8 `AboutPage` — `/nosotros`

Quiénes somos, Misión, Visión (22-60), cuatro `ServiceCard` «Cómo te respaldamos» (63-91), sección «Cuatro sedes» generada con `BRANCHES.map(city)` (92-104). Spec: `institutional-pages.spec.tsx` (describe «nosotros»: no inventa cifras ni testimonios).

### 5.9 `BranchesPage` — `/sedes`

- Una tarjeta por sede (20-51): ciudad (22), `<address>` (23), teléfono opcional con enlace `tel:` (24-29), horario opcional como `<dl>` (30-39), «Cómo llegar» a Google Maps (40-49). Cierre con enlace a `/garantias` y botón de WhatsApp (53-75).
- `F/constants/branches.ts`: tipo `BranchHours { days; hours }` (12-17); `Branch { city; address; phone?; schedule? }` (19-27); `BRANCHES` (29-54); helpers `formatBranchPhone` (57), `branchPhoneHref` → `tel:+57…` (62), `branchDirectionsUrl` → `https://www.google.com/maps/search/?api=1&query=…` (67).
- Direcciones: tomadas de `https://gruposecurity.co/contacto/` (verificado el 2026-11-03 según el comentario, líneas 1-3). Teléfonos y horarios: de la ficha pública de Google Maps de cada sede, consultada el 2026-11-04; NO confirmados por el negocio. Armenia mostraba una segunda tabla contradictoria (8 a. m.–5 p. m. sin descanso); se usó la tabla principal (comentario, 5-8).

| Sede | Dirección | Teléfono (`phone`) | Lun a vie | Sáb | Dom |
|---|---|---|---|---|---|
| Pereira | Calle 16 #5-38 Pereira, Risaralda | 316 027 5100 (`3160275100`) | 8:30 a. m.–5 p. m. | 8:30 a. m.–12 p. m. | Cerrado |
| Armenia | Calle 22 #14-02, Armenia, Quindío | 310 708 6360 (`3107086360`) | 8 a. m.–12 p. m. y 1:30–5 p. m. | 8:30 a. m.–12 p. m. | Cerrado |
| Manizales | Cra. 25 # 68-63 Palermo Manizales, Caldas | 310 708 4994 (`3107084994`) | 8 a. m.–12:30 p. m. y 2–5 p. m. | 8:30 a. m.–12 p. m. | Cerrado |
| Cali | Cra. 8 #18-2, Centro, Cali, Valle del Cauca | 317 365 3489 (`3173653489`) | 8:30 a. m.–12 p. m. y 1–5 p. m. | 8:30 a. m.–12:30 p. m. | Cerrado |

Nota: el teléfono de Pereira coincide con el número de WhatsApp de ventas (`SALES_WHATSAPP_NUMBER`). Spec: `institutional-pages.spec.tsx` (describe «sedes»: dirección, URL del mapa, teléfono y horario propios de cada sede).

### 5.10 `WarrantyPage` — `/garantias`

- Los PDF viven en `src/frontend/public/documentos/` y se sirven desde `/documentos/`: `politica-garantias-cambios-devolucion.pdf` y `formulario-cambio-mercancia.pdf` (constantes exportadas `WARRANTY_POLICY_PDF`, `EXCHANGE_FORM_PDF`, líneas 7-8; copiados del sitio anterior el 2026-11-03 según el comentario, línea 6). `portafolio-servicios-2026.pdf` está en la misma carpeta (usado por `ServicesPage`). La carpeta no tiene seguimiento en git.
- La política completa está en la propia página: `SECTIONS` (24-129), 11 secciones (Definiciones, Garantía, Aspectos incluidos…, Constancias, Cuándo no aplica, Retracto, Casos sin retracto, Política de cambio, Devoluciones, Producto dañado) renderizadas en 184-208; botones de descarga (151-158); tarjetas a soporte, sedes y formulario (160-183, la tercera con `href` al PDF).
- El contenido jurídico es copia del documento oficial; no reescribir. Spec: `institutional-pages.spec.tsx` (describe «garantías»: aloja la política y los PDF, sin enviar al sitio anterior).

### 5.11 `ClientLoginPage` — `/clientes/login`

`F/pages/ClientLoginPage.tsx:1-13`. `react-hook-form` (`useForm<LoginForm>`, 9). Envío: `useCustomerPortalLogin().mutate({email,password})` (12). Tras éxito navega a `returnTo` si empieza con `/clientes/` y no con `//`, si no a `/clientes` (11). Error genérico (12). `search={false}`. Spec: `client-access-pages.spec.tsx`.

### 5.12 `AccessRequestPage` — `/clientes/registro`

Ver sección 7.2.

### 5.13 Enlaces externos y TODO

- Enlaces externos que quedan: WhatsApp (`wa.me`) en varios sitios; `https://www.sic.gov.co/` en el pie (`StorefrontFooter.tsx:42`); Google Maps en `BranchesPage`; ningún enlace a `gruposecurity.co`.
- TODO: no hay marcas `TODO` en estos archivos [no verificado con búsqueda exhaustiva]. Pendientes reales: sección 12.

## 6. Constantes y datos

### 6.1 `F/constants/contact.ts`

| Símbolo | Línea | Valor / forma |
|---|---|---|
| `SALES_WHATSAPP_NUMBER` | 10 | `'573160275100'` |
| `SALES_PHONE_DISPLAY` | 11 | `'316 027 5100'` |
| `WHATSAPP_MESSAGES` | 14-19 | `contact`, `projects`, `wholesale`, `sellWithUs` (`as const`) |
| `configureSupportMessage(need)` | 22-24 | «Hola, compré una cámara en Grupo Security y necesito {need}.\nReferencia: [escribe la referencia]\nFactura o pedido: [escribe el número]» |
| `whatsappUrl(message?)` | 27-30 | `https://wa.me/${número}` + `?text=` codificado |

Estado de los datos: el comentario del archivo (7-9) dice que el número es el del botón de WhatsApp de gruposecurity.co. El usuario indicó que los valores DEMO siguen pendientes de datos reales; el número no está confirmado en esta sesión [no verificado]. Un solo número atiende todo (ventas y soporte). El comentario del pie (`StorefrontFooter.tsx:11`) aún dice «DEMO values».

### 6.2 `F/constants/branches.ts`

Ver 5.9.

### 6.3 `F/constants/home-catalog.ts`

- `HomeShelf { slug; title }` (8-12). `HOME_SHELF_LIMIT = 4` (15). `HOME_SHELVES` (17-22): `camaras`, `alarmas`, `control-de-acceso`, `casa-inteligente`. `HOME_OTHER_CATEGORIES` (25-30): `redes-y-wi-fi`, `energia-y-electricidad`, `audio-y-perifoneo`, `parqueaderos`. `HOME_CATEGORY_TILE_LIMIT = 8` (33), `HomeBrand`, `HOME_BRANDS` (45-53), `brandSearchHref` (56-58).
- Constancia: el 2026-11-04 la sesión de portada dejó un error de sintaxis en este archivo; se corrigió quitando las líneas sobrantes. Al releerlo hoy el archivo está bien formado y `tsc` pasa.
- Usos: `StorefrontHome.tsx:9` importa `HOME_OTHER_CATEGORIES` y `HOME_SHELVES`; `ProductShelf.tsx:2` importa `HOME_SHELF_LIMIT`. `HOME_CATEGORY_TILE_LIMIT`, `HOME_BRANDS` y `brandSearchHref` solo los usa `BrandsStrip` (sin importadores) o nadie.

## 7. Cuenta de clientes

### 7.1 Mapa de lo que existe

| Pieza | Archivo | Estado |
|---|---|---|
| Cabecera de cuenta y portal | `P/pages/CustomerAccountPage.tsx:16-23` (`CustomerPortalShell`) | En uso; una sola plantilla y un solo `<main>` (22) |
| Cuenta / Mis datos | `P/pages/CustomerAccountPage.tsx:24-28` | En uso |
| Catálogo con sesión | `P/pages/ClientCatalogPage.tsx` | En uso |
| Ficha privada | `P/pages/PortalProductDetailPage.tsx:13` | En uso con `privateCatalog`; la rama pública (`PublicDetail`, 12) no tiene ruta |
| Componentes de catálogo | `P/components/CatalogViews.tsx` | En uso por `ClientCatalogPage` |
| Hooks | `P/hooks/useCustomerPortal.ts`, `P/hooks/useCatalog.ts` | En uso |
| Estado | `src/frontend/src/stores/customer-portal-auth.store.ts` | En uso |
| Admin de escalafones | `P/pages/PortalAccountsAdminPage.tsx` | En uso (`App.tsx:154`), solo Super Admin |
| `ClientProtectedRoute.tsx` | `P/components/` | Sin importadores |
| `PortalApprovalQueue.tsx` | `P/components/` | Sin importadores |
| `pages/CatalogPage.tsx` | `P/pages/` | Sin importadores ni ruta |

`CustomerPortalShell` (`CustomerAccountPage.tsx:16-23`): sincroniza la cuenta con el store (18); mientras comprueba muestra «Comprobando tu cuenta…» (19); si falla la sesión redirige a `/clientes/login` (20); con sesión muestra nombre, «Cerrar sesión» (`window.location.assign('/clientes/login')`) y navegación «Mi cuenta / Catálogo / Mis datos» (22).

### 7.2 Flujo de registro (automático; verificado en código)

1. `AccessRequestPage.tsx:10-12`: formulario con campos `contactName`, `companyName`, `email`, `documentId` (opcional), `phone` (opcional), `password` (mínimo 12), `confirm`. Valida coincidencia de contraseñas en el cliente.
2. Llama a `registerPortalAccount(data)` (`customer-portal.service.ts:45-48`): `POST /api/customer-portal/accounts/register`.
3. Endpoint: `CustomerPortalController.register` (`customer-portal.controller.ts:55-59`), público, limitado a 10 por minuto, responde 201. DTO `RegisterPortalAccountDto` (`dto/register-portal-account.dto.ts`): email válido, contraseña 12-128, `contactName` 2-120, `companyName` 2-160, `documentId` 3-40, `phone` 7-30.
4. Servicio `CustomerPortalService.register` (`customer-portal.service.ts:32-48`): normaliza el correo, rechaza duplicados con 409 (35, 45), guarda el hash `bcrypt` (coste 12) y crea el `PortalAccount` con `type: FINAL_CUSTOMER` y `state: ACTIVE` (41), ignorando cualquier `type` enviado. No vincula NIT con clientes existentes ni asigna escalafón. Respuesta: «Cuenta creada. Ya puedes ingresar como cliente final.» (43).
5. El cliente web inicia sesión de inmediato con `loginPortal` y va a `/clientes` (`AccessRequestPage.tsx:10`). Si el login falla tras crear la cuenta, muestra «Tu cuenta ya fue creada. Inicia sesión para continuar.».
6. Login (`customer-portal.service.ts:108-123`): `POST /api/customer-portal/auth/login`, 5 por minuto; cookie `customer_access_token`, `httpOnly`, `sameSite: 'strict'`, `secure` en producción (`controller.ts:67`); sesión de 8 h por defecto (`PORTAL_SESSION_HOURS`).
7. Sin aprobación de ningún empleado. Estados `PENDING` y `REJECTED` siguen existiendo (`prisma/schema.prisma:1324-1328`; el valor por defecto del modelo es `PENDING`, línea 1217, pero `register` lo sobreescribe) y las rutas admin de aprobar y rechazar siguen en el backend (`controller.ts:96-112`) sin pantalla que las use (`PortalApprovalQueue` sin importadores). Prueba que fija el comportamiento: `customer-portal.service.spec.ts:33-56`.

### 7.3 Qué ve el cliente con sesión

Menú «Mi cuenta» → «Mi portal» y «Salir». En `/clientes`: saludo con su nombre, su empresa, su clasificación (`tier.name`, o «Instalador»/«Cliente final») y dos tarjetas (catálogo, datos) (`CustomerAccountPage.tsx:24-28`). En `/clientes/productos`: catálogo con precios de su tarifa o «Solicita cotización» (`ClientCatalogPage.tsx:10`, `CatalogViews.tsx:19`).

### 7.4 Decisión abierta

¿El registro debe requerir aprobación de un empleado? Hoy es automático. Cambiarlo toca base de datos y backend (crear con `PENDING`, pantalla de cola, aviso al cliente); exige aprobación del usuario y no está hecho. La infraestructura de aprobación existe en backend.

### 7.5 Restos de estilo antiguo (`slate-*`, `#CE0203` literales)

| Archivo:línea | Resto |
|---|---|
| `P/pages/PortalAccountsAdminPage.tsx:17` | `slate-500` (5 veces), también `rounded-lg`, `text-red-700` |
| `P/components/ClientProtectedRoute.tsx:13` | `slate-600` (sin uso) |
| `P/components/CatalogViews.tsx:11` | coincidencia `slate-` por `hover:-translate-y-0.5` [falso positivo probable] |
| `P/pages/CatalogPage.tsx:12` | `slate-*` y `#CE0203` (sin uso) |
| `P/pages/customer-portal-shell.spec.tsx:89` | cadena `slate-` en una aserción |
| `F/components/HomeHero.tsx:19,100` | `slate-` (sin uso) |
| `F/components/CoverageSelector.tsx:55,61,68,82` | `slate-` y `#CE0203` (sin uso) |

También: `security-500` usado como color de texto/fondo en `mega-menu/CategorySidebar.tsx:88,98` y `MobileCategoryDrawer.tsx:71,100` (el mapa pide `security-600` para acciones).

## 8. Librerías (`src/frontend/package.json`; instalada entre paréntesis)

| Librería | Rango | Uso aquí |
|---|---|---|
| react / react-dom | ^18.3.0 (18.3.1) | UI; `react-dom/server` en las pruebas |
| react-router-dom | ^7.18.3 (7.18.4) | Rutas, `Link`, `MemoryRouter` en pruebas |
| react-router | ^7.18.3 | Dependencia del anterior |
| @tanstack/react-query | ^5.60.0 (5.104.1) | Sesión del portal, categorías, productos |
| react-hook-form | ^7.53.0 (7.89.0) | Formulario de login |
| axios | ^1.7.0 (1.20.0) | `portalApi` (`customer-portal.service.ts:4-8`) |
| zustand | ^5.0.0 (5.0.15) | Store de la cuenta del portal |
| tailwindcss | ^3.4.0 (3.4.19) | Estilos; tokens en `tailwind.config.js` |
| vite | ^6.0.0 (6.4.3) | Compilación |
| vitest | ^5.0.1 (5.0.3) | Pruebas |
| typescript | ^5.6.0 (5.9.3) | Tipos |
| eslint, typescript-eslint | ^9.13.0 / ^8.11.0 | Lint |
| @base-ui/react, xlsx, agentation | — | Sin uso en la tienda pública [no verificado] |

Tokens (`tailwind.config.js`): `security-500` `#CE0203` (17), `security-600` `#AD0102` (18), `surface-50…300` (30-33), `ink-400…900` (36-40), `storefront.ink` `#1A1A1A` (45), radios `rounded-control` 0.625rem, `rounded-panel`, `rounded-card` 1rem (98-100). Fuente Roboto (76).

## 9. Verificación

Comandos corridos el 2026-11-04 desde `src/frontend`:

| Comando | Resultado real |
|---|---|
| `npx tsc -b --noEmit` | salida vacía, código 0, 68 s |
| `npx eslint src/features/storefront src/features/customer-portal` | salida vacía, código 0 |
| `npx vitest run src/features/storefront src/features/customer-portal` | 29 archivos de prueba pasados, 299 pruebas pasadas, 33 s; código 0 |

Specs (qué cubren):

| Spec | Cubre |
|---|---|
| `components/StorefrontChrome.spec.tsx` | sin barra roja, navegación Catálogo/Soluciones/Soporte, buscador solo en interiores, un solo `<main>` ausente en la plantilla, pie, WhatsApp |
| `components/AccountMenu.spec.tsx` | menú cerrado, visitante, con sesión precargada, sin `QueryClientProvider` |
| `components/StorefrontFooter.spec.tsx` | columnas con enlaces reales, rutas internas, WhatsApp, sin NIT inventado, redes ocultas |
| `components/PageIntro.spec.tsx`, `ServiceCard.spec.tsx` | h1 único, migas, `to`/`href`, `highlight` |
| `components/mega-menu/mega-menu.spec.tsx` | modelo, store, escritorio, estados, cajón móvil, integración con el disparador |
| `components/campaign-components.spec.tsx` | `HeroBanner` y pop-up (Marketing) |
| `components/PublicProductCard.spec.tsx` | tarjeta de producto |
| `components/home-components.spec.tsx` | `CategoryShopTiles` (sin uso) y `ProductShelfView` (en uso) |
| `components/CoverageSelector.spec.tsx`, `FeaturedSolutionsSection.spec.tsx`, `StorefrontSalesChannels.spec.tsx` | componentes sin uso |
| `pages/storefront-home.spec.tsx` | portada: buscador, confianza, mosaicos, banners, «qué proteger», estantes, sedes, servicios, accesos internos |
| `pages/service-pages.spec.tsx` | Servicios, Proyectos, Certificaciones |
| `pages/support-pages.spec.tsx` | Soporte, Configurar, `configureSupportMessage` |
| `pages/institutional-pages.spec.tsx` | Soluciones, Nosotros, Sedes (teléfono y horario por sede), Garantías |
| `pages/client-access-pages.spec.tsx` | login y registro en la plantilla, sin buscador, sin colores sueltos, campos y restricciones |
| `pages/catalog-index-page.spec.tsx`, `category-page.spec.tsx`, `search-results-page.spec.tsx` | catálogo, categoría, búsqueda |
| `hooks/useCategoryMenu.spec.ts`, `utils/*.spec.ts` | hook de categorías y utilidades (precio, títulos, campañas, etc.) |
| `P/pages/customer-portal-shell.spec.tsx` | portal: un `<main>`, un `<h1>`, plantilla, estados de carga y error |

Nota: los 29 archivos incluyen specs de componentes sin uso, por lo que borrarlos exige borrar su spec. No se corrieron pruebas del backend ni `vite build`.

## 10. Recetas

### 10.1 Añadir una página interior

1. Crear `F/pages/NuevaPage.tsx`:

```tsx
import PageIntro from '../components/PageIntro'
import StorefrontChrome from '../components/StorefrontChrome'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function NuevaPage() {
  useDocumentTitle('Nueva | Grupo Security')
  return (
    <StorefrontChrome>
      <main className="text-storefront-ink">
        <PageIntro breadcrumbs={[{ label: 'Inicio', to: '/tienda' }, { label: 'Nueva' }]} title="Nueva" description="Frase corta." />
        <div className="mx-auto max-w-[105rem] px-5 py-8 sm:px-8 lg:px-12">{/* contenido */}</div>
      </main>
    </StorefrontChrome>
  )
}
```

2. Importarla y añadir `<Route path="/nueva" element={<NuevaPage />} />` antes del comodín `*` (`App.tsx:206`).
3. Un solo `<h1>` (lo pone `PageIntro`) y un solo `<main>`. Objetivos táctiles de 44 px (`min-h-11`/`min-h-12`).
4. Añadir una prueba (10.4) y, si procede, un enlace en el pie (10.2).

### 10.2 Añadir un enlace al pie

En `StorefrontFooter.tsx`, editar `COLUMNS` (17-45): añadir `{ label, href: '/ruta' }`, o dar `href` a una entrada existente sin él. Si es externo, `external: true`. Actualizar `StorefrontFooter.spec.tsx` (prueba «no enlaza a rutas que no existen» lista las rutas válidas).

### 10.3 Añadir una sede o cambiar horario/teléfono

Editar `BRANCHES` en `F/constants/branches.ts:29-54`: objeto `{ city, address, phone?: '3XXXXXXXXX' (10 dígitos), schedule?: [{ days, hours }] }`. Se muestran solas en `/sedes`, `/nosotros`, y la portada (`StorefrontHome.tsx:233`). Actualizar los textos fijos «cuatro sedes» y las listas de ciudades en `ProjectsPage`, `AboutPage:26`, `SupportPage:88`, `StorefrontHome.tsx:17` y `AboutPage:93` (título «Cuatro sedes»). Actualizar `institutional-pages.spec.tsx` (esperados por sede).

### 10.4 Escribir una prueba con `renderToStaticMarkup`

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import NuevaPage from './NuevaPage'

const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/nueva'] }, createElement(NuevaPage)))
describe('nueva', () => {
  it('tiene un solo <main> y un solo <h1>', () => {
    expect(html.split('<main').length - 1).toBe(1)
    expect(html.split('<h1').length - 1).toBe(1)
  })
})
```

Si la página usa `useQuery`, envolver en `QueryClientProvider` con `new QueryClient()` (ver `client-access-pages.spec.tsx:15-23`). Los efectos no corren en el render estático: no se prueba interacción. Las pruebas de páginas exigen sin `slate-` ni `#CE0203`.

### 10.5 Evitar los problemas conocidos

| Problema | Cómo evitarlo |
|---|---|
| Un `<a>` o `Link` sale rojo o con otro color | Usar `!text-…` y `hover:!text-…` (3.1) |
| Buscador de cabecera aparece donde no debe | Pasar `search={false}` a `StorefrontChrome` |
| Entrada del pie que no lleva a ninguna parte | No darle `href`: no se pinta |
| Dos `<main>` | La plantilla no pone `<main>`; el portal lo pone en `CustomerPortalShell` (`CustomerAccountPage.tsx:22`) |
| Vista previa de Marketing con botón de WhatsApp encima | No cambiar `fixed bottom-5 right-5` sin revisar `useStorefrontCampaigns.ts:80` |

## 11. Riesgos y deuda

### 11.1 Mapa desactualizado (`docs/MAPA-TIENDA-PUBLICA.md`)

| Sección del mapa | Dice | Código hoy |
|---|---|---|
| §5 (línea 66) | «NIT 900.000.000-0 (demo)» en `StorefrontFooter.tsx` y correo `serviciocliente@gruposecurity.example` | Búsqueda en `src/frontend/src`: no existen ni el NIT ni ese correo. El pie no muestra NIT |
| §6 (línea 70) | `ProductShelf` sin importadores | `StorefrontHome.tsx:4,187` lo usa; no borrarlo |
| §2 (línea 22) | `<main>` dentro de `<main>` en la ficha privada | `PortalProductDetailPage.tsx:13` no pinta `<main>`; la prueba del shell lo exige |
| §2 (línea 16) | portada con «tres accesos» | La portada hoy tiene franja de confianza, mosaicos, banners y estantes (11.4) |

### 11.2 Código muerto (verificado con búsqueda de importaciones el 2026-11-04)

| Archivo | Importado por | Veredicto |
|---|---|---|
| `F/components/HomeHero.tsx` | nadie (ni pruebas) | sin uso |
| `F/components/StorefrontSalesChannels.tsx` | solo su spec | sin uso |
| `F/components/FeaturedSolutionsSection.tsx` (+ `fixtures/featured-solutions.ts`, `types/featuredSolution.ts`) | solo su spec | sin uso |
| `F/components/BrandsStrip.tsx` | nadie | sin uso (arrastra `HOME_BRANDS`, `brandSearchHref`) |
| `F/components/CategoryShopTiles.tsx` | solo `home-components.spec.tsx` | sin uso |
| `F/components/CoverageSelector.tsx` | solo su spec | sin uso |
| `P/pages/CatalogPage.tsx` | nadie | sin uso |
| `P/components/ClientProtectedRoute.tsx`, `P/components/PortalApprovalQueue.tsx` | nadie | sin uso (no estaban en la lista del mapa) |
| `F/components/ProductShelf.tsx` | `StorefrontHome.tsx:4` | EN USO |
| `F/components/PublicProductGrid.tsx`, `PublicProductCard.tsx`, `ProductMedia.tsx` | catálogo, categoría, búsqueda, estante | EN USO |

La limpieza general la hará el usuario cuando avise; no se hizo. Las menciones a `HomeHero` en `features/promotions/*.spec.tsx` son aserciones de texto, no importaciones.

### 11.3 Otros riesgos

- Datos de contacto: el número de WhatsApp y los teléfonos/horarios de sedes no están confirmados por el negocio (6.1, 5.9). Pereira repite el número de ventas.
- Revisión móvil pendiente (el usuario la pidió para después). Las pruebas no miden 375 px.
- La Biblioteca de la demo no tiene productos publicados: los estantes de la portada salen vacíos (se ocultan) y las búsquedas de Soluciones pueden no devolver nada.
- Sin `useDocumentTitle` en 8 páginas (5).
- Comentario obsoleto en `StorefrontFooter.tsx:4` y título de prueba `StorefrontChrome.spec.tsx:93` («pie claro»).
- `ProjectsPage`: prueba dice «tres pasos», hay cuatro entradas.
- Sin commit: todo el trabajo está solo en el árbol de trabajo.
- `PortalAccountsAdminPage` usa estilos antiguos (7.5).

### 11.4 Portada

Estado actual de `F/pages/StorefrontHome.tsx`: héroe rojo con buscador y WhatsApp (54-93) que integra `HeroBanner campaigns={campaigns.hero}` (92) y `CampaignPopup popup={campaigns.popup}` (94); datos de `useStorefrontCampaigns()` (49). Después: franja de confianza `TRUST` (13-18, render 96-110); mosaicos con foto `CATEGORY_TILES` (20-25, render 112-143, usa `/images/home/storefront-art.png` como sprite con `backgroundPosition`); «¿Qué quieres proteger?» `PROTECT` (32-36, render 145-168); banners de marca `BRAND_BANNERS` (27-30, render 170-183, imágenes `/images/home/banner-hikvision-distribuidor.png` y `banner-ezviz-nuevas.png`); estantes `ProductShelf` por `HOME_SHELVES` (185-189); «Más categorías» (191-211); servicios `services` (38-42, render 213-227: `/servicios/proyectos`, `/servicios/soporte`, `/servicios/certificaciones`); sedes y WhatsApp (229-249). Para `HeroBanner` y `CampaignPopup` ver `docs/handoffs/2026-11-04-marketing-banners-y-paneles.md` (no presente al redactar).

## 12. Pendientes

1. Confirmar con el negocio: número de WhatsApp, teléfonos y horarios de sedes, correo de servicio al cliente, NIT si se publica.
2. Decidir el registro con aprobación (7.4).
3. Limpieza de código muerto (11.2) cuando el usuario avise; borrar con sus specs.
4. Quitar restos `slate-*`/`#CE0203` de `PortalAccountsAdminPage` y alinear `security-500` → `security-600` en el mega menú (7.5).
5. Revisión móvil (375 px) de todas las páginas nuevas.
6. Publicar productos en la Biblioteca de la demo para validar los estantes.
7. Páginas del pie sin crear: Términos, Protección de datos, Preguntas frecuentes, Centro de ayuda; redes sociales sin URL oficial.
8. Añadir `useDocumentTitle` a las páginas que no lo tienen.
9. Actualizar `docs/MAPA-TIENDA-PUBLICA.md` según 11.1.
10. Commit, push y despliegue: requieren aprobación explícita (`AGENTS.md`).

## 13. Ideas (revisión de https://gsp.com.co/, mayorista competidor)

La lectura de sus páginas interiores fue por resúmenes automáticos, no del HTML [no verificado].

1. Dos WhatsApp, Ventas y Soporte, con mensajes precargados (hoy un solo número; `WHATSAPP_MESSAGES` ya permite mensajes por tema).
2. Lista de cotización en lugar de carrito, enviada por WhatsApp.
3. Páginas por marca.
4. Calendario de capacitaciones/eventos con inscripción (hoy las fechas se piden por WhatsApp en `CertificationsPage`).
5. Señales de confianza reales (premios y certificaciones por marca); solo datos verificados (ya exigido por `storefront-home.spec.tsx`, describe «portada: confianza»).

No copiar: portada oscura con animación larga, textos de relleno, URLs de categoría sin sentido, «Acceder a mi cuenta» repetido.
