# Organización de biblioteca por marca/proveedor en QA

Fecha: 28/10/2026. Rama: `Esnaider/validacion-biblioteca`. HEAD: `cb230aa`.
Estado: aplicado y conciliado; sin commit ni push.

## Solicitud y alcance autorizado

El usuario pidió cargar la organización del Excel sin precios en la copia de BD del VPS y conservar el trabajo en este worktree. Se interpretaron las 41 hojas como agrupaciones de Listas; las marcas de fabricante ya curadas permanecen intactas. GENÉRICOS y Sin identificar son agrupaciones de revisión, no marcas nuevas.

Destino comprobado antes de escribir: API `gs-test-demo-api`, NODE_ENV=development, LIBRARY_DATABASE_MODE=legacy, host PostgreSQL `gs-test-demo-ops-db`, base `gs_api_copy`. No se activó el esquema dedicado. Sin migraciones, cambios/reinicios de servicios, despliegue productivo ni credenciales transferidas.

## Fuente y conciliación

- Fuente: `LISTAS_CONSOLIDADAS_POR_MARCA_Y_PROVEEDOR_CORREGIDO.xlsx`, sin precios, 5.032 SKU únicos y 41 grupos. SHA-256 original en `data/biblioteca-organizacion-20261028/manifest.json`.
- Normalización de SKU igual al backend: mayúsculas, sin espacios internos ni extremos, NFC. No se eliminan guiones ni ceros.
- La auditoría histórica de 5.038 SKU incluye seis rótulos: MIKROTIK y RUIJIE, y cuatro encabezados POWEST (9, 10, 21 y 22). Se excluyen del lote actual porque no son referencias de producto; no se borraron de QA.
- Antes: 5.055 productos, 0 Listas, 2.338 precios.
- Coincidencias: 5.031. Faltante: WD122PURP (conservar WD122PURZ como SKU distinto).
- Se crearon 41 Listas, códigos `BIB-*`, activas y `defaultVisibility=false`.
- Se asignaron los 5.031 productos y se creó WD122PURP con su texto original, marca Western Digital existente y categoría Almacenamiento existente. Quedó DRAFT/inactivo/no visible, sin precio ni nombre comercial inventado.
- Después: 5.056 productos, 41 Listas, 2.338 precios; 5.032 SKU del lote asignados. Los 24 registros externos al Excel conservan sus datos y asociaciones.
- No se modificaron marcas, categorías, nombres ni fichas de productos existentes. Tampoco publicación, permisos o perfiles de proveedor.
- Todas las asociaciones de Lista de los precios eran NULL. Permanecen así; el importador admite NULL. El ejecutor bloquea un movimiento si dejaría una asociación de precio no nula incompatible.

## Archivos y pruebas

Unidad de trabajo: ejecutor de datos y su evidencia; sin cambios de lógica de la aplicación.

- `scripts/organizar-biblioteca-grupos.cjs`: dry-run predeterminado, rechazo de destino fuera de QA, manifiesto sin precios, plan con huella, recibo de respaldo y confirmación obligatorios en apply. Una transacción con bloqueo de escrituras concurrentes sobre productos/Listas/precios; historial `PRODUCT_IMPORT` por asociación.
- `scripts/organizar-biblioteca-grupos.test.cjs`: 9/9 pruebas aprobadas con `node --test scripts/organizar-biblioteca-grupos.test.cjs`; `node --check scripts/organizar-biblioteca-grupos.cjs` aprobado.
- `data/biblioteca-organizacion-20261028/{manifest,plan,apply,postcheck}.json`: lote, dry-run, aplicación y conciliación persistida localmente en el worktree. Esta carpeta está excluida por la regla vigente `data/*`; no se fuerza su inclusión en Git. Esta bitácora y el ejecutor conservan la evidencia técnica compartible.
- Runtime real: dry-run previo -> apply transaccional -> nuevo dry-run. El segundo propone 0 altas de producto, 0 Listas y 0 reasignaciones, con los 5.032 SKU presentes. No se simuló importar precios reales.
- Hash de todos los campos existentes de producto excepto listaId/updatedAt, antes/después: `1e5db317058057593c8a2e11ed0c9eb4`.
- Hash de todas las columnas y filas de precios, antes/después: `8dcaf673fb1fb3140c1b2cd2e38e3596`; 2.338 filas.
- Salud tras aplicar: `/api/health` responde status=ok, database=connected, environment=development. Sin reinicio.
- No se ejecutaron suites completas frontend/backend ni lint/typecheck de aplicación: no se modificó TS/TSX, Prisma ni configuración de servicios. No se verificó navegación autenticada en navegador.

## Respaldo y límite de reversión

Se creó pg_dump completo de gs_api_copy en formato custom antes de aplicar y se comprobó con pg_restore --list; no se hizo ensayo de restauración. Tamaño: 12.745.465 bytes. SHA-256: `a37c072cb956dfc00a6ff5e17faf953322a3d56d6431718895faf1228b539293`.

Copia privada persistente en VPS: `/home/dev/qa-backups/gs-library-groups-20261028/qa-before.dump` (directorio modo 700). Recibo, inventario del archivo y reporte de aplicación acompañan el respaldo. Los bytes de la base no se copiaron a Windows ni al repositorio. El recibo de apply conserva también la ruta temporal original.

Una reversión requiere autorización propia. La frontera de este lote son los cambios listaId de `apply.json`, las 41 Listas creadas y el único producto nuevo identificado allí. Antes de revertir, comprobar que ninguna asociación haya cambiado desde el lote y que el alta no tenga datos posteriores; no borrar a ciegas productos, precios o Listas. Restaurar el dump completo sobre QA sobreescribiría trabajo posterior: usar primero una base aislada autorizada para recuperar selectivamente si hace falta. El historial del lote se conserva como evidencia.

## Siguiente paso

Recargar la interfaz local y revisar las agrupaciones. El importador ya resuelve SKU globalmente; este lote no configura plantillas/perfiles de precios ni sus tarifas, y no aplica importaciones. Los 192 productos de Sin identificar requieren clasificación posterior. El ejecutor está deliberadamente bloqueado para producción; cualquier traslado productivo requiere otra autorización y su procedimiento aprobado.
