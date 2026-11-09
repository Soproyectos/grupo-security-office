# Agenda compacta — 9 de noviembre de 2026

La persona organiza sus actividades propias o del equipo, encuentra pendientes y abre su detalle para actuar según sus permisos.

## Diseño e implementación

Se aplicó la skill gs-disenador-web y la guía Operate/craft-floor de Impeccable: cabecera compacta, controles conocidos, agrupación de filtros y reducción de espacios. PRODUCT.md y DESIGN.md no existen en este checkout. Dos agentes gpt-6-luna hicieron exploración/revisión y una implementación acotada; la raíz integró y corrigió el render.

- Cabecera con título, alcance, Calendario/Tareas, Actualizar y Crear actividad. Título de 20 px; controles y cuerpo de 13–14 px, actividades del calendario de 12 px.
- Calendario pequeño plegado inicialmente; filtros abiertos en escritorio y plegados al abrir en móvil. Limpiar filtros recupera tipo, estado y personas.
- Shell de alto disponible únicamente en /agenda, /sales/agenda y /supervisor/agenda, además de la ruta de accesos ya existente.
- Mes con seis filas que se ajustan al área disponible; semana con una fila. Actividades con desplazamiento propio dentro del día. Cuatro grupos de tareas con listas desplazables y acciones de cabecera fuera de esas listas.
- Fechas visibles también sin permiso de crear. Ayuda acorde con los permisos. Contratos, caché, campos, enlaces y controles de acceso conservados.
- CSS propio de Agenda; no se modificaron servicios ni backend. Se corrigieron en integración el crecimiento intrínseco de filas y la aplicación accidental de seis filas a la semana.

## Validación

TypeScript, ESLint sobre los TSX cambiados y seis suites pertinentes: 147 pruebas pasan. Se añadió una prueba de calendario de solo lectura que verifica fechas, detalle y ausencia de creación. git diff --check sin incidencias.

Prueba visual con componentes reales AdminLayout y AgendaCalendarPage en una entrada .review aislada. Todas las solicitudes Axios se interceptan y las rutas no previstas fallan; identidad y actividades ficticias, persistencia y EventSource desactivados. No se escribieron actividades reales.

- 1430 × 721: documento de 1430 × 721, calendario mensual completo en el área; vista semanal medida en una fila de 370 px.
- Rueda en grupo Hoy: scrollTop 0 → 434 → 0, documento permanece en 0.
- 375 × 721: documento de 375 × 721 sin desbordamiento horizontal; formulario de creación con ancho interior y scrollWidth de 335 px, alto y scrollHeight de 550 px; controles medidos de al menos 44 px.
- 768 × 721: documento de 768 × 721 sin desbordamiento de página.
- Crear, completar, reasignar, quitar y añadir enlace confirmados mediante interfaz contra el adaptador ficticio. Solo lectura: 42 fechas, 19 actividades y ningún botón de crear.

Capturas en el directorio de visualizaciones de esta conversación: agenda-compacta-5173.jpg y agenda-tareas-compactas.jpg. Ambas muestran datos ficticios.

## Checklist y límites

Cumplido en esta revisión: jerarquía compacta, acceso a acciones y filtros, conservación de funciones, selección identificable, recuperación de filtros, etiquetas y foco, tamaños táctiles del formulario, desplazamiento por lista y ausencia de scroll horizontal de página en los tres anchos.

Omitido: medición instrumental completa de contraste, lector de pantalla y zoom al 200 %. Se conservan algunos estilos y símbolos heredados de los componentes de detalle; no se certifica conformidad integral de accesibilidad. La carga existente sigue comunicándose con texto, sin introducir un skeleton nuevo en esta mejora.

Pendiente: recorrido autenticado con datos reales. La ruta /agenda del navegador de pruebas redirige a login. Las pruebas aisladas comprueban interfaz y contratos existentes, no equivalen a una escritura real en el backend.

Los archivos de producción y la entrada de prueba se sincronizaron con C:/Users/sopor/grupo-security-office, que sirve el puerto 5173. Copias anteriores de AdminLayout y AgendaCalendarPage guardadas en visualizaciones/pre-agenda-20261109. Sin cambios de servicios, migraciones ni publicación.

## Ajuste posterior: cuadro y aviso lateral

Se movió el estado vacío desde la franja superior a la columna de filtros. El calendario ya no baja los 54 px correspondientes al aviso y su separación. En escritorio desde 1024 px se limita el ancho según el alto disponible para una proporción casi cuadrada: medición en vista de prueba 1430 × 721, panel 553 × 531. El ejemplo incluye una fila adicional de aviso de datos ficticios; la página normal comienza más arriba. Se conserva el desplazamiento dentro de los días. A 375 px no existe desbordamiento horizontal de página y el aviso se conserva en la sección de filtros. TypeScript, ESLint y 29 pruebas de página/avisos pasan. Captura: agenda-cuadro-aviso-lateral.jpg. Cambio aplicado al checkout activo del puerto 5173.

## Referencias del usuario: Google Calendar y calendario semanal claro

La referencia nueva sustituye la decisión anterior del cuadro estrecho. Se amplía el calendario principal a todo el espacio disponible, con minicalendario y filtros en una columna derecha de 240 px. El mes muestra las semanas que necesita (noviembre de 2026 ocupa cinco filas). La semana utiliza 24 franjas horarias y encabezado de días fijo, con scroll propio y apertura inicial a las 08:00.

AgendaWeekView.tsx agrupa las actividades una vez por día y hora de Colombia; evita repetir formateadores y búsquedas por cada celda. Todos los eventos de una hora se conservan, con desplazamiento en esa celda cuando hace falta. Los botones de evento y de crear franja son hermanos, sin botones anidados. Seleccionar una franja abre la creación con su día y hora; crear desde las acciones anteriores conserva 09:00 por defecto. Las actividades solo almacenan startsAt: los marcadores indican inicio, sin inventar duración o fin ni añadir arrastre/redimensionamiento sin contrato.

Se conservaron Tareas, filtros, alcance, completar, reasignar, enlaces y autorización. CSS reorganizado con clases concretas para eliminar selectores estructurales heredados que interferían en la nueva rejilla.

Delegación: implementación y revisión funcional acotadas con gpt-6-luna. La raíz integró CSS, extrajo el componente semanal y añadió cinco pruebas para las 24 horas, zona horaria, registros coincidentes, solo lectura y estado completado. Siete suites: 152 pruebas pasan. TypeScript y ESLint sobre los TSX nuevos/cambiados comprobados.

Prueba de interfaz con componentes reales y adapter ficticio: seleccionar lunes 9 de noviembre a las 11:00 abre 2026-11-09T11:00; se guarda y completa una actividad ficticia; se abre una actividad de las 23:00 del mismo día. No se hicieron escrituras reales. El documento conserva su tamaño de viewport en 1430 × 721, 768 × 721 y 375 × 721. En móvil el calendario aparece antes del lateral; la semana tiene 752 px de contenido dentro de 327 px de ancho desplazable, sin ampliar la página.

Capturas: agenda-mes-referencia.jpg y agenda-semana-referencia.jpg, con datos ficticios. Los archivos de producción se sincronizan con el checkout activo del puerto 5173. Se conserva la limitación de no haber podido validar la sesión real autenticada; contraste instrumental completo, lector de pantalla y zoom al 200 % siguen sin certificarse.
