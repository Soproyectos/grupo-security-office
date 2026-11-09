# Integración de asignación de paneles en localhost:5173

Fecha: 2026-11-09. Ruta real: `/users/access?usuario=<id>`.

## Resultado

El administrador selecciona una persona real del directorio, elige un panel y edita sus accesos en un árbol a la derecha. Se integró la presentación aprobada en los componentes existentes, conservando servicios, permisos del servidor y validaciones de versión y catálogo.

- Usuarios reales con búsqueda, paginación, estado de cuenta y selección por URL.
- Paneles Comercial, Biblioteca y Marketing; accesos anteriores cuando existen. Agenda conserva sus acciones en el grupo comercial.
- Grupos plegables, selección parcial, selección por grupo y por acción, alcances y recursos. Las concesiones heredadas muestran su origen y alcance.
- Rueda dentro de las listas y ramas, sin barras visibles; contenedores ajustados al viewport. Los botones de guardado quedan fuera del contenido desplazable.
- Selector compacto de usuario en móvil, con búsqueda y directorio desplegables; cierre con Escape.
- Borradores de Biblioteca y acciones individuales conservados al cambiar de panel. Aviso existente al cambiar de usuario con cambios pendientes y al recargar/salir del documento.
- Sin copiar al producto el adaptador simulado, usuarios ficticios o almacenamiento de sesión del prototipo.

## Contrato de guardado conservado

Biblioteca guarda su selección con su endpoint dedicado. Comercial, Marketing y estadísticas de Mi resumen guardan las acciones individuales juntas. En Biblioteca, el guardado manual aparece cuando hay cambios pendientes de esas acciones. Los paquetes conservan aplicación/retirada inmediata y lo indican junto al control.

Se conservan bloqueo de varias fuentes manuales, permisos anteriores que requieren revisión, requisitos de publicación, alcances y recursos, refresco de sesión, mensajes del servidor y control de concurrencia. Marketing no aparece habilitado únicamente por acciones sueltas sin un paquete aplicado. El acceso administrativo por rol se explica por separado de las asignaciones.

## Archivos

- `src/frontend/src/components/layout/AdminLayout.tsx`: altura fija y área flexible solo para la ruta de accesos.
- `src/frontend/src/features/users/components/UserAccessAssignments.tsx`: presentación del directorio, selector de panel y editor existentes.
- `AccessPermissionGrid.tsx`: variante de árbol nativo con casillas y estados parciales.
- `LibraryPermissionsBlock.tsx`: variante de árbol con guardado dedicado.
- `UserAccessWorkspace.css`: estilos limitados al espacio de accesos.
- `UserAccessAssignments.spec.tsx`: cobertura estructural del espacio y caso de Marketing sin paquete.

El checkout activo que sirve 5173 es `C:/Users/sopor/grupo-security-office`; el trabajo se preparó en el worktree `1d2e`. Se sincronizaron únicamente los archivos correspondientes. Se respaldaron y verificaron por hash los cuatro componentes activos anteriores antes de la primera copia, para evitar sobrescribir cambios aparecidos durante la integración. Sin reinicios, migraciones, commits, push ni despliegue a producción.

## Validación

- TypeScript `tsc --noEmit`: correcto.
- ESLint de componentes y prueba modificados: correcto.
- Seis specs pertinentes: **116 pruebas correctas** (`UserAccessAssignments`, `AccessPermissionGrid`, `LibraryPermissionsBlock`, `access`, `library-permissions` y `users.service`). Vitest usó caché dentro del worktree y `--configLoader runner` porque `node_modules` es una junction al checkout activo.
- Navegador: componentes y layout reales montados con API interceptada y datos ficticios. Probados borrador de Biblioteca, cambio a Marketing y regreso conservando selección, guardado dedicado con actualización de caché, edición y guardado de acciones individuales.
- Pantalla de 1280 × 600: sin desbordamiento de página y botones de Biblioteca visibles. Revisado también en el viewport de escritorio disponible y a 375 × 812, con selector de usuario compacto, árbol desplazable y guardado visible.
- Revisión independiente de contrato, permisos, campos y borradores: sin regresiones nuevas confirmadas.
- La ruta real fue abierta en el navegador de Codex y solicita inicio de sesión. No se validaron escrituras sobre cuentas reales ni se modificaron sus permisos. No se comprobó lector de pantalla o zoom 200 %.

Los límites preexistentes de navegación SPA fuera del selector y reinicio de borradores tras conflictos concurrentes no se ampliaron en esta integración. La evaluación heurística de la investigación anterior corresponde a la vista previa a la integración; no se presenta como puntuación de esta versión.

## Corrección tras captura del usuario

Se retiraron las clases grid y columnas responsive de la variante tree en ambos componentes; solo la presentación anterior conserva la rejilla. Esto evita que el orden de carga de Tailwind y el CSS del espacio cambie el árbol a columnas horizontales. El editor del usuario recibe flex:1 explícito para ocupar la altura restante. Corrección sincronizada en 5173 y comprobada visualmente con las ramas verticales. TypeScript, ESLint y las 116 pruebas pertinentes vuelven a pasar.

## Corrección de scroll entre ramas abiertas

Se permitió que la rueda continúe desde una rama al árbol al alcanzar el principio o final de sus opciones. El límite del árbol conserva overscroll contain para no arrastrar la página. Prueba de navegador con Clientes, Cotizaciones y Agenda abiertos: una rueda ascendente sobre Agenda devolvió el árbol desde scrollTop 379 hasta 0, manteniendo la página en 0 y los controles de guardado fuera del contenido desplazable. Se sincronizó el CSS en el checkout activo 5173.
