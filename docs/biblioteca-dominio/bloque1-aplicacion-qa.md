# Bloque 1: procedimiento para aplicar en QA

Estado: **aplicado en QA el 29/10/2026**, con la aprobación específica del usuario. Respaldo previo: `/home/dev/backups/gs_api_copy_pre_bloque1_20261029.dump` (12.486.263 bytes, sha256 `39b8222c3d7beaf924845bf542d5ab5ba44d1c316493fa3b8081e53ae2d977fd`). La verificación coincidió con lo esperado: 66 subcategorías, 1.538 productos con subcategoría, el demo sin subcategoría, ninguna asignación inconsistente, las 3 migraciones registradas y la aplicación sana y sin reinicios.

## 1. Destino

| Dato | Valor (comprobado en solo lectura el 29/10/2026) |
|---|---|
| Servidor | `dev@57.131.50.38` |
| Contenedor | `gs-test-demo-ops-db` (PostgreSQL 18.6) |
| Base | `gs_api_copy` (39 MB) |
| Esquema SQL | `public` |
| Rol que aplica | El administrador del clúster, el mismo con el que se conecta la aplicación: superusuario, `BYPASSRLS` y dueño de `products` y `categories` |
| Aplicación conectada | `gs-test-demo-api` (Prisma 6.19.3, `LIBRARY_DATABASE_MODE=legacy`). Arranca con `node dist/src/main.js` y no aplica migraciones por su cuenta |

Producción (`gs-db` / `grupo_security`) y la Biblioteca dedicada (`gs_test_biblioteca_dev`) no se tocan.

## 2. Migraciones y cambios de datos

Se aplican en este orden. Cada una corre en una sola transacción, junto con su registro en `_prisma_migrations`.

| Migración | Estructura | Datos | Suma de verificación (archivo con fin de línea LF) |
|---|---|---|---|
| `20261029150000_library_subcategories` | Tabla `subcategories`; columna opcional `products.subcategoryId` con índice y relación `RESTRICT` | Crea 66 subcategorías, una por cada categoría hija. Asigna subcategoría a los 1.538 productos que están en categorías hijas. El demo queda sin subcategoría porque está en una categoría principal | `622933dbe9bc0162ad38d10aa46e386ac97626de51d91f997175f8eb665cf921` |
| `20261029150100_library_spec_dictionary` | 3 enumeraciones y 5 tablas: `spec_definitions`, `spec_options`, `subcategory_specs`, `product_spec_values`, `product_spec_value_options` | Ninguno: las tablas quedan vacías | `3282768f9d080a534c83adb6e6536c91a8ca54f6ded9d6cd8509bac4b450b1b6` |
| `20261029150200_library_product_sources` | Tabla `product_sources` | Ninguno: la tabla queda vacía | `70b057c7cb375da53f8aa140d9d98b925485371f0ed1cc2ffaf5dde21474fe5d` |

Qué **no** cambia:
- No se modifican `categories`, `products.categoryId`, `products.updatedAt` ni `product_changes`.
- No se borra nada.
- No se aplica ni se registra `20261028120000_product_internal_notes`, que ya falta en el historial de QA. Esa diferencia existía antes de este bloque.

Protecciones de M1. La migración se detiene **sin dejar ningún cambio** si ocurre cualquiera de estas condiciones:
- la seguridad por filas (RLS) le oculta filas al rol que la ejecuta;
- hay categorías con más de 2 niveles;
- la cantidad de productos con subcategoría no coincide con la de productos en categorías hijas;
- algún producto queda con una subcategoría distinta de la que corresponde a su categoría.

## 3. Compatibilidad con la aplicación desplegada

La prueba local usó la misma versión de Prisma (6.19.3) y el cliente generado de `validacion-biblioteca`, que es el esquema de la aplicación de QA.

| Comportamiento | Resultado |
|---|---|
| Leer productos con categoría y marca; crear un producto; cambiarlo de categoría; crear y borrar categorías | Funciona sin cambios |
| `prisma migrate deploy` desde una carpeta que no trae estas 3 migraciones | Termina bien con "No pending migrations"; no las revierte |
| Producto creado después de aplicar | Queda sin subcategoría. Se completa volviendo a ejecutar el relleno de M1 |
| Producto movido a otra categoría después de aplicar | Conserva la subcategoría anterior. Se detecta con `legacyCategoryId` |
| Borrar una categoría principal que todavía tiene subcategorías | **Lo rechaza la base de datos** (`RESTRICT`); la aplicación mostrará un error |

No hace falta reiniciar la aplicación. `ALTER TABLE products` toma un bloqueo exclusivo breve: la tabla tiene 1.539 filas, así que dura milisegundos.

## 4. Respaldo, aplicación y recuperación

Los comandos se ejecutan desde la PC, con la llave SSH ya existente. Las migraciones viajan por la entrada estándar: no se copian archivos de migración al VPS. Ningún comando imprime contraseñas.

**Paso 0. Comprobación previa (solo lectura).**
- La base es `gs_api_copy` y el rol es administrador.
- `_prisma_migrations` no tiene ninguna de las 3 migraciones.
- Hay 66 categorías hijas, 1.538 productos en ellas y ninguna categoría con un tercer nivel.

**Paso 1. Respaldo (escritura en el VPS: crea un archivo).**

```bash
ssh dev@57.131.50.38 'docker exec gs-test-demo-ops-db sh -c "pg_dump -Fc -U \"\$POSTGRES_USER\" -d gs_api_copy" > /home/dev/backups/gs_api_copy_pre_bloque1_20261029.dump && sha256sum /home/dev/backups/gs_api_copy_pre_bloque1_20261029.dump && docker exec -i gs-test-demo-ops-db pg_restore --list < /home/dev/backups/gs_api_copy_pre_bloque1_20261029.dump | grep -c "TABLE DATA"'
```

El disco tiene 163 GB libres.

**Paso 2. Aplicar (escritura en la base de QA).** Para cada migración, en orden, se envía el paquete `<migración>.apply.sql`, que contiene la migración más su registro en `_prisma_migrations`:

```bash
ssh dev@57.131.50.38 "docker exec -i gs-test-demo-ops-db sh -c 'psql -X -v ON_ERROR_STOP=1 --single-transaction -U \"\$POSTGRES_USER\" -d gs_api_copy'" < 20261029150000_library_subcategories.apply.sql
```

Si una migración falla, se detiene todo y no se aplican las siguientes.

**Paso 3. Verificar (solo lectura).**
- Hay 66 subcategorías.
- Hay 1.538 productos con subcategoría y ninguno con una subcategoría distinta de la que le corresponde.
- Existen las 7 tablas.
- `_prisma_migrations` tiene 3 filas nuevas con las sumas de la tabla anterior.
- `gs-test-demo-api` sigue en estado `healthy`.

**Recuperación A: revertir (probada en local).** Se envían en una sola transacción los archivos `migration.down.sql` de M4, M3 y M1, en ese orden, y se borran sus 3 filas de `_prisma_migrations`. En la prueba local esto devolvió el esquema y los datos exactamente al estado anterior.

**Recuperación B: último recurso.** Restaurar el respaldo del paso 1 con `pg_restore --clean --if-exists`. Exige detener `gs-test-demo-api` mientras dura y descarta cualquier cambio posterior al respaldo. Necesita una aprobación aparte.

## 5. Pruebas locales

Se hicieron sobre una base desechable en `127.0.0.1:55432`: el esquema de QA sin datos, más el historial de sus 56 migraciones, más datos sintéticos.

| Prueba | Resultado |
|---|---|
| Arnés `src/backend/prisma/migration-tests/library-block1/run.sh` (Prisma 6.19.3) | **113 aprobadas, 0 fallidas**. Cubre restricciones y tipos, opciones permitidas, unicidad, procedencia, cascadas, relleno repetible, cliente anterior, ida y vuelta con las migraciones de reversión, y protecciones que abortan sin dejar cambios |
| Ensayo del paso 2 con `psql` (el mismo paquete que se enviaría a QA) | Las 3 se aplican. Prisma informa "Database schema is up to date" y "No pending migrations" |
| Protección contra RLS (rol dueño con `FORCE ROW LEVEL SECURITY`) | Aborta y no deja la columna creada |
| Dominio `key-specs` (jest) y TypeScript estricto | 95/95 pruebas; `tsc` sin errores |
| Revisión Gentle AI, parte 1 (esquema, migraciones y este documento base) | **Aprobada** y reconocida. Tres observaciones informativas: ver la sección 6 |
| Revisión Gentle AI, parte 2 (arnés y correcciones del dominio) | Sin terminar: ver el documento de tareas |

## 6. Observaciones de la revisión para después

Ninguna bloquea la aplicación.
- Volver a ejecutar el relleno puede fallar si alguien crea a mano una subcategoría con el mismo `slug` que una categoría hija nueva.
- Un texto de dato clave de más de unos 2,7 kB choca con el índice de `valueText`. El dominio ya rechaza textos largos con `text_too_long`, pero la base no tiene ese tope.
- La revisión de la parte 1 no tenía a la vista las pruebas de las protecciones, porque están en la parte 2.
