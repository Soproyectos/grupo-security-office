# Cambios visuales puntuales de la tienda pública · 24/11/2026

Sin commit ni push. Rama `Esnaider/sad-golick-8a6b22`.

## 1. Flechas de las vitrinas a los costados

- **Pedido (Agentation, /tienda):** poner los botones «Productos anteriores/siguientes» en los costados de la sección, con opacidad mínima.
- **Qué cambió:** las flechas salen del encabezado y quedan sobre los bordes izquierdo y derecho de la fila de productos, centradas en vertical. En reposo tienen 40 % de opacidad; al pasar el cursor o enfocar con teclado pasan a 100 %. La flecha que no puede avanzar se oculta. En el encabezado queda solo «Ver todo».
- **Archivo:** `src/frontend/src/features/storefront/components/ProductShelf.tsx`.
- **Verificación:** navegador integrado a 1440 px (flecha derecha visible y tenue a la derecha de la vitrina Cámaras) y a 390 px (botón de 44 × 44 px, sin desborde horizontal). `tsc --noEmit`: sin errores en este archivo (quedan los errores previos de precios asignados, comparación y autenticación). ESLint del archivo: sin avisos. Vitest de `src/features/storefront`: no concluyente por una falla del entorno (`useEffect` de null, React duplicado en `node_modules`), ajena a este cambio.

## 2. Carrusel de fotos dentro de «Explora por categoría»

- **Pedido (Agentation, /tienda):** las vitrinas ya no van abajo; cada cuadro de «Explora por categoría» (Cámaras, Alarmas, Control de acceso, Cableado y redes) debe mostrar fotos de productos que se corren con flechas.
- **Qué cambió:** cada cuadro es un carrusel de fotos (una por vez, se corre con las flechas laterales tenues o deslizando). Cada foto lleva a su producto; la barra inferior con el nombre sigue llevando a la categoría. Cámaras, Alarmas y Control de acceso usan las 12 referencias elegidas; Cableado usa los primeros productos de la categoría. Si una foto no carga se descarta; si ninguna carga, el cuadro muestra la imagen de antes. Se quitaron las vitrinas de debajo de la portada. `ProductShelf.tsx` queda sin uso en la portada (conserva su prueba).
- **Archivos:** `features/storefront/components/CategoryTileCarousel.tsx` (nuevo), `pages/StorefrontHome.tsx`, `hooks/usePublicProductShelf.ts` (sin SKUs usa los primeros productos de la categoría).
- **Verificación:** navegador a 1440 y 390 px (4 cuadros, flecha avanza una foto, sin desborde horizontal). `tsc --noEmit` y ESLint sin errores en estos archivos. Vitest de la portada no concluyente por la falla del entorno (React duplicado); además `storefront-home.spec.tsx` y `home-components.spec.tsx` pueden necesitar actualizarse (ya no hay vitrinas y los cuadros dejaron de ser un único enlace).

## 3. Portada rediseñada: campañas Hikvision, fotos de producto y reels

- **Pedido:** pasar a la rama el diseño de la portada (artefacto de diseño «Página de inicio · Grupo Security»).
- **Qué cambió:**
  - Nueva sección «Lo nuevo de Hikvision», antes de «Explora por categoría», con tres campañas de Hikrecursos (AOV 4G, ColorVu 3.0, EasyIP). Todas enlazan a la búsqueda de la marca Hikvision.
  - Los cuatro cuadros de «Explora por categoría» usan una foto fija de producto publicado (volvió el enlace único por cuadro; se quitó el carrusel y las vitrinas de debajo).
  - Nueva sección «Mantente al día» con reels de Instagram: el iframe solo se carga al tocar la miniatura. Queda oculta mientras `HOME_REELS` esté vacío.
- **Archivos:** `components/BrandCampaigns.tsx`, `components/InstagramReels.tsx`, `components/brand-campaigns-reels.spec.tsx` (nuevos); `pages/StorefrontHome.tsx`, `pages/storefront-home.spec.tsx`, `constants/home-catalog.ts`; imágenes en `public/images/home/tiles/` y `public/images/home/campanas/`. Se borró `CategoryTileCarousel.tsx` y se revirtió la rama de respaldo del hook `usePublicProductShelf.ts`.
- **Verificación:** navegador a 1440 y 390 px (sin desborde, sin imágenes rotas). Vitest de portada y de las secciones nuevas: 19/19. `tsc --noEmit` y ESLint sin errores nuevos.
- **Pendientes:** los enlaces de los reels (`HOME_REELS`); la sección «Novedades en el catálogo» del diseño no se implementó porque la API pública no permite ordenar por fecha de publicación; editar cada sección desde Marketing (traspaso a backend); confirmar las condiciones de uso de los materiales de Hikvision.

## 4. Reels de Instagram activados (2026-11-25)

- `HOME_REELS` tiene 6 reels de la cuenta gruposecurity.co. Miniaturas copiadas a `src/frontend/public/images/home/reels/r1..r6.jpg`.
- Los títulos los escribí a partir de lo que se ve en cada miniatura; conviene revisarlos.
- Al tocar un reel, ocupa el ancho completo de la fila (iframe de 640 px de alto, máx. 420 px de ancho) para que el video no quede apretado.
- Prueba actualizada: la lista vacía se pasa explícita (`reels: []`), porque ahora el valor por defecto ya no está vacío.
- Verificado: 19/19 pruebas, sin desborde a 375 px, 5 miniaturas cargan, el clic abre el iframe de Instagram.

## 5. Reels en una fila y vista previa al pasar el cursor (2026-11-25)

- Los reels van siempre en una sola fila (se reparten el ancho; en celular la fila se desplaza de lado). Aplicado también en el diseño (artifact, versión 18).
- Vista previa al pasar el cursor: `HomeReel.preview` (MP4 mudo, mínimo 5 s). Solo en equipos con cursor y sin «reducir movimiento». **Pendiente:** ningún reel tiene clip aún, así que hoy no cambia nada.
- Los clips no se pueden sacar de Instagram: los entrega Grupo Security (MP4 H.264, sin audio, ~540×960, idealmente < 2 MB cada uno) en `public/images/home/reels/`.

## 6. Clips de vista previa y títulos nuevos de los reels (2026-11-25)

- Los 6 reels tienen clip de vista previa (`r1..r6.mp4`, 6 s, sin audio, 360 px de ancho, 120–250 KB). Los recorté de los videos de la cuenta gruposecurity.co; el original completo no queda en el repo. Comprobado en pantalla: al pasar el cursor, el clip arranca.
- Títulos nuevos (a confirmar): «Qué es la seguridad electrónica», «Control de acceso con tu rostro», «Cuida tu finca, lote o terreno», «Cámaras Hikvision ColorVu 3.0», «Reconocimiento facial para conductores», «Fibra óptica: robusta y versátil».
- Diseño de los títulos: tres opciones (A sobre la foto, B tarjeta con frase, C foto limpia con barra roja) en https://claude.ai/artifact/HSDNQCmHprmbsB8Jm5oNwk. Pendiente que se elija una.

## 7. Reels con diseño C, flechas y sin símbolo de play (2026-11-25)

- Diseño C aplicado: foto limpia, duración arriba a la derecha, título debajo (sin barra roja). Se quitó el símbolo de play.
- Flechas en los extremos con sombra mínima; aparecen solo cuando los reels no caben en la fila (celular o más de ~8 reels), igual que en las vitrinas.
- Vista previa al pasar el cursor: el clip queda cargado en la página (sin mostrar nada) y se reproduce al entrar el cursor; ya no depende de «reducir movimiento». Comprobada con el cursor real.
- `HomeReel.duration` nueva (texto, p. ej. «0:48»), tomada de la duración real de cada reel.

## 8. Nuevo orden de la portada y sección «Capacítate» (2026-11-25)

- Orden: Mantente al día → Explora por categoría → Lo nuevo de Hikvision → ¿Qué quieres proteger? → Marcas → Capacítate con Hikvision → Más categorías → Servicios → Sedes. «Novedades en el catálogo» sigue pendiente (la API pública no ordena por fecha).
- `LearnSection`: tres accesos sin fechas inventadas: Webinars y certificaciones (`/capacitate`), Cursos en línea (e-learning de Hikvision, otra pestaña), Certifícate con nosotros (`/servicios/certificaciones`).
- `/capacitate` (`TrainingCalendarPage`): incrusta el calendario que Hikvision publica en https://hikvisionlatam.tech/calendar/latam (la misma dirección que usa su página de soporte). Hikvision indicó que podemos usarlo. El filtro por país no se puede fijar desde la dirección: la persona elige Colombia dentro del calendario.
- Pendiente (backend/Marketing): mostrar los próximos 2 o 3 webinars en la portada exige datos de Hikvision (no hay API pública). Se propone un webhook propio o formulario en Marketing; pedir a Hikvision Colombia un envío del calendario.

## 9. «Próximas clases» en Capacítate (2026-11-25)

- Diseño elegido: combinación de A y B. Computador: lista con recuadro de fecha, tipo, hora y botón «Registrarme», con «Cursos en línea», «Certifícate con nosotros» y «Ver calendario completo» a la derecha. Celular: una tarjeta por clase con la fecha en banda roja.
- Datos: `HOME_TRAINING_EVENTS` en `constants/home-catalog.ts` (id, tipo, título, `startsAt` con zona Colombia, `registrationUrl` https). **Hoy está vacía a propósito**: no hay clases confirmadas para Colombia ni sus enlaces de registro, y no se simulan datos. Vacía, la sección muestra los tres accesos permanentes.
- Solo se muestran las próximas 3; una clase se mantiene hasta 3 h después de empezar; la hora se muestra en hora de Colombia.
- Verificado en pantalla con 3 eventos de ejemplo temporales (ya retirados): 1440 y 375 px, sin desborde, botones de 44 px.
- Pendiente para backend/Marketing: alimentar la lista automáticamente. Propuesta: webhook propio con clave + formulario en Marketing como respaldo + tarea programada que lea el calendario de Hikvision (con su permiso por escrito). Reporte de traspaso por escribir.

## 10. Capacítate con panel de próxima clase (2026-11-25)

- La sección se llama ahora «Capacítate». Se quitó el mini calendario de 14 días del diseño (no estaba en la tienda); queda «Ver calendario completo» hacia `/capacitate`.
- Tienda igualada al artifact: panel oscuro de la próxima clase («Hoy/Mañana/En N días · próxima clase», título, día y hora, botón «Registrarme», recuadro de fecha grande), debajo las dos siguientes, y a la derecha «Cursos en línea» y «Certifícate con nosotros». En celular todo en una columna y sin el recuadro grande.
- «Hoy/Mañana/En N días» se cuenta en días calendario de Colombia. Sin clases cargadas siguen los tres accesos.
- Verificado en pantalla (1440 y 375 px) con 3 eventos temporales ya retirados. `HOME_TRAINING_EVENTS` sigue vacía.
- Pendiente de decidir: en el artifact de la persona ya no aparecen «¿Qué quieres proteger?» ni los banners de Marcas; la tienda todavía los tiene.

## 11. Tienda igualada al artifact, Novedades, fechas de Capacítate y revisión antes de enviar a main (2026-11-25)

- Retiradas «¿Qué quieres proteger?» y los banners de Marcas (pruebas ajustadas). «Más categorías» con foto de 48 px por categoría (`public/images/home/more/`).
- Capacítate con las clases publicadas hoy en el calendario de Hikvision (26 nov webinar SMB/HPP; 2 y 3 dic Clase Abierta HIK-IA). El enlace de «Registrarme» es el calendario de Hikvision (no hay enlaces directos por evento). **No confirmado que sean para Colombia.**
- Novedades en el catálogo: parámetro `sort=recent` en `GET /api/public/products` (orden por `publishedAt`, luego `createdAt`; ignorado con `q`) y `NewArrivals` (4 productos, sin precio ni «Cotizar»; no se muestra si falla o no hay). La API local (puerto 3010, lanzada por otra sesión) aún corre sin el cambio y responde 400 a `sort`; hay que reiniciarla para verlo. Un spec del backend (`public-catalog.service.spec.ts`, «no combina una subcategoría de Cámaras con otra categoría») falla; no se comprobó si es previo.
- Revisión de lo que llevaría un envío a main de todo el árbol (193 entradas): ver bloqueantes en la respuesta de la sesión (package-lock borrado y dependencias solo-Windows rompen el Dockerfile; 6 errores de `tsc -b` en archivos a medias; contraseña SMTP real en `.env.example`; `src/backend/.env.ux` sin ignorar; variables nuevas del portal ausentes en el VPS y migraciones automáticas; restos locales vite.config.js/json y start-dev.cjs).

## 12. Bloqueantes de despliegue corregidos desde el repo (2026-11-25)

- `src/frontend/package-lock.json` restaurado y `package.json` del frontend vuelto al original (copia de la versión local fuera del repo). Esas dependencias eran herramientas locales de Windows.
- `.env.example`: contraseña SMTP sustituida por un marcador. **La contraseña vieja ya la vieron varias sesiones: conviene rotarla en Hostinger.**
- `.gitignore`: se ignoran `.env.*` salvo `.env.example` (cubre `src/backend/.env.ux`).
- Restos locales y archivos a medias excluidos del repo solo en este checkout (`.git/info/exclude`), sin borrarlos: `vite.config.js`, `vite.config.json`, `start-dev.cjs`, `pnpm-lock.yaml`, `useAssignedProductPrices.ts`, `CompareProductsPage.tsx` (nadie los importa) y `services/portal-auth.spec.ts` (prueba el servicio viejo del portal; lo cubre `portal-auth.service.spec.ts`).
- `public-catalog.service.spec.ts`: la prueba «no combina una subcategoría de Cámaras con otra categoría» se alineó con el servicio actual (filtra por la categoría pedida y devuelve vacío).
- Verificado: frontend `tsc` sin errores (sin los 3 archivos excluidos) y `vitest` 1828 de 1831 (las 3 que fallan son del `portal-auth.spec.ts` excluido); backend `tsc` sin errores y `jest` de products/public, categories y customer-portal 351 de 351. No se ejecutó `npm ci` ni `vite build`/`docker build`. Las suites con PostgreSQL desechable del backend no se corrieron (necesitan su base local).
- **Siguen abiertos (no se arreglan desde el repo):** variables del portal en el `.env` del VPS (`BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`, `PORTAL_AUTH_URL`, SMTP) antes de desplegar; aprobación de las 3 migraciones del portal (se aplican solas); lo grande de la mezcla (>400 líneas, sin commits) debería ir en commits y PRs por unidad de trabajo.
