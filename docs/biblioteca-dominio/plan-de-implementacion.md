# Plan de implementación por tareas pequeñas

**Estado:** el mandato de continuidad autoriza avanzar por este plan en desarrollo/pruebas; el estado vigente y la evidencia están **solo** en la tabla de [README.md](./README.md). No autoriza producción ni datos reales. T03 quedó validada en PostgreSQL 18 aislado; T04/T05 siguen en desarrollo. Los requisitos de aprobación por tarea que figuran como corte histórico abajo no sustituyen ese mandato.
**Decisiones y diseño:** [ADR-20261022](../adr/ADR-20261022-biblioteca-postgresql-dedicado.md) · [modelo-de-datos](./modelo-de-datos.md) · [infraestructura-e-integracion](./infraestructura-e-integracion.md) · [transicion-de-datos](./transicion-de-datos.md) · [reglas-de-publicacion](./reglas-de-publicacion.md).
**Entornos:** **LOCAL** = worktree en el PC, sin base de datos ni Docker. **AISLADO** = recursos temporales con prefijo `gs-test-` en un entorno separado de producción, con red interna y datos sintéticos (o una copia que el usuario apruebe). **VPS** = producción: solo con aprobación explícita en cada paso.
**Autorización vigente:** código/candidatos, recursos y migraciones exclusivamente de desarrollo/prueba sintéticos están cubiertos por el mandato registrado en README. Nuevas dependencias solo de desarrollo tras revisión, sin versiones mayores ni servicios del host. Producción, datos reales, commit/push/merge y despliegue siguen fuera de autorización. El aislamiento/aviso de seguridad y las decisiones comerciales pendientes se conservan.

## Tareas

### T00 · Parche SQL de `findAll` (carril de seguridad independiente)
- **Objetivo / dependencias:** cerrar la inyección SQL de `GET /api/products` antes de desplegar código afectado. Sin dependencias; no se mezcla con esta obra.
- **Componentes:** `src/backend/src/modules/products/products.service.ts` y su spec; prueba de integración `products.service.fuzzy.pgint.ts`.
- **Entorno:** LOCAL (unitarias, ya pasan 120/120) y AISLADO (integración con PostgreSQL desechable, aún no ejecutada).
- **Autorización:** aprobar el procedimiento de prueba aislada; luego commit, PR, merge y despliegue, por separado.
- **Aceptación:** pruebas unitarias; prueba de integración aislada; revisión del diff; `main` desplegado con el parche.
- **Evidencia:** resultado de pruebas, hashes del paquete, informe de que producción no cambió con la prueba.
- **Reversión:** revertir el PR; la prueba aislada se limpia con su `trap`.

### T01 · Aprobar las decisiones que bloquean
- **Objetivo:** cerrar D1, D3, D4, D5 y D7 (ver lista de bloqueos en [README.md](./README.md)). Dependencias: ninguna. Componentes: solo el ADR y este plan. Entorno: documental. Autorización: decisión del usuario (no del agente). Aceptación: cada decisión pasa a «confirmada» con fecha. Evidencia: ADR actualizado. Reversión: reabrir la decisión.

### T02 · Prueba de concepto de dos esquemas y dos clientes Prisma
- **Objetivo:** comprobar con Prisma 6.19.3 que dos esquemas generan dos clientes que conviven, con el adaptador `pg`. **Primera tarea técnica propuesta**: es local, no toca bases, servicios ni datos. Dependencias: T01 no la bloquea.
- **Componentes:** archivo nuevo `src/backend/prisma/biblioteca/schema.prisma` (solo para la prueba), `package.json` (scripts), una prueba de carga de ambos clientes. Sin cambiar `schema.prisma` actual.
- **Entorno:** LOCAL. **Autorización:** modificar archivos en el repo y, si hay que instalar algo, instalarlo.
- **Aceptación:** `prisma validate` y `prisma generate` de ambos esquemas sin error; un script importa ambos clientes y los instancia (sin conectar); `tsc` y lint pasan; `docker build` del backend no se ejecuta aquí (queda para T04/T12).
- **Evidencia:** comandos y resultados. **Reversión:** descartar la rama.

### T03 · Esquema Prisma de biblioteca y migración inicial por diferencia
- **Objetivo:** preparar los 23 modelos equivalentes al actual, conservando los IDs de actor como escalares externos sin FK a usuarios; generar el SQL inicial con `prisma migrate diff --from-empty --to-schema-datamodel … --script` (Prisma 6.19.3, sin base). Dependencias: aceptación local de T02 cumplida; Linux y conexiones siguen pendientes. D1 solo afecta a `UploadedFile`/`Stock`, excluidos del candidato autorizado.
- **Componentes reales:** `src/backend/prisma/biblioteca-candidata/schema.prisma`, salida `generated/client`, historial propio `migrations/…/migration.sql`, complemento histórico y comprobadores locales. **Entorno:** LOCAL. **Autorización del 22/10/2026:** preparar y verificar archivos; **no** aplicar ni conectar a BD, ni tocar esquema productivo, PrismaService o CI.
- **Aceptación:** SQL con `pg_trgm`, SKU normalizado, dos CHECK históricos y NOT NULL de `catalogManufacturerRefs`, conservando default. **Decisión explícita del usuario, 22/10:** excluir los tres GIN; su evaluación queda como optimización futura condicionada a consultas y mediciones. Mantener Product y la preparación futura T11/T13 sin datos de relleno. Conservar los siete estados solo por compatibilidad; reglas futuras en T09. Ejecutor preparado con aislamiento/destino vacío, search_path, errores inmediatos y aplicación atómica; ver [procedimiento](./t03-prueba-postgresql18.md). Aún no validado contra PostgreSQL.
- **Evidencia:** [diff y hashes regenerados](./t03-prueba-postgresql18.md), comparación de los 23 modelos, aserción estática del NOT NULL/default y prueba física futura mediante catálogos y rechazo de NULL. No se ejecutó SQL ni se autorizaron conexiones. **Reversión de estas correcciones:** usar el diff de recepción para restaurar solo complemento/SQL/comprobador/tsconfig, retirar archivos nuevos de prueba y párrafos nuevos de documentación; preservar T00, T02 y entrega previa. Sin operaciones globales de Git.

### T04 · Definición del servicio de biblioteca en Docker Compose
- **Objetivo:** archivos de configuración del servicio `gs-biblioteca-db` (imagen oficial, volumen, red `biblioteca_net`, secretos por variables, healthcheck), sin desplegar. Dependencias: T03. **Componentes:** `docker-compose.prod.yml`, `deploy/vps/docker-compose.override.yml`, `.env.example`. **Entorno:** LOCAL (validar con `docker compose config` en un equipo con Docker autorizado, o revisión estática). **Autorización:** modificar el repo; no crear contenedores. **Aceptación:** la configuración se valida sin secretos en el repositorio. **Evidencia:** salida de validación. **Reversión:** revertir el cambio.

### T05 · Servicio de conexión y modo `legacy | dedicado`
- **Objetivo:** `BibliotecaPrismaService` y un indicador de modo que decide, por módulo, qué cliente usa, sin cambiar aún a los consumidores. Dependencias: T02, T03. **Componentes:** `src/backend/src/prisma/*`, `app.module.ts`, variables de entorno. **Entorno:** LOCAL. **Autorización:** modificar el repo. **Aceptación:** en modo `legacy` todo se comporta igual (suites actuales sin nuevos fallos); en modo `dedicado` falla de forma clara si falta la URL. **Evidencia:** pruebas. **Reversión:** revertir.

### T06 · Inventario completo y adaptación de módulos por oleadas
- **Objetivo:** completar el [inventario](./infraestructura-e-integracion.md#3-inventario-concreto-de-módulos-y-consultas-a-adaptar) (consultas indirectas, `prisma/*.ts`, `scripts/`, SQL crudo) y adaptar:
  - **Oleada A:** `brands`, `categories`, `library-packages`, `scripts/import-product-media`.
  - **Oleada B:** `products`, `prices`, `files`, `catalog-jobs` (incluye las 16 consultas crudas de `products`).
  - **Oleada C:** `common/acl`, `listas`, `assignments`, `commercial`, `customer-portal`, `storefront`, `dashboard`, `team-workflow`, `health`.
- Dependencias: T05, T07 (auditoría), D3. **Entorno:** LOCAL + AISLADO (pruebas con base). **Autorización:** modificar el repo por oleada; ensayo aislado. **Aceptación:** por oleada, las suites pertinentes pasan en ambos modos, los contratos HTTP no cambian, ninguna consulta cruza dominios sin interfaz. **Evidencia:** lista de consultas adaptadas y resultados. **Reversión:** revertir por oleada (el modo `legacy` sigue disponible).

### T07 · Registro de eventos de biblioteca
- **Objetivo:** crear `library_audit_events` y dirigir allí los eventos de biblioteca (vista previa y descarte de importaciones, cambios de lista, archivos), conservando `product_changes` y `publication_events`. Dependencias: T03. **Componentes:** esquema de biblioteca, servicios de `products`, `prices`, `listas`. **Entorno:** LOCAL + AISLADO. **Autorización:** modificar el repo. **Aceptación:** cada acción de biblioteca deja un evento con actor (id y nombre); el `audit_logs` histórico no se toca. **Evidencia:** pruebas. **Reversión:** revertir.

### T08 · Respaldos y restauración conjuntos
- **Objetivo:** scripts de respaldo de ambas bases y del volumen de archivos con manifiesto, y procedimiento de restauración a un punto compatible. Dependencias: T04, D7. **Componentes:** `deploy/vps/` (scripts y temporizador), documentación. **Entorno:** AISLADO (ensayo de restauración); VPS al activar. **Autorización:** modificar el repo; recursos aislados; instalar el temporizador en la VPS es cambio de servicio. **Aceptación:** restaurar un respaldo en un entorno aislado y comprobar conteos, huellas y archivos; informe de conciliación sin huérfanos nuevos. **Evidencia:** manifiesto y comparaciones. **Reversión:** desactivar el temporizador nuevo; los respaldos actuales no se tocan.

### T09 · Reglas de publicación en el motor de validación
- **Objetivo:** implementar las tres dimensiones (puede publicarse / qué falta / verificación) sobre la validación existente (`cat05-r1`), con los mínimos confirmados y sin exigir documentos. Dependencias: T13 (tablas de faltantes y evidencia), D4, D5. **Componentes:** `modules/products/validation/*`. **Entorno:** LOCAL + AISLADO. **Autorización:** modificar el repo. **Aceptación:** las pruebas de la [matriz](./reglas-de-publicacion.md) pasan; ningún producto existente cambia de estado de publicación. **Evidencia:** pruebas y un informe, sin efectos, de qué productos serían publicables. **Reversión:** revertir.

### T10 · Flujo independiente de enriquecimiento técnico
- **Objetivo:** auditoría de faltantes → extracción determinista → evidencia → revisión humana → actualización de ficha, **sin tocar precios**. Reutiliza `tools/enrich_hikvision_catalog.py` y el skill `catalog-librarian`; el LLM solo para excepciones. Dependencias: T13 (faltantes y evidencia), D3. **Entorno:** LOCAL / equipo de trabajo; nunca escribe directo en producción. **Autorización:** por lote; la revisión humana es obligatoria. **Aceptación:** cada propuesta lleva fuente y verificación; una referencia no exacta se descarta; las propuestas entran por el editor de ficha. **Evidencia:** informe por lote. **Reversión:** descartar las propuestas.

### T11 · Scripts de copia, validación y copia inversa
- **Objetivo:** copia completa de las 23 tablas a una base vacía conservando ids, transformando actores; validaciones de la fase 3; copia inversa. Dependencias: T03, T04. **Componentes:** `scripts/` o `src/backend/scripts/` (nuevos). **Entorno:** AISLADO. **Autorización:** modificar el repo; recursos aislados. **Aceptación:** todas las comprobaciones de la fase 3 en ensayo; repetible desde cero. **Evidencia:** informe de validación. **Reversión:** eliminar recursos `gs-test-*`.

### T12 · Ensayo general en entorno aislado
- **Objetivo:** recorrer la fase 1 a 3 completas, el cambio de modo y la restauración con la web existente. Dependencias: T05, T06, T08, T11. **Entorno:** AISLADO. **Autorización:** recursos aislados y datos (sintéticos o copia aprobada). **Aceptación:** pruebas de aceptación de la sección siguiente. **Evidencia:** informe firmado de ensayo. **Reversión:** limpieza por prefijo.

### T13 · Migraciones de rediseño del modelo de biblioteca
- **Objetivo:** ya en la base dedicada, migraciones nuevas por oleadas: columnas anulables, `manufacturer_ref`, referencias de proveedor con FK, `supplier_costs`, `product_gaps`, `field_evidence`, familias y atributos, `library_files`, variantes. Dependencias: corte hecho (T16) y las decisiones D2, D3, D4, D5, D7, D10. **Entorno:** LOCAL → AISLADO → VPS. **Autorización:** migraciones, por oleada. **Aceptación:** cada migración se ensaya en AISLADO con datos copiados; no se pierden datos; las pruebas pasan. **Reversión:** migración inversa o restauración del respaldo previo.

### T14 · Indicador de congelación de escrituras de biblioteca
- **Objetivo:** `LIBRARY_WRITES_FROZEN`: rechaza escrituras de biblioteca con un mensaje claro y deja las lecturas. Dependencias: T05. **Entorno:** LOCAL + AISLADO. **Autorización:** modificar el repo. **Aceptación:** con el indicador, toda ruta de escritura de biblioteca devuelve el mismo error y no escribe; sin él, nada cambia. **Evidencia:** pruebas por ruta. **Reversión:** revertir.

### T15 · Retiro de las tablas antiguas del esquema operativo
- **Objetivo:** migración nueva que retira de la base operativa las 23 tablas y sus modelos, tras la observación. Dependencias: T16 y periodo de observación. **Entorno:** AISLADO → VPS. **Autorización:** migración y despliegue. **Aceptación:** respaldo verificado y operativo sin referencias a esas tablas. **Reversión:** restaurar desde el respaldo conjunto.

### T16 · Corte en la VPS
- **Objetivo:** ejecutar la fase 4. Dependencias: T00, T12, T14 y aprobación del usuario. **Entorno:** VPS. **Autorización:** ventana, respaldo, recursos nuevos, cambio de servicio y despliegue, cada uno aprobado. **Aceptación:** validación corta, pruebas de humo, permisos sin cambios. **Evidencia:** manifiesto y reporte de la ventana. **Reversión:** según la tabla de [reversión](./transicion-de-datos.md#3-reversión).

### T17 · Mediciones de rendimiento
- **Objetivo:** medir antes y después, y fijar objetivos con el usuario. Dependencias: T12. **Entorno:** AISLADO. **Aceptación:** los objetivos acordados se cumplen; si no, se informa y no se declara listo. **Evidencia:** resultados con método y volumen. **Reversión:** no aplica.

## Pruebas de aceptación a planear
| Prueba | Cómo | Criterio |
|---|---|---|
| Cargar productos incompletos sin inventar datos | Importar filas con solo SKU y filas con huecos | Quedan en borrador inactivo; `NULL` y faltantes registrados; ningún valor de relleno |
| Detectar duplicados y conservar ids | Reimportar el manifiesto de 5.038 | 0 duplicados por SKU normalizado; ids existentes intactos |
| Registrar faltantes y fuentes | Producto sin datasheet ni manual | Publicable; faltantes en `product_gaps`; `NO_ENCONTRADO` distinto de `NO_APLICA` |
| Comparar antes de actualizar, sin borrar por vacíos | Vista previa con celdas vacías | La vista previa no cambia datos; la celda vacía conserva el valor |
| Precio anterior y nuevo, actor y lote | Aplicar una revisión | `product_changes` con antes, después, actor (id y nombre) y lote |
| Idempotencia y concurrencia | Reaplicar la revisión; dos aplicaciones simultáneas | Un solo efecto; la otra recibe el resultado guardado |
| Contrato de la web y permisos | Mismas peticiones y roles antes/después de T06 | Respuestas equivalentes; sin ampliar accesos |
| Referencias entre dominios | Informe de conciliación tras cada fase | Sin huérfanos nuevos |
| Restaurar respaldo y comprobar coherencia | Restauración completa en AISLADO | Conteos, huellas y archivos coinciden; conciliación sin huérfanos nuevos |
| Rendimiento | Medir listado, búsqueda y aplicación de precios con el volumen real acordado | **Objetivos medibles definidos con el usuario en T17** (por ejemplo percentil 95 del listado); hoy **no hay mediciones** y no se promete ninguno |
