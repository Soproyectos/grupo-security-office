# Encargo continuo: completar los dos paneles y la importación

**Modalidad solicitada por el usuario:** una sola tanda de implementación y auditoría del coordinador al final. Esta instrucción reemplaza las pausas para auditoría entre pasos de IMPLEMENTADOR.md, AUDITOR.md y el preparador anterior. Los permisos reales de la plataforma y las reglas de seguridad del producto siguen vigentes.

Lee AGENTS.md, CONTEXTO.md, el inventario BASE-01 y su auditoría si están disponibles. Después consulta las fichas por partes con:

```bash
node docs/ejecucion-paneles/preparar-tanda.mjs --list
node docs/ejecucion-paneles/preparar-tanda.mjs BASE-02 contrato
```

## Objetivo y continuidad

Completa Comercial, Catálogo y precios y la nueva importación conforme a tareas.json y los diseños. Conserva lo ya implementado. Trabaja secuencialmente, pero sin esperar aceptación del coordinador entre pasos. Escribe el contrato de cada función y compruébalo contra el diseño antes de implementar; esas propuestas quedan disponibles para la auditoría final, no se presentan como decisiones empresariales aprobadas.

Resuelve decisiones técnicas reversibles dentro del diseño, divide incrementos grandes y corrige tus propios fallos. Conserva una lista de los incrementos restantes; completar uno no termina el paquete. Consulta una ficha a la vez para reducir contexto. No reconstruyas toda la conversación ni repitas investigación general.

Guarda progreso en `docs/ejecucion-paneles/resultados/TANDA-01-avance.json`: paso, estado (`pendiente`, `en_proceso`, `implementado_sin_auditar`, `bloqueado`), archivos, pruebas y motivo del bloqueo. Este registro permite continuar desde otra sesión si se agota el contexto. `implementado_sin_auditar` permite continuar a sus dependencias cuando sus criterios y pruebas pasan; nunca equivale a aceptación del coordinador.

El preparador de tanda muestra fichas sin exigir aceptaciones intermedias. Tú debes respetar dependencias técnicas: no conectar una interfaz a una API inexistente ni aplicar una migración no preparada. No edites las aceptaciones de estado.json ni marques decisiones empresariales como confirmadas por tu cuenta. QA-01 y el veredicto definitivo pertenecen al coordinador.

## Entorno de trabajo obligatorio

La carpeta S3 sirve la web activa. Puedes leerla para inventariar, pero la implementación se realiza en una copia aislada que no esté montada por los servicios activos, con base de datos y puertos de prueba propios. Preparar esa copia forma parte de esta tanda; registra su ruta y versión. Un worktree nuevo no incluye por sí solo cambios sin commit: preservar también esos cambios y los módulos existentes mediante copia/snapshot autorizado, sin reset/clean ni reemplazar la instalación activa.

El preview, los controles granulares y banners existen en L; S3 tiene otras funciones. Reutiliza las piezas disponibles mediante integración, no reimplementes el preview ni sobrescribas S3 con una versión incompleta. Si no puedes acceder a una pieza, registra exactamente qué fuente falta; no la suplantes con un prototipo que parezca terminado.

No hacer despliegues, commits, pushes, cambios de credenciales, migraciones de cuentas reales ni operaciones sobre datos comerciales. No modificar la presentación pública de productos por reorganizar administración. Pruebas con datos ficticios y PostgreSQL desechable.

## Bloqueos que no se inventan

Yéminus requiere contrato/API y datos de integración reales; Excel Pedidos, un formato saneado; reglas de descuento, precio público y stock requieren decisiones documentadas cuando no estén ya resueltas. Si faltan, completa las partes independientes y deja la rama bloqueada con la evidencia necesaria. No declares «todo funcional» con conectores simulados, mocks en producción o decisiones inventadas. No repitas preguntas por cada paso; agrupa los bloqueos reales en el informe.

## Comprobaciones y entrega única

Verifica cada incremento con las pruebas pertinentes antes de continuar. Incluye API permitida/denegada, alcance, revocación, transacciones, concurrencia/reintentos y conservación de publicados según la ficha. Para interfaz, verifica los recorridos en navegador. Lint y typecheck de las aplicaciones modificadas. Diferencia pruebas ejecutadas de las planeadas y PostgreSQL de repositorios simulados.

Al terminar todo lo posible, entrega `docs/ejecucion-paneles/resultados/TANDA-01-entrega.md`: ruta aislada, base y cambios previos conservados, paquetes/pasos implementados sin auditar, pendientes/bloqueos, contratos propuestos, diff o hashes por archivo, migraciones y recuperación, comandos/resultados y recorrido de prueba con su URL si hay servidor de revisión activo. No expongas credenciales ni PII.

Entrega una sola vez al coordinador para auditoría final. Si una limitación del entorno impide continuar toda la tanda, conserva el progreso y entrega el bloqueo concreto; no anuncies trabajo ejecutándose después de cerrar tu sesión.
