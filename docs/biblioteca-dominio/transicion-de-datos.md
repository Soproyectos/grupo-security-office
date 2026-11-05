# Transición de datos: de la base única a la biblioteca dedicada

**Estado:** diseño; no se ejecutó ni se creó nada. Decisiones: [ADR-20261022](../adr/ADR-20261022-biblioteca-postgresql-dedicado.md). Estructura: [modelo-de-datos.md](./modelo-de-datos.md). Servicio y respaldos: [infraestructura-e-integracion.md](./infraestructura-e-integracion.md). Cada paso que toque la VPS, una base, un servicio, git o un despliegue **requiere autorización explícita del usuario en cada ocasión**.
**No verificado:** volúmenes reales (la copia de srv-soporte tiene 497 productos y 40 de 56 migraciones; producción tendría unos 5.056 productos según un documento del 20/10, sin consultar), duración de cada paso, y que no existan secuencias numéricas (no vi columnas `autoincrement` en el esquema, pero debe confirmarse).

## 1. Reglas que no se rompen
1. **Una sola escritura por dato:** en cualquier momento los datos de biblioteca se escriben en **una** base, nunca en las dos. Sin doble escritura ni sincronización bidireccional.
2. **Un solo catálogo oficial:** antes del corte, el oficial es la base actual; después, la nueva. Nunca ambos.
3. **No se editan ni se borran las migraciones históricas** de la base operativa (56 en el repo). La base de biblioteca tiene su propio historial desde cero.
4. **Se conservan identificadores, relaciones, revisiones e historial:** los ids no se regeneran; las revisiones conservan su contenido (que referencia archivos por id); `product_changes`, `publication_events`, `price_import_*` se copian completos. Los registros existentes de `audit_logs` **no se mueven ni se borran**.
5. **Un cambio a la vez:** la primera biblioteca es **equivalente a la estructura actual** más lo imprescindible para separar dominios (referencias de actor en lugar de llaves a usuarios). Los rediseños del modelo (tablas nuevas, columnas anulables, proveedores, faltantes) llegan **después** como migraciones normales de biblioteca, ya con la separación validada.

## 2. Fases

### Fase 0: prerrequisitos
- Parche SQL de `findAll` integrado y desplegado por su propio camino (pendiente de seguridad independiente).
- Decisiones D1 y D7 (qué hacer con `UploadedFile`/`Stock` y con los archivos) y el criterio de actores (hecho en el ADR).
- Respaldo verificado de la base actual y un entorno de ensayo aislado, con datos sintéticos o una copia aprobada por el usuario.

### Fase 1: biblioteca vacía
1. Definir el servicio PostgreSQL de biblioteca (tarea T04) y su esquema Prisma (T03).
2. Generar la **migración inicial** de biblioteca por diferencia entre «vacío» y el esquema nuevo (`prisma migrate diff --from-empty --to-schema-datamodel`, sin conexión), y revisar el SQL. Incluir `pg_trgm`, SKU normalizado, dos CHECK y NOT NULL/default de `catalogManufacturerRefs`. Los tres GIN retirados en `20260908172738` se excluyen por decisión del usuario del 22/10; evaluación futura solo con consultas y mediciones. `lifecycleStatus` conserva siete estados por compatibilidad, no define reglas futuras de publicación. [Correcciones y prueba preparada](./t03-prueba-postgresql18.md), sin aplicación.
3. Aplicar esa migración solo a la base nueva, en el ensayo y luego en la VPS con autorización. La base operativa no se toca.

### Fase 2: copia de ensayo (repetible)
Script de copia (tarea T11), ejecutado primero en el entorno aislado:
- Lee de la base operativa solo las 23 tablas de biblioteca y escribe en la nueva respetando el orden de dependencias; **conserva los ids**.
- Transforma las llaves a usuarios: `created_by_id` → `created_by_actor_id` + `created_by_actor_name`, tomando el nombre de `users` **solo en este paso** (única lectura entre dominios; el script no guarda credenciales ni correos).
- La copia es **completa sobre una base de destino vacía** (se borra y recarga la base nueva, nunca la antigua). Al ser un volumen pequeño [NO VERIFICADO] se evita un mecanismo incremental, que sería una forma de doble escritura.
- Archivos: copia de las imágenes de `uploaded_files` y de los originales de listas al volumen de biblioteca, con SHA-256 de origen y destino.

### Fase 3: validación (cada vez que se copia)
| Comprobación | Cómo | Criterio de aceptación |
|---|---|---|
| Conteos | `count(*)` por tabla en origen y destino | Idénticos en las 23 tablas |
| Contenido | Huella por tabla (hash ordenado de id y columnas clave) | Idénticas, salvo las columnas de actor transformadas |
| Integridad interna | Las FK del dominio quedan creadas sin errores; consulta de huérfanos | 0 huérfanos dentro de biblioteca |
| Referencias entre dominios | Informe de conciliación (cotizaciones, asignaciones, portal) antes y después | Mismos huérfanos que antes, ninguno nuevo |
| Precios | Suma y conteo por tarifa; el último `product_changes` por producto | Idénticos |
| Revisiones | `product_revisions.content` byte a byte; `public_revision_id` válido | Idénticos |
| Archivos | Cantidad, tamaño y SHA-256 de cada imagen y original | Todos coinciden |
| Contrato de la web | Mismas peticiones a los endpoints públicos y administrativos antes y después | Respuestas equivalentes (se documentan las diferencias aceptadas) |
| Permisos | Pruebas por rol sobre las rutas afectadas | Sin ampliar ni reducir accesos |
Si algo falla, no se avanza: se corrige y se repite la copia desde una base vacía.

### Fase 4: ventana de corte (solo con autorización)
1. Aviso al equipo de seguridad (Netdata) y a los usuarios.
2. **Respaldo conjunto** de ambas bases y de los archivos, con manifiesto. Es el **punto compatible A**.
3. **Congelar escrituras de biblioteca:** la API rechaza las rutas de escritura de biblioteca (indicador `LIBRARY_WRITES_FROZEN`, a construir en la tarea T14); las lecturas siguen. Alternativa si no existe: detener brevemente la API (cambio de servicio, con aprobación).
4. **Copia final** completa a una base de biblioteca vacía y **validación corta** (conteos y huellas).
5. **Cambio de conexión:** se fija `BIBLIOTECA_DATABASE_URL` y el modo `dedicado` y se reinicia la API (cambio de servicio, con aprobación). Cada módulo usa un solo cliente según el modo; ningún módulo escribe en ambas.
6. Pruebas de humo (lectura de catálogo, ficha, cotización con producto, vista previa de precios, permisos) y **descongelar**.
7. **Bloquear escritura en las tablas antiguas de biblioteca** dentro de la base operativa (revocar privilegios de escritura al rol de la aplicación) para impedir una escritura accidental. Las tablas **no se borran**.
8. Observación: el tiempo que se defina con el usuario antes del retiro.

### Fase 5: retiro de las tablas antiguas (posterior, decisión aparte)
Una migración **nueva** de la base operativa retira las 23 tablas y sus modelos del esquema operativo. No reescribe ni borra migraciones históricas. Solo después de un periodo de observación, un respaldo verificado y aprobación del usuario.

## 3. Reversión
| Momento | Reversión | Pérdida de datos |
|---|---|---|
| Antes de la fase 4 | No hay nada que revertir: la base nueva se vacía o se elimina | Ninguna |
| Fases 4.3 a 4.6, antes de descongelar | Volver al modo anterior (`legacy`) y reiniciar la API; descongelar | **Ninguna**: no hubo escrituras de biblioteca |
| Después de descongelar, dentro de la ventana de observación | **Copia inversa** (nueva → antigua) de lo escrito desde el corte, script ensayado previamente, con las tablas antiguas rehabilitadas; o corregir hacia adelante | Sin copia inversa se pierden las escrituras posteriores al corte |
| Tras el retiro (fase 5) | Restaurar desde el respaldo conjunto | Lo posterior al respaldo |
La copia inversa es un entregable del ensayo (T11/T14); no se asume que funciona hasta probarla.

## 4. Recuperación de ambas bases a un punto compatible
- El respaldo conjunto (manifiesto con hora común, huellas y último evento de cada historial) define cada punto compatible.
- Se restauran las **dos bases y los archivos de la misma ejecución**. Como las referencias entre dominios son ids opacos, restaurar solo una base deja ids huérfanos; el informe de conciliación los lista y se decide caso por caso.
- El ensayo de restauración forma parte de la aceptación (sección de pruebas del [plan](./plan-de-implementacion.md)).

## 5. Riesgos y preguntas abiertas
- Una consulta cruzada no inventariada puede fallar después del corte (el inventario es estático e incompleto: ver tarea T06).
- La marca «Sin marca» y otros valores de relleno actuales (D10) no se limpian en esta transición; se tratan después con aprobación.
- Duración de la ventana, tamaño real y espacio: sin mediciones. No se promete tiempo ni rendimiento.

## Corte T11 de desarrollo — 23/10/2026 (ensayo sintético aprobado)

Herramienta acotada `src/backend/prisma/biblioteca/prueba-copia/`: contrato T03 + UploadedFile (24 tablas), solo clientes ya aislados y con identidad física exacta de la misma ejecución gs-test. Snapshot REPEATABLE READ/READ ONLY, destino vacío bloqueado, escritura atómica y sin desactivar FK. Categories.parentId y Products.publicRevisionId se insertan como NULL y se restituyen en la misma transacción; IDs, valores, JSON/revisiones, precios y bytes se comparan por huella ordenada por PK. Límite sintético: 10.000 filas por tabla, 10 MiB de payload total, timeout 30s de transacción, 3s por sentencia, 1s de espera de locks. Sin consultas HTTP dentro de transacciones.

La propuesta histórica de transformar actores en fase 2 no coincide con el contrato físico T03: los campos de actor conservan sus nombres y son escalares externos; las 23 tablas no tienen columnas actor_name. Este corte conserva esos IDs sin leer User ni inventar nombres. Los eventos nuevos propios sí tienen snapshot de actor. No es un script para usar en producción ni una copia de usuarios/ACL/clientes.

Ensayo completo aprobado en PostgreSQL 18.6 aislado: ambos sentidos, error deliberado tras cinco tablas con rollback, destino ocupado/identidad equivocada rechazados y limpieza condicionada a hashes idénticos antes de DELETE. Igualdad de 24 conteos/huellas; SQL NULL/JSON null y números JSON fuera de precisión JS conservados. Tras los casos, 28 tablas de biblioteca y 24 de compatibilidad vacías; tres contenedores, red y credenciales propios ausentes. [Resultados](./evidencia/t11-copia-intento-1/resultado-ejecucion.json) y [huellas completas](./evidencia/t11-copia-intento-1/conteos-hashes-copia.json). La herramienta rechaza datos no vacíos en las tablas aditivas T07/T13 que todavía no copia; no permite una inversa que los omita silenciosamente. Los originales de listas, decisiones D7, conciliación del esquema operativo completo y migración real siguen pendientes. El manifiesto de cada intento describe miembros/hashes/comandos; no se utiliza otra imagen, red o volumen.
