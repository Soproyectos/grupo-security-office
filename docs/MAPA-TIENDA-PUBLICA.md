# Mapa de la tienda pública

Documento de trabajo para ordenar las páginas que verá cualquier persona en internet y para delegar su construcción. Base: inventario de código del 2026-11-03 sobre `src/frontend/src` de este worktree. Lo marcado **[Decidir]** espera respuesta del coordinador y lo marcado **[Confirmar]** necesita un dato oficial que no está en el repositorio.

## 1. Reglas que aplican a todo

- Las páginas públicas permiten explorar, buscar, ver fichas y comparar sin cuenta. El registro sirve para pedir tarifa; los precios solo se ven con tarifa asignada.
- Sin commits, push, despliegues, migraciones ni cambios de contenedores sin aprobación explícita (ver `AGENTS.md`).
- Sin teléfonos, correos, NIT ni direcciones inventados. Lo que no esté confirmado se deja como `[Confirmar]` y no se publica.
- Textos de interfaz en español neutro. Código e identificadores en inglés.

## 2. Mapa de páginas

| Ruta | Estado | Envoltorio actual | Acción |
|---|---|---|---|
| `/tienda` | Existe | `StorefrontChrome home` | Portada aprobada. Sus tres accesos pasan a rutas internas. |
| `/catalogo` | Existe | `StorefrontChrome` | Alinear con la plantilla común. |
| `/catalogo/categoria/:slug` | Existe | `StorefrontChrome` | Alinear. |
| `/catalogo/buscar` | Existe | `StorefrontChrome` | Alinear. |
| `/catalogo/productos/:id`, `/productos/:slug` | Existe | `StorefrontChrome` | Alinear. Verificar comparación y precios por tarifa por separado. |
| `/clientes/login`, `/clientes/registro` | Existen | Cabecera propia, sin pie | Pasar a la plantilla común. |
| `/clientes` y subrutas | Existen | `CustomerPortalShell`, colores propios | Mismo pie y tokens; arreglar `<main>` dentro de `<main>` en la ficha privada. |
| `/soluciones` | Nueva | — | Por necesidad: vigilar, detectar intrusiones, controlar entradas, conectar equipos. Enlaza al catálogo. |
| `/servicios` | Nueva | — | Hub con Proyectos, Soporte técnico y Certificaciones. |
| `/servicios/proyectos` | Nueva | — | Evaluación, diseño e implementación, mantenimiento. Cotizar por WhatsApp. |
| `/servicios/soporte` | Nueva | — | Separa configurar un equipo, diagnóstico o reparación y garantías. |
| `/servicios/soporte/configurar` | Nueva | — | Recorrido de quien compró una cámara (boceto aprobado en el artefacto de Servicios). |
| `/servicios/certificaciones` | Nueva | — | Temas HCSA Hikvision; fechas y cupos **[Confirmar]**. |
| `/nosotros` | Nueva | — | Empresa, respaldo técnico y sedes. |
| `/sedes` | Nueva | — | Pereira, Armenia, Manizales y Cali; direcciones, teléfonos y horarios **[Confirmar]**. |
| `/garantias` | Nueva | — | Enlaza a la política oficial; no la reescribe. URL oficial **[Confirmar]**. |

**Decidido (2026-11-03):** «Soporte» del menú principal lleva a `/servicios/soporte`; `/servicios` queda como hub alcanzable desde «Soluciones» y el pie.

## 3. Plantilla común

Una sola cabecera, un solo pie y los mismos tokens en todas las páginas públicas, incluidas login y registro.

- **Cabecera:** logo oficial con separador, Catálogo, Soluciones, Soporte y cuenta. **Decidido (2026-11-03):** la cuenta es siempre «Mi cuenta» con menú: Ingresar y Crear cuenta sin sesión; Mi portal y Salir con sesión.
- **Barra roja y buscador de cabecera:** **Decidido (2026-11-03):** solo las páginas interiores (catálogo, categoría, búsqueda, ficha) los conservan; la portada no, porque su buscador ya es el héroe.
- **Pie:** el mismo en todas las páginas. Hoy se muestran solo las entradas con enlace; se completan cuando existan las páginas (Nosotros, Sedes, Garantías, Términos, Protección de datos).
- **Banda superior de páginas internas** de Servicios: fondo `security-600`, ruta de migas, título h1 y una frase de 65 caracteres como máximo.
- **Tokens** (en `tailwind.config.js`): `security-500` `#CE0203` marca; `security-600` `#AD0102` hero y acciones; `storefront-ink` `#1A1A1A` texto; `surface-50/100/200/300` fondos y bordes; radios `rounded-control` 10 px y `rounded-card` 16 px. No usar colores sueltos ni `slate-*`.
- **Accesibilidad:** objetivos táctiles de 44 px o más, contraste mínimo 4.5:1, un solo `h1` y un solo `<main>` por página, foco visible, sin desbordes a 375 px.
- **Botón flotante de WhatsApp:** aparece en todas las páginas con la plantilla; no debe tapar contenido (reservar espacio al final).

## 4. Matriz de enlaces

| Origen | Elemento | Destino |
|---|---|---|
| Portada | Asesoría para proyectos | `/servicios/proyectos` |
| Portada | Soporte técnico | `/servicios/soporte` |
| Portada | Certificaciones | `/servicios/certificaciones` |
| Portada | Soluciones (menú) | `/soluciones` |
| `/servicios` | Tres tarjetas y «Configurar mi equipo» | Proyectos, Soporte, Certificaciones, `/servicios/soporte/configurar` |
| `/servicios/soporte` | Configurar / Diagnóstico / Garantías | `/servicios/soporte/configurar`, `/sedes`, `/garantias` |
| `/servicios/proyectos` | Cotizar | WhatsApp con mensaje de `WHATSAPP_MESSAGES.projects` |
| `/soluciones` | Cada necesidad | Categoría o búsqueda del catálogo |
| Pie | Nosotros, Sedes, Garantías | `/nosotros`, `/sedes`, `/garantias` |
| `/garantias` | Política oficial | URL oficial externa, `rel="noopener noreferrer"` |

Los enlaces externos actuales a gruposecurity.co (Soporte técnico, Certificaciones) se reemplazan por las rutas internas.

## 5. Datos de demostración a sustituir antes de publicar

Número de WhatsApp, teléfonos y horarios de `features/storefront/constants/contact.ts`, correo `serviciocliente@gruposecurity.example`, «NIT 900.000.000-0 (demo)» en `StorefrontFooter.tsx`. Cada dato lo confirma el coordinador y vive en variables o constantes; nunca en pruebas ni fixtures reales.

## 6. Código sin uso

Sin importadores fuera de pruebas: `HomeHero`, `StorefrontSalesChannels`, `FeaturedSolutionsSection`, `BrandsStrip`, `CategoryShopTiles`, `ProductShelf`, `CoverageSelector` y `customer-portal/pages/CatalogPage.tsx`. **Decidido (2026-11-03):** se borran en una tarea aparte (T10), con sus pruebas, después de la plantilla común.

## 7. Plan por tareas para agentes baratos

Orden y dependencias. Cada tarea es un commit pequeño que el coordinador aprueba; ninguna toca más de lo listado.

| # | Tarea | Archivos | Depende de |
|---|---|---|---|
| T1 | Plantilla común: extraer cabecera y pie compartidos, un patrón de cuenta | `StorefrontChrome.tsx`, `StorefrontFooter.tsx`, `AccountMenu.tsx` | — (decisiones de §3 ya tomadas) |
| T2 | Componente `PageIntro` (banda roja, migas, h1, frase) y `ServiceCard` | `features/storefront/components/` | T1 |
| T3 | Páginas `/servicios`, `/servicios/proyectos`, `/servicios/certificaciones` y rutas en `App.tsx` | `features/storefront/pages/`, `App.tsx` | T2 |
| T4 | Páginas `/servicios/soporte` y `/servicios/soporte/configurar` | ídem | T2 |
| T5 | Portada: los tres accesos a rutas internas; actualizar `storefront-home.spec.tsx` | `StorefrontHome.tsx`, spec | T3, T4 |
| T6 | Login, registro y portal con la plantilla común | `ClientLoginPage`, `AccessRequestPage`, `CustomerAccountPage`, `PortalProductDetailPage` | T1 |
| T7 | `/soluciones`, `/nosotros`, `/sedes`, `/garantias` | `pages/`, `App.tsx` | T2, datos **[Confirmar]** |
| T8 | Completar el pie con las páginas nuevas | `StorefrontFooter.tsx` | T7 |
| T9 | Verificar catálogo real: comparación sin cuenta y precios con tarifa | solo lectura, informe | — |
| T10 | Borrar código sin uso (ver §6) y sus pruebas | los componentes de §6 | T1 |

### Instrucciones que acompañan a cada tarea

1. Leer `AGENTS.md`, este documento y el archivo que se va a cambiar antes de escribir.
2. Reutilizar componentes y tokens existentes; no crear colores, radios ni sombras nuevos.
3. Un solo `h1` y un solo `<main>`; objetivos de 44 px; comprobar 1430 × 721 y 375 px sin desbordes.
4. No inventar datos de contacto ni texto legal; usar `[Confirmar]` en el informe, no en la interfaz.
5. Cerrar con `npx tsc -b --noEmit`, `npx eslint` sobre lo tocado y `npx vitest run` sobre `src/features/storefront`, y reportar el resultado real.
6. No hacer commit, push ni cambios de servicios. Entregar la lista de archivos tocados.
