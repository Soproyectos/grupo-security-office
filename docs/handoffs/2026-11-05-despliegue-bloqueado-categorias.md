# Despliegue bloqueado por jerarquía de categorías

Estado: inventario de solo lectura completado con el SSH autorizado; propuesta de catálogo vacío preparada, sin escrituras productivas.

## Hechos verificados

El usuario confirmó que fusionó el PR #90. El merge `96670843` pasó CI y construyó ambas imágenes. El [CD 42076282618](https://github.com/Soproyectos/grupo-security-office/actions/runs/42076282618) verificó un respaldo previo de 12.673.764 bytes y aplicó `20261028120000_product_internal_notes`. Después, `20261029150000_library_subcategories` falló con P3018/P0001: 29 categorías tienen profundidad mayor que dos.

El guard de esa migración se ejecuta antes del primer DDL y del backfill. Según el log, no se aplicó la transformación de categorías/subcategorías, las migraciones posteriores no se ejecutaron y el script no reemplazó API/frontend. El smoke test quedó omitido. Una comprobación HTTP pública posterior obtuvo 200 tanto en `/api/health` como en `/tienda`; eso acredita disponibilidad, no publicación de la versión nueva.

El respaldo del intento es `20261105T174312Z-96670843.dump`. No se leyó ni restauró su contenido. Después, el usuario proporcionó el destino SSH y autorizó buscar su clave en la carpeta SSH; el alias existente `vps` permitió ejecutar el inventario de solo lectura. No se leyó el contenido de la clave ni se cambiaron credenciales.

## Inventario ejecutado, solo lectura

Las consultas siguientes obtuvieron el árbol de categorías, conteos agregados de productos y el estado técnico de las seis migraciones del despliegue. No devuelven productos individuales, precios, usuarios ni clientes. Se ejecutaron dentro de una transacción de solo lectura, con límites de espera y `ROLLBACK`.

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '5s';

WITH RECURSIVE product_counts AS (
  SELECT "categoryId", count(*) AS product_count
  FROM "products"
  GROUP BY "categoryId"
), ancestry AS (
  SELECT c.id AS start_id, c.id AS node_id, c."parentId" AS parent_id,
         1::int AS depth, ARRAY[c.id]::text[] AS path, false AS cycle
  FROM "categories" c
  UNION ALL
  SELECT a.start_id, p.id, p."parentId", a.depth + 1,
         a.path || p.id, p.id = ANY(a.path)
  FROM ancestry a
  JOIN "categories" p ON p.id = a.parent_id
  WHERE a.parent_id IS NOT NULL AND NOT a.cycle
), terminal AS (
  SELECT DISTINCT ON (start_id) start_id, depth, cycle, path, parent_id
  FROM ancestry
  ORDER BY start_id, cycle DESC, depth DESC
)
SELECT c.id, c.name, c.slug, c."parentId",
       p.name AS parent_name, p.slug AS parent_slug,
       t.depth, t.cycle, t.path,
       (t.parent_id IS NOT NULL AND NOT t.cycle) AS broken_parent_chain,
       coalesce(pc.product_count, 0) AS product_count
FROM "categories" c
JOIN terminal t ON t.start_id = c.id
LEFT JOIN "categories" p ON p.id = c."parentId"
LEFT JOIN product_counts pc ON pc."categoryId" = c.id
ORDER BY t.cycle DESC, t.depth DESC, c.slug, c.id;

SELECT migration_name, started_at, finished_at, rolled_back_at,
       applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20261028120000_product_internal_notes',
  '20261029150000_library_subcategories',
  '20261029150100_library_spec_dictionary',
  '20261029150200_library_product_sources',
  '20261029150300_library_spec_value_state',
  '20261029150400_library_classification_optional'
)
ORDER BY started_at, migration_name;

ROLLBACK;
```

Se usó `psql -X -q -v ON_ERROR_STOP=1 --csv` mediante `docker exec` sobre el contenedor DB existente, sin crear contenedores. El inventario real permanece fuera de Git. Resultado: 89 categorías (37 raíces, 23 de segundo nivel, 29 de tercer nivel), cero ciclos, 5.056 productos, 2.335 precios y cuatro usuarios. Notas internas figura aplicada; subcategorías figura fallida sin pasos aplicados y las cuatro posteriores no figuran aplicadas.

Otras comprobaciones de solo lectura: un único Super Admin activo, sin supervisor, con MFA habilitado y diez filas de códigos de respaldo; seis roles y 88 permisos de rol. Solo se obtuvieron conteos y booleanos: no nombres de usuario, correos, contraseñas, secretos MFA ni códigos. API y respaldo apuntan a la misma base (`true`); hay aproximadamente 152 GiB libres y la base actual ocupa unos 43,5 MB. Estos valores son una instantánea, deben verificarse otra vez antes del cambio.

## Decisiones y recuperación pendientes

El usuario aclaró expresamente: **«Dejar el catálogo vacío y conservar estructura y Super Admin»**. El objetivo sustituye la propuesta anterior de aplanar las categorías conservando el catálogo actual. La estructura comercial confirmada es de nueve categorías y 66 subcategorías; se extrajo únicamente la hoja `Categorias` del maestro revisado, sin sus productos ni precios.

La [propuesta de cambio reversible](2026-11-05-catalogo-vacio-vps.md) prepara una base completa nueva en el mismo PostgreSQL existente y conserva íntegra la anterior como archivo de recuperación. El nuevo esquema seguiría en modo `legacy`, con una sola base activa para la aplicación. No se implementa la arquitectura de biblioteca dedicada. La creación, migraciones, transferencia de autenticación y corte siguen pendientes de aprobación explícita.

El intento P3018 permanece intacto en la base anterior. En una base nueva se ejecutaría la historia de migraciones desde cero, sin trasladar `_prisma_migrations` del origen y sin `migrate resolve`. Si se abandonara esta opción y se recuperara la base anterior, haría falta un plan diferente aprobado para sus datos y su intento fallido.

No editar la migración histórica ni marcarla como `applied`: su estructura y backfill todavía faltan. No retirar el guard para forzar el deploy; el modelo nuevo no representa un tercer nivel y el backfill solo contempla hijas directas de raíces.

## Corrección independiente de recuperación

El [PR #91](https://github.com/Soproyectos/grupo-security-office/pull/91) contiene la salvaguarda que detiene el API y comprueba compatibilidad antes de volver a imágenes anteriores. Esa corrección tiene nueve escenarios locales aprobados y revisión nativa acotada aprobada. No reorganiza las categorías ni resuelve por sí sola el estado P3018; permanece separada de cualquier escritura de datos productivos.
