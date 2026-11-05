# T03 — PostgreSQL 18 aislado: estructura comprobada, prueba de datos detenida

**Estado actual, 22/10/2026: T03 validada en PostgreSQL 18 aislado.** El paquete RESTRICT corregido completó las tres fases con salida 0, incluidos CASCADE/SET NULL, rollback de fixtures y 23 tablas vacías. Limpieza de contenedores/red/env propios verificada. Los dos intentos fallidos se conservan. Esto valida los 23 modelos de transición, no la biblioteca completa ni su integración. Continuación de desarrollo autorizada por el mandato del usuario.

## Primer intento: resultado comprobado (histórico)

La sesión llegó a SET y set_config de destino.sql. El bloque DO falló con **SQLSTATE P0001, GS_T03_DESTINO_RECHAZADO**, en destino.sql:22 (RAISE de la guarda). El ejecutor terminó con **código 2**, pues no encontró el error deliberado ZX003/GS_T03_ROLLBACK_EXPECTED exigido para aprobar la fase 1. No se trata de una prueba negativa aprobada.

La guarda combina identidad de base, usuario/sesión, IP, puerto, cluster_name, versión, data_directory y search_path; el log no imprime qué condición concreta fue distinta. En el cierre inicial aún no se había identificado la causa; el análisis local posterior aparece al final. No se ejecutó vacio.sql, migration.sql, estructura.sql ni fallo.sql: el SQL candidato y su complemento no se aplicaron. No comenzaron las fases 2 y 3.

[Log SQL íntegro](./evidencia/t03-ejecucion/01-rollback.log) · [Salida del ejecutor](./evidencia/t03-ejecucion/lanzamiento-stdout.log) · [stderr](./evidencia/t03-ejecucion/lanzamiento-stderr.log) · [Resultado por caso y metadatos](./evidencia/t03-ejecucion/resultado-ejecucion.json).

## Secuencia y comandos registrados

- Preflight remoto de solo lectura, salida 0: identidad dev/host esperado; 8 CPU, 22.113.684 KiB disponibles, 182.139.314.176 bytes libres en los sistemas de archivos consultados; Docker 29.1.3, build 29.1.3-0ubuntu3~24.04.2. Sin colisiones gs-test-pg, gs-test-runner, gs-test-net ni rutas de entrada. [Comandos exactos](./evidencia/t03-ejecucion/preflight-comandos.sh), [salida](./evidencia/t03-ejecucion/preflight-remoto.log).
- Imagen ya presente postgres:18-alpine, linux/amd64, ID **sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873**. No hubo descarga ni instalación. La versión exacta del servidor y de psql no quedó registrada antes del rechazo; el nombre de imagen no sustituye esa comprobación.
- Cinco hashes locales completos volvieron a coincidir. Solo se transfirieron ejecutar-aislado.sh y prueba-t03.tar.gz por scp (dos salidas 0), a los dos nombres exactos acordados en /home/dev. Ambos hashes y los ocho miembros enumerados en SHA256SUMS se comprobaron en destino; los nueve miembros habían sido verificados localmente. [Huellas previas](./evidencia/t03-ejecucion/hashes-antes-transferencia.json), [transferencias](./evidencia/t03-ejecucion/transferencia.json).
- Lanzamiento exacto mediante SSH no interactivo, clave existente usada sin leer su contenido y host key estricta: [comandos remotos](./evidencia/t03-ejecucion/lanzamiento-comandos.sh). Se conservó timeout 600 s/kill-after 30 s, timeouts psql 120 s, sentencia 60 s y bloqueo 5 s. Inicio 2026-10-22T21:48:31.019Z; fin 2026-10-22T21:48:38.386Z; salida SSH/script 2. La salida individual de psql no se conserva separada por el wrapper; su error SQL sí figura en el log.
- El script creó dos contenedores propios y una red interna, verificó las guardas Docker antes de abrir psql, y ante el error ejecutó su trap. No hubo puertos publicados, volúmenes/binds productivos, Docker socket ni servicios existentes modificados. Se mantuvieron los límites y capacidades del procedimiento aprobado; no se ejecutó otro procedimiento.

Identidad sintética de la ejecución: **20261022214833-f600afb3**, base **gs_test_biblioteca_20261022214833_f600afb3**, cluster **gs-test-t03-20261022214833-f600afb3**. Los IDs completos están en [identidad.txt](./evidencia/t03-ejecucion/identidad.txt).

## Huellas congeladas

- Esquema: 5f6bc6835e7d775929006b3da7a85b46cd1cb2d5ab06ec63bbeaae3dccd396a4.
- SQL concatenado (incluye complemento): c6b6c38425bfd3321f8610d3311fe3a7a08a7c748ef172df047d63f2e37ea36b.
- Complemento: 43541773a8f0d51d33a8d97774114a300a83022ce7c2954e257cf1611c0e70e2.
- Ejecutor: f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e.
- Paquete: b00fc5d08dcf0487d8a0f42c063c901b378d11cf64095d97ed2404b03c59a37b.

El [manifiesto preparado](./evidencia/t03-prueba-preparada.json) y el [procedimiento](./t03-prueba-postgresql18.md) permanecen como corte de preparación sin cambios operativos. Los hashes de cada miembro están también en el resultado de esta ejecución. No se generó un candidato distinto.

## Casos y límites de aceptación

- Identificación del destino: **falló inesperadamente**; no se puede dar por aprobada.
- Public vacío antes de aplicar: no ejecutado por rechazo previo.
- Estructura física, manufacturerRefs NOT NULL/default, 280 columnas, 23 PK, cinco enums, dos CHECK y 61 índices: no ejecutados.
- Datos sintéticos válidos/ inválidos, unicidad normalizada, precisión y siete estados compatibles: no ejecutados.
- FK internas: **0 de 19 probadas**; acciones CASCADE/SET NULL/RESTRICT no comprobadas.
- Rollback completo del DDL tras ZX003: **no verificado**; no se alcanzó DDL ni fallo deliberado. El aborto temprano no demuestra ese caso.
- Aplicación atómica y rollback de fixtures/tablas vacías: no ejecutados; las fases 2/3 no se iniciaron.

## Limpieza y producción

El trap conservó exit=2/resultado=1. Una sesión de cierre **solo de lectura**, salida 0, confirmó por los IDs capturados que los dos contenedores y la red propios ya no existen; pg.env y runner.env propios están ausentes. También confirmó que no existen logs de fases 2/3. [Comandos](./evidencia/t03-ejecucion/cierre-comandos.sh) · [prueba de limpieza](./evidencia/t03-ejecucion/cierre-remoto.log).

Conforme al procedimiento se retiene evidencia sintética privada y payload en **/home/dev/gs-test-t03.r6059N**, y los dos artefactos transferidos en **/home/dev/gs-test-t03-ejecutar.sh** y **/home/dev/gs-test-t03-paquete.tar.gz**. No son servicios activos ni contienen datos reales. No se usó prune ni borrado general; no se afirma limpieza total del disco. Solo se recuperaron identidad.txt, 01-rollback.log y resultado.txt, sin archivos de credenciales.

**Comprobaciones de producción realizadas: ninguna.** Solo metadatos generales del host/imagen y recursos exactos de prueba; no se inspeccionaron contenedores productivos ni se abrió una conexión a datos reales. No se afirma integridad total de producción a partir de esta observación. Sin instalaciones, commit/push, despliegue, T04 ni modificación de T00.

## Continuación local autorizada: causa y corrección mínima

La comparación `inet_server_addr()::text` era defectuosa: el cast explícito de inet a text conserva siempre la máscara. Para la IP registrada por Docker y el log, `172.19.0.2`, produce `172.19.0.2/32`. Compararlo con el texto `172.19.0.2` activa IS DISTINCT FROM y rechaza incluso el destino correcto. Es un defecto suficiente para explicar el rechazo; el log original no descarta discrepancias adicionales en las demás condiciones. [Documentación oficial PostgreSQL 18: text(inet), abbrev y host](https://www.postgresql.org/docs/18/functions-net.html).

Se cambió **solo una línea** de [destino.sql](../../src/backend/prisma/biblioteca-candidata/prueba-postgresql18/destino.sql):

```diff
-     OR inet_server_addr()::text IS DISTINCT FROM current_setting('gs_test.expected_ip')
+     OR host(inet_server_addr()) IS DISTINCT FROM current_setting('gs_test.expected_ip')
```

`host()` obtiene la IP sin máscara; la igualdad exacta con la IP inspeccionada y el rechazo de NULL permanecen. Una IP diferente sigue rechazándose. No se eliminan ni flexibilizan comprobaciones de usuario, base, cluster, versión 18, ruta de datos, puerto, search_path, Docker, esquema vacío, transacciones o limpieza. No cambia el modelo de datos ni el SQL candidato/complemento.

Se ejecutó localmente `node src/backend/prisma/biblioteca-candidata/prueba-postgresql18/preparar.js`, que solo produce archivos. El paquete corregido se conservó por separado como `src/backend/prisma/biblioteca-candidata/generated/prueba-t03-corregida-ip.tar.gz`; se restauró byte por byte el paquete original en su ruta. El manifiesto preparado y toda la evidencia del intento fallido permanecen intactos: describen aquel intento, no autorizan este paquete nuevo.

Huellas para la nueva autorización:

- Paquete corregido: `5450c8abf16a349d469e8063593e790a673b32ab22745a277da768e4e6616dd1`.
- Miembro destino.sql: `c1f60b43da1dad6707ffe13275dab335c79980bce3666b9477ff80ebbb3758a3`.
- Miembro SHA256SUMS: `ca7b879e7f5fabbc888f208708a979c6df3bcfc8f4d5b5b9ebd2b74b27a46d82`.
- Ejecutor sin cambios: `f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e`.

Comprobaciones locales: igualdad exacta del archivo con la sustitución de una sola línea sobre el miembro original; lectura de los nueve archivos USTAR regulares; hashes de todos los miembros y cada entrada de SHA256SUMS conformes. Solo destino.sql/SHA256SUMS difieren del paquete original. Esquema, SQL concatenado, complemento y ejecutor conservan los cinco hashes anteriores junto al paquete original restaurado. Esto valida la preparación de archivos, **no su ejecución en PostgreSQL**. No se abrió una conexión ni se ejecutó Docker/SSH en esta continuación.

## Comandos de la repetición propuesta y posteriormente autorizada

Hace falta recrear los recursos desechables porque los del intento anterior fueron eliminados. Se propone el mismo aislamiento/procedimiento, límites, casos y parada ante errores, repitiendo primero el preflight de recursos, imagen local y nombres libres. El aviso seguridad/Netdata fue confirmado para la prueba; antes de una nueva ventana se comprobará que esa cobertura siga vigente. No se reutilizan contenedores o redes existentes.

Único cambio de SQL: normalizar la representación de la IP antes de compararla. Para preservar los artefactos remotos originales, comprobar además que las dos rutas nuevas no existan y transferir exclusivamente el ejecutor idéntico como `/home/dev/gs-test-t03-ejecutar-ip.sh` y el paquete corregido como `/home/dev/gs-test-t03-paquete-ip.tar.gz`. No sobrescribir las rutas anteriores. Los comandos remotos de lanzamiento cambiarían a:

```bash
set -eu
cd /home/dev
printf '%s  %s\n' 'f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e' 'gs-test-t03-ejecutar-ip.sh' | sha256sum -c -
printf '%s  %s\n' '5450c8abf16a349d469e8063593e790a673b32ab22745a277da768e4e6616dd1' 'gs-test-t03-paquete-ip.tar.gz' | sha256sum -c -
timeout --signal=TERM --kill-after=30s 600 \
  bash ./gs-test-t03-ejecutar-ip.sh ./gs-test-t03-paquete-ip.tar.gz \
  5450c8abf16a349d469e8063593e790a673b32ab22745a277da768e4e6616dd1
```

**Corte de propuesta anterior a la autorización:** estos comandos quedaron pendientes entonces. El usuario autorizó posteriormente una sola repetición sobre estos hashes y confirmó que el aviso seguía vigente. Su resultado se registra abajo. No se inicia T04 ni se modifica producción/T00. Los 23 modelos siguen siendo una base de transición; preparación incompleta T11/T13, proveedores/costos/faltantes/evidencia, archivos e historial/eventos mantienen sus tareas.

## Repetición autorizada con IP corregida: resultado actual

El usuario autorizó una única repetición del paquete **5450c8abf16a349d469e8063593e790a673b32ab22745a277da768e4e6616dd1** con el ejecutor **f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e**. Confirmó: «Sí, sigue vigente y cubre la repetición» para el aviso seguridad/Netdata. Se ejecutó **exactamente una vez**, de 2026-10-22T22:28:36.260Z a 22:28:46.350Z; salida **3**, sin marcador global GS_T03_PRUEBA_OK. El primer intento y sus archivos de evidencia no se sobrescribieron.

Preflight nuevo, salida 0: 8 CPU, MemAvailable 22.110.792 KiB, 182.139.568.128 bytes libres, imagen local idéntica linux/amd64 y rutas/nombres previstos libres. Docker 29.1.3, build 29.1.3-0ubuntu3~24.04.2. Hashes locales de ejecutor/paquete y nueve miembros conformes; solo se transfirieron esos dos artefactos a las rutas nuevas acordadas. Los hashes remotos y SHA256SUMS también pasaron. Sin instalaciones ni descargas. La guarda confirmó versión mayor PostgreSQL 18; versión menor y versión exacta de psql no se imprimieron, por lo que no se inventan.

Se ejecutaron los comandos del bloque anterior, conservados literalmente en [lanzamiento-comandos.sh](./evidencia/t03-ejecucion-ip/lanzamiento-comandos.sh). [Preflight: comandos](./evidencia/t03-ejecucion-ip/preflight-comandos.sh) y [salida](./evidencia/t03-ejecucion-ip/preflight-remoto.log); [hashes/autorización](./evidencia/t03-ejecucion-ip/hashes-y-autorizacion.json); [transferencias](./evidencia/t03-ejecucion-ip/transferencia.json). La identidad sintética fue **20261022222839-8e0131d2**, base **gs_test_biblioteca_20261022222839_8e0131d2**. [IDs completos](./evidencia/t03-ejecucion-ip/identidad.txt).

### Resultados por caso

- **Destino e aislamiento: pasó.** La comparación corregida de IP y el resto de guardas de destino/Docker pasaron en las tres sesiones. No se flexibilizó ninguna guarda.
- **Estructura física: pasó dos veces**, marcadores GS_T03_ESTRUCTURA_OK en fases 1 y 2. Se comprobaron 23 tablas/PK, 280 columnas/tipos/nulabilidad/defaults, cinco enums, 19 FK/acciones, 61 índices no PK, dos CHECK, pg_trgm/similarity() y ausencia de GIN. catalogManufacturerRefs aparece con attnotnull=t y DEFAULT ARRAY[]::text[].
- **Rollback completo del DDL: pasó.** La fase 1 terminó con el error deliberado exacto ZX003/GS_T03_ROLLBACK_EXPECTED. La sesión nueva de fase 2 volvió a comprobar public vacío, sin tipos/extensión residuales, antes de reaplicar. El aviso 42P06/public existente es un NOTICE de CREATE SCHEMA IF NOT EXISTS, no un fallo.
- **Aplicación atómica: pasó.** SQL candidato más complemento concatenado e inspección terminaron sin error en fase 2; la sesión de datos siguiente pudo usar esas tablas. Los límites y timeouts acordados se mantuvieron.
- **Datos válidos y defaults: pasaron.** 24 inserciones sintéticas cubrieron las 23 tablas (dos categorías); siete assert_ok y el bloque de validez completaron. Se preservó la fila PENDING_PRODUCT sin crear otro Product.
- **19 FK con referencias inválidas: pasaron 19/19.** El bucle exigió 23503 y el nombre de cada constraint y comprobó tested=19 antes de continuar. Las referencias válidas también se insertaron correctamente. El JSON enlazado registra cada FK individual.
- **Doce casos negativos posteriores: pasaron.** Cuatro NULL prohibidos → 23502; lifecycle inválido → 23514; enum inválido → 22P02; SKU normalizado duplicado, precio compuesto duplicado y PK compuesta duplicada → 23505; precisión decimal → 22003; dos límites inválidos de sizeBytes → 23514. Los siete estados históricos se almacenaron y los extremos válidos 0/52.428.800 se admitieron; eso no aprueba reglas futuras de publicación.
- **Borrado RESTRICT: falló la expectativa de la prueba.** datos.sql:89 intentó borrar b1 referenciada. La BD rechazó el borrado con **23001/products_brandId_fkey**, pero expect_error exigía **23503/products_brandId_fkey** y lanzó **P0001: Error distinto**. Es el único fallo inesperado de esta repetición. No se trata de una eliminación inválida aceptada ni de un error deliberado aprobado. No se cambió esa expectativa ni se reintentó.
- **Acciones posteriores ON UPDATE CASCADE, ON DELETE SET NULL y ON DELETE CASCADE: no ejecutadas.** Sus casos están después de la línea 89. Que sus atributos físicos coincidan no sustituye esas pruebas de comportamiento.
- **ROLLBACK explícito final de fixtures, vacias.sql y reinspección final: no verificados/no ejecutados.** El error abortó la sesión antes de esos pasos. La eliminación del contenedor no cuenta como prueba de tablas vacías ni como éxito de ese rollback preparado.

Logs íntegros: [01-rollback.log](./evidencia/t03-ejecucion-ip/01-rollback.log), [02-aplicacion.log](./evidencia/t03-ejecucion-ip/02-aplicacion.log), [03-datos.log](./evidencia/t03-ejecucion-ip/03-datos.log). [Resultado detallado por caso y 19 FK](./evidencia/t03-ejecucion-ip/resultado-ejecucion.json), [salida/código](./evidencia/t03-ejecucion-ip/lanzamiento-resultado.json).

### Limpieza y alcance del cierre

El trap dejó exit=3/resultado=1 y eliminó solo los dos contenedores de esta ejecución, su red y pg.env/runner.env propios. Un cierre independiente **de solo lectura**, salida 0, confirmó ausencia de los IDs capturados y de ambos env. [Comandos de cierre](./evidencia/t03-ejecucion-ip/cierre-comandos.sh), [evidencia de limpieza](./evidencia/t03-ejecucion-ip/cierre-remoto.log). No hubo prune, limpieza general ni recursos activos propios retenidos.

Como establece el procedimiento, se retienen la carpeta privada de evidencia/payload sintéticos **/home/dev/gs-test-t03.gwRV7V**, el ejecutor **/home/dev/gs-test-t03-ejecutar-ip.sh** y el paquete **/home/dev/gs-test-t03-paquete-ip.tar.gz**. Solo se recuperaron identidad.txt, los tres logs y resultado.txt; no se accedió a archivos de contraseña. La evidencia/artefactos del primer intento se conservan.

**Producción: ninguna conexión de datos, consulta de contenedores productivos o modificación.** Se consultaron únicamente metadatos generales del host/imagen y recursos exactos de prueba. No se afirma integridad total de producción. Sin datos reales, cambios de SQL/ejecutor/modelo durante la repetición, T00, T04, commit/push o despliegue.

**Estado y siguiente paso:** la estructura candidata y el rollback DDL tienen evidencia positiva en PostgreSQL 18 aislado, pero T03 no se cierra porque la prueba integral no pasó. Esperar autorización para revisar localmente la expectativa SQLSTATE de datos.sql:89 y preparar, si procede, la corrección de esa prueba. No corregir ni repetir dentro de esta ejecución. Las tareas de construcción/integración y carga de productos siguen fuera de este alcance.

## Corrección local autorizada de RESTRICT: paquete preparado, NO ejecutado

Se confirmó el origen antes de corregir: [DDL candidato, constraint products_brandId_fkey](../../src/backend/prisma/biblioteca-candidata/migrations/20261022000000_t03_initial_candidate/migration.sql) define products.brandId → brands.id, **ON DELETE RESTRICT ON UPDATE CASCADE** (línea 619). La inspección física del segundo intento imprime esa misma definición. El [error registrado](./evidencia/t03-ejecucion-ip/03-datos.log), línea 141, devuelve **23001/products_brandId_fkey** al DELETE de b1, antes de que expect_error eleve P0001 por esperar 23503.

PostgreSQL 18 distingue **23001/restrict_violation** de **23503/foreign_key_violation**. Su implementación emite el primero al rechazar RESTRICT y adjunta el nombre de la FK; asignar una referencia hija inexistente utiliza el segundo. Fuentes primarias: [códigos PostgreSQL 18](https://www.postgresql.org/docs/18/errcodes-appendix.html), [ri_ReportViolation, rama PostgreSQL 18](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ri_triggers.c#L2593-L2633).

[Diff mínimo completo](./evidencia/t03-correccion-restrict.patch) · [Manifiesto y evidencia estática del paquete corregido](./evidencia/t03-correccion-restrict.json).

Cambios limitados a **datos.sql**:

- El DELETE de marca exige exclusivamente **23001 y products_brandId_fkey**; no se acepta la clase 23 genérica ni una lista de códigos alternativos. El helper compara código y nombre mediante IS DISTINCT FROM, rechazando también un diagnóstico NULL inesperado.
- Inmediatamente después exige que exista b1 y que p1 siga existiendo con brandId=b1. Es una comprobación preparada, **no una permanencia observada aún en PostgreSQL**.
- ON UPDATE CASCADE exige la marca renombrada, ausencia del ID antiguo y el producto existente enlazado al nuevo ID. SET NULL exige revisión borrada y producto existente con referencia NULL. DELETE CASCADE exige ausencia de grupo e ítem. Las consultas EXISTS evitan que una fila desaparecida convierta la aserción en cero llamadas.
- Revisión restante: hay cinco FK físicas ON DELETE RESTRICT; la única expectativa de DELETE RESTRICT de estos fixtures era la corregida. El bucle de las 19 FK inválidas permanece en **23503 más su nombre exacto**, porque modifica referencias hijas hacia padres inexistentes; no prueba eliminar padres. CASCADE y SET NULL siguen siendo casos de éxito con efectos concretos, sin capturar errores como aprobación. No se agregaron casos ajenos a estas acciones ni se cambiaron FK o reglas de negocio.
- Se mantienen BEGIN/ROLLBACK de fixtures, el marcador GS_T03_FIXTURES_REVERTIDOS_OK, vacias.sql para las 23 tablas y la reinspección final del ejecutor. Los casos pendientes se ejecutarán dentro del próximo ensayo completo, no como un atajo aislado.

Paquete nuevo separado: `src/backend/prisma/biblioteca-candidata/generated/prueba-t03-corregida-restrict.tar.gz`.

- **Paquete SHA-256: `dce033a7a39a83311c4cb39313686db49ec6c8775e34fa6b82757ad0a09596e7`**.
- Ejecutor idéntico: `f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e`.
- datos.sql: `5f12e6b2a411e58f312aa17f48f959858109f0968df6a8d4625130ffd13141b3`.
- SHA256SUMS interno: `8f06c834ffd4f68619d57d68e93c6bd2d7ccc58121a40cd7e534d867513be8bc`.

El manifiesto enlazado contiene los nueve hashes completos. Preparación local con preparar.js, sin SQL: se comprobó tipo regular/nombres de los nueve miembros, sus hashes y cada entrada de SHA256SUMS. **Solo datos.sql y SHA256SUMS difieren del paquete de IP corregida**. Se preservaron los dos paquetes anteriores, su evidencia y sus manifiestos; esquema, DDL/complemento, destino.sql corregido y ejecutor conservan sus hashes. No se accedió a la VPS ni se ejecutaron SQL/Docker, instalaciones o T04 en esta corrección.

### Único nuevo intento completo propuesto: requiere autorización

Reutilizar el mismo aislamiento gs-test-pg/gs-test-runner/gs-test-net, imagen local, límites, guardas, tres fases y política de parada/limpieza. Antes de transferir: confirmar vigencia del aviso de seguridad, acceso existente, recursos, imagen y nombres/rutas libres. No reutilizar contenedores o red ni sobrescribir evidencia. Transferir únicamente el ejecutor idéntico a **/home/dev/gs-test-t03-ejecutar-restrict.sh** y este paquete a **/home/dev/gs-test-t03-paquete-restrict.tar.gz**, después de comprobar que ambas rutas no existan.

Comandos remotos propuestos, **no ejecutados**:

```bash
set -eu
cd /home/dev
printf '%s  %s\n' 'f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e' 'gs-test-t03-ejecutar-restrict.sh' | sha256sum -c -
printf '%s  %s\n' 'dce033a7a39a83311c4cb39313686db49ec6c8775e34fa6b82757ad0a09596e7' 'gs-test-t03-paquete-restrict.tar.gz' | sha256sum -c -
timeout --signal=TERM --kill-after=30s 600 \
  bash ./gs-test-t03-ejecutar-restrict.sh ./gs-test-t03-paquete-restrict.tar.gz \
  dce033a7a39a83311c4cb39313686db49ec6c8775e34fa6b82757ad0a09596e7
```

Se propone **una sola ejecución completa**: rollback DDL deliberado y esquema vacío → aplicación atómica/inspección → fixtures válidos e inválidos, 19 FK, RESTRICT y permanencia de marca/producto, CASCADE/SET NULL pendientes, ROLLBACK explícito, comprobación de 23 tablas vacías y reinspección final. Ante un nuevo error inesperado: detener, conservar evidencia y limpiar solo recursos propios; sin correcciones ni repeticiones automáticas.

**T03 conserva los resultados positivos previos de estructura PostgreSQL 18 y sigue sin aceptación integral.** El nuevo paquete solo está preparado estáticamente. Pendiente autorización explícita sobre el hash anterior y estos comandos; sin cambios productivos, datos reales, T00, T04, commit/push o despliegue.

## Cierre de T03: ensayo completo aprobado

Ventana de seguridad confirmada por el usuario: «Sí, cubre esta ventana de pruebas aisladas». Se verificaron de nuevo script/paquete, nueve miembros, imagen local idéntica, recursos y nombres/rutas libres. Paquete dce033a7a39a83311c4cb39313686db49ec6c8775e34fa6b82757ad0a09596e7 y ejecutor f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e. Se usaron los comandos preparados, una vez, sin modificar sus bytes.

**Resultado: salida 0 y GS_T03_PRUEBA_OK.** Pasaron estructura física, manufacturerRefs NOT NULL/default, CHECK/enums, unicidad normalizada, precisión, 19 FK válidas e inválidas, RESTRICT/23001 con FK exacta y marca/producto conservados, ON UPDATE CASCADE, ON DELETE SET NULL/CASCADE, rollback completo DDL, aplicación atómica, ROLLBACK explícito de fixtures, 23 tablas vacías y reinspección final. Los tres marcadores GS_T03_FIXTURES_REVERTIDOS_OK / GS_T03_DATOS_REVERTIDOS_OK / GS_T03_ESTRUCTURA_OK aparecen al final de la fase 3. Único error SQL visible: ZX003 deliberado en fase 1, correctamente identificado; ningún error inesperado.

[Resultado por caso e identidad](./evidencia/t03-ejecucion-restrict/resultado-ejecucion.json) · [log rollback](./evidencia/t03-ejecucion-restrict/01-rollback.log) · [aplicación](./evidencia/t03-ejecucion-restrict/02-aplicacion.log) · [datos y tablas vacías](./evidencia/t03-ejecucion-restrict/03-datos.log) · [comandos ejecutados](./evidencia/t03-ejecucion-restrict/lanzamiento-comandos.sh) · [hashes de evidencia](./evidencia/t03-ejecucion-restrict/SHA256SUMS-evidencia.txt).

El trap terminó con exit=0/resultado=0. Cierre independiente de solo lectura confirmó ausencia de los dos contenedores, red y env de esta ejecución: [comandos](./evidencia/t03-ejecucion-restrict/cierre-comandos.sh), [resultado de limpieza](./evidencia/t03-ejecucion-restrict/cierre-remoto.log). Se conservan solo evidencia/payload privados en /home/dev/gs-test-t03.0rQ4DL y los dos artefactos transferidos, como dispone el procedimiento; no hubo prune ni borrados ajenos. Evidencia anterior intacta. Ninguna conexión, inspección de contenedores o modificación productiva; sin datos reales, instalaciones, commit/push o despliegue.

**Límite:** los 23 modelos son base de transición. T04/T05 y demás integración/desarrollo siguen tareas propias bajo el mandato de continuidad; no hay migración de productos reales ni biblioteca terminada. Los documentos/manifiestos de preparación anteriores son cortes históricos y sus hashes no se reescriben para ocultar fallos.
