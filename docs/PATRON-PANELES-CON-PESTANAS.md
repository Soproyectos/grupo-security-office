# Patrón de paneles con pestañas

Norma de diseño para todo panel interno con varias páginas. Es el diseño de pestañas de **Biblioteca**: icono pequeño, nombre corto y un texto de ayuda a la derecha. Quien diseña y quien programa lo usan igual; no se inventan barras nuevas.

## Cuándo usarlo

- **Sí:** el panel tiene **2 o más páginas** hermanas y la persona cambia entre ellas con frecuencia (Biblioteca, Comercial).
- **No:** el panel tiene una sola página. Una barra con una pestaña no aporta (Marketing ya tiene tres: Banners, Promociones internas y Gestionar avisos).
- **No:** pestañas dentro de una página que ya vive bajo una barra del panel (por ejemplo, las secciones de Catálogos maestros o las de Configuración comercial). Dos barras apiladas confunden: la de arriba dice dónde estás, la de abajo es solo una sección.
- **No:** ventanas (modales), el menú general de arriba de la aplicación ni la zona del cliente final en la tienda (otra audiencia, otro diseño).

## Anatomía

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [icono] Nombre   [icono] Nombre   [icono] Nombre      Texto de ayuda de  │  ← barra
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔                                         la pestaña activa  │
├─────────────────────────────────────────────────────────────────────────┤
│ contenido de la página                                                  │  ← contenido
└─────────────────────────────────────────────────────────────────────────┘
```

| Parte | Qué es | Reglas |
|---|---|---|
| Barra | Franja blanca con una línea debajo. | Una sola por panel. No lleva título visible: el nombre del panel queda solo para lectores de pantalla. |
| Icono | Dibujo de un solo trazo, 18 px. | Siempre en SVG (nada de emoji ni símbolos de texto). Solo colores del tema (hereda el de la pestaña). |
| Nombre | Una o dos palabras con verbo o sustantivo claro. | Corto: «Fichas», «Solicitudes», «Zonas». Un concepto, una palabra en toda la aplicación. |
| Contador | Número opcional junto al nombre. | Solo si hay algo pendiente (por ejemplo solicitudes por revisar). Si es cero, no se muestra. |
| Texto de ayuda | Una frase a la derecha. | Cambia según la pestaña activa. Dice qué se hace ahí, no repite el nombre. |
| Contenido | La página de la pestaña. | Va debajo de la barra. No repite el título del panel. |

## Clases y componente compartido

Las clases viven en `src/frontend/src/components/layout/library-workspace.css`:

| Clase | Para qué |
|---|---|
| `biblioteca-workspace` | Contenedor del panel (da los colores y la tipografía del espacio). |
| `biblioteca-workspace__bar` | Barra. |
| `biblioteca-workspace__label` | Nombre del panel, oculto a la vista y disponible para lectores de pantalla. |
| `biblioteca-workspace__nav` | Lista de pestañas. |
| `biblioteca-workspace__destination` (`is-active`) | Cada pestaña. |
| `biblioteca-workspace__hint` | Texto de ayuda. |
| `biblioteca-workspace__content` | Contenido debajo de la barra. |

**No se escriben a mano: se usa el componente** `src/frontend/src/components/layout/WorkspaceTabs.tsx`. Cada pestaña es un `WorkspaceTab` (`id`, `label`, `icon` con el trazo SVG, `hint` y `badge` opcional); las pestañas por ruta agregan `to` y `end`.

Hay dos modos:

- **Por estado** (`mode="state"`): la página cambia de sección sin cambiar la dirección. Pinta botones con `role="tab"`, `aria-selected` y los ids `tab-<id>` y `panel-<id>`; el contenido debe llevar `role="tabpanel"`, `id="panel-<id>"` y `aria-labelledby="tab-<id>"`. Hoy ningún panel en producción lo usa; queda para paneles con secciones que no cambian la dirección.
- **Por ruta** (`mode="route"`): cada pestaña es un enlace y la dirección dice dónde está la persona. Pinta enlaces con `aria-current="page"` en la activa. Acepta `trailing` para enlaces extra al final (por ejemplo uno que abre otro sitio).

Variantes de contenedor (`variant`):

| Variante | Cuándo |
|---|---|
| `workspace` (por defecto) | La página ya está dentro de un `biblioteca-workspace`. |
| `standalone` | La barra va sola encima de un contenido que conserva su propio contenedor (Comercial). |
| `header` | La barra va al final de una cabecera de aplicación que ya tiene su línea inferior. En teléfono oculta el texto de ayuda para no alargar la cabecera fija. |

Ejemplo por ruta:

```tsx
const TABS: readonly WorkspaceRouteTab[] = [
  { id: 'clientes', to: '/commercial/customers', label: 'Clientes', icon: 'M16 20v-2…', hint: 'Los clientes que puedes consultar.' },
  { id: 'cotizaciones', to: '/commercial/quotes', label: 'Cotizaciones', icon: 'M14 3H7…', hint: 'Las cotizaciones y su estado.' },
]
<WorkspaceTabs mode="route" variant="standalone" title="Comercial" navLabel="Navegación de Comercial" tabs={TABS} />
```

Ejemplo por estado:

```tsx
<WorkspaceTabs mode="state" title="Nombre del panel" navLabel="Secciones del panel"
  activeId={current} onChange={id => setTab(id as PortalTab)} tabs={tabs} />
```

## Permisos: una acción por pestaña

- Cada pestaña se asigna **por separado**: tiene su propia acción (o paquete) en la pantalla de asignación de paneles. Quien tiene una pestaña no recibe las demás.
- La interfaz solo **muestra** las pestañas asignadas. Ocultar no es autorizar: el servidor vuelve a exigir la acción en cada petición y responde con un error claro si falta.
- Una pestaña sin permiso no se pinta (no hay pestañas muertas). Si la persona no tiene ninguna, el contenido explica que no tiene paneles asignados y no se monta ninguna página, así que tampoco se piden datos.
- El permiso con que se muestra la pestaña debe ser el mismo que exige el servidor. Si difieren, se anota en el reporte de traspaso (`docs/handoffs/`).

Ejemplos de hoy:

| Panel | Pestaña | Acción que la habilita |
|---|---|---|
| Biblioteca | Productos | `products:read` |
| Biblioteca | Fichas | `products:write` |
| Biblioteca | Precios | `prices:preview` |
| Biblioteca | Importaciones | `imports:read` |
| Biblioteca | Catálogos maestros | `masters:read` |
| Usuarios | Usuarios | `users:read` |
| Usuarios | Asignar paneles | Solo Super Admin (no es una acción asignable) |
| Comercial | Clientes, Solicitudes, Cotizaciones, Metas, Resumen del equipo, Zonas | `customers:read`, `portalAccounts:read`, `quotes:read`, `targets:read`, `teamInsights:read`, `portalZones:manage` |
| Marketing y mercadeo | Banners | `marketing:read` con el panel asignado por paquete |
| Marketing y mercadeo | Promociones internas | `commercialPromotions:read` |
| Marketing y mercadeo | Gestionar avisos | `commercialPromotions:create` (la página se abre también con editar, publicar o retirar) |

«Clientes del portal» ya no es un panel: sus cuentas son la pestaña **Solicitudes** de Comercial (`/commercial/portal`) y sus zonas la pestaña **Zonas** (`/commercial/zones`). «Sin asesor» pasó a ser un filtro dentro de Solicitudes, visible solo con `portalAccounts:assign`. `/customer-accounts` redirige a `/commercial/portal`.

Más detalle en [Paneles y permisos](PANELES-Y-PERMISOS.md) y en el [mapa de permisos de Biblioteca](biblioteca-dominio/mapa-de-permisos-biblioteca.md).

## Accesibilidad y teléfono (375 px)

- Todo se opera con teclado; el foco se ve con el anillo de color de acción.
- Por ruta: enlaces con `aria-current="page"` en la activa, dentro de un `nav` con nombre (`navLabel`).
- Por estado: `role="tablist"` con botones `role="tab"`, `aria-selected`, `aria-controls` y el panel enlazado con `aria-labelledby`.
- El estado activo no depende solo del color: lleva línea inferior y color de acción.
- En 600 px o menos la barra se reorganiza sola: las pestañas ocupan una fila con **desplazamiento propio** (la página no se desplaza de lado), cada pestaña mide **al menos 44 px de alto** y el texto de ayuda pasa debajo, a lo ancho.
- Con `prefers-reduced-motion` desaparece la transición de color y se conserva el cambio de estado.
- Pruebas: renderizado con `renderToStaticMarkup` (`WorkspaceTabs.spec.tsx` y las pruebas de cada panel). Revisar además a 375, 768 y 1440 px cuando la aplicación pueda ejecutarse.

## Qué paneles ya lo siguen y cuáles no

| Panel | Estado | Motivo |
|---|---|---|
| Biblioteca (`CommercialLayout`, rama de catálogo) | Sigue el patrón | Es la referencia. Usa las mismas clases escritas a mano porque su ayuda depende de la ruta exacta; se puede pasar a `WorkspaceTabs` cuando haya tiempo de revisarlo. |
| Comercial (`CommercialLayout`, rama de Comercial) | Sigue el patrón, por ruta | Usa `WorkspaceTabs`. Reúne Clientes, Solicitudes, Cotizaciones, Metas, Resumen y Zonas. Las promociones pasaron a Marketing. |
| Clientes del portal | Ya no es un panel | Se fusionó en Comercial (pestañas Solicitudes y Zonas). |
| Espacio de ventas (`SalesLayout`) y Espacio del supervisor (`SupervisorLayout`) | Ya usan `WorkspaceTabs` | Hoy no están montados en las rutas (`/sales` y `/supervisor` se muestran con el menú general). Si se vuelven a usar, la barra ya sigue el patrón. |
| Marketing y mercadeo (`MarketingLayout`) | Sigue el patrón, por ruta | Usa `WorkspaceTabs` con Banners (`/marketing/banners`), Promociones internas (`/marketing/promotions`) y Gestionar avisos (`/marketing/notices`). `/marketing` abre la primera pestaña que la persona tiene; `/promotions` y `/sales/promotions` redirigen a las nuevas. Campañas se sumará como una pestaña más. |
| Configuración comercial (`CommercialSettingsPage`) | No aplica | Sus pestañas son secciones dentro de una página que ya está debajo de la barra de Comercial. |
| Secciones dentro de páginas de Biblioteca (importaciones, diccionario, plantillas, editor de producto, grupos de especificaciones) | No aplica | Pestañas anidadas: la barra del panel ya dice dónde está la persona. |
| Ficha de producto, ventanas (modales) | No aplica | No son paneles con varias páginas. |
| Cuenta del cliente final (tienda) | No aplica | Otra audiencia, otro diseño. |
| Usuarios (`UsersLayout`) | Sigue el patrón, por ruta | Une Usuarios (`/users`) y Asignar paneles (`/users/access`). **Pendiente: Roles** sigue como franja interna de `UsersPage`; pasarla a la barra cuando termine la otra sesión que edita esa página. Con una sola pestaña visible no se pinta la barra. |

## Cómo agregar una pestaña

1. Elegir nombre corto, icono de un solo trazo y una frase de ayuda (sin repetir el nombre).
2. Agregarla a la lista del panel; en rutas, con su `to` y `end` correctos.
3. Definir su acción propia en el catálogo de permisos y exigirla en el servidor (con el reporte de traspaso si hace falta backend).
4. Probar: que se vea solo con la acción asignada, que la activa lleve `aria-current` o `aria-selected`, y que a 375 px la barra se desplace sola.
