# Portal comercial: asignación de asesor, tarifas y cotizaciones del cliente

- **Fecha** 2026-11-25
- **Rama** `Esnaider/clientes-portal-tarifas-d2ef11`
- **Estado** Diseño acordado; cambios de base pendientes de aprobación. Ningún commit sin aprobación.

## Objetivo

Que un cliente registrado en la web quede con un asesor y una tarifa, arme y envíe cotizaciones con sus precios, y que el asesor las valide. Todo debe delegarse por paneles asignables, con alcance propio, de equipo o total.

## Reglas del usuario

1. El cliente se registra con su **ciudad** y la cuenta queda **pendiente**.
2. El asesor se asigna automáticamente al azar entre los asesores activos cuya **zona** incluye esa ciudad. Si no hay ninguno, el registro queda en la cola de supervisores. El supervisor puede asignar o reasignar dentro de su equipo.
3. A cada asesor se le asigna su zona al crearlo en el panel administrativo (Usuarios).
4. El asesor recibe un aviso. Busca al cliente en la base interna, lo vincula, le asigna la tarifa según sus compras previas y activa la cuenta. Es provisional hasta integrar Yeminus.
5. Solo el Super Admin crea y edita niveles y la tarifa general.
6. Solo cotiza una cuenta activa, con cliente vinculado y asesor. Los precios salen de su tarifa y se congelan al enviar.
7. El asesor recibe un aviso por cada cotización nueva. Valida stock, puede cambiar o recomendar productos y contacta al cliente por WhatsApp. Los estados son la trazabilidad.
8. El cliente ve sus cotizaciones con su estado e historial. El personal los ve solo con la acción de panel correspondiente y en su alcance.

## Reglas de cotización (reemplazan la regla de Listas)

- **C1 Sin Listas.** Ninguna cotización, del portal o del panel, usa ni exige Listas. Se retira la verificación de acceso por Lista al crear cotizaciones y agregar productos.
- **C2 La tarifa es de la empresa.** Cada cliente registrado (empresa) tiene una sola tarifa: su nivel o, si no tiene, la tarifa general. Todas las personas de esa empresa cotizan con ella. La asigna su asesor o el supervisor.
- **C3 El asesor es de la empresa.** Cada empresa tiene un solo asesor, y solo un supervisor lo cambia. Una persona nueva de una empresa ya registrada queda con el asesor de esa empresa al vincularla.
- **C4 Qué se puede cotizar.** El cliente puede cotizar cualquier producto que ve en el catálogo publicado. El asesor, cualquier producto que pueda ver en Biblioteca.
- **C5 Precio.** El precio de cada línea es el vigente en la tarifa de la empresa y se congela al enviar. Si el producto no tiene precio en esa tarifa, la línea entra como «precio por confirmar» y el asesor lo completa. Nunca se inventa un valor.
- **C6 Varias personas.** Una empresa puede tener varias cuentas web. Cada cotización guarda qué persona la envió. Cada persona ve en «Mis cotizaciones» las suyas, con estado e historial.

## Supuestos (confirmar si cambian)

- La ciudad se elige de una lista fija (departamento y municipio), no se escribe libre. Así la asignación por zona es exacta.
- Cada asesor tiene una sola zona. Una zona es un nombre más su lista de ciudades, y la administra el Super Admin.
- El asesor de la cuenta es la fuente de verdad. Al vincular un cliente interno que tenga otro responsable, se avisa y solo un supervisor puede decidir.

## Cambios de base (requieren aprobación)

| # | Cambio | Para qué |
|---|---|---|
| M1 | `PortalAccount.city` (código de municipio) y `PortalAccount.advisorId` (usuario) | Ciudad del registro y asesor asignado mientras la persona aún no está vinculada a una empresa |
| M2 | Tablas `Zone` (nombre, activa) y `ZoneCity` (zona y municipio), y `User.zoneId` | Zonas de asesores para asignar por ciudad |
| M3 | `Quote.listaId` y `QuoteItem.listaId` opcionales (dejan de usarse), `Quote.portalAccountId` opcional, `QuoteItem.unitPrice` opcional | Regla C1 (sin Listas), C6 (quién la envió) y C5 (precio por confirmar) |
| M4 | Tabla `QuoteStatusEvent` (cotización, de, a, fecha, usuario o cliente, nota) | Historial visible para el cliente y el personal |
| M5 | `Customer.portalTierId` (nivel de la empresa); los niveles que hoy tiene cada cuenta pasan a su empresa | Regla C2: la tarifa es de la empresa, no de cada persona |

## Acciones nuevas de panel (catálogo de acceso)

- `portalAccounts:read`: ver registros y cuentas, con alcance propio, de equipo o total.
- `portalAccounts:assign`: asignar o reasignar asesor, con alcance de equipo o total.
- `portalAccounts:manage`: vincular cliente, asignar tarifa, activar, rechazar, suspender y reactivar; alcance propio o de equipo.
- `quotes:history`: ver estados e historial de cotizaciones, con alcance propio, de equipo o total.
- Niveles, tarifa general y zonas siguen como acciones solo de Super Admin.

Paquetes: **Vendedor** recibe `portalAccounts:read` y `portalAccounts:manage` sobre lo propio. **Supervisor comercial** recibe esas mismas sobre su equipo, más `portalAccounts:assign`, `customers:reassign` y `quotes:history`.

## Tareas

- [x] T1 Migraciones M1–M5 (aprobadas 2026-11-25). Carpeta `prisma/migrations/20261125215543_portal_commercial_quotes`, solo aditiva, aplicada únicamente en la base local desechable. Comprobado: `tsc` limpio; jest customer-portal + commercial con 20 suites y 264 pruebas en verde. Ruta: delegada (un escritor). Nota: la copia de M5 toma un nivel cualquiera si dos personas de la misma empresa tenían niveles distintos; revisarlo con datos reales antes de producción.
- [x] T1b Lista de municipios: descargada con permiso del usuario desde DANE DIVIPOLA (datos.gov.co `gdxc-w37w`, corte 2024-12-30, CC BY 4.0). Quedó en `src/backend/src/common/geo/co-municipalities.json` (1.122 municipios) y se sirve en `GET /api/public/municipalities`.
- [x] T2–T4 backend: zonas, registro con ciudad, cuenta pendiente, asignación automática, acciones y paquetes de panel, y tarifa por empresa. Ruta: delegada (un escritor). Verificado: `tsc` limpio y 20 suites con 293 pruebas en verde. `access-assignments.service.spec.ts` ya fallaba antes: es una prueba de integración contra otra base (`localhost:54331`). Revisión de seguridad independiente: encontró 8 fallos (vincular la empresa de otro asesor, tarifa de una empresa ajena, reasignar empresas de otro equipo, asesor sin panel, aprobación doble, cola huérfana, bloqueo de pendientes por método). Los 8 quedaron corregidos y probados. Además el guard ahora bloquea por defecto: sin `Reflector`, una cuenta pendiente queda bloqueada. Verificado: `tsc` limpio, customer-portal con 17 suites y 234 pruebas en verde, eslint limpio. Falta el frontend.
- [x] T5–T6 backend: cotización del cliente con las reglas C1–C6, precio por confirmar e historial de estados. Ruta: delegada (escritor nuevo). Rutas nuevas:
  - Cliente: `POST/GET /api/customer-portal/customer/quotes` y `GET .../:id`.
  - Personal: `PATCH /api/commercial/quotes/:id/items/:itemId/price` y `GET /api/commercial/quotes/:id/history` (con `quotes:history`).
  - Las cotizaciones internas ya no exigen Lista. La tarifa por defecto es la de la empresa.
  - Revisión independiente: 9 hallazgos, todos corregidos:
    - El precio se fija solo en líneas por confirmar.
    - Solo se aceptan tarifas de venta.
    - No se puede ganar una cotización con precios pendientes.
    - Se reintenta ante una colisión de código, y la numeración pasa bien de COT-9999.
    - Hay topes de cantidad y de total, y un máximo de 20 cotizaciones abiertas.
    - Una cotización fuera de alcance responde 404.
    - Las líneas y los totales se escriben en una sola transacción.
  - Verificado: `tsc` limpio; 25 suites con 390 pruebas en verde. El SQL del generador de códigos se probó en la base local dentro de una transacción revertida.
- [x] T2–T6 frontend: dos escritores en paralelo, uno para el panel del personal y otro para el cliente.
  - Panel «Clientes del portal» con asesor, ciudad, tarifa de la empresa y cola «Sin asesor». El menú lo muestra según el panel asignado, sin importar el cargo.
  - Zonas y zona del asesor en Usuarios.
  - Registro con ciudad (`MunicipalityPicker`) y aviso de cuenta en revisión.
  - «Agregar a mi cotización», «Mi cotización» y «Mis cotizaciones» con historial.
  - En el detalle del personal: contacto con WhatsApp, precio por confirmar e historial.
  - El backend agregó `GET admin/advisors` y `canQuote` en `auth/me`.
- [x] T7 Retirados: `catalog/products`, `catalog/products/:id`, `customer/catalog/products` y `customer/catalog/products/:id`, además de `CatalogQueryDto` y `PortalApprovalQueue.tsx`. El script de humo ahora usa `customer/catalog/prices`.
- [x] T8 Recorrido completo en el navegador (base local desechable, datos ficticios):
  - Flujo probado:
    1. El Super Admin crea la zona «Eje Cafetero» (Pereira y Dosquebradas).
    2. Crea «Asesor Local» con esa zona y le aplica el paquete Vendedor.
    3. Laura se registra con ciudad Pereira. La cuenta queda PENDIENTE y se le asigna sola a Asesor Local, que recibe el aviso.
    4. Laura ve «Tu cuenta está en revisión».
    5. El asesor ve solo su cuenta, la aprueba (se crea la empresa CL-0002 a su nombre) y le pone el nivel Mayorista.
    6. Laura ve «Tu tarifa», agrega productos y envía COT-0001.
    7. El asesor ve el contacto (wa.me/573001234567), las líneas y el historial, y la pasa a negociación.
    8. Laura ve «En revisión» con su historial.
  - Pantallas revisadas a 1440 y 390: catálogo, ficha, Mi cotización, detalle del cliente y panel. Ninguna tiene scroll horizontal.
  - Fallos encontrados y corregidos durante la prueba:
    - El guard no pasaba la empresa, así que `canQuote` salía falso. Ahora tiene prueba de regresión.
    - La versión del catálogo de permisos estaba fija en el frontend (`panels-20261104-1` en vez de `panels-20261125-1`).
    - El contador «0» se mostraba con la lista vacía.
  - Verificación final:
    - Backend: `tsc` limpio, 36 suites y 553 pruebas.
    - Frontend: `tsc` limpio, 168 archivos y 1873 pruebas.

## Pendientes y preguntas abiertas

- **IVA (resuelto 2026-11-26):** el usuario confirmó que las tarifas ya incluyen IVA.
  - `computeQuoteTotals` (`quote-math.ts`) ya no suma IVA: el total es la suma de las líneas menos el descuento, e `taxAmount` es el IVA contenido. Aplica a cotizaciones del panel y del portal.
  - Las pantallas dicen «IVA incluido (19%)».
  - Probado con COT-0002: total $650.000 con IVA incluido de $103.782, igual en la vista del cliente y en la del asesor.
  - Las cotizaciones que ya existan guardan su total anterior hasta que alguien las edite. Al recalcularlas, el total baja al valor sin el IVA añadido. Conviene revisarlo antes de desplegar.
- **Confirmación nativa:** los botones de estado del detalle de cotización del personal usan `window.confirm`. Ya estaba así y no sigue las reglas de diseño. Se puede reemplazar por una confirmación en línea.
- **Botón de la tarjeta:** «Agregar a mi cotización» queda debajo de la tarjeta, fuera de su borde. Es un ajuste visual opcional.
- **Copia de niveles a la empresa (M5):** si dos personas de la misma empresa tenían niveles distintos, la copia se queda con uno. Hay que revisarlo con datos reales antes de producción.
- **Prueba sin correr:** `access-assignments.service.spec.ts` necesita su propia base de integración y no se ejecutó.
- **Sin commits.** La propuesta de commits por unidad de trabajo queda pendiente de aprobación.

## Comprobaciones por tarea

Backend: `npx jest` de los módulos tocados y `npx tsc --noEmit`. Frontend: `npx tsc --noEmit`, `npx vitest run` y `eslint` en lo tocado.

## Progreso

- 2026-11-25: análisis de paneles, cartera y cotizaciones hecho, y reglas acordadas con el usuario.
- 2026-11-26 (pruebas del usuario): formulario de usuarios más ancho y sin recorte; barra de fortaleza de clave (roja, naranja, verde) en todas las claves nuevas; la del personal usa zxcvbn como el servidor (12–72 caracteres, más estricta para Super Admin). Se añadió `@zxcvbn-ts/*` al frontend (package.json y lock). Ojito para ver la clave en todos los campos (`PasswordField`).
- 2026-11-26 (revisión de contraseñas): las rutas antiguas `POST /customer-portal/accounts/register` y `.../reset-password` solo exigían longitud; ahora aplican `validatePortalPassword` (con pruebas). Pendientes sin cambiar: `POST/PUT /users` sin límite de intentos propio (solo el global de 20/min por IP); Better Auth no valida nombre/correo al restablecer o cambiar; el reset antiguo solo escribe `portalAccount.passwordHash` y no la credencial de Better Auth. La API local no se reinició con este cambio.
- 2026-11-26 (contraseñas, cierre): retiradas las rutas antiguas `accounts/register`, `forgot-password` y `reset-password` (y su código, DTOs y pruebas). Better Auth ahora rechaza claves con el nombre o el correo del dueño al restablecer y al cambiar (el hook resuelve el dueño por sesión o por el token). Probado en vivo contra la API local (17 comprobaciones, cuenta de prueba borrada). Queda sin cubrir una prueba del hash con prefijo `sha256:` en `login`.
- 2026-11-26 (captcha del personal): `POST /api/auth/login` exige Turnstile (`TurnstileGuard`, cabecera `x-captcha-response`) cuando existe `TURNSTILE_SECRET_KEY`; en producción sin llave se rechaza. La pantalla de ingreso del personal muestra el widget cuando existe `VITE_TURNSTILE_SITE_KEY`. En local no hay llaves, así que no aparece. Pendiente: probarlo con las llaves de prueba de Cloudflare y confirmar que producción tiene la llave pública en el build del frontend.
- 2026-11-26: T1–T8 implementados y probados en local. Faltan las decisiones abiertas y la aprobación de commits.
- 2026-11-26 (Clientes del portal, pestañas): `/customer-accounts` se divide en pestañas Cuentas, Sin asesor (con `portalAccounts:assign`), Zonas y Niveles y tarifa (solo Super Admin; sin permiso nuevo). Con una sola pestaña disponible no se muestra la barra. Edición de zona: el backend ya devuelve las ciudades y el formulario las carga; ahora además enfoca el nombre al editar, explica que no hay que reescribirlas y cierra la edición si se elimina esa zona. Selector de ciudades con búsqueda ya existía en `ZonesAdminSection`. Pruebas: `tsc` limpio y vitest 1878 OK; sin cambios de backend. Pendiente: decidir si Zonas y Niveles se asignan por pestaña a no Super Admin (cambia reglas de permisos).
- 2026-11-26 (Zonas y Niveles asignables): el usuario decidió que se asignen por pestaña. Nuevas acciones `portalZones:manage` y `portalTiers:manage` (alcance global) y paquetes `portal-zonas` y `portal-niveles`. Zonas, niveles, tarifa general y lista de tarifas activas (`GET customer-portal/admin/price-lists`) los impone el backend: Super Admin, o quien tenga la acción. Las tarifas se crean y editan en Biblioteca > Catálogos maestros > Tarifas (la pestaña lo indica). Sin migración. Pruebas: jest (customer-portal, zones, common) 622 OK, `tsc` limpio en ambos, vitest 1878 OK. API local reconstruida y reiniciada en 3031.
- 2026-11-26 (diseño Biblioteca, corrección): por indicación del usuario, «Clientes del portal» queda con tres pestañas (Clientes, Sin asesor, Zonas) con el mismo diseño que Biblioteca (clases `biblioteca-workspace__*`: icono pequeño, nombre corto y texto de ayuda a la derecha). Se quitó la pestaña «Niveles y tarifa» (tarifas se administran en Biblioteca > Catálogos maestros > Tarifas) y se retiró el permiso `portalTiers:manage` y su paquete. Quedan `portalZones:manage` y el paquete `portal-zonas`. Niveles (Oro, Plata) y tarifa general solo Super Admin por API, sin pantalla ahora. Pruebas: vitest 1878, jest 622, `tsc` limpio; API local reiniciada.
- 2026-11-26 (paneles con pestañas): nuevo componente compartido `WorkspaceTabs` (por estado o por ruta) con el diseño de Biblioteca; lo usan Clientes del portal y la barra de Comercial. Ventas y Supervisor quedaron migrados, pero esos layouts no están montados en ninguna ruta. Norma escrita en `docs/PATRON-PANELES-CON-PESTANAS.md` y en la skill gs-disenador-web. «Asignar paneles» (/users/access) ahora tiene el panel «Clientes del portal» con tres grupos independientes (Clientes, Sin asesor, Zonas); el paquete `portal-zonas` pasó a ese panel. Sin cambios de backend. Pruebas: tsc limpio, vitest 1898 pasan. Pendiente: verlo en el navegador (1440 y 375 px); decidir si Sin asesor o Zonas solas deben ocultar la pestaña Clientes (hoy dependen de `portalAccounts:read`).
- 2026-11-26 (reparto de paneles): por decisión del usuario, «Clientes del portal» deja de ser panel y se fusiona en Comercial (pestañas Solicitudes y Zonas; `/customer-accounts` redirige a `/commercial/portal`). Comercial queda: Clientes, Solicitudes, Cotizaciones, Metas, Resumen del equipo, Zonas. «Gestionar avisos» y «Promociones internas» pasan a Marketing y mercadeo (`/marketing/notices` y `/marketing/promotions`; las rutas viejas redirigen). «Asignar paneles» pasa a ser pestaña del panel Usuarios mediante `UsersLayout` (sin tocar `UsersPage`, que otra sesión edita). «Asignar paneles» ya agrupa las acciones del portal dentro de Comercial y las de avisos dentro de Marketing. Sin cambios de backend. Pruebas: tsc limpio, vitest 1933 pasan. Pendiente: verlo en el navegador (375, 768 y 1440 px); mover «Roles» a la barra de Usuarios cuando termine la sesión de contraseñas; enriquecer Clientes con datos de la cuenta de la tienda; retirar `/sales/*` y `/supervisor/*`; renombrar el paquete `portal-zonas` (backend, hoy dice «Clientes del portal: Zonas»).

## T9 - Portal del cliente en pestañas (2026-11-26)
- [x] Pestañas: Inicio, Mi cotización (N), Mis cotizaciones, Mis datos; se quitó "Catálogo" de las pestañas (el CTA de Inicio y el menú de la tienda lo cubren).
- [x] Inicio nuevo (CustomerHome): estado de cuenta, tarjeta de asesor (solo nombre + WhatsApp general), borrador de cotización, últimas 3 cotizaciones, tarifa.
- [x] Servidor: auth/me devuelve advisor {name} (asesor propio, si no el dueño de la empresa). Sin migración.
- [x] Aviso bajo la cabecera en /catalogo y /productos para cuentas en revisión, en configuración o con perfil incompleto (CatalogAccountNotice).
- Pruebas: frontend customer-portal+storefront 453 ok, tsc ok, backend customer-portal ok. Visto a 1440 y 390 px (sin scroll horizontal, objetivos >=44px).
- Pendiente: reiniciar el API local (3031) para que muestre el nombre del asesor; ver el aviso del catálogo con una cuenta pendiente; impeccable no está instalado en este worktree (se aplicó gs-disenador-web + ux-ui-senior).
- 2026-11-26 (sin paquetes de paneles, tres alcances): los paquetes dejan de existir en backend y frontend; todo se asigna acción por acción en «Asignar paneles». Las fuentes heredadas de un paquete siguen en la base pero ya no conceden (filtro central `granting-sources.ts`); quien tenía paneles solo por paquete los pierde. Script de limpieza para la copia local, sin ejecutar: `src/backend/scripts/purge-package-access-sources.mjs` (dry-run por defecto, `--apply` borra, solo con `127.0.0.1:54329/gs_prod_copy`). Se quitó el gestor viejo de `UsersPage` (solo líneas de paquetes). Alcances propio/equipo/global ahora en clientes (reasignar), cotizaciones (crear), cuentas del portal (asignar), agenda, resumen del equipo y metas, con el servidor imponiéndolos; una acción dependiente no puede tener más alcance que su dependencia. Sin migraciones. Pendiente de decisión: Biblioteca y Marketing (datos sin dueño) siguen solo globales; zonas por equipo exigen un campo `createdById` (migración); KPI de comparación asesor-equipo y «revisar metas» no existen; la derivación de agenda por rol (`base-access.ts`) contradice «nada se asigna por rol»; el destino de «propio» al reasignar. Pruebas: backend tsc limpio y jest 977; frontend tsc limpio y vitest 1939. API local reconstruida y reiniciada en 3031.
- 2026-11-27 (clientes: duplicados y ciudad): la acción `customers:reassign` se llama ahora «Reasignar responsable del cliente» (hace una reasignación a la vez; la masiva de cartera queda para «Equipo y metas» cuando se construya). Alta y edición de clientes: se busca un cliente existente por NIT y correo normalizados (409 `CUSTOMER_DUPLICATE` con `field` y, si está en su alcance, `existing`); la ciudad se elige de la lista DIVIPOLA y se guarda el código (`INVALID_CITY` 400); un solo generador de código CL-####. Al aprobar una cuenta web: si hay un cliente activo con ese NIT o correo se vincula; con varias coincidencias `CUSTOMER_AMBIGUOUS`, fuera de alcance `CUSTOMER_OUT_OF_SCOPE`; error de unicidad pasa de 500 a 409. El registro web (`portal-auth`) no se tocó. Decisión por revisar: el NIT nuevo se guarda sin puntos ni dígito de verificación (`901123456`), lo que pierde ese dígito del dato; los clientes antiguos no se reescriben. Pendiente: probar la normalización del NIT en SQL con datos reales antes de desplegar. Pruebas: backend tsc limpio y jest 941; frontend tsc limpio y vitest 1957. La API local no quedó reiniciada: la base 127.0.0.1:54329 no estaba corriendo y no la arranqué.
