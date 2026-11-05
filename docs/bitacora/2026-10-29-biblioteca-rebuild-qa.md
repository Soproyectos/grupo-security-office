# Reconstrucción de Biblioteca en QA — 2026-10-29

## Estado

**Aplicación completada y verificada en QA.** Se reemplazaron 5.055 productos distintos del demo por los 1.538 del manifiesto final. La base quedó con 1.539 productos: 1.538 borradores inactivos/no visibles/no publicados más el demo publicado.

La vía `scripts/rebuild-biblioteca-qa.cjs --apply` exigió el SHA exacto del manifiesto, receipt del respaldo QA fresco y verificado, snapshot aprobado y `--coordinator-go` con el mismo hash del manifiesto. `--dry-run` sigue siendo el modo predeterminado.

## Identidad y respaldo previo

Guardas observadas: `NODE_ENV=development`, `LIBRARY_DATABASE_MODE=legacy`, `current_database()=gs_api_copy`, host `gs-test-demo-ops-db`, ruta `/gs_api_copy`.

Dump custom completo inmediatamente anterior al apply en VPS: `/home/dev/qa-backups/gs-library-rebuild-20261029-060642/gs_api_copy-before-apply.dump`.

Tamaño: 13.159.667 bytes; SHA-256 `2b7165c9a74b311979a047507bb1649a3e95abff05c348e989e87795f1a7a9c8`. Directorio modo 700, archivo modo 600. `pg_restore --list` lo leyó correctamente con la versión del contenedor PostgreSQL. El dump permanece en VPS; no se descargó. Receipt local: `data/biblioteca-rebuild-20261029/apply-backup-receipt.json`.

El ejecutor valida en cada aplicación el SHA del backup declarado, ruta QA, tamaño, `pgRestoreList=verified`, identidad y antigüedad máxima de 24 horas. El contenedor API no puede leer el archivo del host; el receipt verificado se transfiere al contenedor sin credenciales.

## Estado QA observado antes de la carga

| Entidad | Conteo |
|---|---:|
| Productos | 5.056 |
| Categorías | 76 (9 raíces + 66 hijas + Sin categoría) |
| Marcas | 26 |
| Listas | 41 |
| Precios | 0 |
| Ítems de cotización | 0 |
| Stocks | 0 |
| Uploaded files | 445 |

Solo tienen productos **Sin categoría** (5.055, incluido el demo) y **Detección de incendios** (1 producto de prueba). El árbol de 9 raíces y 66 hijas coincide exactamente con los 66 pares del manifiesto; el árbol y `Sin categoría` se conservan.

## Manifiesto final y dry-run

Archivo local validado: `BIBLIOTECA_MAESTRA_2026-10-29/REVISION_SEMANTICA/lote_carga.json`.

- SHA-256 del manifiesto (bytes exactos): `8c674a8124390f791e204880e42508bb1491852ae844e50a08b2783a4f459aef`.
- `sourceSha256`: `e29fe70e883aaa3b577afde686a1f9b020b3f784d9d41b77e1573e0489eac012`.
- `reviewSha256` contiene tres hashes de revisión semántica y `adjustmentSha256` dos hashes de ajustes/auditoría; el parser verifica que cada valor sea SHA-256.
- Los 66 pares de categoría resuelven sin conflicto contra el árbol QA. No se crean categorías.
- 1.538 productos del lote pasan validación. Se eliminan 5.055 productos distintos del demo y se crean 1.538 nuevos; junto con el demo, la proyección final es 1.539 productos. Los 3.517 restantes del universo conciliado no se cargan.
- Se reutilizan 17 marcas existentes. Se crearían 7 marcas nuevas, todas con `Confirmada_por_fuente`, `evidenciaMarca` presente y mención de la marca en `textoMarca`: 3M (2 productos), MikroTik (1), Phillips (1), Ruijie (3), Paradox (1), 3Bumen (1) y Ubiquiti (8). Marcas sin evidencia suficiente, colisiones de alias o slug se bloquean; dry-run final: `unresolvedBrands=[]`.
- Las fichas nuevas solo reciben SKU canónico, nombre, marca y categoría/subcategoría. El SKU conserva mayúsculas/minúsculas exactas. Se crean como `DRAFT`, inactivas, no visibles, no publicadas; `extraAttributes` se omite (queda NULL), por lo que no se añade `extraAttributes.biblioteca`. No se carga ningún precio, lista, proveedor, archivo, imagen, recurso ni especificación.
- Snapshot aprobado y repetido justo antes del apply: `f50710c306eb0e0a59b63e195ba7a3c3aa8227cc67de7d80559394b57ef81029`.
- Su `snapshotBaseSha256` coincide exactamente con el previo `e86c751e0e242e2e7aabfbc1ba9719498bc61b5cf8cfb2c99c65c80bf2ec0dbf`; las claves nuevas para los conteos globales de quote items y stocks valían 0.

## Demo y relaciones protegidas

SKU `IDS-E04HQHI-D`, ID `655337aa-6b8a-4ae7-8973-ff977267af04`: Hikvision, **Sin categoría**, `publicado`/`PUBLISHED`, visible, publicado en catálogo, `ACTIVE`, revisión pública `02d85cb7-a12d-4cd6-9373-bb871943b50c`.

Huella SHA-256 completa de la fila, todas las relaciones Prisma del demo, `ProductChange`/`PublicationEvent` asociados y metadata de archivos referenciados: `dbeb8e118ca9771e1dd86ae909bf17a82ec90c3a807526716a69e9c86bbf70dc`. Conteos: 2 imágenes, 5 recursos, 7 grupos, 34 ítems, 1 revisión; 0 precios, cotizaciones, notas internas y audit logs. Dos uploaded files se referencian por URL/UUID. El postcheck fue idéntico. No se alteran categoría, marca, flags, ficha, relaciones ni blobs del demo.

## Dependencias del borrado y preservación

- 462 filas de `product_images` tenían `ON DELETE RESTRICT`; se borraron explícitamente antes de los productos. Se quitaron las relaciones, nunca los blobs.
- Se eliminaron por cascada 1.146 grupos de especificaciones, 8.439 ítems, 3 notas internas y 42 revisiones. No había recursos de catálogo de otros productos.
- Precio, quote items y stock están en cero; apply aborta si alguno deja de estar en cero.
- Las cuatro filas de `audit_logs` asociadas a los productos eliminados quedaron con `productId=NULL` por `ON DELETE SET NULL` (3 eventos `Price.create`, 1 `Product.create_internal_note`); el resto sobrevivió intacto.
- Las 10.223 filas `ProductChange` asociadas a los productos objetivo, las dos del demo y tres filas huérfanas anteriores permanecen sin cambios. El total global es 10.228: 10.223 objetivo + 2 demo + 3 huérfanas.
- Las 2 `PublicationEvent` permanecen sin cambios; carecen de FK y pueden conservar IDs de productos retirados.
- Las 445 filas de `uploaded_files` y sus blobs se conservan intactas; 443 tienen `ownerProductId` de productos retirados, sin FK. No se purgan ni modifican.
- No se eliminan usuarios, roles, permisos, listas, categorías ni marcas existentes. Marcas nuevas y fichas se crean dentro de la misma transacción de reemplazo.

## Transacción de apply

La aplicación cerró con commit: eliminó 5.055 productos y 462 imágenes no-demo, creó 7 marcas y 1.538 borradores. La transacción serializable revalidó identidad/snapshot, comparó las relaciones preservadas y la huella del demo, y confirmó los conteos finales. Un primer intento anterior se revirtió antes del commit por el orden incorrecto de dos conteos globales en el snapshot; se corrigió el destructuring, se añadieron guardas y pruebas de regresión, se constató que la huella base seguía igual y se tomó el respaldo fresco aquí documentado antes del apply exitoso.

## Verificación del ejecutor

- `node --check scripts/rebuild-biblioteca-qa.cjs` correcto.
- `node --test scripts/rebuild-biblioteca-qa.test.cjs`: 10 aprobadas, 0 fallidas.
- Postcheck independiente de solo lectura: correspondencia exacta de los 1.538 SKU/nombre/marca/categoría-hoja con el manifiesto; no hay filas extra, por lo que los 3.508 pendientes, 6 rótulos y 3 restringidos no aparecen.
- Las 1.538 fichas están inactivas, ocultas, no publicadas, sin lista/slug/`extraAttributes` y no usan `Sin Marca`. Las siete marcas nuevas quedaron inactivas. No se crearon categorías.
- Conteos finales: 1.539 productos, 76 categorías (9 categorías comerciales raíz + 66 hojas + `Sin categoría`), 33 marcas, 41 listas, cero precios/cotizaciones/stocks y 445 UploadedFiles.
- Demo e historial asociados con huella idéntica; mantiene dos imágenes, cinco recursos, siete grupos/34 ítems, una revisión pública y dos UploadedFiles referenciados.
