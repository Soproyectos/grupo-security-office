# Encargo para el coordinador auditor

Audita una entrega concreta del agente implementador. Lee su ficha, el contrato aceptado, informe y diff correspondiente. No tomes el mensaje «terminado», los tests verdes ni la existencia de una pantalla como prueba suficiente. Confirma la versión auditada y conserva cambios ajenos.

## Antes del código

Para inventario/contrato: comprueba fuentes, rutas actuales frente a propuestas, decisiones pendientes y una unidad de trabajo viable. Cierra campos, API, permiso, alcance, errores, eventos, límites y pruebas antes de aceptar backend. Si algo requiere decisión empresarial o contrato externo, déjalo pendiente solo en la rama afectada.

Antes de aceptar un contrato, materializa en `tareas.json` todos sus incrementos restantes con IDs, objetivos y aceptación propios. No aceptes un «primer incremento» que deje el resto sin registrar. Si el esquema inicial contrato/backend/frontend es demasiado amplio, divídelo aquí, sin esperar a que el implementador escriba una entrega enorme. Un paquete solo queda completo cuando todos sus pasos están auditados; el primero no cierra los demás.

Para migraciones, aplicación de precios y publicación, revisa previamente la estrategia de integridad, concurrencia, compatibilidad y recuperación en base desechable. No transfieras esas decisiones al agente económico sin resolverlas. Esto es revisión del coordinador; no exige otra aprobación humana para cada detalle reversible autorizado.

## Al recibir implementación

1. Verifica alcance y cambios inesperados. Compara el diff del paso con el estado inicial; en un checkout sucio no atribuyas todo `git diff` a esa entrega. Registra hashes de los archivos auditados.
2. Conecta pantalla/botón → API → acción → alcance → datos → evento → prueba. Revisa rutas antiguas, scheduler, importadores y trabajos en segundo plano que puedan evitar la nueva regla.
3. Comprueba casos permitidos y denegados: sin asignaciones, mismo cargo con acciones distintas, recurso ajeno, lectura sin edición/publicación, revocación con el mismo JWT y cambios mientras un trabajo está pendiente. No aceptes permisos globales agregados para resolver un acceso.
4. Para precios: IVA una vez, COP/Decimal/redondeo/límite común, vacíos, referencia única, lista archivada, dos cargas concurrentes, precio cambiado entre revisión/aplicación, rollback y reintento. Cotizaciones/facturas históricas y la identidad de Biblioteca permanecen íntegras.
5. Para catálogo: borrador sin filtración pública; revisión exacta validada/publicada; medios privados protegidos; borrar lista conserva Biblioteca; ZIP/apartados/bytes/hash/ida y vuelta; PDF ausente solo aviso. No se cambia el diseño público de producto por reorganizar administración.
6. Para Comercial: responsable/cartera/equipo, descuento separado si se acuerda, metas, fuente de ventas y deduplicación ERP. Ganar cotización no sustituye factura ni crea aprobación de venta; solicitud sin stock permanece separada.
7. Ejecuta o reproduce las pruebas de mayor valor según el diff. Usa PostgreSQL desechable cuando la garantía depende de transacciones/concurrencia. Comprueba lint/typecheck y el recorrido real de navegador cuando el paso sea interfaz. No exijas repetir toda la plataforma por cambios solo documentales.

## Veredicto y continuidad

Guarda la [plantilla de auditoría](plantillas/AUDITORIA.md) en `resultados/<ID>-<paso>-auditoria.md`. Cada hallazgo debe indicar archivo, comportamiento reproducible, impacto y corrección necesaria. Usa **ACEPTADA**, **REQUIERE CAMBIOS**, **PARCIAL** o **NECESITA DECISIÓN**. Una limitación que afecta un criterio obligatorio impide aceptar ese paso.

Solo el coordinador añade una aceptación a `estado.json`, después de comprobar el resultado. Ejemplo de forma —no es una aceptación real—:

```json
{
  "verdict": "aceptada",
  "reviewer": "coordinador",
  "report": "docs/ejecucion-paneles/resultados/BASE-01-inventario-auditoria.md"
}
```

La clave en `reviews` es `<ID>/<paso>`. Una decisión empresarial confirmada se registra en `decisions` con `status: "confirmada"` y una referencia `evidence`; no basta el deseo del implementador. El preparador lee estas declaraciones, pero no autentica personas ni sustituye la auditoría. Antes de delegar un paso dependiente, comprueba que su evidencia sigue describiendo la versión vigente.

Si hay hallazgos, devuelve únicamente el lote de correcciones de esta entrega al agente. Audita otra vez lo corregido y las regresiones justificadas. No avances por antigüedad, presión de coste ni porcentaje completado. Una aceptación local no autoriza producción, migrar cuentas existentes, commits ni pushes.
