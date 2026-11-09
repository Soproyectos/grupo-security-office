# Accesos por panel con casillas compactas — 7 de noviembre de 2026

Super Admin elige una persona y marca sus accesos por grupos, con el mismo formato de Biblioteca en los paneles configurables.

## Cambio

- Comercial, Marketing y Biblioteca comparten grupos de casillas con selección completa/parcial. Comercial agrupa clientes, cotizaciones, agenda, equipo/metas y avisos.
- Filas de 28 px en escritorio y objetivos de al menos 44 px en móvil. Los títulos y márgenes de los paneles son más pequeños; Biblioteca distribuye sus grupos en una fila en pantallas anchas.
- Resumen detallado, condiciones de publicación y paquetes de trabajo permanecen disponibles en desplegables cerrados al inicio.
- Las concesiones de paquetes se muestran marcadas y protegidas. Su retirada sigue siendo explícita desde el paquete; no se convierten en concesiones manuales.
- Se conservan alcances, recursos, retirada de fuentes anteriores y el guardado independiente de Biblioteca. Sus estadísticas se identifican como parte del guardado de acciones individuales.
- Marcar acciones incluye sus requisitos editables del catálogo; desmarcar un requisito retira los dependientes manuales. Los requisitos de Biblioteca conservan su flujo propio y el servidor sigue validando la propuesta.
- Guardar otro panel conserva los borradores. El guardado propio de Biblioteca vuelve a mostrar el estado autorizado del servidor, incluso cuando otra fuente mantiene un permiso.
- El vaciado de la única fuente manual usa el DELETE existente; nunca se envía un PUT con `grants: []`. Varias fuentes manuales bloquean una sustitución ambigua.

## Comprobaciones

- TypeScript y lint de los archivos modificados: correctos.
- Pruebas de accesos, Biblioteca y componente compartido: 114 correctas en seis archivos.
- Medición visual con datos ficticios: Biblioteca expandida ocupa 522 px a 1572 px de ancho útil, en una ventana de 1588 px. Es una comparación representativa con los 938 px de la anotación original, no una medición del usuario real.
- Revisión de Comercial y Marketing abiertos: mismos grupos y casillas. A 375 px no hay desbordamiento horizontal y las etiquetas conservan objetivos táctiles de 44 px. En móvil los grupos se apilan y requieren desplazamiento vertical.
- La prueba utiliza únicamente una API simulada y usuarios ficticios. Chrome produce capturas/resultados, pero no se cierra automáticamente: el ejecutor termina sus procesos de prueba al alcanzar 45 segundos.

## Límites y reversión

No cambia el backend, sus permisos, esquemas ni endpoints. No se escribieron permisos de personas reales. Quedan pendientes el recorrido autenticado con datos reales y las comprobaciones manuales de lector de pantalla y zoom.

La unidad de cambio incluye `UserAccessAssignments.tsx`, `LibraryPermissionsBlock.tsx`, `AccessPermissionGrid.tsx` y las pruebas de asignación y del componente compartido. Restaurar esos archivos al estado de la vista anterior revierte este diseño sin modificar datos. Las ediciones ajenas de `UsersPage.tsx`, `UserAccessManager.tsx` y otros archivos de la copia activa se conservan.
