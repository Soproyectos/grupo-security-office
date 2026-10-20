# Administrar banners desde Configuración de la página

El slider de la tienda se administra en **Comercial → Configuración de la página → Banners**. Super Admin asigna las acciones a cada persona desde **Usuarios → Paneles → Configuración de la página → Banners**. Las cuentas existentes no reciben este trabajo automáticamente.

## Cómo preparar una campaña

1. Pulsa **Crear banner** y escribe un nombre para reconocerlo dentro del equipo.
2. Sube una imagen para escritorio. Puedes agregar otra para móvil o usar una URL HTTPS. Se admiten PNG, JPG y WebP hasta 8 MB; el servidor reconoce el formato por el contenido.
3. Escribe una descripción accesible y, si corresponde, el destino y texto del botón. Sin destino, la imagen no funciona como enlace.
4. Revisa las vistas de escritorio y móvil. **Completa** conserva toda la imagen. **Llenar** recorta bordes y permite elegir el punto de enfoque.
5. Pulsa **Guardar borrador**. Otra persona con permiso para publicar puede revisarlo y pulsar **Publicar**.

Se recomienda una pieza de 1500 × 400 px para escritorio y otra de 900 × 675 px para móvil. Una imagen ancha no se vuelve una composición para móvil automáticamente: sin pieza móvil, se muestra proporcionalmente la de escritorio. La vista previa usa el mismo componente visual que la tienda.

## Qué puede hacer cada persona

- **Ver** (`banners:read`): consultar borradores, versiones publicadas y vista previa.
- **Crear** (`banners:create`): preparar nuevos borradores y subir imágenes.
- **Editar** (`banners:edit`): cambiar borradores y subir imágenes.
- **Publicar y retirar publicación** (`banners:publish`): poner la versión guardada en la tienda o retirarla. No permite editar el contenido.
- **Eliminar** (`banners:delete`): eliminar un borrador. Si está publicado, primero debe retirarlo una persona con permiso para publicar.

Las cuatro acciones de trabajo requieren **Ver**. Cada solicitud de la API comprueba los permisos vigentes. Cambiar el cargo de una persona no le concede banners ni información comercial. El apartado **Información comercial** conserva sus permisos independientes `storefront:read` y `storefront:edit`.

## Qué ve el visitante

El visitante recibe exclusivamente la copia publicada. Editar título, imagen, enlace, posición o botón de un banner publicado prepara cambios privados; la copia visible permanece igual hasta pulsar **Publicar cambios**. El orden se aplica al publicar. Si se retiran todos los banners, desaparece el slider. Con una sola campaña no aparecen flechas de navegación innecesarias.

Los enlaces y el texto del botón son propios de cada campaña. No hay fechas de programación ni rotación automática en esta versión: las campañas se publican y retiran manualmente.

## Datos, seguridad y auditoría

La tabla PostgreSQL `storefront_banners` conserva `draft`, `publishedData` y una revisión numérica. Una pantalla desactualizada recibe un conflicto y debe recargar antes de guardar. No se sobrescribe silenciosamente el trabajo de otra persona.

Las mutaciones de contenido y publicación se guardan en la misma transacción que su auditoría. Si no puede registrarse la acción, el cambio se revierte. Los eventos de dominio son `banner_create`, `banner_edit`, `banner_publish`, `banner_unpublish` y `banner_delete`, entidad `StorefrontBanner`. La carga de archivos genera `banner_image_upload`, entidad `StorefrontBannerAsset`. Super Admin puede filtrarlos en **Auditoría**; se mantienen los límites existentes para otros auditores.

Para contar publicaciones, usa `banner_publish`. El evento complementario `administrative-action` no se suma a los eventos de dominio: describen la misma operación. Las imágenes se guardan con nombre aleatorio en `uploads/banners`; eliminar un banner no borra archivos porque podrían estar reutilizados. La limpieza de archivos huérfanos queda fuera de esta versión.

La API no descarga URLs proporcionadas por usuarios. Rechaza destinos de scripts, URLs con credenciales, rutas ambiguas y SVG subidos. La validación de archivos comprueba tipo permitido, tamaño y firma PNG/JPEG/WebP; no incluye un servicio antivirus ni decodificación completa de imágenes.

## Revisión local del 9 de octubre de 2026

La migración `20261009160000_storefront_banners` conserva las dos campañas que antes estaban fijas en el código. Se aplicó en una base nueva `gs_banner_preview` y en una base descartable de pruebas, ambas en `127.0.0.1:55439`. No se cambió una base externa ni cuentas reales.

- Backend: `npm test -- --runInBand banners.service.spec.ts banners.postgres.spec.ts access-catalog.spec.ts admin-access.guard.spec.ts`: 4 suites, 129 pruebas aprobadas. Cinco usan PostgreSQL real, HTTP, JWT y sesiones; incluyen revocación, edición separada de publicación, entradas inválidas, conflictos, retirada, eliminación y rollback por auditoría fallida. Tras corregir archivos PNG con nombre JPG, se repitieron las dos suites nuevas: 7 pruebas aprobadas.
- Frontend: las pruebas de banners, navegación, inicio, categorías y búsqueda aprobaron 39 casos. Construcción aprobada; lint sin errores y nueve advertencias existentes.
- Las 33 migraciones del proyecto se aplicaron correctamente desde cero en la base de revisión.
- Navegador real (Edge/Playwright): login, carga del archivo existente PNG con nombre JPG, creación, borrador privado, publicación, edición sin alterar la versión pública, republicación, retirada y eliminación aprobadas. Editor y tienda revisados a 390 px; editor sin desbordamiento horizontal y sin excepciones JavaScript. Capturas en `.local/banner-preview/`. La API y el frontend quedaron en ejecución para revisión.

El clúster local disponible es PostgreSQL 18. Docker no estaba operativo; la comprobación en PostgreSQL 16 sigue pendiente antes de publicar en un servidor compartido.

## Abrir y reiniciar la revisión

Frontend: `http://localhost:5180/commercial/page-settings`. Tienda: `http://localhost:5180/tienda`. API: `http://localhost:3100/api/docs`.

Las credenciales ficticias están en `.local/banner-preview/credentials.json`, excluido de Git. Usa `editor` para probar banners e información comercial. La cuenta `admin` permite revisar asignaciones y exige el enrolamiento MFA normal. No se envía correo a estas identidades ficticias.

Con el clúster temporal en funcionamiento, desde `src/backend`:

```powershell
node scripts/banner-preview.cjs seed
node scripts/banner-preview.cjs api
# En otra terminal:
node scripts/banner-preview.cjs frontend
```

El script solo admite la base local `gs_banner_preview`; no usa el `DATABASE_URL` ordinario del proyecto. Los procesos, registros y capturas de navegador de esta revisión están en `.local/banner-preview`.

## Límite de reversión

La unidad incluye el modelo y migración de banners, archivos `banners.*` del backend, registro en `StorefrontModule` y catálogo de acceso, componentes y servicio de banners del frontend, página `PageConfigurationPage`, entradas de navegación, filtros de auditoría, pruebas y esta guía. Para volver atrás, restaura el slider fijo y retira esas integraciones de rutas y permisos junto con la migración nueva. Conserva primero los datos de `storefront_banners` y sus imágenes. No reviertas la implementación anterior de permisos individuales ni los módulos de catálogo o acceso de clientes.
