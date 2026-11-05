# Marketing y mercadeo: campañas de la tienda (banner del título y pop-up)

Estado (actualizado 2026-11-04): M1 backend, M2 panel de administración, M3 banner y pop-up públicos y M4 panel asignable (3 paquetes `marketing-*`, versión `panels-20261104-1`) están implementados y verificados con pruebas y en la demo, **sin commit**. Ninguna migración de esquema; solo se redactó `20261104090000_remove_legacy_storefront_banners` (no aplicada vía Prisma; las 2 filas heredadas se borraron a mano en la base de demo `gs_api_copy`). Pendiente: M5 (revisión móvil, tablet, pop-up en móvil, banner sin imagen), pestaña futura «Campañas», retirar los banners de PRUEBA de la demo. Detalle técnico completo: `docs/handoffs/2026-11-04-marketing-banners-y-paneles.md`. Los checkboxes de abajo reflejan el plan original y no se actualizaron tarea por tarea.

## Objetivo
Un panel delegable «Marketing y mercadeo» con una pestaña «Campañas» desde la que una persona con permiso crea, edita, publica y retira la publicidad de la tienda pública, sin tocar código: el banner deslizable del título (hoy la foto de la cámara en el héroe de `/tienda`) y el pop-up.

## Decisiones del usuario (2026-11-03)
- Se construye de nuevo con el modelo de paneles actual. No se recupera el código viejo de banners (se descartó el 2026-10-20 en el commit `b5f20b1` por usar el modelo de permisos anterior).
- Se asigna igual que el resto de paneles (Usuarios → Paneles). Quien lo tenga entra a «Marketing y mercadeo → Campañas».
- Secciones de Campañas por ahora: **Banner del título** y **Pop-up**. Se podrán añadir otras (p. ej. franja de anuncio) después.
- **El pop-up muestra únicamente la imagen de la campaña**, diseñada para el pop-up. Sin título ni descripción superpuestos. Puede llevar un enlace al hacer clic.
- El banner del título se desliza solo, sin saturar: pausa al pasar el cursor o enfocar, botón de pausa, respeta «reducir movimiento»; la foto actual de la cámara se conserva como respaldo cuando no hay campañas publicadas.
- Los avisos internos para vendedores (`SalesPromotion`) siguen como están.

## Restricciones
- AGENTS.md: commits, push, despliegues, migraciones y cambios de servicios requieren aprobación explícita. La migración se redacta pero no se aplica sin aprobación.
- Sin datos inventados: no hay campañas ficticias en datos reales.
- Las medidas de las imágenes las muestra el panel y se validan al subir (ver pendientes).

## Decisiones del usuario (2026-11-04)
- Medidas aprobadas: banner de escritorio 1200 × 520 (ancho mínimo 1000), móvil 900 × 675, pop-up 900 × 900 con proporción flexible, máximo 3 MB.
- El panel «Marketing y mercadeo» abre por ahora con una sola pestaña, **Banners** (Banner del título y Pop-up). «Campañas» queda como pestaña futura: una campaña reunirá más cosas que un banner. No se muestra vacía.
- Borrar los 2 banners heredados (Hikvision y EZVIZ). Migración redactada en `prisma/migrations/20261104090000_remove_legacy_storefront_banners`, sin aplicar. La base es la del VPS de demo; falta que el usuario indique cómo conectarse.
- M1 backend hecho (167 pruebas pasan; SQL a medida sin probar contra Postgres real). Claves `marketing:read|create|edit|publish|delete`. La versión del catálogo de accesos se sube en M4 junto con la pantalla.

## Pendientes de decidir
1. Medidas exactas de la pieza del banner del título (propuesta: unas 1200 × 520 px para escritorio y 900 × 675 px para móvil; hay que validarla con quien diseña las piezas) y del pop-up.
2. Frecuencia del pop-up (propuesta: una vez por sesión, no en el primer instante, con cierre claro y operable con teclado).
3. Si el pop-up y el banner admiten fechas de inicio y fin (propuesta: sí).
4. Qué clave de permisos exactas (propuesta: `marketing:read|create|edit|publish|delete`), según lo que revele el mapeo del catálogo de acceso.

## Tareas
- [ ] M0 Mapeo de paneles, permisos y del módulo de promociones (solo lectura).
- [ ] M1 Backend: modelo y migración (redactada, sin aplicar), permisos del panel, endpoints de administración, endpoint público de campañas vigentes, subida de imagen con validación de tipo, tamaño y medidas, auditoría, pruebas.
- [ ] M2 Frontend de administración: panel «Marketing y mercadeo → Campañas», secciones Banner del título y Pop-up, guía de medidas y vista previa con el componente real de la tienda, borrador y publicar.
- [ ] M3 Frontend público: banner deslizable en el héroe de `/tienda` y pop-up solo imagen.
- [ ] M4 Asignación de permisos en Usuarios → Paneles y guía de usuario.
- [ ] M5 Verificación en navegador (escritorio y móvil), lint, tipos y pruebas; informe.

## Proceso
Cada tarea la ejecuta un agente de implementación con instrucciones precisas y se verifica antes de marcarla. Sin commit sin aprobación.

## Evidencia
- Boceto aprobado en espíritu: `.impeccable/mocks/banner/portada-banner.html` (banner en el panel del héroe y pop-up). El pop-up del boceto llevaba título y texto: se reemplaza por solo imagen.
- Guía histórica (describe código que ya no existe): `docs/BANNERS-Y-CONFIGURACION-PAGINA.md`.
- Modelo existente `StorefrontBanner` (`storefront_banners`, migración `20261009160000`) y `SalesPromotion` como referencia.
