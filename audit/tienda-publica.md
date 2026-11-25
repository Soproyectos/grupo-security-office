# Examen UX/UI — parte comercial pública (2026-11-23)

Ruta auditada: `.claude/worktrees/sad-golick-8a6b22` (web local unificada, http://127.0.0.1:5181, datos reales de producción en solo lectura). Código en `src/frontend/src/features/storefront/`. Sin cambios hechos: solo propuestas.

**Alcance:** /tienda (portada), /catalogo, categoría, búsqueda, ficha de producto, /soluciones, /sedes, /garantias, pie y cabecera, login/registro de clientes. Desktop 1440 y móvil 390.
**Supuestos (sin preguntar):** objetivo = que el cliente encuentre un equipo y pida cotización por WhatsApp; no hay carrito ni precios públicos; la mayoría llega desde el móvil.
**Fuera de este examen / no verificado:** /nosotros, /servicios/* (no los abrí); tiempos reales de producción (aquí hay un túnel SSH que suma latencia); contraste medido con herramienta; flujo de cuenta de clientes autenticada; envío real de correos.

Severidad: 4 crítico · 3 alto · 2 medio · 1 menor. Esfuerzo: S/M/L.

## Qué funciona bien (observado)
- Portada clara: una promesa, un buscador y un enlace a WhatsApp; confianza (distribuidor, garantía, 4 sedes). Móvil sin scroll horizontal (390/390).
- Menú de categorías con fotos y conteo; «Cotizar por WhatsApp» en ficha; estado vacío de búsqueda con salida («Explorar categorías»); sedes con teléfono y horario.

## Hallazgos priorizados

| # | Sev | Ley | Hallazgo y evidencia | Propuesta | Esf. |
|---|---|---|---|---|---|
| 1 | 4 | Jakob, Prägnanz | **Imágenes rotas visibles.** En la ficha DS-A81024S 2 de 3 miniaturas muestran el ícono de imagen rota; en resultados de «hikvision» la 1.ª y 2.ª tarjeta salen rotas; 6 `<img>` sin `alt` en la ficha. | Ocultar miniaturas que fallan (`onError`) y mostrar un marcador neutro; `alt` vacío o descriptivo; revisar en BD los archivos de esas fichas. | S |
| 2 | 4 | Tesler, Jakob | **Producto «DESCONTINUADO» invita a cotizar.** La ficha muestra la insignia y aun así «Precio a consultar» + 2 botones «Cotizar por WhatsApp» (`ProductHero.tsx:144`). Promete algo que quizá no existe. | Para descontinuados: cambiar CTA a «Preguntar por un equivalente» o no publicarlos; decisión de negocio. | S |
| 3 | 3 | Hick, Von Restorff | **Todo es «Precio a consultar».** Cada tarjeta repite el mismo texto + botón «Cotizar» (`PublicProductCard.tsx:60`); 850 resultados sin diferenciador. | Si no hay precio, quitar el texto repetido de la tarjeta y dejar un solo CTA; el texto solo en la ficha. | S |
| 4 | 3 | Fitts | **CTA móvil pequeño y tapado.** Barra fija de la ficha: botón de 32 px de alto (y800) y texto cortado «Cotizar por Wha…» por el botón flotante de WhatsApp. «Ficha técnica» enlace de 20 px. | Botón ≥44 px, ancho completo en móvil; dejar espacio al botón flotante o unirlos en uno solo. | S |
| 5 | 3 | Pareto, Parkinson | **Búsqueda lenta.** Respuesta de 2–5 s (ver nota: túnel) y solo esqueletos hasta ~10 s en la prueba; la API de lista tardó 3,3 s. | Medir en el servidor real; si persiste, índice/limite de campos y `staleTime`; mantener esqueleto + mensaje de espera. | M |
| 6 | 3 | Hick | **Ventana de campaña al entrar** («Hik Friday») cubre la portada en desktop y exige cerrar antes de buscar. | Mostrar una vez por sesión, no en el primer segundo; que no bloquee la búsqueda. Decisión de la sesión de banners. | S |
| 7 | 2 | Miller | **Ficha con 13 secciones de especificaciones** y 2 bloques de «Recursos» repetidos (PDF/EN/UND); «Idioma: UND» no se entiende (`ProductResources.tsx:73`). | Abrir solo 2–3 grupos, resto plegado; traducir «UND» a «Sin idioma» o esconderlo. | S |
| 8 | 2 | Miller | **Texto técnico en inglés/siglas** en beneficios («IU fácil de usar», «IP SAN», «RAID 0,1,3…»). Público no técnico. | Resumen de 3–4 líneas en lenguaje simple antes de la ficha (lo puede generar la Biblioteca). | M |
| 9 | 2 | Prägnanz | **Círculos de categoría vacíos** en `/catalogo` (círculos grises sin foto) aunque el menú sí tiene fotos (`/images/menu/*`). Se ve como si faltara algo. | Usar las mismas fotos del menú (`menu-images.ts`) en la rejilla de `/catalogo` y en la portada. | S |
| 10 | 2 | Jakob | **Título de pestaña «Panel de Administración»** mientras carga y en pantallas de login/registro de clientes (`index.html:7`). Mala señal de marca y SEO. | Título neutro «Grupo Security» en `index.html`; el panel lo cambia al montarse. | S |
| 11 | 2 | Posición serial | Cabecera: **«Catálogo · Soluciones · Soporte»** y «Mi cuenta» sin acceso directo a WhatsApp/Cotizar; el CTA comercial no está entre los primeros ni últimos ítems. | Añadir «Cotizar» o WhatsApp como último ítem de la barra. | S |
| 12 | 1 | Fitts | Enlaces del pie de 24 px de alto (mínimo WCAG 2.2, pero lejos de 44). | `py-2` en enlaces del pie en móvil. | S |
| 13 | 1 | Proximidad | Títulos de tarjeta cortados («Adaptador inalámbrico DS-…») en móvil a 2 columnas. | Permitir 3 líneas o pasar a 1 columna bajo 360 px. | S |
| 14 | 1 | Tesler | «Estatuto del consumidor» lleva a la SIC (sitio externo) sin avisar. | Marcar «(abre en otra pestaña)» o resumir la política propia. | S |

## No es de la tienda (ignorar)
El botón flotante oscuro (herramienta de anotaciones de desarrollo) se superpone al de WhatsApp; no existe en producción.

## Orden sugerido
1) #1, #2, #4 (confianza y conversión, esfuerzo S); 2) #3, #9, #10, #11; 3) #5 medir en servidor real; 4) #7, #8 con la Biblioteca. Esperar aprobación antes de implementar; después verificar con `tsc`, `eslint`, `vitest` y capturas antes/después.

## Área de clientes (prueba 2026-11-23)

**Resultado: no se pudo crear el cliente de prueba ni pedir recuperación de contraseña. No se escribió nada en la base.**

- Registro (`/clientes/registro`) y recuperación (`/clientes/recuperar`) fallan con el mensaje genérico. Causa observada en el log de la API: `P2021`, falta la tabla `public.portal_auth_user`. Producción solo tiene la migración `20261119120000`; faltan `20261120090000_portal_auth_better_auth` y `20261120130000_portal_account_rules`. No se migró.
- Formulario de registro, observado:
  - (3) Contraseña con una palabra del nombre («Prueba») se rechaza; la regla «Sin tu nombre…» no explica qué palabra molesta.
  - (2) Tras marcar la casilla de política, el error rojo «Marca la casilla…» sigue visible hasta enviar de nuevo.
  - (2) El mensaje de fallo «No se pudo crear la cuenta. Revisa los datos…» culpa al usuario cuando el fallo es del servidor; separar error de datos y error del sistema.
  - Bien: lista de requisitos de contraseña en vivo («Cumplido/Falta»), botón «Mostrar», NIT y teléfono opcionales.
- Sin verificar: login real, perfil, completar perfil, catálogo de cliente, cambio de correo/contraseña, borrado de cuenta, Google.

### Prueba de punta a punta en BD local (`gs_ux_test`, web en :5182, API en :3011)

Base local nueva, con todas las migraciones aplicadas (`prisma migrate deploy`), sin tocar producción. Cuenta demo: `cliente.demo.ux@example.com` (la contraseña de prueba se cambió durante la prueba; se puede crear otra desde el registro).

| Paso | Resultado |
|---|---|
| Registro con correo | OK. Muestra «Revisa tu correo». |
| Confirmación de correo (enlace en `src/backend/outbox/ultimo-correo.txt`, sin SMTP) | OK. Entra directo al portal. |
| Portal: Mi cuenta, Mis datos, Catálogo | OK. Catálogo vacío porque la BD local no tiene productos (no evaluable). |
| Cambiar contraseña | OK. «Cambiamos tu contraseña y cerramos tus otras sesiones.» |
| Cerrar sesión; login con la contraseña vieja | Rechazada correctamente. |
| Login con la nueva | OK. |
| Recuperar contraseña (enlace en el mismo outbox) → nueva contraseña → login | OK. Mensaje neutro («Si el correo corresponde a una cuenta…»). |
| Editar mis datos | Carga; no se probó guardar. |
| Cambiar correo, eliminar cuenta, Google | No probados. |

Hallazgos nuevos:
- (2) «Comprobando tu cuenta…» tarda más de 10 s al abrir una página del portal directamente (en desarrollo, sin compilar); en producción medir. Si pasa, mostrar esqueleto.
- (2) Tras cambiar la contraseña, el aviso «Listo…» es una línea pequeña sin color de éxito, mientras la lista debajo vuelve a decir «Falta» en todo; parece error. Mostrar aviso verde y ocultar la lista.
- (2) El portal no dice qué sigue: «Tu acceso es básico. Un asesor puede habilitarte cotizaciones y precios.» sin botón para pedirlo. Añadir «Pedir acceso a precios» (WhatsApp o formulario). Pareto/Tesler.
- (1) El registro exige confirmar el correo pero el mensaje no ofrece reenviar el enlace.
