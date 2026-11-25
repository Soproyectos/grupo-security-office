# Informe unificado — web comercial (tienda pública y portal de clientes)

Fecha: 2026-11-23. Carpeta: `.claude/worktrees/sad-golick-8a6b22` (web local unificada). Nada de esto se ha implementado ni está en commit.

**Fuentes que une este informe:** examen UX con las 12 leyes ([tienda-publica.md](tienda-publica.md)), análisis visual con las reglas de `gs-disenador-web` y la marca (este documento) y la prueba del flujo de clientes en base local.
**Nota:** el comando `/disenador-visual-senior` no está instalado en esta sesión; el análisis visual usa la skill `gs-disenador-web` (checklist y marca) y mediciones propias.

**Cómo se midió:** capturas en 1440 y 390 px, lectura del código en `src/frontend/src/features/storefront`, tokens de `index.css` y `tailwind.config`, contraste calculado con la fórmula WCAG. **No verificado:** `/nosotros` y `/servicios/*`, tiempos en el servidor real, cambio de correo, borrado de cuenta, Google, catálogo de cliente con productos.

Prioridad: **P1** hacer ya · **P2** próxima tanda · **P3** cuando haya tiempo. Esfuerzo: S pequeño, M medio, L grande.

---

## 1. MEJORAR (lo que funciona pero rinde menos de lo que podría)

| P | Qué | Evidencia | Esf. |
|---|---|---|---|
| P1 | **Botón de cotizar en móvil**: más alto (≥44 px) y sin que lo tape el botón flotante de WhatsApp. | Barra fija de la ficha: botón de 32 px, texto cortado «Cotizar por Wha…». | S |
| P1 | **Búsqueda más rápida o con mejor espera**: mensaje de «buscando…» y resultados parciales. | 2–5 s por el túnel; lista de 24 productos 3,3 s. Medir en el servidor real antes de optimizar. | M |
| P2 | **Ficha de producto más corta para el cliente**: abrir solo 2–3 grupos de especificaciones, plegar el resto, y resumen de 3–4 líneas en lenguaje simple al inicio. | 13 secciones de especificaciones; textos como «IU fácil de usar», «IP SAN», «RAID 0,1,3…». | M |
| P2 | **Tarjetas de producto sin texto repetido**: un solo llamado a cotizar; «Precio a consultar» solo en la ficha. | Todas las tarjetas repiten «Precio a consultar» + «Cotizar» (850 resultados en «hikvision»). | S |
| P2 | **Portal de clientes**: botón «Pedir acceso a precios» y reenvío del enlace de confirmación. | El portal dice «Tu acceso es básico…» sin acción; el registro no ofrece reenviar el correo. | S |
| P2 | **Avisos de éxito visibles**: aviso verde al cambiar la contraseña y ocultar la lista de requisitos que vuelve a decir «Falta». | Tras el cambio, una línea pequeña sin color y toda la lista en «Falta». | S |
| P3 | **Ventana de campaña** (Hik Friday): una vez por sesión y que no bloquee el buscador. | Cubre la portada en 1440 al entrar. | S |
| P3 | **Pie de página en móvil**: enlaces con más alto táctil. | 24 px (cumple el mínimo WCAG 2.2, lejos de 44). | S |

## 2. CAMBIAR (lo que está mal o contradice las reglas)

| P | Qué | Evidencia | Esf. |
|---|---|---|---|
| P1 | **Imágenes rotas**: ocultar miniaturas que fallan y mostrar un marcador neutro; revisar en la Biblioteca esos archivos. | Ficha DS-A81024S: 2 de 3 miniaturas rotas; 2 tarjetas rotas en resultados; 6 `<img>` sin `alt`. | S |
| P1 | **Productos descontinuados no deben invitar a cotizar** (o no publicarse). Decisión de negocio. | Ficha «DESCONTINUADO» con 2 botones «Cotizar por WhatsApp» (`ProductHero.tsx:144`). | S |
| P1 | **Registro y recuperación fallan con un mensaje que culpa al usuario**: separar «error de datos» de «error del sistema». | Producción: «No se pudo crear la cuenta. Revisa los datos» cuando el fallo era del servidor (tabla ausente). | S |
| P2 | **Quitar los textos pequeños en mayúsculas sobre los títulos** (prohibidos por la guía visual). | `text-eyebrow uppercase` en `CatalogIndexPage.tsx:163`, `CategoryPage.tsx:205,359`, `FeaturedSolutionsSection.tsx:103`; en las tarjetas, la marca en mayúsculas (`PublicProductCard.tsx:38`) se puede mantener como dato, no como etiqueta decorativa. | S |
| P2 | **Quitar el tinte azul de la tienda**: la tienda usa las escalas `surface` e `ink` (equivalen a «slate»: fondo `#F8FAFC`, texto `#0F172A`) y el azul del tema; la guía pide grises neutros. Pasar a las escalas `neutral` o definir tokens neutros para la vitrina; la decisión de gris (`#404040` o `#484748`) sigue abierta con el usuario. | `tailwind.config`: `surface`/`ink` marcadas como «escala fría»; `index.css`: `--color-bg-surface`, `--color-text-primary` con matiz azul. | M |
| P2 | **Flechas «›» de texto como iconos**: usar el icono SVG ya existente (`ChevronRight`). | `StorefrontHome.tsx:141,162,174,188,233,244` y 7 archivos más con «›»/«→». | S |
| P2 | **Contraste**: el texto secundario `ink-400` (2,56:1 sobre blanco) no cumple 4,5:1; `ink-500` sobre fondo gris claro queda en 4,34:1. | Cálculo WCAG; usos: contador de filtros `CategoryPage.tsx:418` y flechas/cierre del menú. Subir a `ink-600` (6,92:1). | S |
| P2 | **Círculos de categoría vacíos** en `/catalogo` y la portada: usar las mismas fotos del menú (`menu-images.ts`). | Círculos grises sin imagen en 1440. | S |
| P3 | **Bloques «icono + título + texto» como estructura de página** (franja de confianza y de servicios): sustituir por una línea de texto o una lista simple. | Portada: franja de 4 datos y fila «Asesoría / Soporte / Certificaciones». | M |
| P3 | **Colores sueltos en el código** (hex fuera de tokens) en componentes compartidos. | `StatusPill.tsx:22-24`, `StatCard.tsx:36-38` repiten tokens de éxito/aviso/error. | S |

## 3. ACTUALIZAR (lo que está desfasado o falta poner al día)

| P | Qué | Evidencia | Esf. |
|---|---|---|---|
| P1 | **Título de la pestaña**: «Panel de Administración» aparece al cargar la tienda y el portal; poner «Grupo Security» en `index.html` y que el panel lo cambie al montarse. | `index.html:7`. | S |
| P1 | **Migraciones de cuentas en producción** (`20261120090000_portal_auth_better_auth`, `20261120130000_portal_account_rules`): sin ellas el registro, la recuperación y el acceso con Google no funcionan en producción. Requiere aprobación para migrar y probar antes (la prueba local ya pasó). | Log de la API: `P2021`, falta `portal_auth_user`. | M |
| P2 | **`DESIGN.md` desactualizado** (cabecera gris y «rojo solo para acciones» vs. decisión de octubre 2026) y falta `PRODUCT.md`: la guía pide leerlos. | `references/marca.md`; no existen en la raíz. | S |
| P2 | **Correo real para clientes**: configurar SMTP antes de abrir el portal; hoy los enlaces solo salen a un archivo local. | Registro y recuperación dependen del correo. | M |
| P3 | **Decisiones de marca abiertas**: gris del texto (`#404040` vs `#484748`) y códigos oficiales del manual final. | `marca.md`. | decisión |
| P3 | **Pruebas pendientes**: páginas institucionales, servicios, cambio de correo, borrado de cuenta, Google, catálogo de cliente con productos y medición real de tiempos. | Ver «No verificado». | M |

---

## Qué ya está bien (no tocar)
- Portada: una promesa, un buscador y WhatsApp como alternativa; sin scroll horizontal a 390 px.
- Menú de categorías con fotos y conteo; estado vacío de búsqueda con salida; sedes con teléfono y horario; pie sin «Vende con nosotros».
- Portal: registro, confirmación de correo, cambio y recuperación de contraseña funcionan en la base local; mensaje neutro en la recuperación; rojo de marca con 5,78:1 sobre blanco.

## Orden sugerido
1) P1 de **Cambiar** y **Actualizar** (imágenes rotas, descontinuados, título de pestaña, mensajes de error, botón móvil); 2) decidir con el negocio las migraciones de cuentas y el SMTP; 3) tanda P2 de color, contraste, mayúsculas y flechas en un solo cambio visual; 4) ficha y búsqueda (P2/M) junto con la Biblioteca.

Antes de implementar: aprobación del usuario; después, `tsc --noEmit`, `eslint`, `vitest` y capturas antes/después en 1440 y 375 px. Los cambios que necesiten datos o backend (descontinuados, pedir acceso a precios, reenvío de correo) van por un traspaso en `docs/handoffs/`.
