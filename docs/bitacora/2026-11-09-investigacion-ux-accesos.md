# Investigación UX: asignación de paneles

Fecha: 2026-11-09. Pantalla: `/users/access`. Estado: investigación y prototipo aislado; las recomendaciones de este documento no se han integrado en la ruta de administración.

## Objetivo

Un administrador selecciona una persona, entiende qué puede hacer y sobre qué información, y abre el panel que necesita modificar. Prioridad expresada por el usuario: «Entender qué puede hacer cada usuario». Mantener grupos recogidos y una presentación compacta.

## Conclusión

La vista actual sirve mejor para editar asignaciones que para entender el acceso de una persona. El resumen debe mostrar las capacidades conocidas antes de las casillas: panel disponible, acciones, alcance y origen. Las funciones del dominio existentes determinan el resultado; no basta con contar concesiones ni con comprobar una acción suelta.

La identidad visual actual resulta apropiada para una herramienta interna. Conservar tokens, acento de marca, controles nativos, paneles recogidos y protección de borradores. La mejora afecta principalmente a la jerarquía y a la explicación del funcionamiento.

## Revisión heurística

Valoración experta A, de 0 a 4 por criterio; no representa una prueba con usuarios ni una escala de cumplimiento legal.

| Criterio | Puntuación / 4 |
|---|---:|
| Visibilidad del estado | 1 |
| Lenguaje familiar | 2 |
| Control y libertad | 3 |
| Consistencia | 2 |
| Prevención de errores | 2 |
| Reconocimiento sin memorizar | 1 |
| Eficiencia | 3 |
| Minimalismo | 3 |
| Recuperación | 2 |
| Ayuda | 2 |
| **Total** | **21 / 40** |

## Prioridades

1. **P1 — Asignaciones y capacidades no equivalen.** El contador de `UserAccessAssignments.tsx` cuenta `access.grants`; las funciones de `features/users/access.ts` contemplan excepciones de Super Admin y `agenda-access.ts` contempla capacidades base de roles internos. Cero asignaciones no demuestra ausencia de acceso. El resumen debe recibir los roles del destinatario, no los del administrador que realiza la consulta.
2. **P1 — Una acción registrada no siempre habilita un panel.** `features/marketing/marketing-access.ts` requiere un paquete Marketing aplicado; acciones sueltas no satisfacen esa condición. Biblioteca también combina acciones con una fuente admitida. Mostrar «No habilitado» y un motivo consultable, sin declarar disponible un panel por contar casillas marcadas.
3. **P1 — Alcance y origen de los accesos heredados poco visibles.** El editor muestra como seleccionadas y deshabilitadas las acciones heredadas, pero el alcance de esa fuente no se explica junto a ellas. Mostrar «Solo su información / Su equipo / Toda la empresa», nombrar la fuente y ofrecer acceso a su edición. El alcance efectivo combinado debe resolverse con las reglas reales, sin elegir arbitrariamente una fuente.
4. **P1 — Distintas reglas de guardado.** Los paquetes cambian inmediatamente, las acciones manuales requieren guardar y Biblioteca tiene otro guardado. Las estadísticas situadas dentro de Biblioteca pertenecen al bloque manual externo. Explicar el momento del cambio junto al control y separar visualmente los dominios que se guardan por separado. Un botón único no debe prometer una operación atómica que el contrato actual no ofrece.
5. **P2 — Rejilla demasiado estrecha a anchuras intermedias.** A 1280 px, las columnas fijas de cinco o seis grupos provocan etiquetas de dos a cinco líneas; una acción alcanzó 104 px de alto. Reducir columnas según espacio disponible y contenido, manteniendo tamaños legibles.

No se identificaron P0 dentro del alcance de esta revisión UX. Se priorizan cuatro P1 y un P2; no es una auditoría de seguridad.

## Personas y fortalezas

- Administrador nuevo: puede interpretar una selección como acceso ya disponible y no deducir requisitos de fuentes o paquetes.
- Administrador frecuente: debe recordar qué cambios son inmediatos y cuáles siguen pendientes.
- Navegación por teclado: falta una explicación cercana y consultable del alcance y origen de controles heredados deshabilitados. No se probó lector de pantalla.
- Conservar: paneles recogidos, casillas nativas agrupadas, selección parcial, descarte y protección al cambiar de usuario con un borrador.

## Propuesta y prototipo

Flujo: seleccionar usuario → resumen de capacidades conocidas → abrir detalles si hace falta → editar accesos. Resumen plano por panel con «Qué puede hacer», «Alcance» y «Origen»; las acciones detalladas empiezan recogidas. En móvil, sustituir el directorio lateral por un selector compacto para dar prioridad al resumen.

[Abrir prototipo local con datos ficticios](http://localhost:5173/.review/access-ux-20261109.html?view=proposal&scenario=mixed). Permite comparar vista actual y propuesta en tres casos: Super Admin sin asignaciones, Vendedor con Comercial y Biblioteca, y Operador con acciones Marketing sueltas. La edición abre el componente actual con un adaptador en memoria. Todas las peticiones de esa demostración se interceptan; las desconocidas fallan. No escribe permisos ni credenciales reales.

Los casos son ejemplos preparados, no información de usuarios reales ni una réplica íntegra del catálogo del servidor. La propuesta usa las funciones actuales de Comercial, Biblioteca, Marketing y Agenda para las condiciones de disponibilidad; los textos y fuentes del ejemplo están limitados a esos casos. No es un motor general de permisos listo para integrar.

El resumen implementable puede componerse con los datos actuales y los roles de la persona consultada. No certifica cada endpoint o registro ni resuelve por sí solo restricciones de jerarquía de equipos. La autorización del servidor sigue siendo la autoridad.

## Evidencia y límites

- Impeccable 0.1.18: una ejecución del detector sobre los tres componentes evaluados, sin hallazgos automáticos. Revisión A de diseño y B técnica independientes antes de compartir resultados; no se reejecutó para mejorar el resultado.
- Revisión actual a 1280 × 720: sin desbordamiento horizontal; 27 casillas Biblioteca/estadísticas asociadas con etiquetas, grupos nativos y selección parcial. Comprobación puntual de Tab y foco visible.
- Contrastes normales medidos: 5,28 a 17,85:1, por encima del mínimo AA de texto normal. No cubre todos los estados; controles inactivos se excluyeron de esa medición.
- Prototipo a 1440 × 900: filas de 81–89 px en el caso Vendedor, sin desbordamiento horizontal. A 375 × 812: sin desbordamiento horizontal, controles visibles medidos de al menos 44 px de alto y selector de usuario compacto. Verificados cambio de usuario, explicación de Marketing no habilitado y apertura del editor del destinatario correcto.
- El prototipo TSX pasa la comprobación de sintaxis con TypeScript local. No se presenta como una implementación de producto ni como una ejecución nueva de toda la suite del frontend.
- No se probaron lector de pantalla, zoom 200 %, errores de guardado reales, rendimiento, permisos de personas reales ni todos los estados de contraste.
- El entorno disponible permite evaluación de DOM de solo lectura; se omitieron overlay e instrumentación de cambios en vivo. Se usaron DOM, capturas y prototipo aislado.

## Fuentes

- Contrato existente: `src/frontend/src/features/users/access.ts`, `features/marketing/marketing-access.ts`, `features/agenda/agenda-access.ts` y `services/users.service.ts`.
- [W3C: contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- [W3C: tamaño mínimo de objetivo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): AA exige 24 × 24 px o sus excepciones; la política móvil del proyecto exige 44 px. No considerar cualquier control menor de 44 px un incumplimiento AA.
- [W3C: mensajes de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html): comunicar resultado y cambios pendientes sin depender únicamente del foco.

## Siguiente decisión

Elegir entre empezar por el resumen de capacidades, alcance y origen (recomendado para la prioridad del usuario), o incluir también la reorganización de los guardados en la primera entrega. Ninguna opción implica cambiar reglas de autorización.
