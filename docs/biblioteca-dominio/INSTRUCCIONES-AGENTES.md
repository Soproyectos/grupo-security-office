# Instrucciones para agentes: obra de la biblioteca dedicada

Complementan a [`AGENTS.md`](../../AGENTS.md); si hubiera contradicción, **prevalece `AGENTS.md`**. No repiten sus reglas generales (sin secretos en Git, ambientes local/prod, cambios mínimos, validar antes de «terminado», respuestas en español, un paso a la vez).

## Antes de actuar
1. Leer [`README.md`](./README.md) (índice y **tabla de estado**) y el [ADR](../adr/ADR-20261022-biblioteca-postgresql-dedicado.md). No depender del historial de ningún chat: lo que no esté en el repositorio no existe para el siguiente agente.
2. Elegir **una** tarea de la [tabla de estado](./README.md#estado-de-las-tareas) cuyas dependencias estén cumplidas y que nadie haya reclamado. Si está «En curso», no la toques.
3. Reclamarla: anotar en la tabla «En curso — <agente>, <fecha>, <rama>». Revisar `git status` y la rama; no sobrescribir trabajo ajeno ni tocar archivos que otra tarea está editando. Si necesitas otro worktree, pedirlo.

## Mientras trabajas
- Trabajar solo la tarea elegida y con el alcance que ella indica. No ampliar a «de paso» arreglos de otras brechas; registrarlas como pendientes.
- **Una autoridad por dato:** no crees un segundo campo o tabla oficial de lo que ya tiene dueño en el [ADR](../adr/ADR-20261022-biblioteca-postgresql-dedicado.md#5-una-autoridad-por-dato). No hagas doble escritura ni cruces transacciones entre bases.
- No convertir una decisión pendiente en un hecho aprobado. Si dependes de una (D1…D11), detente y pregunta una sola cosa concreta.
- No inventar valores para satisfacer restricciones (NULL o faltante registrado). No interpretar «no encontrado» como «no aplica». No cambiar automáticamente la publicación de productos existentes.
- Los costos de compra no se mezclan con tarifas de venta ni se publican.

## Al terminar cada cambio
1. **Actualizar en el mismo cambio** la documentación afectada y la tabla de estado del [`README.md`](./README.md) (estado, fecha, evidencia, qué falta).
2. **Registrar** en `docs/bitacora/AAAA-MM-DD-<tema>.md`: qué cambió (archivos), qué probaste (comandos y resultado real), qué **no** probaste, qué quedó pendiente y cómo revertir. Sin secretos ni datos personales.
3. Si regeneras el [diccionario](./diccionario-esquema-actual.md) (`herramientas/generar-diccionario.js`), anota el commit del esquema usado.
4. **No declarar terminado lo que no verificaste.** Separa en el informe: *comprobado*, *inferido*, *pendiente*. Una prueba que no se ejecutó se escribe como «no ejecutada», no como «pasa».

## Secretos y datos
Nada de contraseñas, tokens, cadenas de conexión reales, correos ni datos de clientes en documentos, ejemplos, bitácoras, fixtures o capturas. Los ejemplos usan datos ficticios. Las variables sensibles viven en la VPS o en el entorno local, nunca en Git.

## Requiere autorización explícita del usuario, cada vez
Instalar herramientas o dependencias · crear contenedores, redes o volúmenes (también temporales) · cualquier acción en la VPS · ejecutar migraciones o scripts que escriban en una base · cambiar servicios · commit, push, PR, merge · despliegue. La aprobación de un cambio documental **no** autoriza ninguna de esas acciones, y la aprobación de una vez no se traslada a la siguiente.

## Seguridad y orden de prioridades
- El parche SQL de `GET /api/products` es un carril de seguridad independiente (tarea T00); debe resolverse antes de **desplegar** código afectado. No lo mezcles con otras tareas.
- La VPS es producción: no acceder, consultar bases ni crear recursos sin orden explícita.
- Búsquedas amplias de solo lectura (4 o más archivos): usar el agente `Explore`, como indica `AGENTS.md`.

## Fuera de alcance de esta obra
Hermes y Gentle AI (pausados), una API independiente para biblioteca, el rediseño del acceso de la tienda (no muestra precios a visitantes) y la corrección de las demás brechas de la auditoría, salvo que una tarea del plan las incluya.
