# Benchmark: SYSCOM Colombia (www.syscomcolombia.com)

> Informe de UX, estructura y modelo comercial, preparado para comparar contra **Grupo Security** (distribuidor colombiano de CCTV, alarmas, control de acceso y smart home).
> Fecha de la auditoría: **2026-09-29** (los precios, promociones y eventos citados corresponden a esa fecha).

## 0. Alcance y método (leer primero)

| Aspecto | Detalle |
|---|---|
| Navegador | Chrome real (extensión de automatización), viewport de escritorio 1374x605 px. Vista móvil simulada con un iframe de 390 px de ancho (no se redimensionó la ventana). |
| Extracción masiva | JavaScript en la página (enlaces, formularios, menús) y `curl` con user-agent de navegador para volcar HTML, megamenús (endpoint AJAX propio), formularios, cabeceras HTTP y comprobar estados de ~160 enlaces. |
| Modo | **Solo lectura.** No se envió ningún formulario, no se creó cuenta, no se ingresaron credenciales, no se escribió en el chat de Intercom, no se agregó nada al carrito. Se abrió el widget de chat solo para ver el saludo y se cerró. |
| Lo que NO se pudo ver | Todo lo que está detrás del login: precios, stock por sucursal, carrito, checkout, cotizador (`/cotizador`), crédito (`/credito`), órdenes, wish list, PIN, material de marketing. Se documenta lo que se ve desde fuera (formularios, plantillas HTML, modales ocultos, textos de ayuda). |
| Archivos descargables | No se descargaron PDFs/catálogos. Solo se anotan sus URLs. Se descargaron (solo para verlas) las 9 imágenes del carrusel (~6,3 MB en total). |
| Archivo complementario | `docs/benchmark/syscom-colombia-categorias.csv`: las 649 categorías (9 + 123 + 517) con id y URL completa. |

Regla de lectura: lo marcado **(inferido)** es una deducción del autor a partir de lo observado, no un dato publicado por Syscom.

---

## 1. Resumen ejecutivo

1. **Es un mayorista B2B cerrado, no una tienda.** Texto literal en el login: *"Todos nuestros productos son altamente especializados... Discúlpenos, no vendemos al público"* y *"Solamente vendemos a integradores especializados y distribuidores certificados"*.
2. **Ningún precio es visible sin sesión.** Las 66 tarjetas de producto del home y todas las del listado muestran el botón gris **"Acceder a mi Cuenta"** en lugar de precio; la ficha muestra *"Para obtener su password por primera vez, contacte a su Representante de Ventas"*.
3. **El onboarding es asistido, no self-service.** No existe "Registrarse": solo un **pre-registro** de 4 pasos para empresas (NIT con validación de dígito de verificación, RUT, Cámara de Comercio, cédula del representante legal, perfil tributario) y luego un ejecutivo de cuenta entrega número de cliente y password.
4. **Catálogo grande y bien jerarquizado:** 9 categorías raíz, 123 subcategorías y 517 sub-subcategorías (megamenú cargado por AJAX), ~144 marcas listadas, 265 productos solo en "Cámaras IP y NVRs".
5. **Buscador de primer nivel (Algolia Autocomplete):** sugiere categorías secundarias, categorías finales, marcas, productos (miniatura + modelo + marca) y **"Base de conocimiento"** (artículos del centro de ayuda). Tolera typos ("camra ip 4mp") y modelos sin guiones ("ds2cd1043g2").
6. **Inventario multi-sede:** filtro por *Sede Bogotá / Sede Bogotá (Celta) / Sede Cali*, "Sólo en Existencia", modal "Inventarios" con stock y "En camino" desde el CEDIS, "Alerta de Stock" por correo. En la ficha VISTA-48LA, el carrusel de **accesorios muestra el inventario ("Inventario 46") sin login**.
7. **Herramientas de integrador como diferenciador:** "Cotice a sus Clientes" (cotizador), compartir ficha **con logo propio y precio propio (USD o COP) o sin precio**, calculador de cámara y de distancia de cable (estos dos son **públicos**), material de marketing, generador de PIN, solicitud de crédito, descarga de certificados de retención (Retefuente, ReteIVA, ReteICA Bogotá/Funza/Cali).
8. **Publicidad = campañas de fabricante en el hero.** 8 de 9 slides son campañas de fabricante (7 marcas: Honeywell x2, TXPRO puntos, Sinclair 5%, Kenwood escalonada, Jimi IoT 5%, Epcom Powerline 7%, LinkedPro) más 1 evento (Smart City Expo Cali, 30 sep-1 oct 2026). Hay un T&C único de promociones y programa de **puntos TXPRO** (July 1-Sep 30, 2026).
9. **Formación como palanca comercial:** calendario de webinars/cursos/certificaciones (GoToWebinar) filtrable por ciudad (Bogotá, Cali, Medellín), mes, categoría e idioma; centro de ayuda Intercom con >180 artículos; blog en Blogger; "80 Soluciones" (2020).
10. **Moneda por defecto USD** (toggle USD/COP), **TRM visible** ($3,306.86), precios **sin IVA** (toggle "Sin I.V.A./con I.V.A.") y **4% adicional de descuento por pago de contado** (efectivo/transferencia), según la nota al pie de todas las páginas de producto/listado.
11. **Plataforma propia en PHP** (PHPSESSID), Bootstrap 3 + jQuery 1.12.4, detrás de Cloudflare; es la **misma plataforma que Syscom México** (assets en `ftp3.syscom.mx`, favicon `syscom.mx`, el "Acerca de" habla de "21 sucursales en México", los T&C citan "ley mexicana", la ficha dice "Código SAT copiado", "Frecuencias de uso libre" son decretos de México).
12. **SEO y técnica flojos para un sitio de esta escala:** sin `robots.txt` ni `sitemap.xml` (devuelven 404 con HTTP 200), **todas las URLs inexistentes responden 200 (soft 404)**, sin H1 en el home, sin canonical, sin Open Graph, sin JSON-LD, meta description vacía en el home, `lang="en"` en un sitio en español, zoom móvil deshabilitado, sin banner de cookies, sin HSTS/CSP, cookie de sesión sin flags visibles.
13. **UX de listado:** filtros solo por sede/existencia/promoción/categoría/marca; **no hay filtros por atributos técnicos** (megapíxeles, PoE, IR...), ni rango de precio, ni vista lista/grilla. La categoría "Cámaras IP y NVRs" renderiza **265 productos en una sola página** (27.836 px de alto); las búsquedas paginan a 300.
14. **Cumplimiento local bien resuelto:** PQRSD (con canal WhatsApp/Intercom), manual **SAGRILAFT/PTEE**, política de ética (PDF), aviso de privacidad, certificados de retención con verificación por código al correo.
15. **Mejor oportunidad para Grupo Security:** copiar lo que hace bien Syscom (pre-registro con validación, stock por sede, cotizador con marca blanca, buscador con base de conocimiento) y superarlo donde es débil (registro autoservicio con estado de solicitud, filtros técnicos, precio orientativo visible, SEO/estructurado, COP por defecto, listados paginados).

---

## 2. Mapa del sitio (árbol de URLs)

Base: `https://www.syscomcolombia.com`. `[login]` = redirige por JavaScript a `/login/` (responde HTTP 200 con `<script>window.location.href="/login/"`).

```
/                                        Home
├─ /login/                               Acceso (Número de Cliente + Password)
│   ├─ /principal/recuperarpasswordazul  Recuperar password
│   ├─ /principal/pre_registro/preregistro  Pre-registro para Distribución (4 pasos)
│   └─ /principal/contactoazul           "¿Requiere contactar a un distribuidor o instalador?" (= Contacto)
├─ Catálogo
│   ├─ /principal/listadoportadasazul/{slug}-{id}.html   Nivel 2 (lista todos los productos de la subcategoría; L3 como filtro)
│   ├─ /principal/listadoproductosazul/{slug}-{id}.html  Nivel 3 (lista de productos)
│   ├─ /principal/listadopormarca/{MARCA}[/full]         Por marca
│   ├─ /principal/brands                 Todas las marcas (A-Z, 144 entradas)
│   ├─ /principal/buscar?global_search=…&ordenar=…&pag=…  Resultados de búsqueda
│   ├─ /principal/all_accessories/{modelo}-{marca}-{id}.html  Todos los accesorios de un producto
│   └─ /producto/{MODELO}-{MARCA}-{id}.html              Ficha de producto
├─ Ofertas
│   ├─ /principal/especiales             "Ofertas Septiembre" (Seguridad / Conectividad / Radiocomunicación)
│   │   ├─ /principal/listadosespeciales/nuevoprecio     Nuevo Precio (22)
│   │   ├─ /principal/listadosespeciales/nuevallegada    Inventario Recibido (48)
│   │   └─ /superprecio  (= /outlet)     Súper Precio (nuevo y caja abierta) → /outlet/list/{cat}/{id}.html
│   ├─ /principal/promociones/super_precio-9351.html     Listado Súper Precio
│   ├─ /principal/promociones/{marca}-{id}.html          Landings de promo (honeywell_seguridad-9789, txpro-9785)
│   ├─ /singlepage/caja_abierta_home     Caja Abierta (Bogotá) → /principal/caja_abierta?…
│   └─ /principal/terminos_condiciones_promociones       T&C de promociones (acordeón, 2 páginas)
├─ Formación y contenido
│   ├─ /calendario                       Presentaciones / Certificaciones / Eventos
│   ├─ /principal/centrowebinars         Centro de Webinars
│   ├─ /singlepage/syscom_80_soluciones  "Mejores 80 Soluciones de Integración 2020"
│   ├─ https://www.syscomblog.com/       Blog (Blogger)
│   ├─ https://soporte.syscomcolombia.com/es/  Centro de ayuda (Intercom Help Center)
│   └─ /principal/syscom_apps            SYSCOM Apps (HikCentral, Hik-ProConnect, EPCOM GPS/Wialon)
├─ Herramientas
│   ├─ /cotizador                        Cotice a sus Clientes [login]
│   ├─ /panel/calculador_de_camara       Calculador de Cámara (PÚBLICO)
│   ├─ /panel/cable                      Calculador de Distancia de Cable (PÚBLICO)
│   ├─ /principal/certificados_retencion/formulario_certificados   Descargar Certificados (público con código por correo)
│   ├─ /principal/paginasazul/id:105     Frecuencias de Uso Libre (decretos de México)
│   └─ /principal/anydesk                Redirige a anydesk.com/es/downloads
├─ Cuenta (todo [login])
│   ├─ /panel  /panel/mis_datos  /panel/facturas_html (Mis Órdenes / Facturación Electrónica)
│   ├─ /panel/wish_list  /panel/mis_direcciones  /panel/garantias_html
│   ├─ /credito  /pin/  /panel/marketing_digital  /panel/carrito_orden_marketing
│   └─ /principal/shopping_cart          Carrito [login]
├─ Servicio y legal
│   ├─ /principal/centro_servicio        Centro de Servicio (RMA: devolución, garantía o reparación)
│   ├─ /principal/garantias2             Política de Garantía y Devoluciones (resumen + botón "Ver Politica")
│   ├─ /principal/politicas-ventas       Reglamento de acuerdos comerciales
│   ├─ /principal/terminos_y_condiciones  Términos y condiciones
│   ├─ /principal/aviso-privacidad       Aviso de privacidad
│   ├─ /principal/manual-sagrilaft       SAGRILAFT y PTEE
│   ├─ /principal/form_pqrs/             PQRSD (formulario)
│   ├─ /principal/quejas_sugerencias     Quejas y Sugerencias
│   ├─ /principal/paginasazul/id:4       Calidad de los Productos
│   ├─ /principal/paginasazul/id:95      Política de Clasificación de Productos (certificados/caja abierta)
│   ├─ /principal/acerca_de              Acerca de SYSCOM (texto global de Syscom México)
│   ├─ /principal/distribuidoresNoautorizados  ← ROTO (404 con HTTP 200)
│   └─ /contacto  (= /principal/contactoazul)  Sedes Bogotá y Cali
└─ /manifest.json                        PWA mínimo (name "SYSCOM", gcm_sender_id)
```

Patrones de URL:

| Tipo | Patrón | Ejemplo real |
|---|---|---|
| Producto | `/producto/{MODELO}-{MARCA}-{id}.html` | `/producto/DS-2CD1043G2-LIU-HIKVISION-220979.html` |
| Categoría nivel 2 | `/principal/listadoportadasazul/{slug-jerárquico}-{id}.html` | `/principal/listadoportadasazul/videovigilancia-camaras-ip-214.html` |
| Categoría nivel 3 | `/principal/listadoproductosazul/{slug-jerárquico}-{id}.html` | `/principal/listadoproductosazul/videovigilancia-camaras-ip-bullet-1323.html` |
| Marca | `/principal/listadopormarca/{MARCA}` | `/principal/listadopormarca/HIKVISION` |
| Búsqueda | `/principal/buscar?global_search={q}&ordenar={orden}&pag={n}[&stock=true&marca=…&categoria=…]` | `…?global_search=DS-2CD&ordenar=Relevancia&pag=1` |
| Ordenamientos (valores de `ordenar`) | `Relevancia`, `Mas_Vendidos`, `Precio_de_Menor_a_Mayor`, `Precio_de_Mayor_a_Menor`, `Modelo A-Z/Z-A`, `Marca A-Z/Z-A` | — |

Observaciones: los slugs de categoría son inconsistentes con el nombre visible (p. ej. "Cámaras IP y NVRs" > "Bala" tiene slug `camaras-ip-bullet`; "Alarmas / Intrusión y Casa Inteligente" tiene slug `automatizacion--e-intrusion-…`).

---

## 3. Home: análisis bloque por bloque

Capturas y DOM: alto total del documento 3.342 px; 158 requests; 118 imágenes; 1.747 nodos DOM. El texto de página tiene **0 H1 y 0 H2** (los títulos de sección son H3).

### 3.1 Tabla de bloques (de arriba hacia abajo)

| # | Bloque | Contenido / mensaje | CTA | URL destino |
|---|---|---|---|---|
| 1 | **Barra utilitaria superior** (fondo azul oscuro) | Enlaces destacados con color: "Súper Precio" (naranja), "Caja Abierta" (magenta), "Eventos y Certificaciones" (morado); texto: "Webinars", **"Devoluciones y Garantías"** (negrita), "Soporte Técnico"; dos *toggles*: "Sin I.V.A./con I.V.A." y "USD/COP" (por defecto USD); a la derecha un ícono azul (certificado) y "Login" | Ver cada enlace | ver §4.1 |
| 2 | **Header principal** | Logo SYSCOM COLOMBIA (SVG, enlaza a `/`); **buscador** Algolia con placeholder animado tipo máquina de escribir (ejemplos vistos: "Switch sfp+ 24 p", "Bobina de cable ca", "Domo IP 4"); **"TRM: $3,306.86"** (tooltip "Tipo de Cambio"); botón azul **"Ofertas"**; botón amarillo **"Carrito"** con contador | Buscar / Ofertas / Carrito | `/principal/consultarproductosazul` (fallback del form), `/principal/especiales`, `/principal/shopping_cart` |
| 3 | **Barra de categorías** (azul) | 9 botones: Videovigilancia · Control de Acceso · Energía · Detección de Fuego · Alarmas / Intrusión y Casa Inteligente · Radiocomunicación · Redes e IT · Cableado Estructurado · IoT / GPS / Telemática y Señalización Audiovisual. **Se abren con clic (no con hover)** y despliegan megamenú de 5 columnas | Clic para abrir; cada ítem enlaza a listado | ver §5 |
| 4 | **Carrusel hero** (9 slides, autoplay, flechas + 9 puntos, banner de 3000x450 px) | Campañas de fabricante y 1 evento. Detalle slide por slide en §3.2 | Clic en toda la imagen | ver §3.2 |
| 5 | **"Videos Soluciones"** | Feed de videos cortos tipo *reels* (widget Firework, canal `syscom_colombia`, playlist `gOdQ2B`, etiquetados "syscomcolombia"). Títulos vistos: "Conoce GrandStream" (con botón), "Radio Kenwood Serie NX-1000 sumergido en agua: prueba de...", "Escala con Ubiquiti", "MikroTik CCR2116" | Reproducir video / flecha siguiente | Reproductor emergente de Firework |
| 6 | **"Tendencia en Videovigilancia"** | Carrusel de 22 tarjetas: imagen, marca, título, modelo y botón. Ej.: PLK12DC20ABK (EPCOM), THC-B320-VF (HiLook), DS-2DE7A432IW-AEB(T5) (Hikvision), CSH1C1080P (EZVIZ)… | **"Acceder a mi Cuenta"** en cada tarjeta | `/login/` (imagen/título/modelo → `/producto/{MODELO}-{MARCA}-{id}.html`) |
| 7 | **"Tendencia en Redes"** | 22 tarjetas: MikroTik, Ruijie, V-SOL, FiberHome, Grandstream, Mimosa, NetPoint, Hikvision… | "Acceder a mi Cuenta" | `/login/` |
| 8 | **"Tendencia en Radiocomunicación"** | 22 tarjetas: BIRD, Andrew/CommScope, RF Industries, Syscom Towers, Kenwood, TXPRO, Telox, EPCOM Powerline… | "Acceder a mi Cuenta" | `/login/` |
| 9 | **"Fabricantes Destacados"** | Círculos con logo de 35 marcas (Kenwood, Hikvision, V-SOL, Honeywell, TXPRO, Ruijie, Suprema, EPCOM Powerline, MikroTik, WD, Telo Systems, FiberHome, EPCOM, EPCOM Professional, Allied Telesis, Akuvox, LinkedPro, Mimosa, HID, Grandstream, Teltonika, WilsonPro/WeBoost, Planet, IDEMIA, Ruptela, Ibernex, Cambium, TP-Link, WilsonPro/Panduit, CAME, NetPoint, EZVIZ, Getac, SanDisk, Safe Fire Detection) | "Ver Todas las Marcas" y clic en cada logo | `/principal/brands`, `/principal/listadopormarca/{MARCA}` |
| 10 | **Footer** (azul oscuro) | 4 columnas de enlaces (QUIENES SOMOS / PUBLICACIONES / HERRAMIENTAS / SOPORTE), 2 botones (AnyDesk, Certificados), línea de contacto y redes | ver §4.3 | ver §4.3 |
| 11 | **Widget de chat Intercom** (burbuja flotante con insignia "1") | Saludo: **"Hola 👋 ¿Cómo te podemos ayudar?"**, tarjeta "Envíanos un mensaje — Volveremos a conectarnos mañana" (fuera de horario), pestañas Inicio / Mensajes | Enviar mensaje | Intercom (app `abenb62l`) |

No hay en el home: newsletter/suscripción, testimonios, sección de blog, novedades, banner de capacitación propio (solo el enlace superior), ni sección "por qué elegirnos". El hueco de notificaciones superiores ("Notificaciones y Mensajes en el Top de la página") existe en el código pero estaba vacío.

**Bloques comentados en el código fuente del home (no visibles, pero revelan tácticas usadas antes):**
- Aviso "¡Adelantamos la Navidad! Compra ya mismo directamente en nuestra página web y recibe un **1% de descuento** en el precio total" con botón Carrito (incentivo para comprar por web).
- Iframe de YouTube con autoplay.
- Banner flotante "Crédito Express" hacia `https://crediexpress.valcredit.co/syscom` (financiación con un tercero; el enlace no respondió al probarlo con curl).

### 3.2 Carrusel principal: slide por slide

Imágenes en `https://ftp4.epcom.net/usuarios/ftp/banners_index/…`. Pesos medidos: 261 KB a 1.030 KB por slide, **6,3 MB en total, cargados sin lazy loading**.

| Slide | Mensaje textual (lo que se lee en el banner) | Marca | CTA / destino real |
|---|---|---|---|
| 1 | "NO TODOS LOS ATAQUES SE VEN, ALGUNOS SE SIENTEN" · "SC100 Diseñado para detectar impactos sobre superficies y accesos que protegen activos de alto valor." | Honeywell (sensor SC100) | `/principal/promociones/honeywell_seguridad-9789.html?ordenar=Relevancia&pag=1` |
| 2 | "ESTAMOS PRESENTES EN SMART CITY EXPO CALI · 30 SEPT. 01 OCT. 2026 · Centro de Eventos Valle del Pacífico" (muestra cámaras Hikvision, bodycam Telox, radio Kenwood) | Evento / multimarca | **Enlaza a `/` (el propio home): no tiene destino útil** |
| 3 | "COMPRA, ACUMULA Y GANA — Cada radio que compras suma puntos y te acerca a increíbles premios." Tabla de puntos: TX370 10, TX320 15, TX500 35, TX680 45, TX600 40, TX790 100. Premios: 2.000 pts renovación de licencia (anual), 5.000 pts seguidor GPS T2PRO, 10.000 pts TV Samsung 32" Gaming, 20.000 pts viaje o sorteo de mochila profesional T2PRO. Vigencia: 1 jul-30 sep 2026, "Aplican T&C" | TXPRO | `/principal/promociones/txpro-9785.html?ordenar=Relevancia&pag=1` (lista 8 productos, sin explicación del programa) |
| 4 | "EL MATCH IDEAL PARA TENER TODO BAJO CONTROL" · "HC35W43R3 + Grabador Serie 35" · Eficiencia / Robustez / Accesibilidad | Honeywell | Mismo destino que el slide 1 (`honeywell_seguridad-9789`) |
| 5 | "POTENCIA TUS PROYECTOS — APROVECHA EL 5% DE DESCUENTO *En toda la marca*" | Sinclair | `/principal/listadopormarca/SINCLAIR/full?ordenar=Mas_Vendidos&pag=1` |
| 6 | "¡COMPRA 10 RADIOS Y ELIGE TU BENEFICIO!" NX1300DK5: 2 radios adicionales o escalera de auriculares TXEHK; NX1300NK6: ídem; NX1300NK4: 1 radio adicional o escalera de auriculares | Kenwood | `/principal/buscar?global_search=NX1300DK5&ordenar=Relevancia&pag=1&stock=true&marca=kenwood` |
| 7 | "CONECTA, MONITOREA Y PROTEGE MIENTRAS AHORRAS — APROVECHA EL 5% DE DESCUENTO *En toda la marca*" | Jimi IoT | `/principal/listadopormarca/JIMIIOT/full?ordenar=Mas_Vendidos&pag=1` |
| 8 | "MÁS RESPALDO PARA TUS PROYECTOS, X MENOS — APROVECHA EL 7% DE DESCUENTO — kits seleccionados EPCOM POWERLINE: EPU-1KVA-KIT / EPU-2KVA-KIT / EPU-3KVA-KIT" | Epcom Powerline | `/principal/buscar?global_search=EPU-1KVA-KIT&ordenar=Relevancia&pag=1` |
| 9 | "MÁS COMPATIBILIDAD, MENOS COMPLICACIONES. Transceivers SFP, SFP+, QSFP y QSFP28 compatibles con más de 100 marcas." | LinkedPro | `/principal/buscar?global_search=linkedpro&ordenar=Relevancia&pag=1&categoria=1928` (categoría "Transceptores de Fibra") |

Lectura UX: los destinos son **búsquedas o listados filtrados**, no landings con explicación; los banners no muestran precio ni vigencia clara excepto TXPRO. El slide 2 (evento) es el único sin destino útil. Hay 8 slides de campañas de fabricante (7 marcas; Honeywell ocupa 2) y 1 de evento.

---

## 4. Inventario de botones y enlaces por zona

### 4.1 Header y barra utilitaria

| Elemento | Texto | Destino |
|---|---|---|
| Botón naranja | Súper Precio | `/principal/promociones/super_precio-9351.html?ordenar=Relevancia&pag=1` |
| Botón magenta | Caja Abierta | `/singlepage/caja_abierta_home` |
| Botón morado | Eventos y Certificaciones | `/calendario` |
| Enlace | Webinars | `/principal/centrowebinars` |
| Enlace (negrita) | Devoluciones y Garantías | `/panel/garantias_html` [login] |
| Enlace | Soporte Técnico | `http://soporte.syscomcolombia.com/` → 301 https → 302 `/es/` (Intercom Help Center) |
| Toggle | Sin I.V.A. / con I.V.A. | JS `cambia_iva()` (afecta precios de sesión) |
| Toggle | USD / COP | JS `cambia_moneda()` (por defecto USD) |
| Ícono azul (certificado) | Descargar Certificados | `/principal/certificados_retencion/formulario_certificados` |
| Enlace | Login | `/login` |
| Logo | SYSCOM COLOMBIA | `/` |
| Buscador | (autocompletar) | Envía a `/principal/buscar?global_search=…` |
| Texto | TRM: $3,306.86 | `#` (solo informativo) |
| Botón azul | Ofertas | `/principal/especiales` |
| Botón amarillo | Carrito | `/principal/shopping_cart` [login] |
| Menú móvil (pantallas <992 px) | ☰, ‹ atrás, ícono de usuario, selector "Productos / Marca" junto al buscador, accesos rápidos **Cursos** (`/calendario`), **Outlet** (`/outlet`), **Soporte** (`http://soporte.syscom.mx/`, el sitio de México) | — |

### 4.2 Menú principal (megamenú)

Cada botón carga su panel por AJAX (`GET /ajax/navegacion_load?elId={id}&nombre_url={slug}`) al primer clic; Videovigilancia se abre con 14 grupos en 5 columnas. Los títulos de grupo (nivel 2) enlazan a `listadoportadasazul` y los ítems (nivel 3) a `listadoproductosazul`. El nivel 1 (botón) **no tiene URL propia**. Árbol completo en §5 y en el CSV.

### 4.3 Footer

| Columna | Texto | Destino |
|---|---|---|
| QUIENES SOMOS | Acerca de SYSCOM | `/principal/acerca_de` |
| | Calidad de los Productos | `/principal/paginasazul/id:4` |
| | Política de Ética y Transparencia Empresarial | `https://ftp4.epcom.net/usuarios/ftp/colombia/web/documentos/etica-transparencia-empresarial.pdf` (PDF, 91 KB) |
| | Reglamento de acuerdos comerciales | `/principal/politicas-ventas` |
| | Política de Garantía y devoluciones | `/principal/garantias2` |
| | Aviso de Privacidad | `/principal/aviso-privacidad` |
| | Contacto | `/principal/contactoazul` |
| | Términos y condiciones | `/principal/terminos_y_condiciones` |
| | Términos y condiciones de promociones | `/principal/terminos_condiciones_promociones` |
| PUBLICACIONES | Cursos y Capacitación | `/calendario` |
| | Syscomblog | `https://www.syscomblog.com/` |
| | 80 Soluciones | `/singlepage/syscom_80_soluciones` |
| HERRAMIENTAS | Cotice a sus Clientes | `/cotizador` [login] |
| | Facturación Electrónica | `/panel/facturas_html` [login] |
| | Soporte Técnico | `https://soporte.syscom.mx/` (**sitio de México**, no el de Colombia) |
| SOPORTE | Frecuencias de Uso Libre | `/principal/paginasazul/id:105` |
| | Centro de Servicio | `/principal/centro_servicio` (resaltado en negrita) |
| | Pre-registro para Distribución | `/principal/pre_registro/preregistro` |
| | PQRSD | `/principal/form_pqrs/` |
| | Distribuidores No Autorizados | `/principal/distribuidoresNoautorizados` (**404 con HTTP 200**) |
| | [botón naranja] Descargar AnyDesk | `/principal/anydesk` → `anydesk.com/es/downloads` |
| | [botón azul] Descargar Certificados | `/principal/certificados_retencion/formulario_certificados` |
| Línea de contacto | **Colombia: +57 (601) 744 3650 · +57 (601) 653 0200** · recepcion@syscomcolombia.com · Messenger | `https://www.messenger.com/t/SyscomOnline` |
| Redes (íconos) | YouTube, Facebook, Instagram, TikTok | `https://www.youtube.com/channel/UC_b-uyS5i0knkZrsvWvIhJQ`, `https://www.facebook.com/syscomcolombia`, `https://www.instagram.com/syscomcolombia/`, `https://www.tiktok.com/@syscom.colombia` |

En móvil el footer añade "Quejas y Sugerencias" (`/principal/quejas_sugerencias`). **No hay enlace ni botón de WhatsApp** en el home ni en el footer (WhatsApp aparece solo como canal de radicación en el formulario PQRSD y en el texto global de "Acerca de").

Menú de cuenta (visible solo con sesión; el HTML está en la página y revela funciones): Tema oscuro (toggle), Mi cuenta (`/panel`), Mis Órdenes (`/panel/facturas_html`), SYSCOM Apps (`/principal/syscom_apps`), Wish List (`/panel/wish_list`), Mis direcciones (`/panel/mis_direcciones`, con etiqueta "Nuevo"), Devoluciones y Garantías (`/panel/garantias_html`), Solicitud de Crédito (`/credito`), Calculador de Cámara, Calculador de Cable, Generar PIN (`/pin/`), Cerrar Sesión.

---

## 5. Categorías (resumen; árbol completo en el Apéndice A)

El árbol completo (9 raíces, 123 de nivel 2 y 517 de nivel 3, con ids) está en el **Apéndice A** y con URLs completas en el CSV. Para el nivel 3 la URL es `/principal/listadoproductosazul/{slug}-{id}.html` y para el nivel 2 `/principal/listadoportadasazul/{slug}-{id}.html` (URLs completas en `syscom-colombia-categorias.csv`).

| Categoría raíz (id) | Nivel 2 | Nivel 3 |
|---|---|---|
| Videovigilancia (22) | 14 | 77 |
| Control de Acceso (37) | 15 | 63 |
| Energía (30) | 9 | 30 |
| Detección de Fuego (38) | 14 | 36 |
| Alarmas / Intrusión y Casa Inteligente (32) | 20 | 69 |
| Radiocomunicación (25) | 24 | 121 |
| Redes e IT (26) | 14 | 70 |
| Cableado Estructurado (65811) | 6 | 24 |
| IoT / GPS / Telemática y Señalización Audiovisual (27) | 7 | 27 |
| **Total** | **123** | **517** |

Observaciones de arquitectura de información:
- **Mismo producto en varias ramas:** "Racks y Gabinetes", "Herramientas", "Protección contra descargas", "UPS", "Torres y Mástiles", "Videoporteros" y "Sistemas de Emergencia" aparecen repetidos bajo varias raíces (Videovigilancia, Alarmas, Redes, Radiocomunicación…).
- **Nombres distintos para la misma raíz según la pantalla:** "Redes e IT" (menú) vs "Redes y Audio-Video" (menú móvil/filtros); "Alarmas / Intrusión y Casa Inteligente" (menú) vs "Automatización e Intrusión" (breadcrumb y outlet); "IoT / GPS / Telemática…" (menú) vs "GPS, Luces de Emergencia y Transporte" (Súper Precio).
- Casa inteligente (smart home) es **muy pequeña**: dentro de Alarmas solo "Automatización - Casa Inteligente" (Relevadores WiFi, Todo) y "Honeywell Total Connect"; las cámaras WiFi residenciales (EZVIZ) viven en Cámaras IP > WiFi.
- Sí existe una categoría **Videoverificación**, **Cercas Eléctricas**, **Generadores de Niebla**, **Centrales de Monitoreo** y **Protección Perimetral**: verticales de alarma que un distribuidor colombiano suele necesitar.


---

## 6. Listado de categoría (y resultados de marca / promoción / búsqueda)

Se analizaron: `Videovigilancia > Cámaras IP y NVRs` (265 resultados), `Automatización e Intrusión > Paneles de Alarma > Todos` (60), la búsqueda "DS-2CD" (136) y "cable" (788), y las landings `promociones/txpro-9785` (8) y `listadopormarca`.

**Layout**
- Breadcrumb con conteo: `Home > Videovigilancia > Cámaras IP y NVRs (265 Resultados)`; `Home > Buscar > "DS-2CD" (136 Resultados)`.
- Barra lateral izquierda de filtros + grilla de tarjetas a la derecha (clases Bootstrap `col-xs-6 col-sm-6 col-md-3 col-lg-2`: 2 por fila en móvil, 4 en 1374 px, 6 en pantallas grandes). **No hay vista lista/grilla, ni comparador, ni vista rápida.**
- Estado de carga: la lista llega por AJAX; mientras tanto se ve el breadcrumb "(Cargando...)" y la grilla vacía (entre 2 y ~10 s en búsquedas amplias como "cable").

**Filtros (idénticos en categoría, marca, promoción, outlet y búsqueda)**

| Filtro | Opciones observadas |
|---|---|
| Ordenar por | Relevancia · Más Vendidos · Precio de Menor a Mayor · Precio de Mayor a Menor · Modelo A-Z · Modelo Z-A · Marca A-Z · Marca Z-A. El orden por defecto **cambia según la página**: Más Vendidos (Cámaras IP y NVRs), Precio de Menor a Mayor (Paneles de Alarma > Todos, Outlet), Relevancia (búsqueda, marca, promociones) |
| Sede (está en el HTML pero **no se ve en la sesión anónima**; probablemente solo con login) | Todas · Sede Bogotá · Sede Bogotá (Celta) · Sede Cali |
| Sólo en Existencia | Checkbox |
| Promociones | En Oferta · Outlet · En Caja Abierta |
| Categorías | Checkboxes dinámicos según el resultado. Cámaras IP y NVRs: 4K, Bala, Codificadores y Decodificadores de Video, Cubo, Domo / Eyeball / Turret, Fisheye y Hemisféricas, Lente Motorizado, NVRs, Ocultas - Pinhole, PTZ, Térmicas, WiFi (12). En "cable": lista muy larga y plana con categorías de todos los niveles mezcladas alfabéticamente |
| Marcas | Checkboxes dinámicos. Cámaras IP y NVRs: EPCOM POWERLINE, EZVIZ, FANVIL, HIKVISION, HiLook by HIKVISION, HONEYWELL, SYNOLOGY, Syscom, SYSCOM VIDEO, UBIQUITI (10). Paneles de Alarma: AJAX, EZVIZ, HIKVISION, HONEYWELL HOME RESIDEO, M2M SERVICES, OPTEX, STI, Sure-Fi |
| **No existen** | Filtros por atributos técnicos (resolución, PoE, IR, canales, zonas...), rango de precio, disponibilidad por sede sin login, "nuevo" |

En móvil los filtros se abren en modales con botones "Cancelar / Aplicar".

**Paginación**
- Categoría: **sin paginación**; "Cámaras IP y NVRs" devuelve los 265 productos en una sola página (alto 27.836 px, 795 anclas de producto).
- Búsqueda: **300 productos por página**, paginador `« 1 2 3 »` (788 resultados para "cable"). Parámetro `pag`.

**Tarjeta de producto (usuario anónimo)**

| Elemento | Detalle |
|---|---|
| Imagen | Foto del banco de imágenes de Syscom (`ftp3.syscom.mx/usuarios/fotos/BancoFotografiasSyscom/{MARCA}/{MODELO}/…`, PNG). **Cambia al pasar el mouse** (`bloque_imagen(this,'principal')` / `'listado'`) |
| Título | Descripción larga del fabricante, cortada a 3 líneas con tooltip; enlaza a la ficha |
| Modelo | Enlace (azul) |
| Marca | Enlace (verde) |
| CTA | **"Acceder a mi Cuenta"** (gris) → `/login/` |
| **No muestra** | Precio, stock, badges (oferta/nuevo/outlet), calificaciones, botón de cotizar/agregar, especificaciones resumidas |
| Analítica | `onclick="sendEvt(this)"` con `data-event_name="clicked_on_products_list"`, posición y `id_query_search` (enlazado con Algolia Insights) |

Pie de la página: *"Especificaciones, Precios y Fotografías de los Productos: * Las especificaciones, características, funciones, cualidades, colores, precios, así como las fotografías son ciertas al momento de la publicación... * Los precios finales están calculados con un **4% de descuento adicional** tomando en cuenta que el tipo de pago es a contado, ya sea en efectivo o con transferencia electrónica. * El precio del producto puede cambiar dependiendo de la forma de pago. **Los precios publicados son precios sin IVA.** ** Precio especial hasta agotar existencias."*

Hallazgos:
- Ordenar por precio **funciona sin login** aunque el precio no se muestre (en Paneles de Alarma > Todos, ordenado de menor a mayor, aparecen primero comunicadores/expansores y al final paneles PROA7PLUS, V32FBPT, VISTA250BPT), lo que filtra el orden relativo de precios.
- Higiene de datos: en "Paneles de Alarma > Todos" conviven paneles, expansores, comunicadores y cámaras-sensor; títulos con errores tipográficos del proveedor ("Cámra", "Seguimeinto", "Denifición", "Soprota"); modelos con y sin guiones (`DS-2CD1043G2-LIU` vs `DS2CD1043G2LIU`).
- Las landings de promoción (p. ej. TXPRO) son **el mismo listado sin banner, sin condiciones y sin etiquetas de descuento**.

### 6.1 Inventario de controles del listado

| Control | Destino / acción |
|---|---|
| Breadcrumb "Home" y niveles | Home / categoría raíz |
| Selector "Ordenar por" | Recarga con `ordenar=` |
| Checkbox "Sólo en Existencia" | `stock=true` |
| Checkboxes Promociones / Categorías / Marcas | Filtran vía AJAX (`categoria=`, `marca=` en la URL de búsqueda) |
| Imagen, título, modelo | `/producto/{MODELO}-{MARCA}-{id}.html` (en búsquedas pasan por `/principal/searchcont`) |
| Marca (verde) | Ficha de marca o filtro |
| "Acceder a mi Cuenta" | `/login/` |
| Paginador (solo búsquedas) | `pag=2`, `pag=3` |

---

## 7. Ficha de producto

Fichas analizadas: **DS-2CD1043G2-LIU** (Hikvision, bala IP 4 MP, id 220979) y **VISTA-48LA** (Honeywell Home Resideo, panel de alarma híbrido, id 34666); además se verificó que ~80 fichas enlazadas desde el home responden 200 (HTML de 73 a 211 KB, renderizado en servidor).

**Estructura, de arriba hacia abajo**

| # | Elemento | Detalle |
|---|---|---|
| 1 | Breadcrumb | `Inicio > Videovigilancia > Cámaras IP y NVRs > Bala` |
| 2 | Título (es un H2, no H1) | Descripción larga con especificaciones: *"Bala IP 4 Megapixel / Lente 2.8 mm / ACUSENSE Lite (Detección de Movimiento en Humanos y Vehiculos) / Microfono Integrado / 30 mts IR EXIR 2.0 / Exterior IP67 / WDR 120 dB / PoE / ONVIF"* |
| 3 | Logo de la marca | A la derecha del título (HIKVISION) |
| 4 | Galería | Imagen principal + miniatura(s); sin video ni 360° |
| 5 | "Características Principales" | 6 viñetas visibles + enlace "... ver más" |
| 6 | Identificadores | **"Modelo:"** DS-2CD1043G2-LIU y **"Marca:"** HIKVISION (ambos enlaces a listados). No hay SKU interno visible ni código de barras/GTIN |
| 7 | **Caja de compra (anónimo)** | Botón azul **"Acceder a mi Cuenta"** + *"Para obtener su password por primera vez, contacte a su Representante de Ventas"*. Sin precio, sin stock, sin cantidad, sin botón de compra/cotizar |
| 8 | Caja "Productos Certificados SYSCOM" (colapsable, para unidades caja abierta/reacondicionadas) | *"Probamos, inspeccionamos y restauramos a condiciones de trabajo todos los productos SYSCOM. Existencias limitadas y actualizadas al día"* con tabla **Existencia / Clasificación / Su Precio** y enlace "Ver Política de Clasificación" (`/principal/paginasazul/id:95`) |
| 9 | **Accesorios Opcionales** (en la VISTA-48LA) | Carrusel con *chips* de categoría (Botones de Pánico, Comunicadores, Contacto Magnético Cableado/Inalámbrico, Controles Remotos, Interfaces, Módulos y Expansores, Movimiento para Interior, Receptores Inalámbricos, Sirenas y Estrobos, Teclados, Transformadores) y, por accesorio, título, modelo y **insignia azul "Inventario N"** (p. ej. 5800-PIR = 46, 5816 = 50, 5881ENH = 15, MN02LTEM = 177, 5802-WXT = 137), **visible sin login**. Enlace "Ver Todos los Accesorios" → `/principal/all_accessories/VISTA-48LA-HONEYWELL HOME RESIDEO-34666.html` |
| 10 | Pestañas | **Especificaciones** (texto enriquecido del fabricante) y **Descargas / Recursos** |
| 11 | Especificaciones (HIKVISION 1043G2) | Resolución máxima 4 MP (2560x1440), iluminación mínima, distancia focal 2.8 mm (99°), IR 30 m, WDR 120 dB, compresión H.265+, alimentación 12 Vcc/PoE 802.3af 6.5 W, temperatura -30 a 60 °C, IP67, dimensiones, peso 270 g, **"Garantía: 2 años"** (texto libre), accesorios opcionales con enlace por modelo (DS-1280ZJ-XS…), streams, E/S de audio y alarma, red, ONVIF/ISAPI, "Consideraciones" |
| 12 | Descargas / Recursos | Enlaces a PDF en `ftp3.syscom.mx`: **Especificaciones Técnicas**, **Guía de Inicio Rápido** (Baseline_1-3-Series-Multilingual), **Ficha Técnica** (`DS2CD1043G2LIUF_Ficha_Tecnica_20230914.pdf`), **Manual de Usuario** (`Network-Camera_Manual_de_Usuario_5.7.20_20240131.pdf`) |
| 13 | Notas al pie | Las mismas del listado: precios sin IVA, 4% por pago de contado |

**Modales incluidos en el HTML (se activan al iniciar sesión)**

| Modal | Texto/función |
|---|---|
| Inventarios | Tabla **Sucursal / Stock / En Camino**; leyenda "Equipos enviados de nuestro CEDIS" |
| En otras sedes | Ver stock en otra sucursal |
| Alerta de Stock | "Le enviaremos un correo avisando cuando llegue este producto a nuestros almacenes" |
| Solicitud de Distribución | "Coméntenos que aplicación le va a dar a este producto:" + Enviar (**inferido:** para productos de distribución restringida) |
| Compartir | **"Compartir con su Logotipo"**, "Compartir con precio" (moneda **US / CO**), "Compartir sin precio"; validación "Ingrese un precio valido antes de continuar"; genera una ruta que se copia al portapapeles |
| Producto Agregado | Confirmación + **Productos Relacionados** + botón "Ir al Carrito" |
| Lista de productos / Completar Solicitud | Solicitud multi-producto |
| Contenido del Kit o Sistema | Desglose de kits |
| Sin existencias suficientes | "El producto que seleccionó no tiene suficientes existencias" |
| Extra | "Código SAT copiado en portapapeles" (funcionalidad heredada de México) |

**Lo que no tiene la ficha:** calificaciones/reseñas, preguntas y respuestas, video, comparador, productos relacionados visibles (el bloque "Productos Relacionados (Algolia Recommend)" está **comentado** en el código), botones de compartir en redes, garantía como campo estructurado, tiempos de entrega, datos estructurados JSON-LD, Open Graph.

### 7.1 Inventario de enlaces/botones de la ficha

| Elemento | Destino |
|---|---|
| Breadcrumb | Home y categorías |
| "Modelo:" / "Marca:" | Listado por modelo / `listadopormarca/{MARCA}` |
| "ver más" | Expande características |
| "Acceder a mi Cuenta" | `/login/` |
| Chips y tarjetas de accesorios | `/producto/…` del accesorio |
| "Ver Todos los Accesorios" | `/principal/all_accessories/…` |
| Pestañas Especificaciones / Descargas / Recursos | Cambian el panel |
| Descargas | PDF en `https://ftp3.syscom.mx/usuarios/…` |
| Enlaces en el texto (p. ej. Hik-Connect) | Externos (`appstore.hikvision.com`) |

---

## 8. Buscador

| Aspecto | Observación |
|---|---|
| Tecnología | **Algolia Autocomplete** en el header (más eventos de Algolia Insights para conversiones/clics). En móvil hay un selector "Productos / Marca" junto al campo |
| Placeholder | Animado (máquina de escribir) con ejemplos reales: "Switch sfp+ 24 p", "Bobina de cable ca", "Domo IP 4" |
| Panel de resultados | Overlay de 2 columnas. Izquierda: **Categorías Secundarias**, **Categorías Finales**, **Marcas**. Derecha: **Productos** (miniatura, título, modelo, marca; 5 visibles con scroll) y **Base de conocimiento** (5 artículos con etiqueta "Conocimiento") |
| Prueba 1: `DS-2CD` | Cat. secundaria Cámaras IP y NVRs; finales Bala, Domo/Eyeball/Turret, Lente Motorizado, Fisheye y Hemisféricas; marca HIKVISION; productos DS2CD2021G1I(C), DS2CD1043G2LIU, DS2CD1123G2LIU…; artículos "Hikvision - Agregar canales secundarios de una fisheye…", "Configuración Reconocimiento Facial NVR iDS-7616NXI-I2/16P/X", etc. (enlazan a `soporte.syscom.mx/es/articles/…`). Enter → **136 resultados** |
| Prueba 2: `ds2cd1043g2` (minúsculas, sin guiones) | Encuentra `DS2CD1043G2LIU` y `DS2CD1143G2LIU`: **tolera guiones y mayúsculas** |
| Prueba 3: `camra ip 4mp exterior` | Resuelve el error y devuelve cámaras EZVIZ 4 MP exterior (CSH8C4MP, CSH3C4MP): **tolera typos** |
| Búsqueda por modelo / SKU | Sí (modelo es el identificador principal). No hay SKU interno separado |
| Resultados | `/principal/buscar?global_search={q}&ordenar=Relevancia&pag=1`. Rutas de clic pasan por `/principal/searchcont` (medición) |
| Límites | No hay filtro por atributo técnico ni corrección visible tipo "¿Quisiste decir…?"; los resultados no muestran precio |

---

## 9. Carrito, checkout y cotizador

| Elemento | Qué se pudo verificar |
|---|---|
| Carrito (`/principal/shopping_cart`) | **Requiere login**: responde HTTP 200 con `window.location.href="/login/"`. El botón "Carrito" del header muestra un contador (`#art_carrito_nav`) |
| Cotizador ("Cotice a sus Clientes", `/cotizador`) | **Requiere login** (mismo redireccionamiento). Anunciado en el footer como herramienta para el integrador |
| Solicitud de Crédito (`/credito`), Órdenes (`/panel/facturas_html`), PIN (`/pin/`), Wish List, Direcciones, Material de marketing (`/panel/marketing_digital`) y su carrito (`/panel/carrito_orden_marketing`), Garantías (`/panel/garantias_html`) | **Requieren login** |
| Pagos | Se carga la librería **Bold** (`checkout.bold.co/library/boldPaymentButton.js`, dos veces en el `<head>`), proveedor colombiano de pagos en línea (**inferido:** no se ve el checkout) Los T&C hablan de "servicios de terceros para procesar pagos (tarjetas, referencias de pago)" y contracargos. Antes hubo incentivo comentado: 1% de descuento por comprar en la web |
| Financiación | Existe "Solicitud de Crédito" en el menú de cuenta y un banner comentado "Crédito Express" (Valcredit). Términos no visibles |
| Comportamientos deducidos de las plantillas | Modal "Producto Agregado" con productos relacionados; validación de stock ("El producto que seleccionó no tiene suficientes existencias"); backorder (`backorder_informacion`); alerta de stock por correo |
| No verificado | Pasos del checkout, métodos de envío/recogida, costos de flete, plazos de pago, IVA en carrito, descuento por pago de contado aplicado, órdenes de compra |

---

## 10. Login y registro

**URL:** `https://www.syscomcolombia.com/login/` (título: "SYSCOM Colombia - Todo en Sistemas de Emergencia, Seguridad y Comunicación").

| Elemento | Detalle |
|---|---|
| Aviso superior (banda gris) | *"Todos nuestros productos son altamente especializados, por lo cual requieren su instalación, programación y soporte por personal calificado y capacitado. Discúlpenos, no vendemos al público"* |
| Columna izquierda | "Bienvenido a www.syscomcolombia.com" · campo **"Número de Cliente"** (placeholder "N° de Cliente"; en el HTML `name="numero"`, `type="email"`) · campo **"Password"** (`name="cliente"`) · botón azul **"Acceder"** |
| Enlace de recuperación | "¿No puede acceder u olvidó su contraseña?" → `/principal/recuperarpasswordazul` |
| Columna derecha | "Acceder a www.syscomcolombia.com" · "¿Requiere Contactar a un Distribuidor o Instalador?" → `/principal/contactoazul` · texto *"Utilice su número de cuenta o correo electrónico para acceder a SYSCOMCO. Contacte con su ejecutivo de cuenta si usted no cuenta con su número de cuenta o password para acceder."* · **"Pre-registro para Empresas Integradoras"** → `/principal/pre_registro/preregistro` · *"Solamente vendemos a integradores especializados y distribuidores certificados."* |
| No existe | Registro autoservicio, "recordarme", login social, 2FA visible, captcha visible (no verificado en el envío) |

**Recuperar password (`/principal/recuperarpasswordazul`):** "Teclee su Número de Cliente o Usuario" → botón "Solicitar Nuevo" → correo con solicitud de confirmación; aviso: si no llega en **10 minutos**, contactar al Ejecutivo de Ventas para actualizar el correo.

**Pre-registro (`/principal/pre_registro/preregistro`, código de formulario "F-AD-SAG-02 VERSIÓN. 02 FECHA 14/02/2024")** — no se envió; estructura leída del HTML:

| Paso | Campos |
|---|---|
| Inicio ("Validar datos") | Texto: *"Si te dedicas a la actividad comercial en telecomunicaciones, te invitamos a hacerte cliente SYSCOM. Si perteneces a otro sector o eres un usuario final, con gusto uno de nuestros canales lo atenderá en su localidad."* Selector **"Razón social": Persona Natural / Persona Jurídica**; campo de identificación/NIT con formato dinámico, validación del **dígito de verificación** y ayuda "¿Tiene dudas de cómo obtener el número de identificación o NIT? Descubre cómo aquí" (modal sobre el RUT); botón **Validar datos** (consulta si el NIT ya existe) |
| Paso 1: Datos de Empresa Integradora | Nombre comercial; Persona natural: tipo de identificación del representante legal (Cédula de ciudadanía, Cédula de extranjería, Pasaporte, Otro) y nombre completo; Persona jurídica: razón social, nombre del representante legal, **CIIU**, tipo y número de documento, correo del director; **correos por área**: facturación electrónica, cotizaciones, marketing, soporte, guías, cartera |
| Paso 2: Teléfonos de Contacto | Celular principal, fijo, celular de cartera |
| Paso 3: Dirección Comercial | País, departamento, ciudad, dirección; **Segmento o Clasificación**: Videovigilancia, Alarmas Electrónicas, Radiocomunicación, Redes, Control de Acceso, Energía Solar |
| Paso 4: Documentación Requerida | Perfil tributario (casillas): Responsable de IVA, No Responsable de IVA, Gran Contribuyente, Autorretenedor, Simple de Tributación, Retención FTE, Retención ICA, Retención IVA. **Cargas de archivo: Cámara de Comercio, Cédula del Representante Legal, RUT** |

Mensaje del formulario: *"En SYSCOM comercializamos exclusivamente con Integradores de sistemas e instaladores, dedicados al giro."*

---

## 11. Publicidad y marketing

### 11.1 Espacios publicitarios del sitio

| Espacio | Qué se anuncia | Nota |
|---|---|---|
| Hero (9 slides) | Ver §3.2: Honeywell (x2), TXPRO (puntos), Sinclair 5%, Kenwood escalonada, Jimi IoT 5%, Epcom Powerline 7%, LinkedPro, evento Smart City Expo Cali | Es el único bloque de "publicidad de marca" con jerarquía; imágenes de 3000x450 px hospedadas en `ftp4.epcom.net` |
| "Videos Soluciones" | Contenido de marca en formato *reel* (Grandstream, Kenwood, Ubiquiti, MikroTik…) | Widget Firework con la cuenta de Instagram @syscomcolombia |
| "Tendencia en…" (3 carruseles x 22) | Productos (Hikvision, HiLook, Epcom Powerline, MikroTik, Ruijie, V-SOL, Kenwood, TXPRO…) | Mezcla accesorios baratos y equipos; sin precio ni etiqueta de oferta |
| "Fabricantes Destacados" | 35 logos | Sin CTA de promoción |
| Botones de la barra superior | Súper Precio, Caja Abierta, Eventos | Colores de campaña (naranja, magenta, morado) |
| Página "Ofertas Septiembre" | 3 mosaicos (Seguridad, Conectividad, Radiocomunicación) con el **mismo arte** "¡ESTE MES, TU COMPRA VALE MUCHO +!" (radios Kenwood) y "Ver Productos" (`#`, controlado por JS) + contadores **Nuevo Precio (22)** e **Inventario Recibido (48)** + "Ver términos y condiciones" | El arte no diferencia los tres segmentos |
| Súper Precio (`/superprecio` = `/outlet`) | "Disfrute diferentes descuentos en todas nuestras líneas (equipo nuevo y caja abierta)" · 8 mosaicos por categoría · lema "Precio Bajo · Alta Calidad · Gran Stock · Grandes Promociones" | |
| Caja Abierta (`/singlepage/caja_abierta_home`) | "Equipos para Entrega Inmediata en su Sucursal más Cercana" → **Bogotá** + 8 categorías | Solo Bogotá aparece como sucursal |
| Cintillos / pop-ups | Sin banners emergentes, sin cintillo de anuncios; el bloque de notificaciones superior estaba vacío | |
| Calendario de eventos | 7 eventos próximos: webinar ATEN (7 oct, Bogotá), Certificación Oficial Ruijie RSE SMB Product Advanced (13-14 oct, Cali, presencial), Entrenamiento Presencial de Programación Básica en Paneles de Incendio Silent Knight (14 oct, Medellín), "Energía Solar 360°: Energía para Nuevas Oportunidades" (14 oct, Bogotá) y 3 más | Contenido patrocinado por marca (expositor = marca o Syscom) |

### 11.2 Promociones vigentes (T&C: `/principal/terminos_condiciones_promociones`, 2 páginas de acordeones)

| Promoción | Mecánica |
|---|---|
| Promoción escalera **Kenwood** Septiembre 2026 | Comprando 10 radios (NX1300DK5, NX1300NK6: 2 radios adicionales o escalera de auriculares TXEHK; NX1300NK4: 1 adicional o escalera) |
| **EPCOM Powerline 7%** Septiembre 2026 | 7% en kits UPS EPU-1KVA/2KVA/3KVA |
| **Sinclair 5%** Septiembre 2026 | 5% en toda la marca |
| **Jimi IoT 5%** Septiembre 2026 | 5% en toda la marca |
| **Epever 7%** Septiembre 2026 | 7% (sin banner en el hero) |
| **TXPRO puntos** (1 jul-30 sep 2026) | Puntos por modelo de radio y canje por premios (en banner) |
| Condiciones comunes (texto real de la promoción Kenwood) | *"Promociones válidas en referencias seleccionadas y hasta el 30 de Septiembre o agotar existencias. Para los productos entregados como obsequio, el cliente deberá asumir el valor correspondiente al IVA. Los beneficios no son acumulables con otras promociones."* |

### 11.3 Cómo se monetiza la publicidad de marcas (inferido)

- El sitio **no muestra anuncios de terceros ni redes de display**; el "inventario publicitario" es el hero, las promociones de marca y los videos. Los descuentos "en toda la marca" (5% y 7%) parecen **campañas cofinanciadas por el fabricante o con margen de la propia marca** (inferido; el sitio no lo explica).
- Varias marcas destacadas parecen **marcas propias o afines del grupo** (EPCOM, EPCOM POWERLINE, EPCOM PROFESSIONAL, LINKEDPRO, TXPRO, SYSCOM VIDEO, SYSCOM TOWERS; sus banners están en el dominio `epcom.net`) (inferido por nombre y hosting; no confirmado en el sitio). Esto sugiere que parte de la publicidad es autopromoción de marcas con mayor margen.
- Refuerzan la conversión con **programas de lealtad por marca** (puntos TXPRO) y **escaleras por volumen** (Kenwood).
- Medición: GTM, Meta Pixel (evento `Lead` disparado en cada carga de página), pixel de X/Twitter, Hotjar, eventos propios `clicked_on_products_slider` / `clicked_on_products_list`, Algolia Insights.

---

## 12. Canales de contacto, soporte y páginas institucionales

### 12.1 Canales

| Canal | Detalle |
|---|---|
| Teléfonos | **+57 (601) 744 3650** y **+57 (601) 653 0200** (footer, contacto, aviso de privacidad "+57 1 744 3650") |
| Correo | **recepcion@syscomcolombia.com** (footer/contacto; ofuscado con Cloudflare) |
| Sede Bogotá | Carrera 90A No. 64C38, Zona Industrial Álamos Norte, Bogotá · **Lunes a Viernes 7 am-6 pm** |
| Sede Cali | Calle 52 # 1 Norte - 73, Cali · **Lunes a Viernes 8 am-6 pm** |
| Otras sedes | En filtros de stock aparece "Sede Bogotá (Celta)" (probable segundo almacén; **inferido**, no explicado). En el calendario hay eventos en Medellín, pero no hay sede listada |
| Chat en vivo | **Intercom** (burbuja flotante). Fuera de horario: "Volveremos a conectarnos mañana". El formulario PQRSD también lista Intercom como canal |
| WhatsApp | **No hay enlace/botón público.** Solo se menciona como canal en el formulario PQRSD y en el texto global de "Acerca de" |
| Messenger | `https://www.messenger.com/t/SyscomOnline` |
| Redes | YouTube (`UC_b-uyS5i0knkZrsvWvIhJQ`), Facebook (`/syscomcolombia`), Instagram (`/syscomcolombia/`), TikTok (`@syscom.colombia`). No hay LinkedIn ni X |
| Ejecutivo de cuenta | Es el canal formal para obtener usuario y contraseña (se repite en login, ficha y recuperación) |
| Centro de ayuda | `https://soporte.syscomcolombia.com/es/` (Intercom Help Center, buscador "Buscar artículos..."). Colecciones vistas (artículos): Intrusión y Automatización 39, Videovigilancia 13, Control de Acceso 35, Detección de Incendios 22, Hikvision 8, Radiocomunicación y Energía 32, General 3, Redes Ópticas 3, Telefonía IP 6, Networking 17, V-SOL 6 (**≥184 artículos**). Autores: "Ingeniería" |
| Soporte remoto | Botón "Descargar AnyDesk" |
| Soporte técnico (encabezado vs. footer) | Header → `soporte.syscomcolombia.com` (Colombia); footer y menú móvil → `soporte.syscom.mx` (México). Inconsistente |
| Blog | `https://www.syscomblog.com/` (Blogger; último post visto: 24 sep 2026, "Revolución Digital con UniFi Connect...", y otros de Yealink, Hoffman, Fanvil) |

### 12.2 Páginas institucionales y de servicio

| Página | Contenido / hallazgo |
|---|---|
| Acerca de (`/principal/acerca_de`) | Texto global de Syscom **México** reutilizado: "¿Por qué SYSCOM?", "99.8% de mercancía en entrega inmediata", "Contamos con 21 sucursales... en México", "chat SYSCOM.MX y WhatsApp; también domingos de 9 a.m. a 4 p.m.", teléfonos de Chihuahua, lista de sucursales (incluye "Colombia"), historia ("Comenzamos fabricando y distribuyendo equipos de radiocomunicación..."), "Nuestra Web y App las hacemos aquí mismo en México" |
| Calidad de los productos (`/principal/paginasazul/id:4`) | "Un serio compromiso con nuestros distribuidores", monitoreo de calidad y laboratorio de soporte |
| Centro de Servicio (`/principal/centro_servicio`) | "¿Devolución de Equipo, Reparación o Garantía? Estamos listos." · botones "Platique con Nosotros", "Realizar Devolución, Garantía o Reparación", "Equipos en Reparación" · organigrama del equipo de soporte · formulario RMA ("obtener el número de RMA mediante el llenado del siguiente cuestionario"; botón Continuar) |
| Garantías (`/principal/garantias2`) | Resumen "DEVOLUCIONES Y GARANTÍAS" con botón "Ver Politica"/"Ver aviso completo" (documento aparte); el enlace del header (`/panel/garantias_html`) exige login |
| Reglamento de acuerdos comerciales (`/principal/politicas-ventas`) | Resumen de política de ventas (atención, cotización/compra, pagos, garantías, devoluciones, resolución de conflictos) + botón al documento completo |
| Términos y condiciones | Menciona "Sistemas y Servicios de Comunicación, S. A. de C.V. (SYSCOM® COLOMBIA SAS)" y **"ley mexicana"**; cláusulas de pagos por terceros y contracargos |
| Aviso de privacidad | Responsable: Syscom Colombia SAS, Cra. 90A No. 64C38, tel. +57 1 744 3650. Menciona videovigilancia en las instalaciones. Es breve (~1.500 caracteres), sin referencia visible a cookies |
| PQRSD (`/principal/form_pqrs/`) | Fecha de radicación, tipo, clasificación, **anonimato (sí/no)**, canal (Correo, Teléfono, Presencial, WhatsApp, Intercom), No. de cliente, CC/NIT, nombre/razón social, teléfono… + consentimiento de tratamiento de datos |
| SAGRILAFT y PTEE (`/principal/manual-sagrilaft`) | Manual de prevención de lavado de activos / financiación del terrorismo |
| Ética y transparencia | PDF (`ftp4.epcom.net/.../etica-transparencia-empresarial.pdf`) |
| Certificados de retenciones (`/principal/certificados_retencion/formulario_certificados`) | **Público:** NIT (sin dígito de verificación), correo, **código de verificación enviado al correo**, tipo (Retefuente, Retención IVA, Retención ICA Bogotá, ICA Funza, ICA Cali), fecha inicial/final |
| Calendario (`/calendario`) | "Presentaciones / Certificaciones / Eventos". Pestañas: TODOS, PRESENCIALES, PLÁTICA COMERCIAL, CURSOS EXPRESS, CERTIFICACIÓN, FORO, CURSOS ANTERIORES, PLÁTICAS ANTERIORES. Filtros: Lugar (Bogotá, Cali, Medellín, Bogotá DC), Meses (sep-dic), Categorías (Videovigilancia, Redes, Incendio, Energía, Alarmas, Control de Acceso, Radiocomunicación, GPS, Cableado, Colaboración, Tierras Físicas y Pararrayos, Ciberseguridad, Apoyo al Integrador, Fibra Óptica, Audio y Voceo, Señalización Audiovisual), buscador, idioma (Español/Inglés), "Descargar Calendario PDF". Cada evento: fecha, ciudad, horario, título, "Ver Programa" (`/calendario/info/programa/{id}`), **"Regístrese"** (GoToWebinar `attendee.gotowebinar.com/register/…`), expositor (marca o Syscom), categoría, sello "PRESENCIAL" |
| Centro de Webinars (`/principal/centrowebinars`) | Biblioteca con filtros e idioma; conteos por categoría: Alarmas 836, Redes 733, Control de Acceso 514, Videovigilancia 497, Radiocomunicación 277, Colaboración 196, Incendio 145, Energía 115, GPS 92, Cableado 62, Tierras Físicas 46, Audio y Voceo 12, Señalización 10, Robots & Drones 6, Fibra 4, Ciberseguridad 2, Apoyo al Integrador 2; pestañas Próximos Cursos / Cursos Anteriores |
| 80 Soluciones (`/singlepage/syscom_80_soluciones`) | "Mejores 80 Soluciones de Integración 2020": presentaciones de 30 min sin comerciales por marca (EnGenius, Jabra, Grandstream…), contenido de 2020 |
| SYSCOM Apps (`/principal/syscom_apps`) | "Seguridad Versátil en una Plataforma" (Hik-ProConnect), HikCentral Professional ("Ir a HikCentral"), grabación en la nube, **EPCOM GPS / Wialon**. El texto tiene errores de codificación ("m viles", "c maras") |
| Frecuencias de Uso Libre | Decretos de **México** (1995, 1996, 1998, 2006) y un inventario a octubre de 2018, sin equivalentes colombianos |
| Calculadores públicos | **Calculador de Cámara** (tamaño de sensor 1/3" o 1/2", tipo de cámara D1/720P/2/3/4/5/8 MP, lente mm, distancia al objetivo en metros; indica si se pueden identificar rostros, efectivo o placas) y **Calculador de Distancia de Cable** (CD/CA, voltaje, corriente, tolerancia %, pares, calibre AWG → caída de voltaje, corriente total, resistencia, distancia máxima). Aunque viven en `/panel/…` y muestran el menú de cuenta, **abren sin sesión** |


---

## 13. Stack técnico, SEO, rendimiento, accesibilidad y seguridad

### 13.1 Stack detectado

| Capa | Hallazgo (evidencia) |
|---|---|
| Plataforma | **Desarrollo propio en PHP** (cookie `PHPSESSID`), páginas renderizadas en servidor + AJAX (`/ajax/navegacion_load`, `/ajax/wishList_controller`, `/ajax/admin_prod_req`, `/ajax/eventos_controller2`). El propio "Acerca de" dice "Nuestra Web y App las hacemos aquí mismo en México": es una **instancia regionalizada de la plataforma de Syscom México** (assets en `ftp3.syscom.mx`, favicon `www.syscom.mx/favico/`). No es Shopify/Magento/WooCommerce |
| CDN / WAF | **Cloudflare** (`server: cloudflare`, nodo `-BOG`). HTML sin caché (`cache-control: no-store, no-cache, must-revalidate`, `cf-cache-status: DYNAMIC`) |
| Front-end | **Bootstrap 3**, **jQuery 1.12.4** (2016, fuera de soporte), Font Awesome 4, bootstrap-toggle, fuente Rubik, iconos propios (`syscom_icons`). Carrusel Bootstrap nativo |
| Búsqueda | **Algolia** (Autocomplete + Insights; "Algolia Recommend" referenciado pero comentado) |
| Chat / ayuda | **Intercom** (mensajería y Help Center). Además se cargan archivos de un chatbot propio (Vue.js + BotUI, `/chatbot/js/syscom_chatbot.js`, comentario de 2023); no se comprobó si es visible |
| Video | **Firework** (`asset.fwcdn3.com`, `fireworktv.com`, `fwpixel.com`) |
| Pagos | Librería **Bold** (`checkout.bold.co`) |
| Analítica y ads | Google Tag Manager `GTM-52LTZDT`, **Meta Pixel** (`PageView` y `Lead` en cada carga), **pixel de X/Twitter**, **Hotjar** (site 6380097), eventos propios (`clicked_on_products_slider`, `clicked_on_products_list`) |
| Webinars | GoToWebinar (registro) |
| Blog | Blogger (`syscomblog.com`) |
| Markdown | `showdown.js` (T&C de promociones cargados como markdown) |
| PWA | Existe `manifest.json` (`name: SYSCOM`, `display: standalone`, `gcm_sender_id`) pero **no hay service worker** (`/service-worker.js` devuelve el 404 HTML) |
| Idioma / moneda | Español; `<html lang="en">`. Sin selector de idioma (solo el filtro de webinars). Moneda por defecto **USD** con toggle COP; TRM visible; precios sin IVA con toggle |

### 13.2 SEO técnico

| Punto | Estado |
|---|---|
| `robots.txt` / `sitemap.xml` / `sitemap_index.xml` | **No existen**: devuelven la página 404 con **HTTP 200** |
| Códigos de error | **Toda URL inexistente responde 200** (soft 404), incluidos productos inexistentes y `/principal/distribuidoresNoautorizados` |
| Títulos | Home: "SYSCOM Colombia - Todo en Sistemas de Emergencia, Seguridad y Comunicación". **El mismo título se repite** en login, calendario, contacto, ofertas, políticas, etc. Categoría: "SYSCOM Colombia: VIDEOVIGILANCIA / CAMARAS IP" (mayúsculas, sin tildes). Producto: "SYSCOM Colombia: {MODELO}-{MARCA} - {descripción larga}" |
| Meta description | **Vacía en el home**; en producto es una copia del título; en categorías/institucionales igual al título del sitio |
| Canonical / Open Graph / Twitter Cards | **Ninguno** |
| Datos estructurados (JSON-LD / microdata) | **Ninguno** (0 en home y en ficha) |
| Encabezados | Home: 0 H1 y 0 H2. Ficha: el título es H2 y hay dos H1 con el texto "Recursos" (mal uso) |
| Breadcrumbs | Visuales, sin marcado |
| Listados | Los productos llegan **por AJAX**: el HTML inicial de categorías/búsquedas solo trae filtros vacíos y "Sin categorias disponibles" (no rastreable sin ejecutar JS). Filtros por parámetros sin canonical |
| URLs | Semi-amigables con id numérico y slug; slugs inconsistentes con el nombre visible |
| `robots` meta | `index, follow` en todo, incluso login y carrito |
| Redirecciones | http→https 301; `syscomcolombia.com`→`www.` 301; el login gate se hace con JavaScript (HTTP 200), no con 302 |

### 13.3 Rendimiento percibido (una medición, Chrome de escritorio; puede variar)

| Métrica | Valor |
|---|---|
| TTFB del home | ~1,4 s (HTML dinámico, sin caché) |
| DOMContentLoaded / load | ~2,05 s / ~2,4 s |
| Requests del home | 158 (26 al propio dominio, 59 a `ftp3.syscom.mx`, 53 a `ftp4.epcom.net`, 9 a Firework, el resto terceros) |
| Imágenes / nodos DOM | 118 imágenes (15 sin `alt`) / 1.747 nodos |
| Peso del HTML | Home ~186 KB sin comprimir; fichas 73-211 KB |
| Banners del hero | 9 imágenes de 261 KB a 1.030 KB (**~6,3 MB**), sin lazy loading |
| Listado 265 productos | Un solo documento de 27.836 px de alto |
| Búsquedas amplias ("cable", 788 resultados) | La grilla tarda varios segundos en aparecer ("(Cargando...)") |
| Nota | El navegador no expone `transferSize` de recursos de otros dominios, por lo que no se pudo sumar el peso total real de la página |

### 13.4 Responsive y accesibilidad básica

- **Responsive:** el servidor entrega el mismo HTML a móvil y escritorio; Bootstrap 3 con un `navbar` distinto para <992 px (retroceso, hamburguesa, logo, usuario, selector Productos/Marca, accesos Cursos/Outlet/Soporte). Verificado a 390 px de ancho: hero, videos y accesos rápidos se ven correctamente.
- **Zoom bloqueado:** `viewport` con `maximum-scale=1.0, user-scalable=0` (mala práctica de accesibilidad).
- **`lang="en"`** con contenido en español; controles del carrusel con texto "Previous / Next" en inglés.
- **Menú principal no accesible por teclado:** los 9 botones de categoría tienen `tabindex="-1"` y el megamenú se abre solo con clic.
- 10 enlaces sin texto accesible en el home, 15 imágenes sin `alt`, `alt` de producto = solo el modelo, sin enlace "saltar al contenido", 3 `<nav>` y ningún `<header>`.
- Contraste y lector de pantalla: **no verificado**.
- Existe **tema oscuro** (toggle en el menú de cuenta y CSS `application_drk.css`), visible solo con sesión.

### 13.5 Seguridad y privacidad (observable desde fuera)

- HTTPS activo con redirección; **sin HSTS**, sin `Content-Security-Policy`, sin `X-Frame-Options` ni `X-Content-Type-Options` en el home (solo `X-XSS-Protection: 1;mode=block`).
- Cookie de sesión `PHPSESSID` con solo `path=/` (**sin `Secure`, `HttpOnly` ni `SameSite`** en la cabecera observada).
- **No hay banner de consentimiento de cookies** y el aviso de privacidad no menciona cookies, pese a cargar GTM, Meta Pixel, pixel de X, Hotjar, Intercom y Firework.
- Las peticiones a Algolia exponen en el navegador un ID de aplicación y una clave (esperable en Algolia; se asume una clave de solo búsqueda; no se reproduce aquí).
- El pre-registro incluye un token de formulario oculto y validación de NIT; el código de verificación por correo en "Certificados de retenciones" es un buen control (PQRSD no se inspeccionó a ese nivel).

---

## 14. Modelo de negocio inferido

| Dimensión | Lectura |
|---|---|
| **B2B vs B2C** | **B2B puro** y declarado ("no vendemos al público"; "Solamente vendemos a integradores especializados y distribuidores certificados"). Cliente objetivo: integradores, instaladores, distribuidores "dedicados al giro" (telecomunicaciones/seguridad) |
| **Acceso a precios** | Solo con sesión. La cuenta se crea **fuera de la web**: pre-registro con documentos legales → ejecutivo de cuenta entrega número de cliente y password. La ficha muestra **"Su Precio"** (precio personalizado) y "Clasificación" (estado de producto caja abierta/certificado) |
| **Niveles de cliente** | No hay niveles con nombre visibles (tipo Oro/Plata). El precio parece **individual por cliente** (inferido); existe "Solicitud de Crédito" (líneas de crédito) |
| **Moneda y precios** | Moneda por defecto USD con conversión a COP mediante **TRM publicada** (**inferido:** catálogo indexado a USD) ($3,306.86 al 29-sep-2026); precios **sin IVA** con toggle "con I.V.A."; **4% adicional** por pago de contado (efectivo o transferencia) |
| **Promociones** | Ofertas mensuales ("Ofertas Septiembre"), **Nuevo Precio** (22 ítems), **Inventario Recibido** (48), **Súper Precio** (nuevo y caja abierta/outlet), **Caja Abierta** (entrega inmediata en Bogotá), campañas por fabricante (5%, 7%, escaleras por volumen, puntos TXPRO), T&C unificados |
| **Financiación** | Crédito comercial para clientes (login) y tarjeta vía pasarela (Bold, inferido); banner "Crédito Express" (Valcredit) comentado |
| **Programas para integradores** | Formación (webinars, cursos express, certificaciones oficiales de marca, presencial en Bogotá, Cali y Medellín), centro de ayuda técnica (≥184 artículos), cotizador con marca del integrador, fichas compartibles con su logo y su precio, material de marketing, calculadores, generador de PIN, "Apoyo al Integrador", protección de canal ("Distribuidores No Autorizados") |
| **Logística** | 3 puntos de stock (Bogotá, Bogotá-Celta, Cali) + CEDIS con "En camino"; "Entrega inmediata" en sucursal (Caja Abierta Bogotá); alerta de stock |
| **Cumplimiento** | SAGRILAFT/PTEE, política de ética, PQRSD, retenciones (Retefuente, ReteIVA, ReteICA Bogotá/Funza/Cali), facturación electrónica |
| **Monetización de publicidad de marcas** | Ver §11.3: hero y promos cofinanciadas por fabricantes (inferido), videos de marca, eventos y certificaciones patrocinados, más autopromoción de marcas propias afines. No hay display ads de terceros |
| **Captación** | Sin SEO de producto (fichas sin datos estructurados, sin sitemap): la adquisición es **ventas directas + eventos + marketing de marca**; el sitio actúa como catálogo/portal de pedidos para clientes ya calificados |
| **Escala** | 649 categorías, ~144 marcas, 265 SKUs solo en Cámaras IP/NVRs; presencia en Bogotá y Cali con eventos en Medellín |

---

## 15. Fortalezas, debilidades e ideas aplicables a Grupo Security

### 15.1 Fortalezas de Syscom (con evidencia)

1. **Buscador excelente:** Algolia con typos, modelos sin guiones, categorías/marcas/productos y **base de conocimiento** en el mismo panel.
2. **Profundidad y jerarquía de catálogo:** 3 niveles claros, megamenú de 5 columnas, marcas A-Z.
3. **Transparencia parcial de inventario:** "Inventario N" en accesorios sin login; por sede y "En camino" con login; alerta de stock.
4. **Herramientas de marca blanca para el integrador:** compartir ficha con su logo y su precio (USD/COP) o sin precio; cotizador; material de marketing.
5. **Calculadores públicos** (cámara y cable) que sirven como gancho de captación.
6. **Formación y conocimiento como motor de ventas:** calendario filtrable, webinars con registro, certificaciones, Help Center, blog, videos cortos.
7. **Pre-registro serio y adaptado a Colombia:** NIT con dígito de verificación, CIIU, perfil tributario, RUT/Cámara de Comercio/cédula.
8. **Cumplimiento local:** PQRSD, SAGRILAFT/PTEE, certificados de retención con verificación por correo.
9. **Mensaje B2B inequívoco** en el login (filtra usuarios finales sin fricción de soporte).
10. **Fichas con descargas completas** (ficha técnica, manual, guía rápida, especificaciones) y accesorios compatibles por producto.
11. **Estructura promocional ordenada:** T&C único, promos por marca, outlet/caja abierta separados de lo nuevo.
12. **TRM visible y toggles COP/USD e IVA** (transparencia de precio para B2B).

### 15.2 Debilidades de Syscom

1. **Cero precio visible** y **sin registro autoservicio** ni estado de solicitud: el interesado depende de un ejecutivo (fricción alta para nuevos integradores).
2. **Listados pobres:** sin filtros técnicos ni rango de precio, sin comparador, sin paginación en categorías (265 en una página), orden por defecto inconsistente, datos de catálogo con typos y mezcla de accesorios con equipos.
3. **SEO/técnico deficiente:** sin sitemap/robots, soft 404 generalizado, títulos duplicados, sin H1/canonical/OG/JSON-LD, contenido de listados solo por AJAX.
4. **Contenido de México filtrado en la versión Colombia:** "ley mexicana" en T&C, decretos de frecuencias de México, "Código SAT", "21 sucursales en México", soporte técnico de `soporte.syscom.mx`, teléfonos de Chihuahua.
5. **Accesibilidad:** zoom bloqueado, menú sin teclado, `lang="en"`, imágenes sin `alt`.
6. **Peso de banners** (~6,3 MB en el hero), 158 requests, jQuery 1.12.4.
7. **Sin WhatsApp público** y con chat solo en horario ("Volveremos a conectarnos mañana"); sin cookie consent.
8. **Hero con enlaces débiles:** un slide apunta al propio home; las landings de promoción son listados sin explicación ni etiquetas de descuento; el mosaico "Ofertas" usa el mismo arte en los tres segmentos.
9. **Moneda por defecto en USD** en un sitio colombiano.
10. **Inconsistencias de nombres** entre menú, breadcrumbs, móvil y outlet; marcas duplicadas (ANDREW x4 variantes, CAMBIUM x2, MCDI x2, LINKEDPRO x3, "M,"), y enlaces de footer rotos.
11. **Smart home muy pobre** en la estructura (casi todo es profesional/industrial), lo que abre espacio en el segmento residencial.

### 15.3 Ideas priorizadas para Grupo Security

Supuesto: Grupo Security tiene storefront/catálogo público, portal de clientes B2B, cotizaciones, listas de precios y fichas de producto (según el encargo). Prioridad: **P0** = diferencia clara, hacer primero; **P1** = alto valor; **P2** = mejora posterior. Esfuerzo: S (días), M (semanas), L (meses).

| # | Prioridad | Idea | Evidencia en Syscom | Cómo hacerlo mejor | Esfuerzo |
|---|---|---|---|---|---|
| 1 | P0 | **Registro B2B autoservicio con estado de solicitud** | Pre-registro de 4 pasos con validación de NIT, RUT, Cámara de Comercio, cédula, perfil tributario | Mantener campos y validaciones, pero mostrar "en revisión/aprobado", SLA y activación automática de lista de precios básica; evitar el "contacte a su ejecutivo para el password" | M |
| 2 | P0 | **Precio orientativo o rango visible + "Ver mi precio"** | Syscom oculta todo (botón "Acceder a mi Cuenta") | Mostrar "desde $X" o nivel/rango público para catálogos de entrada (smart home, kits) y precio real tras login; reduce rebote sin exponer la lista completa | M |
| 3 | P0 | **Ficha de producto estructurada y rastreable** | Ficha con descargas y accesorios, pero sin JSON-LD/OG/canonical, título=descripción | Renderizado en servidor, `Product` JSON-LD (sin precio si aplica), canonical, H1 correcto, sitemap por categoría/marca, breadcrumbs marcados | M |
| 4 | P0 | **Stock por bodega + "en camino" + alerta de stock** | Modal Inventarios (Sucursal/Stock/En camino), filtro por sede, alerta por correo | Mostrar disponibilidad agregada pública (Disponible / Bajo / Agotado) y detalle por bodega con login; alerta de stock por correo y WhatsApp | M |
| 5 | P0 | **Cotizador con marca blanca** | "Cotice a sus Clientes" + Compartir con logo/precio (USD/CO) | Cotización PDF/enlace con logo del integrador, margen configurable, IVA, vigencia y botón "convertir en pedido"; historial por cliente | L |
| 6 | P1 | **Filtros por atributos técnicos** | Syscom solo tiene sede/existencia/promo/categoría/marca | Facetas: resolución (MP), tipo (bala/domo/PTZ), PoE, IR, canales, zonas, protocolo (Wi-Fi/Zigbee), tecnología (Turbo HD/IP), marca; guardar filtros | M |
| 7 | P1 | **Buscador con typos, modelo sin guiones y base de conocimiento** | Algolia Autocomplete con 5 secciones | Usar Algolia/Meilisearch/Typesense con sinónimos (cámara/camara/CCTV), normalizar modelos, incluir artículos, fichas y accesorios compatibles | M |
| 8 | P1 | **Listas de precios con COP por defecto, TRM visible y toggle IVA** | USD por defecto, TRM, toggles, 4% pago contado | COP por defecto; mostrar TRM solo si hay precios indexados a USD; descuento por pronto pago/transferencia claro por línea | S |
| 9 | P1 | **Promociones con landing propia** | Promos como listados sin explicación; T&C separado | Landing por campaña con mecánica, vigencia, productos participantes, T&C y contador; etiquetas de descuento en tarjeta | S |
| 10 | P1 | **Programa de puntos/escalera por volumen** | TXPRO puntos, Kenwood escalonada | Módulo de lealtad por marca y por cliente (puntos, saldo, canje) y promos por volumen en el carrito | L |
| 11 | P1 | **Calculadores públicos como captación** | Calculador de cámara y de cable abiertos | Añadir calculadoras de almacenamiento/ancho de banda NVR, presupuesto PoE, autonomía de UPS/batería, cobertura de sensores y zonas de alarma; pedir correo para guardar/descargar resultado | M |
| 12 | P1 | **Academia + Help Center** | Calendario con filtros, webinars, Intercom Help Center | Calendario por ciudad/categoría, registro con recordatorio, grabaciones y certificados; Help Center por marca/sistema | M |
| 13 | P1 | **WhatsApp Business visible + chat** | Syscom no publica WhatsApp; chat solo Intercom | Botón flotante WhatsApp (catálogo, cotización, estado de pedido) y chat fuera de horario con respuesta diferida | S |
| 14 | P2 | **Accesorios compatibles con inventario en la ficha** | Carrusel de accesorios con chips e "Inventario N" | Compatibilidad explícita (panel ↔ teclado ↔ sensor ↔ comunicador), "kit sugerido" y venta cruzada | M |
| 15 | P2 | **Certificados y cumplimiento en autoservicio** | Certificados de retención con código por correo; PQRSD; SAGRILAFT | Portal con certificados (Retefuente/ReteIVA/ReteICA), estados de cuenta, facturas y PQRSD con número de radicado | M |
| 16 | P2 | **Listados paginados/infinitos, orden por defecto coherente y comparador** | 265 productos en una página, órdenes distintos según página | Paginación o "cargar más", comparador de 3-4 equipos, vista lista/grilla | S |
| 17 | P2 | **Smart home como vertical fuerte** | Casa inteligente casi ausente en Syscom | Categoría y contenido residencial (kits Wi-Fi, cerraduras, videoporteros IP, sensores inalámbricos), guías para instaladores | M |
| 18 | P2 | **Base técnica moderna** | jQuery 1.12.4, HTML sin caché, banners de 1 MB | Imágenes WebP/AVIF con lazy loading, caché de páginas públicas, CSP/HSTS, cookie flags, consentimiento de cookies, `lang="es-CO"`, accesibilidad (zoom, teclado, alt) | M |
| 19 | P2 | **Consistencia de datos** | Marcas duplicadas, títulos con errores, mezcla accesorio/equipo | Diccionario de marcas y modelos, validación de títulos, reglas de categorización | M |

**Qué evitar (errores de Syscom):** soft 404, ausencia de sitemap/robots, títulos y metas duplicados, texto/normativa de otro país, hero con enlaces sin destino útil, dependencia total de un ejecutivo para obtener acceso, banners pesados sin lazy loading.

---

## 16. Enlaces rotos, errores y puntos no verificados

### 16.1 Errores y hallazgos técnicos

| # | Hallazgo | Detalle |
|---|---|---|
| 1 | **Enlace roto del footer** | "Distribuidores No Autorizados" → `/principal/distribuidoresNoautorizados`: muestra "404 Not Found: La página o producto que ha solicitado no se encuentra o fue removida..." pero con **HTTP 200** |
| 2 | Sin `robots.txt` ni `sitemap.xml` | Devuelven la página 404 con HTTP 200 (`/robots.txt`, `/sitemap.xml`, `/sitemap_index.xml`, `/humans.txt`, `/.well-known/security.txt`, `/service-worker.js`, `/ads.txt`) |
| 3 | Soft 404 generalizado | Cualquier ruta inexistente (`/noexiste-abc`) y producto inexistente (`/producto/XXXX-YYYY-1.html`) responden 200 |
| 4 | Slide 2 del hero | Enlaza al home (`/`) en lugar de a una página del evento Smart City Expo Cali |
| 5 | Soporte técnico inconsistente | Header: `soporte.syscomcolombia.com` (Colombia). Footer y menú móvil: `soporte.syscom.mx` (México) |
| 6 | Contenido de México | T&C ("ley mexicana"), Frecuencias de Uso Libre (decretos de México), "Código SAT copiado en portapapeles", "Acerca de" (21 sucursales en México, teléfonos de Chihuahua) |
| 7 | Errores de codificación | `/principal/paginasazul/id:95` ("PolÃ­tica de ClasificaciÃ³n de Productos"), `/principal/syscom_apps` ("m viles", "c maras"), caracteres `â€‹` en especificaciones de producto |
| 8 | Marcas duplicadas / con error en `/principal/brands` | ANDREW, ANDREW / COMMSCOPE, ANDREW/COMMSCOPE, COMMSCOPE (ANDREW); CAMBIUM NETWORKS x2; MCDI x2; LINKEDPRO x3; entradas "M," y "VARIOS". En el home, `WILSONPRO_/PANDUIT` y `WILSONPRO_/_WEBOOST` devuelven la misma página |
| 9 | Input "Número de Cliente" con `type="email"` | Puede rechazar números de cliente en algunos navegadores/móviles |
| 10 | Meta Pixel | `fbq('track','Lead')` se dispara en cada carga de página (ensucia la métrica de leads) |
| 11 | Peticiones de medición con error | En la prueba, una llamada a `insights.algolia.io/1/events` y otra a `api-iam.intercom.io/messenger/web/metrics` devolvieron **503** (observación única, puede ser transitoria) |
| 12 | Login gate por JavaScript | `/cotizador`, `/credito`, `/panel/*` y `/principal/shopping_cart` devuelven HTTP 200 con un `<script>` de redirección, no un 302 |
| 13 | Menú de cuenta en HTML público | El HTML del home incluye el menú de cuenta completo (rutas de funciones internas) aunque no sea visible |
| 14 | Calculadores en `/panel/…` accesibles sin sesión | Probablemente intencional (herramientas públicas), pero rompe la convención de que `/panel` es privado |
| 15 | Estado de enlaces externos | `facebook.com/syscomcolombia` devolvió 400 y `anydesk.com/es/downloads` 403 **a curl** (bloqueo antibot; no se confirmó desde el navegador). `crediexpress.valcredit.co/syscom` (solo aparece comentado) no respondió |

De los ~163 enlaces del home probados (páginas propias, fichas, marcas, promos, externos) todos respondieron 200 salvo los casos anteriores; el único 404 real es el del punto 1.

### 16.2 Lo que no se pudo verificar y por qué

| Tema | Motivo |
|---|---|
| Precios, "Su Precio", clasificaciones y stock real por sede | Requieren sesión de cliente (no se crearon cuentas ni se usaron credenciales) |
| Carrito, checkout, métodos de pago/envío, cotizador, crédito, órdenes, wish list, PIN, material de marketing | Detrás del login |
| Resultado de "Validar datos" del pre-registro y validación de los pasos 1-4 | Se leyó el HTML; no se envió el formulario |
| Contenido de las políticas completas (garantías, reglamento comercial) | Son documentos a los que se accede con botones; no se descargaron |
| Segunda página de T&C de promociones y condiciones de Epever/Sinclair/Jimi/Epcom | Solo se leyó el acordeón de Kenwood; las demás se cargan por JS |
| Segundo almacén "Celta" y sede Medellín | Aparecen como filtro/evento; no hay página que los describa |
| Visibilidad del chatbot Vue/BotUI | Los scripts se cargan, pero el widget visible fue Intercom |
| Ficha de kit ("Contenido del Kit o Sistema") y de productos certificados/caja abierta | Solo se ve la plantilla; no se localizó una ficha pública con esos bloques activos |
| Cookies que fija JavaScript (GTM, Meta, Hotjar, Intercom) | La herramienta de navegador bloquea la lectura de cookies; solo se revisó la cabecera `Set-Cookie` |
| Rendimiento real (Core Web Vitals/Lighthouse) | No se ejecutó Lighthouse; solo una medición de `performance` (sin LCP: la API no lo devolvió) |
| Ubicación de los enlaces a SAGRILAFT | La ruta `/principal/manual-sagrilaft` existe y responde, pero no se identificó desde qué pantalla se enlaza |
| Redes sociales (contenido) | No se inspeccionaron los perfiles |

### 16.3 Herramientas y límites del análisis

Análisis realizado con navegador real (Chrome) más `curl` para volcar HTML/cabeceras. La herramienta de scripting del navegador bloquea la lectura de cookies y cadenas de consulta y trunca las respuestas largas, por lo que la extracción masiva de estructura se apoyó en `curl` y en el endpoint AJAX del megamenú. El contenido generado por JavaScript (listados, megamenú, calendario) se verificó en el navegador.

---

## Apéndice A. Árbol completo de categorías (ids)

Formato: **Nivel 2** `[id]` — Nivel 3 `id`. URL nivel 2: `/principal/listadoportadasazul/{slug}-{id}.html`; URL nivel 3: `/principal/listadoproductosazul/{slug}-{id}.html` (URLs completas en `syscom-colombia-categorias.csv`).


### Videovigilancia (id 22)
- **Accesorios Generales** `[218]` — Cajas de Interconexión `1976`; Controladores PTZ `3024`; Gabinetes para Cámaras `1349`; Kits Extensores, Convertidores , Divisores, HDMI, VGA, DVI `66018`; Micrófonos `66016`; Montajes y Brackets para Cámaras `1365`; Probadores de Video `65977`; Transceptores de Video `225`; Video Inalámbrico `66027`
- **Cámaras Analógicas y DVRs** `[476]` — 4K `66148`; Bala `65776`; Domo / Eyeball / Turret `65775`; Lente Motorizado `65850`; PTZ `65779`; Videograbadoras Analógicas - TurboHD TVI / AHD / CVI `2809`
- **Cámaras IP y NVRs** `[214]` — 4K `65745`; Bala `1323`; Codificadores y Decodificadores de Video `1379`; Cubo `1324`; Domo / Eyeball / Turret `1325`; Fisheye y Hemisféricas `1320`; Lente Motorizado `65851`; NVRs Network Video Recorders `1383`; Ocultas - Pinhole `2672`; PTZ `1326`; Térmicas `65610`; WiFi (Inalámbricas) `66149`
- **Cables y Conectores** `[206]` — Cable Coaxial y Conectores `65869`; Cables Armados - Coaxial `65868`; Categoría 5e `1420`; Categoría 6 `1421`; Categoría 6A `3054`; Fibra Óptica `65804`; Para Alimentación y Electricidad `1295`; Para Redes RJ-45 `65917`; VGA / DVI / HDMI `65867`
- **Energía** `[208]` — Adaptadores de Pared `66012`; Baterías `66014`; Fuentes de Alimentación `2975`; Fuentes de Alimentación con Respaldo `66011`; Inyectores PoE `66169`; PDU `66040`; Plantas de Energía `66013`; PoE de Largo Alcance `66170`; Switches PoE `66168`; Transformadores `1302`; UPS - No Break `2976`
- **Gabinetes y Accesorios** `[460]` — Gabinetes con Soporte Rack `2724`; Gabinetes de Pared `2831`
- **Herramientas** `[210]` — Accesorios de Instalación `2887`; Herramientas Eléctricas `2886`; Para Cable RG59 `1300`; Para Cable UTP (Cat5e, Cat6) `2307`; Probadores de Video `1366`
- **Monitores Pantallas y Mobiliario** `[65968]` — Pantallas / Monitores `65971`; Publicidad Digital (Digital Signage) `66069`; Videowall Seguridad `65969`
- **Protección Contra Descargas** `[519]` — Coaxial `3023`; Redes `3020`
- **Racks y Gabinetes** `[520]` — Accesorios `3031`; Gabinetes `3030`; Montajes `3043`; Racks `3029`
- **Servidores / Almacenamiento** `[65963]` — Accesorios `65967`; Almacenamiento NAS / SAN / eSATA `65965`; Discos Duros Mecánicos (HDD) `1340`; Estaciones de Trabajo `65966`; Memorias SD / Memorias Micro SD `65973`
- **Software CMS / VMS / Hosting** `[65982]` — Digifort `65984`; HIKVISION `65988`
- **Videograbadoras Móviles y Portátiles** `[525]` — Accesorios `65665`; Cámaras `65810`; Videograbadoras Móviles `3042`; Videograbadoras Portátiles `66151`
- **Videoporteros e Interfonos** `[226]` — Multiapartamentos `1412`; Videoporteros Analógicos `1410`; Videoporteros IP `65958`

### Control de Acceso (id 37)
- **Acceso Vehicular** `[499]` — Accesorios `2926`; Accesorios para Puertas Corredizas y Abatibles `65685`; Barreras Vehiculares `2925`; Pilonas o Bolardos `2938`; Puertas Abatibles `65684`; Puertas Corredizas `66087`; Refacciones `66066`; Semáforos y Señalización `66068`
- **Accesorios** `[415]` — Botones de Salida `2884`; Cables para Control de Acceso `2521`; Cierrapuertas `2522`; Contactos Magnéticos `2523`; Controles Inalámbricos `2527`; Pasacables `2524`; Sensores para Puertas Automáticas `66141`; Tarjetas de Relevador `2939`; Tarjetas y Tags `2885`
- **Biométricos** `[429]` — Enroladores y Lectores USB `2590`; Para Control de Acceso `2589`; Para Tiempo y Asistencia / Checadores `2588`
- **Cerraduras** `[417]` — Accesorios `3005`; Autónomas / Inteligentes `3006`; Chapas Magnéticas `3002`; Contrachapas `3003`; De Perno `2936`; Eléctricas `3004`
- **Detectores de Metal** `[425]` — Accesorios `66093`; Detectores de Metal `2568`
- **Fuentes de Alimentación** `[427]` — Baterías `2625`; Fuentes de Respaldo `2578`; Transformadores `2581`
- **Identificación y Credencialización** `[434]` — Accesorios `65763`; Cintas / Ribbons `65974`; Impresoras - Todas `2612`; Impresoras con Laminación `66193`; Todos `2611`
- **Lectoras y Tarjetas** `[65945]` — Bluetooth `66135`; MIFARE®/iCLASS (13.56 MHz) `65947`; NFC `65978`; Proximidad (125 KHz) `65946`; SEOS `65948`; Tarjetas y Tags `65950`; Todos `65951`; UHF/ RFID `65949`
- **Paneles de Control de Acceso** `[424]` — Accesorios `2941`; Controladores de Acceso `2940`; Licencias y Softwares `65669`
- **Refacciones** `[65723]` — General `65724`
- **Sistemas de Emergencia** `[540]` — Barras para Puertas de Emergencia `3117`
- **Software de Asistencia** `[65672]` — Control de Acceso `65674`; Tiempo y Asistencia `65673`
- **Teclados Autónomos** `[423]` — Todos `2554`
- **Torniquetes y Puertas de Cortesía** `[66061]` — Puertas de Cortesía `66064`; Refacciones `66065`; Torniquetes de Cuerpo Completo `66062`; Torniquetes de Medio Cuerpo `66063`
- **Videoporteros e Interfonos** `[469]` — Accesorios `2777`; Fuentes de Poder `2779`; Intercomunicadores `2778`; Interfones `2775`; Multiapartamentos `2776`; Videoporteros Analógicos `2774`; Videoporteros IP `65952`

### Energía (id 30)
- **Baterías** `[324]` — Accesorios `65761`; Baterías `2981`; Gabinetes para Baterías `65614`
- **Cargadores de Baterías** `[340]` — Todos `2982`
- **Energía Solar** `[511]` — Accesorios `2986`; Controladores de Carga MPPT `2983`; Controladores de Carga PWM `2993`; Kits - Sistemas Completos `2994`; Kits de Montajes para Paneles Solares `2992`; Paneles Solares `2984`; Piezas y Accesorios para Montajes `66344`
- **Fuentes de Poder** `[524]` — Aplicaciones Múltiples `3041`; CCTV/Acceso/Intrusion `3040`
- **Inversores y Convertidores** `[513]` — Convertidores de CD a CD `2991`; Inversores `2989`; Inversores de Interconexión Grid-Tie `65671`; Inversores/Cargadores `65871`
- **Inversores, Cargadores y Convertidores** `[322]` — Inversores `2091`
- **PDU** `[66042]` — Básicos `66043`; Fuente Redundante (ATS) `66047`; Medibles `66044`; Monitoreables `66045`; Switcheables `66046`
- **Protección contra Descargas** `[500]` — Coaxial `2934`; Corriente Alterna `2932`; Corriente Directa `2933`; Redes `2930`
- **UPS / Respaldo** `[493]` — Plantas de Energía `65634`; Todos `2881`; UPS - No Break `65633`

### Detección de Fuego (id 38)
- **Accesorios y Dispositivos Direccionables** `[445]` — Fire-Lite `65663`; Notifier `66312`; Silent Knight `2650`; Todo `2648`
- **Aplicaciones Especiales** `[475]` — Detección Lineal de Calor (LHD) `2806`; Detectores de Llama `2807`; Detectores por Aspiración `2805`
- **Cables** `[449]` — Todo `2664`
- **Detectores Autónomos** `[448]` — First Alert `2663`; S-FIRE `2671`; Todo `2662`
- **Dispositivos Convencionales** `[65852]` — Accesorios `65859`; Detectores de Gases `65861`; Detectores de Humo `65853`; Detectores de Humo y temperatura `65855`; Detectores de Temperatura `65854`; Detectores de Tipo Beam `65856`; Estaciones Manuales de Emergencia `65858`; Todo `65860`
- **Extinción de Incendio** `[497]` — Todos los Productos `2911`
- **Fuentes de Alimentación** `[444]` — Convencionales `66183`; Direccionables `66184`; Todo `2645`
- **Herramientas** `[495]` — Accesorios de Instalación `2898`; Herramientas Eléctricas `2897`
- **Notificación y Voceo** `[536]` — Accesorios `65907`; Estrobos / Sirenas / Bocinas / Campanas `65905`; Paneles de Voceo `65906`
- **Paneles de Incendio** `[443]` — Convencionales `66186`; Direccionables `66187`; Todo `2641`
- **Probadores** `[65955]` — Todos `65956`
- **Protección Contra Sobretensiones** `[467]` — Todos `2772`
- **Señalamientos** `[543]` — Todos `65535`
- **Sistemas de Emergencia** `[65726]` — Barras para Puertas de Emergencia `65728`; Señalización `65730`

### Alarmas / Intrusión y Casa Inteligente (id 32)
- **Accesorios** `[377]` — Botones de Pánico `3025`; Controles Remotos `3026`; Estaciones de Jalón `3027`; Interfaces de Programación `3028`; Sirenas y Estrobos `3038`
- **Automatización - Casa Inteligente** `[523]` — Relevadores WiFi `65873`; Todo `3039`
- **Cables** `[365]` — Todos `2348`
- **Centrales de Monitoreo** `[373]` — Centrales de Monitoreo de Alarmas `2366`; Comunicadores `65936`; Interfaces de Comunicación para Alarmas `2367`; Softwares de Administración MCDI `2673`
- **Cercas Eléctricas** `[375]` — Accesorios `2371`; Aisladores `2370`; Energizadores `2368`; Postes `2369`
- **Detectores / Sensores** `[372]` — Activos `2360`; Autónomos `2393`; Contactos Magnéticos `66147`; Fotoeléctricos y Microondas `2401`; Humo `2392`; Humo Inalámbricos `2361`; Humo VPlex `2394`; Impacto `2359`; Movimiento para Exterior `2357`; Movimiento para Interior `2356`; Rotura de Vidrios y Cristales `2358`; Sísmico `2363`; Temperatura `2362`; Vibraciones `2364`
- **Energía** `[367]` — Baterías `2351`; Fuentes de Poder `2395`; Transformadores `2350`
- **Gabinetes y Carcasas** `[363]` — Carcasas `2345`; Gabinetes para Paneles `2347`; Gabinetes para Sirena `2346`
- **Generadores de Niebla** `[450]` — Accesorios `2670`; Todos `2669`
- **Herramientas** `[496]` — Accesorios de Instalación `2903`; Herramientas Eléctricas `2902`; Para Cable UTP (Cat5e, Cat6) `2900`
- **Honeywell Total Connect** `[261]` — Accesorios `1641`; Cámaras `1640`; Central Receptora `1636`; Cerraduras Inalámbricas Compatibles `1638`; Comunicadores `1632`; Paneles de Alarma `1639`; Servicios AlarmNet / Total Connect `65960`; Teclados `1634`
- **Módulos de Expansión** `[355]` — Módulos de Expansión Cableado `2333`; Módulos de Expansión de Relevador/ PGM `2334`; Receptores Inalámbricos `2331`
- **Megafonía y Audioevacuación** `[65862]` — Honeywell `65863`
- **Paneles de Alarma** `[351]` — Todos `2924`
- **Protección Contra Sobretensiones** `[468]` — Todos `2773`
- **Protección Perimetral** `[387]` — Cable Sensor Perimetral `2404`; Sensores de Movimiento para Exterior `2402`; Sensores de Rayo Laser y PIR´s Inteligentes `65864`; Sensores Fotoeléctricos y Microondas `2405`; Transmisor RF Largo Alcance `65927`
- **Señalamientos** `[544]` — Todos `65537`
- **Sistemas de Emergencia** `[65731]` — Accesorios para Puertas de Emergencia `65935`; Atención Sociosanitaria `66329`; Barras para Puertas de Emergencia `65733`; Estaciones Manuales de Emergencia `65734`; Puertas de Emergencia `65732`; Señalización `65735`
- **Teclados** `[354]` — Todos `2330`
- **Videoverificación** `[66025]` — Todos `66026`

### Radiocomunicación (id 25)
- **Accesorios para Hytera (HYT)** `[266]` — Baterías `65541`; Cargadores de Baterías `65544`; Clips `65546`; Diademas `65784`
- **Accesorios para ICOM** `[263]` — Antenas `65563`; Baterías `65559`; Cargadores de Batería `65562`; Micrófono - Audifono `65786`; Micrófono - Bocina `65787`; Micrófono para Móvil `65789`
- **Accesorios para KENWOOD** `[264]` — Antenas `65554`; Baterías `65550`; Cargadores de Baterías `65553`; Clips `65555`; Diademas `65792`; Fundas `65552`; Micrófono - Audífono `65790`; Micrófono - Bocina `65791`; Micrófono para Móvil `65798`; Programación y Software `65556`; Software de Programación `1693`
- **Accesorios para Motorola** `[262]` — Antenas `65572`; Baterías `65568`; Cargadores de Batería `65571`; Micrófono - Audifono `65794`; Micrófono - Bocina `65795`; Micrófono para Móvil `65797`
- **Accesorios para Otras Marcas** `[267]` — Antenas `65580`; Baterías `65576`; Cargadores de Baterías `65579`; Micrófono - Audífono `65799`; Micrófono - Bocina `65800`; Micrófono para Móvil `65802`
- **Accesorios para Radios PoC** `[66121]` — Accesorios Conducción Ósea `66128`; Accesorios de Bluetooth `66129`; Repuestos `66127`
- **Adaptadores** `[65686]` — BNC `65689`; BNC-Portátiles `65690`; Chasís `65688`; Kits en Estuche `65696`; N `65697`; Polaridad Inversa `65695`; SMA `65692`; TNC `65693`; UHF, Mini-UHF `65691`
- **Antenas** `[283]` — Bobinas, Látigos, Resonadores, Resortes, etc `3114`; Estaciones Base y Repetidores `3111`; GPS `1834`; Móviles `1807`; Montajes y Divisores `3113`; Para Cobertura Celular `1830`
- **Aplicaciones y Soluciones** `[281]` — Consolas y Extensiones Remotas `65611`; Grabación de Audio `65585`; Integración de Radio y Telefonía `65612`; Sistemas de Despacho `65583`; Telemetría y Transmisión de Datos `1787`
- **Cables** `[331]` — Accesorios `65538`; Coaxiales `65536`; Herrajes para Instalación en Torre `65700`; Herramientas para Preparación de Cable `65701`
- **Cobertura Celular 5G, 4G, 3G y Voz** `[65921]` — Amplificadores de Señal Celular (AdSC) `65922`; Antenas, Cables y Accesorios `65923`
- **Conectores** `[65718]` — Chasís `65719`; Heliax `65762`; RF-600, LMR-600 `65711`; RG-213/U, RG-214/U `65710`; RG-58/U, RG-142/U, LMR-195 `65705`; RG-8/U, 9913, CNT-400, LMR-400 `65709`; RG-8/X, 9258, LMR-240 `65746`
- **Energía** `[291]` — Convertidores Industriales de CD a CD `1893`; Fuentes Industriales de CD `1895`; PDU `66041`
- **Equipo de Laboratorio** `[286]` — Analizadores - Espectro y Antenas / Monitores de Servicio y Softwares `1864`; Analizadores de Baterías `3120`; Cargas Fantasma `1866`; Cups para Analizadores de Baterías `3121`; Probadores de Antenas `65630`; Wattmetros y Elementos `1879`
- **Filtros y Sistemas en RF** `[65713]` — Combinadores `1887`; Duplexers `1888`; Hibridos `65931`; Preselectores `65720`; TTA y Multiacopladores `1890`
- **Protección Contra Descarga** `[284]` — Coaxial `1804`
- **Racks y Gabinetes** `[549]` — Accesorios para Racks y Gabinetes `65652`; Gabinetes para Intemperie `65654`; Racks Abiertos `65650`; Racks Cerrados `65653`
- **Radio Sobre Celular PoC** `[66088]` — Integración con Sistemas Analógicos y Digitales `66091`; Kits de Radios `66262`; Licencias NXRadio `66264`; Radios `66089`; TELOX `66090`
- **Radios comerciales KENWOOD** `[533]` — Estaciones Base `3084`; Intrínsecamente Seguros `3082`; Móviles Digitales UHF `3077`; Móviles Digitales VHF `3078`; Móviles UHF `3073`; Móviles VHF `3074`; Portátiles Digitales UHF `3079`; Portátiles Digitales VHF `3080`; Portátiles UHF `3075`; Portátiles VHF `3076`; Portátiles y Móviles 800/900Mhz `3081`; Repetidores `3083`
- **Radios TXPRO** `[66513]` — Accesorios `66516`; Radios UHF `66515`; Radios VHF `66514`
- **Refacciones** `[65772]` — KENWOOD / TXPRO `65773`
- **Repetidores para Radiocomunicación** `[66142]` — Repetidores VHF `66143`; Repetidores UHF `66144`
- **Sistemas Troncalizados** `[547]` — Arquitectura Trunking DMR Tier III `66518`; Arquitectura Trunking NXDN Tipo C `65623`; Arquitectura Trunking NXDN Tipo D `65624`
- **Torres y Mástiles** `[404]` — Accesorios para Torres Arriostradas `2471`; Anclajes Temporales `65661`; Herramientas de Instalación `2485`; Lámparas de Obstrucción `2480`; Mástiles y Accesorios `2483`; Montajes de Techo/ Pared `2484`; Torres Arriostradas (Kits) `2473`

### Redes e IT (id 26)
- **Almacenamiento NAS / SAN y Servidores** `[548]` — Almacenamiento NAS / SAN `65649`
- **Antenas** `[338]` — Accesorios `65896`; Direccionales `65893`; Jumpers `65959`; Omnidireccionales `65895`; Sectoriales `65894`
- **Cobertura para Celular 4G LTE, 3G y Voz** `[65918]` — Amplificadores de Señal Celular (AdSC) `65919`; Antenas, Cables y Accesorios `65920`; Routers 4G (LTE)/3G `66177`
- **Enlaces de Backhaul** `[65878]` — 60, 70 y 80 GHz `65954`; Bandas 5 Ghz / 2.4 GHz `65885`; Otras Bandas `65886`
- **Enlaces PtP y PtMP** `[65877]` — 2.4 GHz `65882`; 5 GHz `65881`; 6 GHz `66505`; 60, 70 y 80 GHz `65953`; 900 MHz `65883`; Otras Bandas `65884`
- **Herramientas** `[287]` — Herramientas Eléctricas `2888`
- **Networking** `[294]` — Convertidores de Medios `1915`; Industrial `2915`; Inyectores PoE `1918`; PoE de Largo Alcance `65609`; Routers, Firewalls, Balanceadores `3045`; Switches `1926`; Switches PoE `1927`; Transceptores de Fibra `1928`
- **Protección Contra Descargas** `[518]` — Coaxial `3019`; Corriente Alterna `3017`; Corriente Directa `3018`; Redes `3016`
- **Racks y Gabinetes** `[509]` — Accesorios para Racks y Gabinetes `2979`; Gabinetes para Intemperie `65622`; Gabinetes Uso Múltiple `2978`; Racks Abiertos `2977`; Racks Cerrados `65621`
- **Redes FTTH/PON** `[66097]` — Cable de Fibra Óptica `66107`; Conectores `66110`; Herrajes `66267`; Herramientas `66106`; Jumpers y Pigtails `66109`; OLT / ONT / ONU `66111`; Splitters y Cajas de Empalme `66108`
- **Redes WiFi** `[65879]` — Adaptadores Inalámbricos `66067`; Controladores `65888`; Hotspots `65892`; Puntos de Acceso `65887`; Repetidores de Señal `65889`; Routers 4G (LTE)/3G `66178`; Routers Inalámbricos `65890`
- **Torres y Mástiles** `[403]` — Accesorios para Torres Arriostradas `2470`; Accesorios para Torres Autosoportadas `2675`; Anclas Temporales `65668`; Herramientas de Instalación `2479`; Lámparas de Obstrucción `2474`; Mástiles y Accesorios `2477`; Montajes de Techo/ Pared `2478`; Torres Arriostradas (Kits) `2472`; Torres Autosoportadas `3097`
- **UPS / Respaldo** `[528]` — Todos `3047`; UPS / No-Breaks `66194`
- **VoIP - Telefonía IP - Videoconferencia** `[301]` — Accesorios `66029`; Audio/Video Conferencia `66032`; Audio/Video Porteros IP `66033`; Auriculares `66031`; Conmutadores IP `3092`; Gateways y ATAs `66035`; Sistemas de Voceo IP `66037`; Teléfonos IP `3094`; Teléfonos IP para Hoteles `66039`

### Cableado Estructurado (id 65811)
- **Cable** `[65812]` — Categoría 5e `65817`; Categoría 6 `65818`; Categoría 6A `65819`
- **Cableado de Cobre** `[65813]` — Cajas Superficiales `65829`; Faceplates `65828`; Herramientas `65848`; Jacks / Plugs `65827`; Patch Cords `65824`; Patch Panels `65826`
- **Canalización** `[65816]` — Abrazaderas / Amarres plásticos `66024`; Canaletas `65839`; Fijación `65841`
- **Fibra Óptica** `[65814]` — Cable `65830`; Conectores `65834`; Distribuidores de Fibra Óptica `65833`; Herrajes `66283`; Herramientas `65849`; Jumpers y Pigtails `65831`
- **PDU** `[66054]` — Básicos `66055`
- **Racks y Gabinetes** `[65815]` — Accesorios para Rack/Gabinetes `65838`; Gabinetes para Exterior `65842`; Gabinetes para Montaje en Pared `65837`; Racks Abiertos `65835`; Racks Cerrados `65836`

### IoT / GPS / Telemática y Señalización Audiovisual (id 27)
- **Ambulancias** `[66336]` — Accesorios-Refaccciones `66340`; Estrobos Ocultos `66339`; Luces Perimetrales `66338`; Plafones `66341`; Rojo `66337`
- **Estrobos y Burbujas** `[503]` — Ámbar `2952`; Accesorios/Refacciones `2954`; Estrobos Ocultos `2953`; Rojo-Azul-Verde `2951`
- **IoT, GPS y Telemática** `[550]` — Accesorios `65658`; Antenas `65656`; Software `65660`; Trackers GPS `65657`
- **Luces / Bocinas para la Industria y Edificios** `[66359]` — Bocinas de Alerta y Notificación Masiva `66361`; Luces para la Industria y Edificios `66360`
- **Motocicletas** `[505]` — Accesorios-Refacciones `2965`; Luces Perimetrales `2962`; Luces Telescópicas `2963`; Sirenas-Bocinas-Controladores `2964`
- **Sirenas / Bocinas / Controladores** `[508]` — Accesorios-Refacciones `2974`; Bocinas `2972`; Controladores `2973`; Sirenas `2971`
- **Videograbadoras Móviles y Portátiles** `[552]` — Accesorios `65667`; Cámaras `65809`; Videograbadoras Móviles `65666`; Videograbadoras Portátiles `66160`


---

## Apéndice B. Marcas listadas en `/principal/brands` (144 entradas, orden A-Z tal como aparecen)

ABELL; ACCESSPRO; ADEMCO (HONEYWELL); AJAX; AKUVOX; ALLIED TELESIS; ALLTERCO ROBOTICS EOOD; ALTAI TECHNOLOGIES; ALTRONIX; ANDREW; ANDREW / COMMSCOPE; ANDREW/COMMSCOPE; ANTENNA SPECIALISTS; ASTRON; ATEN; BEA; BIRD TECHNOLOGIES; CAMBIUM NETWORKS; CAMBIUM NETWORKS INC.; CAME; CAMESA; COMMSCOPE (ANDREW); COMUNELLO; CRESCEND; CRESCO; DIGIFORT; DITEK; ENFORCER SECOLARM; ENGENIUS; EPCOM; EPCOM INDUSTRIAL; EPCOM INDUSTRIAL SIGNALING; EPCOM POWERLINE; EPCOM PROAUDIO; EPCOM PROFESSIONAL; EPCOM TITANIUM; EPEVER; ESCORT; EZVIZ; FAAC; FANVIL; FARGO; FIBERHOME; FIRE-LITE; FREEDOM COMMUNICATION TECHNOLOGIES; GAMBERJOHNSON; GE; GENESIS; GETAC; GRANDSTREAM; GRUPO DE LA ROCHE; HAKKO; HID; HIKVISION; HILOOK BY HIKVISION; HONEYWELL; HONEYWELL FARENHYT SERIES; HONEYWELL HOME RESIDEO; HUSTLER; IBERNEX; IDEMIA (MORPHO); JIMIIOT; JIROUS; JVC KENWOOD; KENWOOD; KHOMP; LINKEDPRO; LINKEDPRO BY EPCOM; LINKEDPRO BY FIBERHOME; M,; M2M SERVICES; MACURCO - AERIONICS; MCDI SECURITY PRODUCTS INC; MCDI SECURITY PRODUCTS, INC; MEANWELL; MERCUSYS; MIDLAND; MIKROTIK; MIMOSA NETWORKS; NETONIX; NETPOINT; NEXETALK; NOTIFIER; NXRADIO; OPTEX; PANAVISE; PANDUIT; PCTEL; PHOX; PLANET; PLP; POLYPHASER; PRECISION; RBTEC; RF ELEMENTS; RF INDUSTRIES,LTD; RITRON; ROSSLARE SECURITY PRODUCTS; RUIJIE; RUPTELA; SAFE FIRE DETECTION INC.; SAMLEX; SANDISK; SDI; SEAGATE; SECO-LARM USA INC; SFIRE; SHAKESPEARE; SIKLU; SILENT KNIGHT BY HONEYWELL; SINCLAIR; STI; SUN PUMPS; SUPREMA; SURE-FI; SURTEK; SYNOLOGY; SYSCOM; SYSCOM TOWERS; SYSCOM VIDEO; SYSTEM SENSOR; TELEWAVE, INC; TELOX; TELTONIKA; TEMPO; THORSMAN; TIMES MICROWAVE; TP-LINK; TRAM BROWNING; TRANSTECTOR; TXPRO; TYCON POWER PRODUCTS; UBIQUITI; V-SOL; VARIOS; WESTERN DIGITAL (WD); WI-TEK; WILSONPRO / WEBOOST; WINLAND ELECTRONICS; XTRALIS; YALE-ASSA ABLOY; YONUSA; ZKTECO; ZKTECO - ACCESSPRO

URL de marca: `/principal/listadopormarca/{MARCA}` (con o sin `/full`).

*Fin del informe.*
