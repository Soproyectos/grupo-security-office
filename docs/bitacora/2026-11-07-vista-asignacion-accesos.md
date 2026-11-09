# Vista de asignación de accesos — 7 de noviembre de 2026

Super Admin utiliza esta pantalla para elegir una persona y asignar lo que puede hacer en cada panel.

## Cambios

- Directorio lateral con búsqueda por nombre o correo, estado de selección y carga de más usuarios usando la paginación existente. La búsqueda espera 250 ms entre consultas.
- Editor del usuario seleccionado con Comercial, Biblioteca, Marketing y accesos anteriores plegados al inicio, según el catálogo disponible. Los resúmenes muestran las asignaciones guardadas.
- Casilla de asignación de cada paquete independiente de su detalle de acciones. Se conservan la retirada de fuentes anteriores, alcances, recursos y acciones individuales.
- Biblioteca mantiene sus casillas, dependencias, resumen, Guardar y Descartar. Al plegar el bloque se conserva el borrador.
- Aviso de cambios pendientes al elegir otra persona y al recargar. Cada usuario monta su propio editor para evitar trasladar selecciones entre cuentas.
- Nombre del usuario resuelto también mediante el endpoint existente `GET /users/:id`, aunque no esté en la primera página del directorio.

No cambia el modelo de permisos ni la arquitectura de la base de datos. No requiere migraciones ni cambios del backend.

## Comprobaciones

- `node node_modules/typescript/bin/tsc --noEmit`: correcto.
- `npm.cmd run lint`: correcto, con 20 advertencias en archivos ajenos al cambio. Lint específico de los cinco archivos modificados: sin errores ni advertencias.
- Vitest: 94 pruebas correctas en `UserAccessAssignments.spec.tsx`, `LibraryPermissionsBlock.spec.tsx`, `features/users/access.spec.ts` y `services/users.service.spec.ts`.
- La ejecución de Vitest utilizó `--configLoader runner` y una configuración temporal con caché dentro del worktree, porque las dependencias existentes se reutilizaron mediante un enlace local. La configuración temporal se retira al finalizar.
- Revisión visual de las ventanas de 1440 y 768 px y de un marco de 375 px: correcta, sin desbordamiento horizontal con los bloques plegados ni con Biblioteca abierta. El ancho útil registrado fue 1424, 752 y 375 px respectivamente.
- Quince comprobaciones de interacción correctas en cada ancho: inicio plegado, aplicar/retirar paquetes, marcar/guardar Biblioteca, conservar borradores al plegar, advertir al cambiar de persona, conservar selecciones al seguir editando, reiniciar el editor al cambiar de usuario y buscar sin perder su identidad.
- Chrome generó las capturas y los resultados correctos, pero no se cerró automáticamente; el ejecutor terminó cada proceso al alcanzar 45 segundos. El fallo de cierre del navegador no se considera una prueba de interacción fallida ni se oculta como una ejecución limpia.

## Alcance y límites

Se conservan los tokens y las fuentes del proyecto, los controles nativos de despliegue, los estados de carga y error y el acceso directo por `?usuario=`. La navegación global a otras rutas conserva su comportamiento; el aviso de borradores cubre el cambio de usuario desde el directorio y la recarga de la página.

No se comprobaron escrituras con usuarios reales ni el recorrido autenticado contra la API local. Quedan fuera de esta validación las pruebas manuales con lector de pantalla y zoom al 200 %.

## Reversión

El cambio se limita a `UserAccessAssignments.tsx`, `LibraryPermissionsBlock.tsx`, sus pruebas en `UserAccessAssignments.spec.tsx` y los helpers/pruebas de `users.service.ts` y `users.service.spec.ts`. Restaurar estos cinco archivos a su estado anterior recupera la distribución previa sin revertir datos ni modificar contratos del servidor.
