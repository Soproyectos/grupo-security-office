# T03 corregida y preparada para prueba en PostgreSQL 18

**Estado: preparado para prueba, no validado en PostgreSQL.** Autorización del usuario del 22/10/2026: recuperar NOT NULL/default, excluir tres GIN y preparar guardas/prueba mínima, sin ejecutar SQL, Docker o SSH. No hubo instalaciones, cambios productivos, commit/push ni T04. Rama `Esnaider/nifty-robinson-8a8974`, HEAD `cb230aa6fa206f142d4cdf8caf7a6a11fe3ebf00`.

## Correcciones concretas

[Diff respecto al candidato recibido](./evidencia/t03-correcciones.patch): complemento, SQL concatenado, comprobador estático y tsconfig del candidato. El diff no incluye los archivos nuevos de prueba, que se revisan directamente en la carpeta indicada abajo. El esquema Prisma permanece idéntico.

- Se añade `ALTER TABLE "products" ALTER COLUMN "catalogManufacturerRefs" SET NOT NULL;`, conforme a `20261017150000:10`. Se conserva `DEFAULT ARRAY[]::TEXT[]` del CREATE TABLE. La comprobación estática exige ambos; la prueba futura consulta `pg_attribute.attnotnull`/`pg_attrdef` y exige rechazo SQLSTATE 23502 para NULL.
- Se excluyen `product_name_gin`, `product_sku_gin`, `product_desc_gin`, retirados en `20260908172738`. Su evaluación queda como optimización futura condicionada a consultas y mediciones; no es requisito ni aprobación implícita de T03. `pg_trgm` permanece para `similarity()`.
- Product conserva todas sus restricciones actuales; la preparación sin rellenos sigue pendiente de T11/T13. No se implementó staging ni se añadieron tablas funcionales. Los siete estados históricos siguen por compatibilidad, sin aprobar reglas futuras de publicación.
- No se tocaron T00, el esquema productivo, PrismaService, CI, lockfile ni migraciones históricas. Proveedores/referencias, costos, faltantes, evidencia, archivos, eventos e historial siguen en T07/T08/T11/T13 y decisiones abiertas; los 23 modelos son una base de transición.

## Artefactos y huellas SHA-256 completas

- [Esquema](../../src/backend/prisma/biblioteca-candidata/schema.prisma): `5f6bc6835e7d775929006b3da7a85b46cd1cb2d5ab06ec63bbeaae3dccd396a4`.
- [SQL candidato completo](../../src/backend/prisma/biblioteca-candidata/migrations/20261022000000_t03_initial_candidate/migration.sql): `c6b6c38425bfd3321f8610d3311fe3a7a08a7c748ef172df047d63f2e37ea36b`.
- [Complemento histórico](../../src/backend/prisma/biblioteca-candidata/complemento-historico.sql): `43541773a8f0d51d33a8d97774114a300a83022ce7c2954e257cf1611c0e70e2`.
- [Ejecutor aislado](../../src/backend/prisma/biblioteca-candidata/prueba-postgresql18/ejecutar-aislado.sh): `f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e`.
- Paquete local `src/backend/prisma/biblioteca-candidata/generated/prueba-t03.tar.gz`: `b00fc5d08dcf0487d8a0f42c063c901b378d11cf64095d97ed2404b03c59a37b`. Está ignorado por Git; se regenera determinísticamente desde fuentes versionables.

[Manifiesto regenerado](./evidencia/t03-prueba-preparada.json): hashes de los nueve miembros del paquete, script, SQL y complemento. [Comparación estática regenerada](./evidencia/t03-comparacion.json). [Protección de archivos recibidos](./evidencia/t03-correccion-proteccion.json). Los informes/JSON de revisión anteriores son cortes históricos, no se sobrescriben para ocultar el defecto encontrado.

Fuentes nuevas en [`prueba-postgresql18/`](../../src/backend/prisma/biblioteca-candidata/prueba-postgresql18/): `preparar.js`, `ejecutar-aislado.sh`, `destino.sql`, `vacio.sql`, `estructura.sql`, `datos.sql`, `fallo.sql`, `vacias.sql`. `preparar.js` produce el contrato de 280 columnas, cinco enums, PK/FK/índices y el paquete USTAR determinista. Solo escribe archivos; no conecta ni ejecuta SQL.

## Aislamiento reutilizado y guardas reales preparadas

Referencia ya existente: `C:\Users\sopor\traspaso-codex-biblioteca\candidata\plan-prueba-temporal-vps.md`. No se modifican su script, paquete ni hashes T00. Se reutilizan nombres `gs-test-net`, `gs-test-pg`, `gs-test-runner`, red interna, PostgreSQL `postgres:18-alpine` ya instalado, datos tmpfs `/var/lib/postgresql`, límites de CPU/RAM, ausencia de puertos y etiqueta de ejecución. **No se crea otro entorno ni se usa la BD operativa como aislamiento.**

El payload T03 usa `psql` de la misma imagen PostgreSQL ya presente para el ejecutor, en lugar de API/Prisma/Jest de T00. Son los mismos dos papeles de contenedor y la misma red; no se inicia otra API. Sin descargas ni instalaciones: si faltan imagen/herramientas se detiene. El runner corre como `postgres`, sin capacidades añadidas; PostgreSQL conserva las cinco capacidades de arranque del plan. Ambos tienen tmpfs en el punto declarado VOLUME por la imagen, sin volúmenes persistentes.

Guardas implementadas, aún no verificadas contra Docker/servidor reales:

1. Usuario `dev`, sin sudo; rechazo de nombres gs-test ocupados. Imagen fijada por su ID local y `--pull never`; paquete y miembros verificados antes de crear recursos. No hay inventario/inspect de contenedores ni datos productivos.
2. Registrar IDs devueltos por las creaciones. Antes de cada sesión SQL se contrastan ID, nombre exacto, etiquetas run/propósito, imagen, red única interna con exactamente dos miembros, ausencia de puertos, privilegios y bind/volume, tmpfs exacto y PGDATA bajo él. La verificación admite únicamente el tmpfs previsto si aparece en `.Mounts`, corrigiendo la contradicción del chequeo antiguo sin alterar T00.
3. Sin URL arbitraria recibida del usuario: host fijo `gs-test-pg`, puerto 5432, base `gs_test_biblioteca_<fecha>_<nonce>` creada en ese servidor nuevo. `destino.sql` contrasta identidad del servidor: IP inspeccionada, versión 18, base real, usuario/sesión, cluster_name único fijado al arrancar y data_directory esperado. No basta el nombre de una variable.
4. `vacio.sql` exige public existente pero sin objetos dependientes, sin otras extensiones que plpgsql ni otros esquemas de usuario. Se ejecuta antes del DDL, en la misma sesión/transacción. `search_path=public, pg_catalog`; timeouts de sentencia/bloqueo y `psql -X -w ON_ERROR_STOP=1`.
5. `migration.sql` **ya incluye el complemento**: no se ejecuta por segunda vez. Aplicación más inspección con `--single-transaction`. No hay CREATE INDEX CONCURRENTLY, VACUUM, CREATE/DROP DATABASE ni controles de transacción dentro de esos 114 comandos candidatos. La lista estática acepta solo CREATE SCHEMA/TYPE/TABLE/INDEX/EXTENSION, ALTER TABLE concretos y COMMENT.

Los índices normales admiten bloque transaccional; los concurrentes no. Los scripts de instalación de extensiones tampoco pueden contener control de transacciones ni comandos incompatibles con un bloque. La semántica de `psql --single-transaction` con ON_ERROR_STOP se consultó en documentación oficial; el ensayo comprobará el rollback real, no se presume por estas referencias. Fuentes: [CREATE INDEX, PostgreSQL 18](https://www.postgresql.org/docs/18/sql-createindex.html), [extensiones, PostgreSQL 18](https://www.postgresql.org/docs/18/extend-extensions.html), [psql, PostgreSQL 18](https://www.postgresql.org/docs/18/app-psql.html).

## Procedimiento exacto futuro — NO EJECUTADO

**Requiere autorización separada sobre los hashes de script y paquete anteriores**, acceso/transferencia por el ejecutor acordado y aviso Netdata si corresponde al procedimiento existente. No se solicitó acceso ni se transfirió nada en esta tarea.

Tras esa autorización, transferir el script como `/home/dev/gs-test-t03-ejecutar.sh` y el paquete como `/home/dev/gs-test-t03-paquete.tar.gz`. Conservar bytes LF/UTF-8; no editar ni regenerar en el destino. Como `dev` en el host autorizado, los únicos comandos de lanzamiento propuestos son:

```bash
cd /home/dev
printf '%s  %s\n' 'f0fbfaa20c6791cfc649cd38f189e981638db8c7979a7f787ae02a608f23717e' 'gs-test-t03-ejecutar.sh' | sha256sum -c -
printf '%s  %s\n' 'b00fc5d08dcf0487d8a0f42c063c901b378d11cf64095d97ed2404b03c59a37b' 'gs-test-t03-paquete.tar.gz' | sha256sum -c -
timeout --signal=TERM --kill-after=30s 600 \
  bash ./gs-test-t03-ejecutar.sh ./gs-test-t03-paquete.tar.gz \
  b00fc5d08dcf0487d8a0f42c063c901b378d11cf64095d97ed2404b03c59a37b
```

Estos comandos **modifican estado desechable** al lanzar el script: dos contenedores, una red, una base creada por initdb del contenedor y una carpeta privada de evidencia. No son comandos de solo lectura ni están autorizados para ejecutar en esta entrega. Tope global 600 s, hasta 60 s de arranque y 120 s por fase psql; límites simultáneos 2 CPU/2 GiB, almacenamiento PG tmpfs 512 MiB y tmpfs del ejecutor 16 MiB.

El script ejecutaría exactamente tres fases, sobre los recursos que acaba de identificar:

1. **Rollback completo del DDL:** `psql --single-transaction` con destino → vacío → SQL candidato → inspección física → fallo deliberado. Se exige código psql 3 **y** SQLSTATE ZX003/mensaje exacto `GS_T03_ROLLBACK_EXPECTED`; otro error no cuenta como éxito.
2. **Aplicación atómica exitosa:** sesión nueva; repetir destino/vacío comprueba que el fallo anterior no dejó tablas, tipos ni extensión. Aplicar SQL concatenado e inspección dentro de una transacción; solo confirma al finalizar sin errores.
3. **Casos de datos:** destino → contrato → fixtures dentro de BEGIN/ROLLBACK → comprobar las 23 tablas vacías → repetir inspección. Errores esperados usan subtransacciones y SQLSTATE/constraint concretos; un dato inválido aceptado aborta. Cualquier error inesperado provoca salida no cero y limpieza.

`resultado=0` y `GS_T03_PRUEBA_OK` solo se emitirían al superar todas las fases. No sustituye las pruebas de integración NestJS, Linux con clientes Prisma, copia/restauración ni publicación.

## Casos preparados, ninguno ejecutado

- **Estructura:** 23 tablas/PK, 280 columnas con tipos/nulabilidad/defaults, cinco enums con orden y valores, 19 FK/acciones, 61 índices no PK (19 únicos y 42 ordinarios), dos CHECK con expresiones verificadas, extensión `pg_trgm` y `similarity()`, ausencia de GIN. NOT NULL real y default de manufacturerRefs se imprimen desde catálogo.
- **Datos válidos:** fixtures sintéticos en las 23 tablas, incluyendo ciclo Product/ProductRevision insertado en orden; default array vacío, COP, DRAFT/inactivo, GUARDADA, QUEUED y PENDING. Actores externos sin tabla User. Una fila de revisión PENDING_PRODUCT/productId NULL no crea otro Product; no implementa staging general.
- **Inválidos:** NULL en manufacturerRefs, nombre, marca y categoría → 23502; lifecycle fuera de siete estados → 23514; enum inválido → 22P02; SKU distinto solo por espacios/mayúsculas → 23505; precio duplicado por producto/tarifa y PK compuesta duplicada → 23505; decimal fuera de precisión → 22003.
- **CHECK y compatibilidad:** los siete estados históricos se pueden almacenar sin convertirlos en reglas de publicación. sizeBytes acepta 0 y 52.428.800 y rechaza −1/52.428.801. No se agrega un CHECK nuevo de precio positivo ni otras decisiones de negocio.
- **FK:** las 19 se usan con referencias válidas y cada una se intenta violar con un ID inexistente, esperando su nombre y 23503; acciones representativas RESTRICT, ON UPDATE CASCADE, ON DELETE CASCADE y SET NULL.
- **Rollback:** el fallo posterior a todo el DDL debe dejar public vacío y sin pg_trgm; los fixtures y funciones pg_temp se revierten al final y las 23 tablas quedan sin filas.

## Limpieza, evidencia y límites

El trap conserva el código de salida. Solo elimina contenedores por IDs capturados que siguen coincidiendo con nombre y etiquetas run/propósito, y la red propia por ID/etiquetas; nunca prune, wildcard de recursos ni limpieza de terceros. No usa volúmenes persistentes. Borra únicamente los dos env de contraseña de la carpeta propia; conserva identidad y logs sintéticos privados en `/home/dev/gs-test-t03.XXXXXX`. No imprime contraseñas ni inspecciona Config.Env completo. Una terminación forzada que impida el trap se informa como posible limpieza pendiente: no se promete limpieza si se mata el proceso con SIGKILL.

**Comprobado aquí:** Prisma validate y comparador corregido; tsc candidato (incluye preparar.js) y backend; lint sin errores/seis advertencias previas; `node --check`, `bash -n`; lista de comandos candidatos; tar leído por la herramienta instalada, nueve miembros/hash verificados; regeneración del paquete byte idéntica. `git diff --check`, enlaces y huellas protegidas revisados al entregar.

**No comprobado:** parseo/ejecución de los SQL por PostgreSQL, comportamiento real de Docker, guardas, tmpfs, rollback, datos o catálogos. El inspector incluye canonicalización de CHECK para PostgreSQL 18 que debe confirmarse en ese ensayo; si difiere, falla y no se flexibiliza automáticamente. No se instaló nada ni se ejecutó SQL/Docker/SSH.

Regeneración local permitida de archivos, desde la raíz (sin BD): `node src/backend/prisma/biblioteca-candidata/ejecutar-local.js sql`, luego `node src/backend/prisma/biblioteca-candidata/comprobar-candidato.js` y `node src/backend/prisma/biblioteca-candidata/prueba-postgresql18/preparar.js`. Si cambia un byte del paquete o script, actualizar evidencia y autorizar sus nuevos hashes antes de ejecutar.

**Siguiente paso:** esperar autorización separada de ejecución. T04 y las decisiones funcionales pendientes siguen fuera de esta tarea.
