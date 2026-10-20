# Implementación de acceso por usuario

Implementada en este worktree local y autorizada el 9 de octubre de 2026. No se ha desplegado ni modificado usuarios de un servidor compartido. Guía de uso: [Cómo asignar trabajo](GUIA-ASIGNAR-TRABAJO.md).

## Contrato

Usuarios → Paneles presenta Área → Apartado → Acciones. El rol es organizativo. Un usuario nuevo inicia sin acciones administrativas. Super Admin conserva la administración de identidad y asignaciones. Cada permiso se comprueba en el servidor con los valores actuales de la base de datos, incluso si el JWT es anterior.

Las acciones de creación, edición, publicación, eliminación y aprobación son independientes. Las dependencias de lectura se muestran y validan. El catálogo no incluye acciones todavía inexistentes. Banners se implementó posteriormente dentro de Configuración de la página; véase la [guía del módulo](BANNERS-Y-CONFIGURACION-PAGINA.md).

## Diseño

Un catálogo central del backend conecta cada controlador y método con acciones estables. Las rutas administrativas sin clasificación se rechazan por defecto. Las rutas públicas y la cuenta personal se conservan. Los roles no sustituyen la asignación de acciones. Los límites existentes por Lista y jerarquía siguen comprobándose, además del permiso operativo.

La asignación se guarda con su evento de auditoría dentro de la misma transacción y usa una versión para rechazar pantallas desactualizadas. El frontend consulta el perfil vigente, limpia datos anteriores al cambiar accesos y protege enlaces directos además del menú.

Los usuarios existentes no se migran automáticamente. `scripts/review-admin-access.ts`, dentro del backend, exporta respaldo e informe de comparación sobre una copia local explícita. No convierte roles en accesos ni aplica concesiones. Reversión futura: conservar el respaldo de concesiones y recursos y restaurar el código anterior junto con ese respaldo; no ejecutar seeds para reconstruir accesos.

## Trabajo

- [x] Catálogo completo de rutas y acciones existentes.
- [x] Guardias del servidor, identidad vigente y revocación.
- [x] Asignación transaccional, validación y conflictos.
- [x] Pantalla de asignación, navegación y botones.
- [x] Herramienta de respaldo y comparación; alcance documentado.
- [x] Pruebas permitidas y denegadas, lint y compilación local.
- [ ] Revisar y aplicar las asignaciones reales del ambiente autorizado.
- [ ] Validar en PostgreSQL 16 y recorrer todas las pantallas de forma interactiva.
- [ ] Despliegue expresamente autorizado.

Estado: sistema implementado y probado localmente. La migración de usuarios reales y el despliegue no se han ejecutado.

Autorización adicional explícita: el usuario aprobó reemplazar los controles RBAC por asignaciones individuales en este worktree local después de probar API y sesiones. `admin-access.integration.spec.ts`: 7 pruebas HTTP aprobadas con NestJS, Passport y JWT firmado; cubren catálogo público, ausencia de sesión, claims antiguos, concesión y revocación con el mismo token, perfil sin paneles, usuario inactivo, sesión revocada y desafío MFA. Ese primer grupo usa almacenamiento ficticio; posteriormente se completaron las pruebas con PostgreSQL real descritas abajo. `access-assignments.service.spec.ts`: 5 pruebas aprobadas de validación, conflicto de versión, actor autorizado y transacción compartida con auditoría.

## Evidencia antes de activar autorización

`npm test -- --runInBand access-catalog.spec.ts admin-access.guard.spec.ts`: 2 suites, 117 pruebas aprobadas antes de la activación. El inventario recorre el AST de todos los controladores y exige clasificación explícita para cada ruta privada. Cada ruta operativa tiene pruebas de rechazo sin concesiones, autorización con sus acciones y dependencias, y rechazo al retirar la acción. También se probaron rutas desconocidas, administración reservada, cuenta personal y catálogo público. Este resultado es histórico: el guard ya está registrado globalmente después de la autorización del usuario y las pruebas de API y sesiones.

## Evidencia final local

- Backend: 29 suites, 606 pruebas aprobadas. Incluye inventario, permisos, ACL, jerarquía, autenticación, operaciones comerciales, auditoría, importaciones y regresión de tienda. Ocho pruebas opcionales de integración de tienda quedaron omitidas por su configuración propia.
- PostgreSQL real: cinco pruebas HTTP con Prisma, Passport y sesiones persistidas sobre un clúster temporal aislado de PostgreSQL 18, base `gs_access_test` en `127.0.0.1:55439`. Se probó guardado y revocación con el mismo token, asignación reservada, selecciones inválidas, concurrencia, rollback real por fallo de auditoría, perfil sin paneles, usuario inactivo y sesión revocada.
- Frontend: seis archivos, 40 pruebas aprobadas. Incluye navegación, selección de acciones, bloqueo de perfiles en caché y regresión de tienda pública.
- Typecheck y lint del backend aprobados. Build del frontend aprobado. Lint frontend sin errores, con nueve advertencias existentes; Vite advierte sobre tamaño de archivos generados.
- Revalidación tras cerrar las dependencias de cotizaciones y accesos: cinco suites, 134 pruebas aprobadas, incluyendo nuevamente las cinco pruebas con PostgreSQL real.

Los mensajes de error durante pruebas de importación, bloqueo y auditoría corresponden a fallos inyectados; no a un servidor compartido caído. Las pruebas HTTP usan controladores de fixture y servicios reales de asignación, identidad, sesión y auditoría; no equivalen a probar todo el servidor publicado.

Docker no estuvo disponible. Se aprovechó PostgreSQL 18 instalado en el equipo sin cambiar el stack del proyecto, que sigue previsto para PostgreSQL 16. La repetición en el contenedor 16 y el recorrido interactivo completo permanecen pendientes antes del despliegue.

## Alcance y auditoría

Los alcances de catálogo completo, cartera del equipo y empresa son casillas separadas. No conceden acciones. Las asignaciones a recursos por rol no se heredan. La API oculta precios sin permiso de tarifas y nivel de lectura de precios en la Lista. Los filtros de búsqueda de categoría, marca y Listas se envían como parámetros SQL.

Pedidos, metas e informes tienen entradas propias. Las consultas auxiliares y botones respetan sus acciones. El perfil se verifica al montar la administración, usa caché separada por usuario y se consulta cada diez segundos y al recuperar foco. Una caché anterior no permite abrir herramientas antes de la primera verificación vigente.

Las asignaciones tienen auditoría transaccional: si falla, se revierte el cambio. Además, las mutaciones administrativas clasificadas emiten `administrative-action`, entidad `AdminAction`, con actor, ruta, método y resultado, sin cuerpo de solicitud ni secretos. Esta evidencia complementaria no bloquea la respuesta si falla su almacenamiento: registra un diagnóstico y conserva el resultado original. No es una cola durable ni sustituye la transacción crítica de permisos.

Para estadísticas de operaciones se debe filtrar ese evento; no sumar indiscriminadamente los eventos de dominio y los de operación porque pueden describir una misma acción. Las denegaciones se registran como `access-denied`.

## Revisión previa a publicar

1. Obtener una copia local autorizada de la base y conservar el respaldo del ambiente elegido.
2. Definir `ACCESS_REVIEW_DATABASE_URL` para esa copia y ejecutar, desde `src/backend`, `npx ts-node scripts/review-admin-access.ts`.
3. Revisar `backup.json` y `comparison.json` en `.local/access-review/`. El informe identifica permisos históricos, acciones actuales, dependencias faltantes y cuentas que comenzarían sin paneles.
4. Asignar individualmente el trabajo y las Listas aprobadas. Comprobarlo con una segunda sesión antes de publicar.

El exportador admite únicamente conexión local explícita, no modifica datos y no exporta contraseñas, tokens ni correos de usuarios. `.local/` está excluido de Git. Su ejecución se probó en la base temporal vacía y la comparación con fixtures unitarios. No aplica restauraciones automáticamente.

El módulo administrativo de banners ya tiene implementación local propia con permisos asignables y publicación separada de edición. Los apartados de stock sin API implementada no se ofrecen como trabajo delegable. No se cambiaron las vistas públicas de producto durante esta implementación.
