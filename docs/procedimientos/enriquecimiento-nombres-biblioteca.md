# Enriquecer nombres de vitrina después del cargue inicial

El lote oficial de 5.038 SKU puede cargarse como biblioteca en borrador. Sus 4.316 fichas `pendiente_enriquecimiento` conservan el SKU como nombre técnico hasta que se apruebe un nombre comercial. El script de este repositorio prepara esa segunda etapa sin escribir en la base de datos.

## Flujo corto

1. Generar o regenerar propuestas desde la raíz del proyecto:

   ```powershell
   python scripts/proponer_nombres_vitrina.py
   ```

2. Abrir [`biblioteca-nombres-propuestos.csv`](../../biblioteca-nombres-propuestos.csv). Copiarlo a `biblioteca-nombres-aprobados.csv` dentro de la raíz del proyecto y rellenar `nombre_aprobado` únicamente para los SKU revisados. La columna `nombre_propuesto` es una sugerencia, no una aprobación.
3. Generar el manifiesto de actualización:

   ```powershell
   python scripts/proponer_nombres_vitrina.py --approved biblioteca-nombres-aprobados.csv
   ```

4. Desde `src/backend`, ejecutar un dry-run contra la base de destino y revisar el reporte:

   ```powershell
   npm run db:import-biblioteca -- --manifest=..\..\biblioteca-import-nombres-aprobados.json --updates-only
   ```

5. La aplicación a producción exige autorización humana explícita. Una vez aprobada, el mismo comando con `--apply --confirm=IMPORTAR-BIBLIOTECA-2026` actualiza únicamente SKU existentes; no publica productos.

## Qué produce el script

La propuesta se basa en `descripcion.valor` del [manifiesto oficial](../../biblioteca-import-39-listas.json). Normaliza espacios, pone en formato legible palabras comunes y conserva códigos alfanuméricos. El límite es de 70 caracteres y el recorte ocurre al final de una palabra. No usa servicios externos ni inventa datos faltantes.

En el lote actual:

- 4.316 filas pendientes para revisión.
- 2.288 propuestas con descripción corta.
- 1.998 propuestas recortadas de una descripción larga (`revisar_recorte`).
- 20 propuestas con conflicto de descripción o categoría entre listas (`revisar_conflicto`).
- 10 sin descripción (`sin_descripcion`): requieren nombre manual.
- 541 SKU comparten una propuesta con otro SKU (240 nombres repetidos); la columna `skus_con_este_nombre` señala esas colisiones.

Todas las propuestas deben revisarse. Un recorte puede omitir modelo, capacidad o variante; el nombre aprobado debe distinguir correctamente el producto. El CSV conserva el SKU, la categoría y la descripción original para esa revisión. Cuando `skus_con_este_nombre` sea mayor que uno, diferenciar las variantes antes de aprobarlas.

El modo `--approved` ignora filas sin `nombre_aprobado`. Rechaza SKU ajenos al lote pendiente, duplicados, nombres iguales al SKU y nombres de más de 70 caracteres. Conserva descripción, categoría, marca y fuentes del manifiesto oficial. Solo las filas aprobadas pasan a `estado: parcial` con `nombre_vitrina.origen: revision-humana`.

## Efecto en la base de datos

El importador cruza por SKU. Con `--updates-only`, los SKU que aún no estén en la base se omiten y no se crean por accidente. En los existentes, una ficha `parcial` actualiza nombre, descripción y categoría, y fija `nameLockedAt`; la carga posterior de una lista de precios no debería sobrescribir ese nombre curado. El producto permanece sin publicación automática.

El manifiesto de 5.038 SKU y el CSV de propuestas están en este repositorio para compartirlos por GitHub. Los Excel originales se leyeron desde `D:\Empresa\web-gruposecurity\listas\LISTA_DE_PRECIOS_EXCEL`; para regenerar el inventario desde Excel en otra máquina hay que disponer allí de los mismos 39 archivos y pasar su ruta con `--lists-dir`. El enriquecimiento de nombres sí puede repetirse directamente desde el manifiesto versionado, sin acceso a `D:`.

## Verificación

```powershell
python scripts/test_proponer_nombres_vitrina.py
```

No se guardan credenciales en el CSV ni en los manifiestos. Revisar los nombres antes de compartir una versión aprobada y mantener los cambios de código, datos y documentación de este flujo dentro del repositorio.
