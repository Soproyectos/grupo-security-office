# Handoff: Catálogo Comercial (public storefront)

## Overview
Public B2B storefront for Grupo Security S.A.S.: homepage (hero, category tiles, product vitrinas, promo banners), client login, and a "Solicitar acceso" account-request form. The goal is prospects browsing products and requesting a commercial account to unlock negotiated pricing.

## About the design files
The files in `design_files/` are **design references built in HTML/JSX** (a Babel-in-browser prototype) — they show intended look and behavior, not production code to drop in as-is. **Recreate these designs in the target codebase's existing stack** (React + TypeScript + Tailwind CSS + Vite, per `grupo-security-office/src/frontend`) using its established component patterns — do not literally import these `.jsx` files. Where this storefront doesn't yet exist as real routes/pages in the repo, create it following the repo's existing conventions (kebab-case files, `features/<domain>/` structure, `services/` for API calls).

## Fidelity
**High-fidelity.** All colors, spacing, radii and typography below are exact pixel/hex values — implement pixel-perfectly.

## Screens

### 1. Home (`screens/Home.jsx`)
- **Purpose**: storefront landing page.
- **Layout**: single column, full-bleed sections, no max-width container (matches mobile-first/PWA repo convention but this design is desktop, 1440px reference width).
- **Utility bar** (top strip): `background: #484748`, `color: #CBD5E1` on the row, but the 5 text items ("Línea de ventas: (6) 123 4567", "Rastrea tu pedido", "Centro de ayuda", "Distribuidor autorizado · marcas líderes en seguridad", "Vende con nosotros") are each `color: #FAFAFA`. `padding: 8px 48px`, `font-size: 12px`, `height: 29px`, `border-radius: 3px`, `overflow: hidden`.
- **Header row**: `background: #fff`, `padding: 20px 48px`, `gap: 32px`, container `width: 1111px; height: 92px`. Logo (`logo-grupo-security.png`) sits in a `display:flex; flex-direction:column; gap:12px; height:89px` wrapper, image itself: `height:165px; width:181px; object-fit:fill; opacity:0.75; border-radius:11px; margin:-22px 2px 10px -34px` (note: this crops/repositions the logo — engineer should sanity-check this against the actual logo asset rather than reproduce the crop blindly if it looks wrong at build time). Search bar: `flex:1`, `border:2px solid #1A1A1A`, `border-radius:10px`, red "Buscar" button `background:#CE0203`. Account entry point ("Hola, bienvenido / Inicia sesión") triggers navigation to Login screen. "Crear cuenta" button: `background:#484748`, `color:#fff`, `border-radius:10px`, `padding:11px 18px`, `font-size:13px`, `font-weight:700` — navigates to "Solicitar acceso".
- **Mega-nav**: `background:#CE0203`, `height:50px`, white text links: Videovigilancia, Control de Acceso, Alarmas y Smart Home, Marcas, plus a white pill "Promociones".
- **Hero**: `height:300px`, `border-radius:18px`, `background: linear-gradient(115deg,#1A1A1A 0%,#262626 55%,#CE0203 130%)`. Amber eyebrow pill `#FFB020`/`#1F1300`. H1 38px/900/white: "Cámaras, control de acceso y alarmas al mejor precio". Two CTAs: white solid "Explorar catálogo", outlined "Crear cuenta gratis" (→ Solicitar acceso).
- **Category tiles** (3-col grid): Videovigilancia (icon bg `#FEF2F2`/fg `#CE0203`, "480+"), Control de Acceso (`#F3F4F6`/`#484748`, "210+"), Alarmas y Smart Home (`#ECFDF5`/`#059669`, "130+"). White card, `border-radius:16px`.
- **Product vitrinas** (2 sections, 4-col grid each): "Lo más pedido en Videovigilancia" and "Nuevo en Control de Acceso". Each product card: `border-radius:14px`, white bg, square icon placeholder tile (`linear-gradient(135deg,#F8FAFC,#E2E8F0)`), brand label 9.5px/700/`#CE0203` uppercase, product name 12.5px, mono SKU 10px/`#94A3B8`, stock status dot (`#047857` en stock / `#B45309` pocas unidades / `#DC2626` agotado), CTA pill (red "Ver precio" or gray "Avísame cuando llegue" when agotado). Optional corner tag: green "MÁS VENDIDO" or dark "NUEVO".
- **Mid-page promo banner**: `background:#1A1A1A`, `border-radius:16px`, amber eyebrow, white H3, white CTA button "Solicitar acceso".
- **Login/Register CTA pair** (2-col grid): dark card "¿Ya tienes cuenta?" (white CTA → login) and light-red card `#FFF5F5`/border `#FFD9D9` "¿Eres nuevo?" (red CTA → solicitar acceso).
- **Footer**: `background:#1A1A1A`, `color:#CBD5E1`, centered copyright line, 11.5px.

### 2. Client Login (`screens/ClientLogin.jsx`)
- **Layout**: centered modal-style card, `max-width:900px`, `border-radius:20px`, `box-shadow: var(--shadow-lg)`, split 42%/58%.
- **Left panel**: `background:#E5E7EB`, `border-right:1px solid #D1D5DB`, centers the logo image (`logo-grupo-security.png` or the client-supplied variant) at natural aspect ratio, `width:100%; max-width:240px; height:auto` — **do not apply `filter:invert(1)`** to a full-color logo (that was a leftover from an old white-on-dark asset and inverts red→cyan; only use `invert(1)` if the asset is genuinely a white-only mark meant for a light background).
- **Right panel**: "← Volver a la tienda" back-link (top), then centered form (`max-width:360px`): H1 20px/700 "Inicia sesión", subtext 13px/`#404040`, `Input` "Correo electrónico" + `Input type="password"` "Contraseña", checkbox "Mantener sesión iniciada" + "¿Olvidaste tu contraseña?" link, full-width primary `Button` "Ingresar", and a light-red tip box `#FFF5F5`/border `#FFD9D9` with "¿Aún no tienes acceso como cliente? Solicita tu acceso" linking to the request-access screen.

### 3. Solicitar Acceso (`screens/SolicitarAcceso.jsx`)
- **Layout**: centered column, `max-width:640px`. Back link "← Volver a la tienda" above a white card (`border-radius:20px`, `padding:40px`, `box-shadow:var(--shadow-sm)`).
- **Content**: H1 24px/700 "Solicita tu acceso como cliente", subtext 13.5px/`#475569`. 2-column form grid (16px gap): Nombre de la empresa, NIT, Nombre de contacto, Correo corporativo, Teléfono, and a "Tipo de cliente" select (Instalador / Distribuidor / Empresa final). Full-width primary `Button` "Enviar solicitud". Footnote 11.5px `#94A3B8`, centered: "Un asesor comercial revisará tu solicitud en 1-2 días hábiles."

## Interactions & behavior
- Home → clicking the account icon/"Inicia sesión" text or the header/hero "Crear cuenta" buttons navigates to Client Login or Solicitar Acceso respectively (simple client-side view swap in the prototype — implement as real routes, e.g. `/login`, `/solicitar-acceso`).
- Client Login → "← Volver a la tienda" returns to Home; "Solicita tu acceso" link goes to Solicitar Acceso.
- Solicitar Acceso → "← Volver a la tienda" returns to Home.
- No client-side validation is mocked in the prototype; the target app should apply its existing form-validation conventions (repo uses React Hook Form + Zod).
- Hover/press states: buttons follow the design system's `Button` component (darken on hover, translateY(1px) on press) — see `design_files/tokens/` for the exact colors.

## Design tokens
See `design_files/tokens/*.css` for the full token set (colors, typography, spacing, radius, shadows) and `design_files/styles.css` for how they're assembled. Key values used on this storefront specifically:
- Storefront chrome: `#1A1A1A` (near-black, hero/footer/promo banners), `#484748` (utility bar + header "Crear cuenta" button — institutional gray, NOT the near-black), `#FAFAFA` (utility bar text)
- Brand red: `#CE0203` (primary CTA / mega-nav / active states), hover `#AD0102`
- Semantic stock colors: `#047857` (en stock), `#B45309` (pocas unidades), `#DC2626` (agotado)
- Radii: 10px controls, 14–16px cards, 18–20px hero/login card, 999px pills
- Fonts: Roboto (body), Roboto Condensed (not used on this storefront specifically — Roboto only)

## Assets
- `design_files/assets/logos/logo-grupo-security.png` — full-color lockup, used on Home header and the Client Login left panel
- `design_files/assets/logos/logo-grupo-security-white.png` — white lockup, for genuinely dark/solid backgrounds only
- `design_files/assets/logos/isotipo-grupo-security.png` — mark only, not used on this storefront
- `design_files/catalogo-comercial/logo-grupo-security-*.png` — three ad-hoc image drops made during design review (superseded the original asset references in a couple of places); the engineer should confirm with design which final logo file/crop to ship rather than using these review artifacts verbatim.

## Files
- `design_files/catalogo-comercial/index.html` — prototype shell (view switcher between the 3 screens)
- `design_files/catalogo-comercial/screens/Home.jsx`
- `design_files/catalogo-comercial/screens/ClientLogin.jsx`
- `design_files/catalogo-comercial/screens/SolicitarAcceso.jsx`
- `design_files/styles.css`, `design_files/tokens/*.css`, `design_files/base.css` — design tokens (colors/type/spacing/radius/shadows) referenced throughout via CSS custom properties
