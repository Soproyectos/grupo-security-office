# Despliegue bloqueado por jerarquía de categorías

Estado: diagnóstico local preparado; inventario productivo y cambios de datos pendientes de autorización.

## Hechos verificados

El usuario confirmó que fusionó el PR #90. El merge `96670843` pasó CI y construyó ambas imágenes. El [CD 42076282618](https://github.com/Soproyectos/grupo-security-office/actions/runs/42076282618) verificó un respaldo previo de 12.673.764 bytes y aplicó `20261028120000_product_internal_notes`. Después, `20261029150000_library_subcategories` falló con P3018/P0001: 29 categorías tienen profundidad mayor que dos.

El guard de esa migración se ejecuta antes del primer DDL y del backfill. Según el log, no se aplicó la transformación de categorías/subcategorías, las migraciones posteriores no se ejecutaron y el script no reemplazó API/frontend. El smoke test quedó omitido. Una comprobación HTTP pública posterior obtuvo 200 tanto en `/api/health` como en `/tienda`; eso acredita disponibilidad, no publicación de la versión nueva.

El respaldo del intento es `20261105T174312Z-96670843.dump`. No se leyó ni restauró su contenido. No se ha accedido manualmente al VPS o a la base desde esta sesión.

## Inventario propuesto, solo lectura

Las consultas siguientes obtienen el árbol de categorías, conteos agregados de productos y el estado técnico de las seis migraciones del despliegue. No devuelven productos individuales, precios, usuarios ni clientes. Están encerradas en una transacción de solo lectura, con límites de espera, y terminan con `ROLLBACK`. No han sido ejecutadas sobre producción.

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

Tras autorización, se usaría el acceso SSH habitual documentado en [el procedimiento del VPS](../procedimientos/deploy-vps.md), ejecutando `psql -X -q -v ON_ERROR_STOP=1 --csv` dentro del contenedor DB mediante el Compose existente. El inventario real se conservaría fuera de Git y se prepararía una propuesta concreta de mapeo antes de pedir permiso para cualquier escritura.

## Decisiones y recuperación pendientes

1. Obtener el inventario autorizado: los cinco slugs del error son ejemplos, no un listado completo ni evidencia de sus ancestros.
2. Revisar el destino de cada categoría profunda frente a la estructura maestra aprobada. No inferir si hay una raíz técnica que debe retirarse, si hay que reubicar nodos o si se requiere otro diseño.
3. Preparar un mapeo revisable con impacto en asignaciones, sin borrar productos ni cambiar publicación o precios. Cualquier modificación productiva necesita aprobación explícita separada.
4. Solo después de corregir y verificar los datos con aprobación: marcar el intento fallido de `20261029150000_library_subcategories` como `rolled-back` mediante el mecanismo de Prisma y reintentar el despliegue autorizado.

No editar la migración histórica ni marcarla como `applied`: su estructura y backfill todavía faltan. No retirar el guard para forzar el deploy; el modelo nuevo no representa un tercer nivel y el backfill solo contempla hijas directas de raíces.

## Corrección independiente de recuperación

El [PR #91](https://github.com/Soproyectos/grupo-security-office/pull/91) contiene la salvaguarda que detiene el API y comprueba compatibilidad antes de volver a imágenes anteriores. Esa corrección tiene nueve escenarios locales aprobados y revisión nativa acotada aprobada. No reorganiza las categorías ni resuelve por sí sola el estado P3018; permanece separada de cualquier escritura de datos productivos.
