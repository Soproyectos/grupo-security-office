# Tienda pública y acceso profesional

La tienda permite explorar productos publicados y precios públicos sin cuenta. Un cliente solicita acceso profesional, verifica su correo y crea una contraseña; el equipo comercial aprueba su perfil y asigna una tarifa. La cuenta de cliente está separada de los usuarios del panel administrativo.

## Configurar la información pendiente

En **Comercial → Tienda y acceso**, un Super Admin o Admin Comercial puede:

1. Seleccionar la lista de precios destinada al público. Sin selección, el catálogo muestra “Consultar precio”. Los importes se leen de `Price`; no se crean precios ni se calcula IVA automáticamente.
2. Definir si los importes almacenados ya incluyen IVA, el remitente, los canales de asesoría, WhatsApp con código de país y el horario. Los canales vacíos no aparecen.
3. Completar la presentación de la empresa y los textos oficiales de privacidad, condiciones y garantías. Un documento vacío muestra un aviso y el enlace de contacto; no se publica un texto legal inventado.
4. Revisar solicitudes verificadas, aprobar con una lista activa y vigente, o dejar un comentario al rechazar/suspender. Aprobar vincula la cuenta con un cliente del módulo comercial.
5. Revisar consultas y marcarlas como atendidas. Las consultas se guardan en PostgreSQL aunque SMTP no esté configurado.

Las credenciales del proveedor de correo se configuran en el backend: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`. `SMTP_FROM` es un remitente opcional de respaldo. `STOREFRONT_URL` debe ser el origen público del frontend: genera los enlaces y valida el origen de las solicitudes. Revisar también `CORS_ORIGIN`. Ninguna contraseña SMTP se almacena en la configuración pública.

## Revisar localmente

La implementación usa las rutas `/tienda`, `/catalogo`, `/catalogo/categoria/:slug`, `/catalogo/buscar`, `/catalogo/producto/:id`, `/acceso-clientes`, `/crear-cuenta`, `/mi-cuenta`, `/profesionales`, `/contacto`, `/ayuda`, `/conoce-grupo-security` y `/legal/:document`.

Para preparar el archivo local de variables, desde `src/backend`:

```powershell
node scripts/start-customer-access-local.cjs env
```

Esto crea `customer-access.env.local` en la raíz, excluido de Git, con secretos aleatorios y valores locales. No modifica las credenciales de otros entornos.

Desde la raíz, con Docker Desktop funcionando:

```powershell
docker compose --env-file customer-access.env.local -f docker-compose.customer-access.yml up -d
```

Este compose usa PostgreSQL 16, volúmenes independientes, API en `http://localhost:3100`, tienda en `http://localhost:5180/tienda` y buzón Mailpit en `http://localhost:8026`. No reenvía correos a destinatarios reales. No usar este compose de desarrollo para producción.

Para cargar datos ficticios, una vez que la API haya aplicado las migraciones:

```powershell
docker compose --env-file customer-access.env.local -f docker-compose.customer-access.yml exec api node scripts/seed-customer-access-preview.cjs
```

El script de fixtures exige desarrollo y una base local aislada, incluida la conexión interna `db` del compose; no apunta a Neon ni a producción. El usuario de prueba usa un identificador ficticio del dominio corporativo para respetar la validación existente del panel: `comercial.preview@gruposecurity.co`. También crea `profesional.preview@example.test`, verificado y pendiente de aprobación, para revisar las tarifas desde el navegador. Ambos usan la contraseña aleatoria guardada únicamente en `data/customer-access-local/preview-password.txt`, excluido de Git.

## Alternativa nativa usada en este equipo

Docker Desktop no arrancó por un error de su servicio `dockerInference`. La validación local se realizó con PostgreSQL 18 ya instalado, en un clúster separado dentro de `data/customer-access-local/postgres`, escuchando solo en `127.0.0.1:55432`. No se modificaron bases existentes. PostgreSQL 16 queda especificado en el compose; el arranque completo de contenedores no se verificó en este equipo.

Con el clúster local y las bases `gs_customer_access` y `gs_customer_access_test` creadas, aplicar las migraciones con `DATABASE_URL` apuntando a cada base. Desde `src/backend`, en terminales independientes:

```powershell
npm ci
npm run build
node scripts/seed-customer-access-preview.cjs
node scripts/dev-mailbox.cjs
node scripts/start-customer-access-local.cjs api
node scripts/start-customer-access-local.cjs frontend
```

Instalar también las dependencias del frontend con `npm ci` en `src/frontend`. El buzón nativo captura SMTP en el puerto 1026 y muestra los enlaces de prueba en el 8026. Los datos del catálogo local son ficticios y no constituyen inventario ni ofertas reales.

## Validación y contratos

Pruebas automáticas de integración con PostgreSQL real y SMTP local:

```powershell
$env:CUSTOMER_ACCESS_TEST_DATABASE_URL='postgresql://gs_local@127.0.0.1:55432/gs_customer_access_test'
npm test -- --runInBand storefront.integration.spec.ts
```

La suite rechaza conexiones fuera de esa base local de pruebas y limpia sus fixtures. Comprueba tarifas pública/profesional, permisos del panel, consentimiento, origen, consultas persistentes, envío SMTP, enlaces reemplazados/vencidos/de un solo uso, recuperación, cierre de sesión y suspensión. Ejecutar también build, lint y las suites generales de ambos proyectos.

Los endpoints nuevos están en `/api/storefront`, `/api/customer-access` y `/api/commercial/storefront`; aparecen en Swagger `/api/docs`. El antiguo endpoint de tendencias ahora exige sesión interna porque devolvía listas y precios internos.

Las sesiones de clientes usan una cookie HttpOnly, SameSite=Lax y Secure en producción. PostgreSQL guarda el hash de los tokens de sesión/verificación, nunca el token de la cookie en claro. La contraseña se valida con la política existente y bcrypt; recuperar acceso revoca las sesiones previas. Las respuestas de catálogo varían por cookie y prohíben almacenamiento en cachés compartidas.

La migración es `20261007120000_customer_access`. No se realizaron commits ni push.

## Publicación autorizada del 7 de octubre de 2026

Se publicó en `http://100.87.48.41:5174/tienda`, servidor `srv-soporte`, con autorización explícita del usuario. La versión desplegada parte del frontend que ya estaba ejecutándose en ese servidor, que era más reciente que la copia local. Conserva sus tarjetas, categorías, búsqueda, galería y ficha de producto en `/catalogo/productos/:id`. Añade la bienvenida, la invitación profesional, el acceso y las páginas informativas. El panel nuevo está en **Comercial → Tienda y acceso** (`/commercial/storefront`); la configuración anterior de contacto en `/storefront` se conserva.

Los 53 archivos originales de componentes, páginas y servicios del catálogo conservan su hash; las respuestas anónimas de una categoría y un producto real coincidieron exactamente antes y después de publicar. Los 497 productos y 2335 precios existentes no se modificaron. El backend integra la tarifa de una cuenta aprobada en el mismo campo `price` del catálogo existente, manteniendo su presentación y el resto del contenido. Un visitante conserva la tarifa pública que ya tenía el servidor.

Se aplicó únicamente la migración nueva sobre PostgreSQL 16. La versión preparada pasó lint, comprobación de tipos y compilación en ambos proyectos, 311 pruebas del frontend y 64 pruebas pertinentes del backend, incluidos correo SMTP y PostgreSQL 16 aislados. También se comprobó en la web publicada que una consulta ficticia se guarda en la base real y que los endpoints privados rechazan visitantes.

El respaldo de código, la base previa, el manifiesto de archivos protegidos y los registros de validación quedan en `/home/soporte/customer-access-release-20261007`. Los respaldos de base y variables tienen permisos restringidos. La imagen del API es `gs-customer-access-api:20261007`; el compose del servidor usa `Dockerfile.customer-access`, conserva sus credenciales y permite configurar SMTP mediante variables de entorno.

El servidor aún no tiene proveedor SMTP ni remitente oficial. Por eso los flujos que requieren enviar verificación o recuperación informan que el correo está pendiente de configuración; no se envían mensajes ni se crean cuentas ficticias en el servidor. El catálogo y las consultas funcionan sin SMTP. Los textos legales y canales de asesoría nuevos pueden completarse después desde el panel. No se importaron los productos ni los usuarios del entorno local de pruebas.

## Ajuste del banner del 8 de octubre de 2026

A petición del usuario, se cambió únicamente la altura de escritorio de `HomeHero.tsx` en el frontend del puerto 5174: de 420 a 360 px. Se mantienen 256 px en móvil y 320 px desde el breakpoint `sm`, con ancho completo y `object-cover`. Este cambio posterior es una excepción explícita al manifiesto de los 53 archivos preservados en la publicación inicial. El respaldo y los hashes anteriores y posteriores están en `banner-before-20261008.tsx` y `banner-adjustment-20261008.json`, dentro del mismo directorio de respaldo del servidor.

El puerto 5173 sirve la carpeta `/home/soporte/office_ai/grupo-security-office`, rama `feat/storefront-public-pricing`; el puerto 5174 sirve el worktree `/home/soporte/.herdr/worktrees/grupo-security-office/worktree-dashboards`, rama `worktree/dashboards`. Ambos frontends comparten el API y PostgreSQL. Publicar en 5174 no fusiona sus cambios con la rama de 5173. El banner de 5173 no se modificó en este ajuste.

La validación directa del worktree detectó que nueve archivos de pruebas aún conservaban expectativas anteriores al acceso de clientes: faltaban los mocks de sesión y se esperaban enlaces antiguos de cuenta y pie de página. Se sincronizaron con las pruebas ya validadas del paquete de publicación, sin cambiar componentes del catálogo. El frontend publicado pasó las 311 pruebas, lint sin errores y comprobación de tipos/compilación; se comprobó en el navegador la altura real de 360 px del banner EZVIZ. Se mantienen nueve advertencias previas de lint y el aviso de tamaño del bundle.

## Imágenes completas en tarjetas móviles, 8 de octubre de 2026

Este primer ajuste fue sustituido por la corrección responsive descrita abajo, tras la revisión visual del usuario.

El usuario autorizó después que todas las imágenes de las tarjetas se vieran completas en móvil. En el frontend de 5174 se cambió a `object-contain` por debajo de 768 px en las tarjetas compartidas de productos, soluciones, categorías de inicio y subcategorías, además de las miniaturas de la galería. La imagen principal de producto ya usaba ese ajuste. Las miniaturas de categorías tienen espacio interior en móvil para que sus bordes redondeados no recorten la imagen; las tarjetas circulares usan 16 px de espacio interior. Desde 768 px se mantiene la presentación anterior con `md:object-cover` y sin ese espacio adicional. No se cambió el banner ni se modificó el frontend de 5173.

El cambio comprende cinco archivos originales del catálogo y constituye otra excepción autorizada al manifiesto de preservación de la publicación inicial. Se preparó y validó primero en una copia separada, dentro de Docker: 311 pruebas aprobadas, lint sin errores y tipos/compilación correctos, con las advertencias previas indicadas arriba. Después se publicaron únicamente esos cinco archivos, conservando sus versiones previas en `mobile-card-images-before-20261008` y registrando hashes y validación en `mobile-card-images-adjustment-20261008.json`, dentro del directorio de respaldo del servidor.

En el navegador se comprobó a 390 px de ancho que las cuatro imágenes de soluciones cargan y usan `contain`; a 1280 px mantienen `cover` y el banner conserva sus 360 px. La captura de comprobación móvil queda en `tarjetas-imagenes-completas-movil.jpg` en los artefactos de esta conversación.

## Corrección responsive tras la revisión del usuario

Se corrigieron también los contenedores que mantenían alturas fijas y espacios sobrantes. En móvil y tableta, el banner usa su proporción original de 1500 × 400 con ancho completo y altura automática; las flechas y los indicadores quedan debajo de la imagen. Desde 1024 px conserva la altura de escritorio solicitada de 360 px. Las tarjetas de soluciones ocupan todo el ancho disponible en móvil y sus imágenes tienen altura automática; muestran dos tarjetas desde 768 px y tres desde 1024 px. Se mantiene la navegación horizontal con ajuste de la tarjeta a su posición al terminar de deslizar.

Los medios de las tarjetas de productos usan un marco cuadrado proporcional en móvil, también en sus esqueletos de carga, y conservan el marco de 4:3 desde 768 px. Se ajustó el espacio del texto en móvil y el salto de línea de referencias largas para evitar cortes. Las miniaturas de categorías móviles usan un marco cuadrado de 80 px, 96 px desde 640 px, sin el relleno adicional anterior; desde 768 px mantienen la forma circular previa. Las categorías de inicio conservan sus miniaturas de 48 px y ya no añaden relleno a la imagen.

Se prepararon y validaron seis archivos de presentación y tres actualizaciones de pruebas en una copia separada con Docker antes de publicar en 5174. Pasaron lint sin errores y tipos/compilación, con las advertencias previas; las 310 pruebas restantes pasan. Se retiró una aserción antigua que prohibía el marco cuadrado en cualquier pantalla: las proporciones responsive ahora se comprobaron en el navegador. Los conteos de categorías comprueban sus enlaces de navegación en lugar de depender de clases CSS circulares.

La revisión en navegador a 320, 390, 768 y 1280 px confirmó que la página no desborda horizontalmente, el banner conserva su proporción en móvil y sus 360 px en escritorio, las fotos de soluciones escalan en móvil y los medios de productos permanecen alineados. Se probaron las flechas del banner y la navegación a la siguiente solución, que avanza una tarjeta completa. Las capturas son `banner-responsive-movil-corregido.jpg` y `tarjetas-responsive-movil-corregido.jpg`. Los respaldos y hashes están en `responsive-images-before-20261008` y `responsive-images-adjustment-20261008.json` en el directorio de respaldo del servidor. No se modificó el frontend de 5173 ni el backend, el API o la base de datos en este ajuste.

## Encabezado móvil tras la anotación del usuario

Se publicaron tres cambios de presentación en 5174: `StorefrontChrome.tsx`, `AccountMenu.tsx` y el disparador de `CategoryMenuContainer.tsx`. Por debajo de 1024 px, el logo, Categorías y Mi cuenta ocupan una sola fila; el buscador ocupa todo el ancho de la fila siguiente. El logo escala entre 80 y 96 px de ancho, y los botones tienen un área táctil de al menos 44 px. Mi cuenta muestra el icono y una etiqueta corta sin saltos de línea; su nombre accesible conserva la indicación de ingresar o registrarse. En escritorio conserva los dos textos anteriores y la distribución existente.

La revisión en navegador a 320, 390, 768 y 1280 px comprobó alineación vertical y ausencia de desbordamiento horizontal. En la vista de 390 px, la altura del encabezado pasó de 202 a aproximadamente 146 px. Se comprobó que Categorías abre, permite navegar a Videovigilancia y cierra; buscar `DS-2CE16H0T` devuelve siete productos reales; Mi cuenta abre `/acceso-clientes` con los controles de ingreso, recuperación y solicitud de acceso.

La copia preparada pasó las 310 pruebas del frontend, lint sin errores y tipos/compilación. Después de mantener la etiqueta móvil en una sola línea, se repitieron lint y tipos/compilación con resultado correcto; permanecen las nueve advertencias previas de lint y el aviso de tamaño del bundle. Los respaldos originales y hashes finales están en `mobile-header-before-20261008` y `mobile-header-adjustment-20261008.json` en el directorio de publicación del servidor. La captura `encabezado-movil-alineado.jpg` y las mediciones `encabezado-responsive-validacion.json` quedan en los artefactos de esta conversación. El frontend de 5173 conserva sus archivos anteriores; este ajuste no modifica el API ni la base de datos.

## Recuperación de la ficha completa de productos en 5174

La comparación del mismo DVR en ambos puertos confirmó una diferencia entre sus ramas: 5173 utiliza `ProductDetailRoute` y el endpoint existente `/api/public/products/:idOrSlug/detail`, mientras que 5174 seguía mostrando `StorefrontProductPage` con la respuesta básica `/api/public/products/:id`. Los datos completos permanecían en PostgreSQL: seis características principales, siete grupos de especificaciones, dos documentos y tres recursos de firmware para el producto revisado.

Se incorporaron los componentes existentes de la ficha completa de 5173 y se cambió únicamente la ruta pública del producto en `App.tsx` de 5174. Los listados, tarjetas y páginas de categorías conservan su implementación. Se mantuvieron el encabezado y acceso de clientes nuevos; los botones comerciales utilizan el mismo proveedor de contacto que el resto de la tienda. Las imágenes principales y miniaturas móviles conservan su ajuste completo.

La ficha detallada aporta el contenido y la consulta básica posterior aporta el precio correspondiente a la sesión actual. Un precio nulo conserva «Precio a consultar»; una falla de esa consulta muestra el estado de error y no sustituye la tarifa por otra. La caché pertenece a `storefront-products`, incluye la identidad, estado y tarifa del cliente, se elimina al cerrar sesión y se refresca en cada visita. Esta integración usa los endpoints ya desplegados, sin cambiar el backend, el API ni los registros de la base.

Pasaron las 334 pruebas de 30 archivos, lint sin errores y tipos/compilación; permanecen las advertencias anteriores. Las pruebas de la ficha completa se tomaron de la implementación existente, y cinco pruebas nuevas verifican la selección de tarifa, el precio nulo y los errores de consulta. En navegador se verificaron el selector de especificaciones de escritorio, los controles móviles hasta la categoría 7 de 7, los acordeones de documentos y la apertura/cancelación del diálogo de firmware. No se aceptó un acuerdo ni se descargó firmware.

Las vistas de 320, 390, 768 y 1280 px no desbordan horizontalmente. Un segundo producto sin datos técnicos adicionales muestra toda su descripción, incluido su último término, y omite las secciones vacías. Las capturas son `producto-ficha-completa-5174.png` y `producto-especificaciones-completas-5174.png`. El respaldo de la ruta previa y el manifiesto de los 20 archivos publicados están en `product-detail-before-20261008` y `product-detail-restoration-20261008.json`, en el directorio de publicación del servidor. El frontend de 5173 conserva sus archivos; no se fusionaron las ramas ni se realizaron commits o push.
