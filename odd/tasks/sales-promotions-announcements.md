# Promociones para vendedores

Estado: implementado en el checkout de desarrollo del servidor de soporte. Sin commit, push, despliegue ni migración en la base de la aplicación.

## Comportamiento
- El vendedor recibe una ventana automática al entrar o recargar cualquier ruta de su espacio cuando existen avisos vigentes.
- Cerrar o Escape permite continuar. La navegación interna y la consulta periódica no reabren la ventana; el botón Ver promociones permite abrirla.
- El panel permanece visible sobre sus herramientas de ventas. No concede acceso a Comercial.
- Supervisor publica y modifica sus avisos para su equipo. Super Admin gestiona todos y publica avisos globales. Editar conserva autor y destinatarios originales.
- Título, condiciones y vigencia en hora Colombia; publicación, edición, retiro e imágenes se auditan.
- Un flyer reemplazable por aviso, PNG/JPEG/WebP, máximo 2 MB. Puede quitarse sin borrar el aviso.
- El archivo se carga por multipart autenticado, valida tamaño y firma raster y se guarda en PostgreSQL como imagen codificada. Se entrega únicamente en consultas autorizadas del aviso; no utiliza el servicio público de archivos.
- Crear aviso y subir flyer son operaciones separadas: si falla la imagen, el formulario conserva el ID y permite reintentar sin duplicar el aviso.
- Avisos retirados, vencidos o futuros no aparecen al vendedor. No hay promociones ficticias en datos reales.

## Validación
- Prisma validate/generate y typecheck backend de build aprobados.
- 23 pruebas backend de permisos, alcance, vigencia, edición, imágenes y auditoría.
- 17 pruebas frontend de presentación, roles, fechas y navegación; ESLint de archivos modificados.
- Base PostgreSQL 16 efímera: SQL de migración real, publicación, edición conservando equipo, imagen privada, eliminación de imagen, visibilidad por jerarquía, aislamiento de equipos, retiro y auditoría. Contenedor retirado; base de aplicación intacta.
- Navegador con datos ficticios: entrada, cierre, navegación, recarga, formulario de edición, subida/reemplazo y retirada de imagen, publicación con fechas correctas.
- Typecheck frontend completo conserva seis errores previos en Header y Auditoría; ningún error nuevo en promociones.

## Activación y revisión
La migración 20261005213000_add_sales_promotions está pendiente de aplicación. La vista localhost:8768 es una demostración con fixtures, sin conexión al backend.
El manifiesto local announcements-final-with-flyers.json conserva originales y contenido final para revisión y reversión de esta tarea. No revertir archivos completos sin comparar cambios posteriores.
La revisión se entrega como diff backend y frontend, con tests asociados. No se crearon commits ni PRs.

## Hallazgo fuera de alcance
HierarchyService.getAncestorIds del proyecto recorre descendientes. No se modificó el servicio compartido por su impacto en otros permisos; este módulo recorre padres con consulta recursiva propia, protección de ciclos y límite de profundidad. Revisar el servicio compartido en otra tarea.


## Página del vendedor
Se agregó /sales/promotions y enlace Promociones al menú del vendedor. Solo consulta los avisos vigentes autorizados, sin controles de edición. Se reutiliza el panel y la ventana automática. ESLint y prueba de navegación aprobados; bundle compila y navegador confirma acceso desde el menú sin reabrir la ventana. Typecheck conserva seis errores previos externos. Sin despliegue. Reversión incremental en /tmp/seller-promotions-page-change.json.

## Activación del entorno de desarrollo autorizada por el usuario
El usuario pidió integrarlo en la web local para probarlo. Se verificó NODE_ENV=development y DATABASE_URL con host db, base grupo_security, contenedores de docker-compose.yml de desarrollo. Respaldo previo data/backups/before-sales-promotions-20261005.sql, directorio ignorado.
Se aplicaron migraciones pendientes de notifications y sales_promotions, se generó Prisma y reinició gs-api. Esquema al día; tabla promociones legible y vacía. Health a través del frontend HTTP 200 y Swagger registra lectura, gestión, publicación, edición, upload/eliminación de flyer y retiro.
Túnel SSH local solo loopback: localhost:5173 -> srv-soporte:5173. Navegador abierto en login real, sin fixtures ni cambios de usuarios/credenciales. Vendedor: /sales/promotions, Supervisor/Super Admin: /promotions. Los avisos deben publicarlos los usuarios autorizados; no se insertaron ofertas ficticias.
Esta activación reemplaza el estado anterior de migración pendiente para desarrollo. Producción no se modificó.

## Corrección de perfil persistido frente a cookie compartida
Usuario reportó 403 Forbidden resource en GET manage y POST publicar indicando Super Admin. Se verificó que el controlador compilado exige los nombres canónicos Supervisor/Super Admin. La pantalla confiaba solo en el perfil de Zustand/localStorage; las cookies entre pestañas pueden representar otro usuario. Se observaron sesiones recientes activas con Super Admin y Vendedor; esto respalda el escenario de desajuste, aunque la petición original no se capturó y su causa exacta no está confirmada.
Antes de gestionar/publicar/editar/retirar/subir/quitar imagen, el frontend comprueba /auth/profile y sincroniza el perfil real. Si cambia la identidad o el alcance global/equipo, detiene la acción para evitar atribuirla a otra cuenta o audiencia. Vendedor no recibe gestión. Feedback local preserva mensajes de sesión.
8 tests de identidad (SA, Supervisor, cookie Vendedor, otra cuenta SA, cambio de alcance y operaciones protegidas), 16 tests de promociones y 8 tests backend de RolesGuard pasan; ESLint aprobado. Typecheck conserva seis errores previos fuera de promociones. Vite sirve el código actualizado. Se solicitó al usuario reingresar como Super Admin y reintentar, pendiente confirmación de su sesión real. No se ampliaron roles ni modificaron credenciales.

Confirmación del usuario: después de reingresar como Super Admin, publicó correctamente en la web de desarrollo. Falla de publicación resuelta y comprobada con su sesión real.

## Formato flyer grande solicitado
Usuario compartió imagen pública de SYSCOM como referencia y aclaró que quiere únicamente el formato: una ventana con el flyer grande. No se publicó su imagen ni se copiaron contactos/política de mora.
Popup actualizado a ancho máximo 5xl, un aviso por fila, imagen completa y sin deformar limitada por altura disponible, cierre con encabezado sticky. Panel de consulta mantiene columnas. Conserva apertura cada entrada/recarga y gestión por roles.
ESLint, 16 pruebas de presentación y build Vite aprobados; typecheck conserva seis errores previos externos. Vista navegador con fixtures confirma nuevo formato, imagen completa y cierre visible; Vite del entorno real entrega el mismo archivo mediante hot reload. Sin migraciones nuevas ni deploy producción.

## Popup solo imagen y equis
Usuario precisó captura SYSCOM: emergente debe tener solo imagen y equis. Se quitaron títulos, condiciones, fechas, caja/padding y botón Continuar del dialog; imagen centrada completa, fondo oscuro y equis circular fuera de esquina superior derecha. Nombre accesible y Escape nativos conservados. Se muestra el primer flyer vigente según orden del servidor; el panel y página conservan todos los avisos y condiciones. Sin flyers vigentes no se abre ventana vacía. Apertura cada entrada/recarga y cierre/reapertura verificados en navegador con fixtures. ESLint16tests y build aprobados; TS conserva seis errores baseline externos. Activo hot reload en web desarrollo, sin cambios BD ni producción.

## Retirar panel de ventas
Usuario seleccionó bloque Promociones vigentes de /sales y pidió borrarlo. Se oculta sección completa (encabezado, ayuda, Ver flyer, enlace cotizaciones y cards) en home/clientes/cotizaciones. Dialog soloimagen+X continúa cada entrada/recarga. La sección se mantiene únicamente en /sales/promotions, página previamente solicitada para consulta. Se conserva instancia del popup entre navegación interna. ESLint y17 tests pertinentes pasan; TS conserva6 errores previos externos. Activo hotreload dev.

## Cabecera vendedor acoplada al estilo existente
Usuario pidió adaptar franja superior /sales al estilo web. SalesLayout adopta identidad Grupo Security SAS, tamaños de isotipo, header sticky con sombra/borde, tipografía y colores del Header existente, dos niveles de navegación, estado activo subrayado y avatar/nombre/rol. Buscador visual equivalente dirige únicamente a /catalogo/buscar?q en pestaña nueva; no permite Comercial. Mantiene herramientas personales, logout y flyer. ESLint/test navegación/build aprobados, typecheck seis errores baseline externos, comprobación visual fixture screenshot vendedor-estilo-proyecto.jpg. Activo hotreload en webdev servidorsoporte. Sin backend/DB/producción/commits.
