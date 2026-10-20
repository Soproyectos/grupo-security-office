# Un agente construye por partes; el coordinador audita cada entrega

**Modalidad vigente solicitada después por el usuario: una tanda completa y auditoría al final.** Utilizar [TANDA-COMPLETA.md](TANDA-COMPLETA.md) como encargo y `preparar-tanda.mjs` para consultar fichas sin pausas de aceptación. El flujo paso a paso descrito abajo se conserva como referencia de la modalidad anterior. Los estados de implementación de la tanda no son aceptaciones de auditoría.

Este paquete organiza los dos paneles diseñados —**Comercial** y **Catálogo y precios**— y la nueva importación de precios. Está pensado para trabajar con un agente económico: recibe una tarea pequeña, usa el código existente, entrega sus pruebas y se detiene para revisión. El coordinador mantiene las decisiones y audita el resultado.

**Estado, 14 de octubre de 2026:** estructura de ejecución preparada. No se iniciaron las tareas de este paquete ni se publicaron cambios de aplicación. La revisión de precios ya existente se conserva; aplicar precios y completar ambos paneles siguen pendientes. Los documentos de diseño no equivalen a funciones terminadas.

## Cómo empezar

Desde la raíz del proyecto:

```powershell
node docs/ejecucion-paneles/preparar-tarea.mjs --list
node docs/ejecucion-paneles/preparar-tarea.mjs BASE-01
```

El segundo comando imprime el encargo listo para copiar al agente elegido. Empieza por inventariar la base, porque la versión local y las del servidor tienen funciones diferentes. **No cambia código, no abre otra sesión de IA y no elige ni cobra un modelo.**

También se incluye el [primer encargo ya preparado](PRIMER-ENCARGO.md). Es una copia inicial de BASE-01; para continuar o retomar después de una auditoría, genera el encargo con el comando y el estado vigente.

El agente guarda su entrega usando [esta plantilla](plantillas/ENTREGA.md). Después, el coordinador utiliza [el prompt de auditoría](AUDITOR.md), revisa los archivos y ejecuta las comprobaciones pertinentes. Si acepta el paso, registra el resultado en [estado.json](estado.json). El preparador habilita el siguiente paso solo cuando sus dependencias están aceptadas.

Para estudiar una ficha que aún tiene dependencias pendientes:

```powershell
node docs/ejecucion-paneles/preparar-tarea.mjs IMP-05 --paso backend-transaccion --vista
```

Esa vista es de consulta y no autoriza implementarla. Las comprobaciones del preparador organizan el trabajo; no reemplazan permisos de la plataforma ni una revisión de seguridad.

## Qué recibe el agente

- El [prompt de implementación](IMPLEMENTADOR.md), con límites y formato de entrega.
- Un [contexto común breve](CONTEXTO.md), sin toda la conversación.
- Una sola ficha y un solo paso de [tareas.json](tareas.json): objetivo, archivos permitidos, lecturas concretas, pruebas y dependencias.

Los paquetes grandes se dividen en **contrato → backend → frontend**. El contrato concreta campos, rutas, permisos y casos de prueba antes de escribir código. Un paso que exceda una entrega revisable se divide de nuevo; no se eliminan pruebas para hacerlo caber. El objetivo orientativo es mantener cada entrega en torno a 100–300 líneas modificadas; 400 es una señal para revisar el tamaño, no una orden de recortar controles.

## Orden del trabajo

1. **BASE:** inventario, contratos de acceso, resolución del alcance por acción y recuperación de la agenda compartida.
2. **IMP:** probar el preview con PostgreSQL desechable, descargar plantilla, unificar precios, guardar revisión, aplicar y mostrar historial. Los perfiles de proveedor vienen después.
3. **CAT:** conservar Biblioteca al operar listas; revisiones de producto, sus apartados y medios; validación, publicación y paquetes de exportación/importación.
4. **COM:** paquetes Vendedor/Supervisor/Gestión, cartera, cotizaciones, metas, indicadores, agenda, avisos y contratos externos. Los límites de descuento tienen su propio paquete; no bloquean estados/alcances de cotizaciones.
5. **QA:** recorridos completos y auditoría de integración antes de preparar una publicación.

Las dependencias exactas están en las fichas. Las ramas independientes pueden prepararse mientras falta información externa; se ejecuta una entrega a la vez en este checkout para evitar que dos agentes cambien los mismos archivos.

## Cómo se ahorra contexto

El agente no carga todas las fichas, repite la investigación histórica ni vuelve a escribir el preview. El preparador selecciona los datos por él. Lee secciones concretas y busca código con `rg`; amplía solo cuando un contrato o fallo lo justifique. Su respuesta resume lo cambiado y enlaza pruebas, en lugar de pegar archivos completos.

No se fija aquí un modelo concreto ni una promesa de coste. El ahorro proviene de reducir lecturas repetidas y resolver las decisiones difíciles antes de encargar código. La auditoría conserva sus controles aunque el implementador sea más económico.

## Qué decide el coordinador

El coordinador cierra los contratos y las decisiones pendientes, revisa migraciones, publicación, aplicación de precios y accesos. El agente puede proponer soluciones y resolver detalles reversibles dentro de su ficha. Los contratos de Yéminus, Excel «Pedidos», descuentos, oferta pública y stock no se inventan. Si falta una decisión empresarial, se registra; las otras tareas pueden continuar.

No hay despliegues, cambios de credenciales, commits ni pushes autorizados por este paquete. Cada publicación conserva su autorización específica. Las asignaciones de usuarios existentes tampoco se migran automáticamente por aprobar una ficha de diseño.

## Fuentes

- [Comercial](../DISENO-PANEL-COMERCIAL-2026-10-13.md).
- [Catálogo y precios](../DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md).
- [Importación de precios](../DISENO-IMPORTACION-PRECIOS-2026-10-14.md).
- [Lo implementado del preview y sus límites](../IMPLEMENTACION-REVISION-PRECIOS-2026-10-14.md).
- [Acceso por usuario](../PANELES-Y-PERMISOS.md) y [diferencias entre versiones](../COMPARACION-10-PANELES-2026-10-13.md).

Las reglas confirmadas por el usuario prevalecen sobre propuestas antiguas. Si dos documentos difieren, el coordinador deja la resolución en el contrato de esa tarea. Las fichas proponen una división de trabajo; no convierten las decisiones pendientes en decisiones aprobadas.

## Comprobar este paquete

```powershell
node docs/ejecucion-paneles/preparar-tarea.mjs --check
node --test docs/ejecucion-paneles/preparar-tarea.test.mjs
```

Estas comprobaciones validan el organizador y sus dependencias; no certifican la implementación futura de los paneles.

El [registro de comprobación](VALIDACION-PAQUETE.md) describe los 30 paquetes/99 pasos y las 13 pruebas ejecutadas al preparar esta estructura.
