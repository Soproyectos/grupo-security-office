# Importación masiva de la biblioteca vitrina

Estado: **manifiesto oficial generado y validado localmente; la aplicación a producción se ejecuta únicamente mediante el workflow manual `Import biblioteca`**.

La biblioteca se carga con **un solo manifiesto JSON**, no con miles de archivos. El universo autorizado son exactamente los 39 Excel de `D:\Empresa\web-gruposecurity\listas\LISTA_DE_PRECIOS_EXCEL`.

El artefacto oficial es [`biblioteca-import-39-listas.json`](../../biblioteca-import-39-listas.json). Contiene **5.038 SKU únicos**: 722 con ficha curada coincidente y 4.316 en `pendiente_enriquecimiento`. El reporte [`biblioteca-import-39-listas.report.json`](../../biblioteca-import-39-listas.report.json) conserva el desglose por archivo, las 329 apariciones duplicadas y las 198 filas sin SKU que no se pudieron importar. La lectura humana resumida está en [`auditoria-biblioteca-39-listas.md`](./auditoria-biblioteca-39-listas.md).

El archivo [`biblioteca-import-web.json`](../../biblioteca-import-web.json) representa los **497 productos que ya estaban publicados** al momento de la consulta. El cruce encontró 479 SKU dentro del lote oficial y 18 publicados fuera de las 39 listas. Sirve para una actualización limitada con `--updates-only`; no sustituye el lote oficial ni autoriza a eliminar esos 18 productos externos.

## Comando

Desde `src/backend`:

```powershell
npm run db:import-biblioteca -- --manifest=..\..\biblioteca-import-39-listas.json
```

El comando anterior hace un **dry-run** y no escribe en la base de datos. Revisa el reporte que queda en `biblioteca/import-dry-run-<timestamp>.json`.

Solo después de revisar el reporte se permite aplicar localmente:

```powershell
npm run db:import-biblioteca -- --manifest=..\..\biblioteca-import-39-listas.json --apply --confirm=IMPORTAR-BIBLIOTECA-2026
```

Cuando los productos ya existen en la web, usar siempre `--updates-only`. Este modo actualiza únicamente SKUs presentes en la base de datos y reporta como omitidos los del manifiesto que no existan; nunca crea productos nuevos:

```powershell
npm run db:import-biblioteca -- --manifest=..\..\biblioteca-import-web.json --updates-only
npm run db:import-biblioteca -- --manifest=..\..\biblioteca-import-web.json --updates-only --apply --confirm=IMPORTAR-BIBLIOTECA-2026
```

La confirmación exacta es una barrera operativa; no debe usarse para producción sin aprobación humana explícita. Para crear los SKU faltantes del lote oficial se usa el modo normal. `--updates-only` omitiría esos SKU y, por tanto, no sirve para crear la biblioteca completa.

## Carga al VPS y base de datos

La importación productiva no se ejecuta pegando comandos ad hoc por SSH. Después de desplegar en `main`:

1. Actions → **Import biblioteca** → `dry-run`.
2. Revisar que el job valide 5.038 fichas, 0 inválidas y 0 errores.
3. Actions → **Import biblioteca** → `apply`.
4. El job repite el dry-run, crea y verifica un `pg_dump` en `/var/backups/grupo-security/pre-import/`, aplica el manifiesto y reconcilia la API pública.

Los artefactos se copian a `/opt/grupo-security/data/imports`, montado como `/app/biblioteca` en `gs-api`. Allí quedan el manifiesto, los reportes de dry-run/apply y el backup de identidad. El workflow comprueba `biblioteca-import-39-listas.sha256` antes de transferir y el VPS vuelve a comprobarlo antes de leer datos.

La aplicación solo se considera terminada cuando `scripts/verificar_biblioteca_publica.py` demuestra en el endpoint público que:

- están visibles los 5.038 SKU oficiales;
- cada uno tiene nombre y categoría;
- no hay SKU públicos duplicados;
- siguen visibles los 497 productos del snapshot previo, incluidos los 18 externos a las listas.

El reporte de esa comprobación se conserva 30 días como artefacto del workflow `Import biblioteca`.

## Formato recomendado

El manifiesto es versionado y tiene un único arreglo `products`:

```json
{
  "schemaVersion": 1,
  "source": "fuente-autorizada-2026-10",
  "products": [
    {
      "referencia": "SKU-001",
      "nombre_vitrina": {
        "valor": "Cámara IP 4MP",
        "origen": "catalogo-proveedor"
      },
      "categoria": { "valor": "Cámaras" },
      "marca": { "valor": "Marca ejemplo" },
      "descripcion": { "valor": "Descripción revisada" },
      "estado": "parcial",
      "fuentes_consultadas": ["catalogo-proveedor"]
    },
    {
      "referencia": "SKU-002",
      "estado": "pendiente_enriquecimiento"
    }
  ]
}
```

La plantilla mínima está en [`docs/plantillas/biblioteca-import-masiva.example.json`](../plantillas/biblioteca-import-masiva.example.json). `referencia` y `estado` son obligatorios. Para `verificado`, `parcial` y `no_encontrado`, `nombre_vitrina.valor` también es obligatorio. Para `pendiente_enriquecimiento`, se puede dejar fuera el nombre: el sistema usa temporalmente el SKU como nombre técnico.

También se acepta, por compatibilidad, un archivo cuyo contenido raíz sea directamente un array de fichas; el sobre versionado es preferible para que futuros agentes sepan qué contrato están leyendo.

## Qué hace cada estado

- `verificado`, `parcial` y `no_encontrado`: escriben la identidad curada de la ficha, bloquean el nombre con `nameLockedAt` y dejan el producto como borrador/inactivo hasta su revisión y publicación.
- `pendiente_enriquecimiento`: permite cargar solo el SKU. Crea un placeholder con `name = SKU`, `nameSource = sistema`, sin bloqueo de nombre, `isActive = false` y estado pendiente en `extraAttributes.biblioteca`.

Una ficha pendiente nunca degrada un producto que ya tenga identidad real o nombre bloqueado. Solo puede actualizar un placeholder SKU-only previamente creado. Una ficha posterior con nombre y datos completos puede enriquecerlo y bloquear su identidad.

Para preparar nombres de vitrina después del cargue inicial, seguir el [flujo de propuestas y aprobación](./enriquecimiento-nombres-biblioteca.md). El script y el CSV de revisión viven en este repositorio; ninguna propuesta cambia la base hasta generar y aplicar el manifiesto de nombres aprobados.

## Visibilidad informativa en la web

El storefront reconoce dos clases de registro público:

- **Comercial:** `lifecycleStatus = PUBLISHED`; pasó las reglas existentes de publicación.
- **Informativo:** tiene el bloque `extraAttributes.biblioteca` escrito por este importador, aunque permanezca `DRAFT`.

La segunda regla permite consultar por nombre o SKU y navegar por categoría mientras se completan los datos. No modifica la FSM, no inventa precios, no activa el producto y no elude la validación comercial. La tarjeta y la ficha muestran **Ficha informativa / Datos en preparación** y no ofrecen cotización hasta que el producto sea comercialmente publicado. Los borradores que no provengan del importador de biblioteca siguen ocultos.

La regla compartida está en `src/backend/src/modules/products/public-catalog-visibility.ts` y se usa tanto en productos como en los conteos del menú de categorías.

## Seguridad e idempotencia

- Se cruza por SKU normalizado, ignorando mayúsculas y espacios equivalentes.
- `--updates-only` es obligatorio para actualizar una biblioteca ya publicada sin crear referencias ausentes en la web.
- Las referencias duplicadas dentro del mismo manifiesto se reportan como inválidas y no se aplican.
- El proceso trabaja en transacciones por lotes de 50 filas y conserva reintentos por fila.
- La biblioteca escribe identidad, categorías, marcas e imagen principal; **no escribe `Price` ni publica productos**.
- Las corridas generan reporte y, en `--apply`, backup de identidad en la carpeta `biblioteca/`.
- `--artifacts-dir` permite dirigir esos reportes a un volumen persistente; producción usa `/app/biblioteca`.
- Un segundo dry-run o apply es idempotente para la misma información.

## Checklist para el lote oficial de 5.038

1. Construir un único JSON a partir de la fuente autorizada.
2. Confirmar que cada fila tenga `referencia`; usar `pendiente_enriquecimiento` si todavía no existe información de vitrina.
3. Ejecutar dry-run con `--manifest`.
4. Revisar válidas, inválidas, duplicados, creates, updates, skips y pendientes.
5. Corregir el JSON y repetir hasta que el reporte sea aceptable.
6. Aplicar únicamente en local con el token de confirmación.
7. Conservar el reporte y el backup.
8. Completar los pendientes con una nueva versión del mismo manifiesto.

Para regenerar el archivo consolidado desde la raíz del repositorio:

```powershell
python scripts/generar_manifiesto_biblioteca.py `
  --lists-dir "D:\Empresa\web-gruposecurity\listas\LISTA_DE_PRECIOS_EXCEL" `
  --expected-files 39
```

La generación toma únicamente los Excel ubicados directamente en esa carpeta, fusiona duplicados por SKU normalizado, da prioridad a las fichas curadas coincidentes y deja los demás registros como `pendiente_enriquecimiento`. No copia precios. `--expected-files 39` evita generar un lote incompleto si falta o sobra un archivo.

Para reconstruir el manifiesto exacto de los productos publicados, después de regenerar el maestro:

```powershell
python scripts/generar_manifiesto_web.py
```

Este segundo comando es de solo lectura sobre el endpoint público: no inicia sesión, no escribe en la base y falla si la paginación queda incompleta o el total cambia durante la lectura.

La cifra 5.028 era una aproximación de negocio. La evidencia reproducible de los 39 Excel es 5.038 SKU únicos; no se eliminan diez referencias válidas para forzar el objetivo anterior.

## Referencias para agentes

- Lógica y contrato: `src/backend/src/scripts/import-biblioteca.logic.ts`.
- Cableado CLI/Prisma: `src/backend/prisma/import-biblioteca.ts`.
- Generador reproducible: `scripts/generar_manifiesto_biblioteca.py`.
- Auditoría del lote oficial: [`auditoria-biblioteca-39-listas.md`](./auditoria-biblioteca-39-listas.md).
- Filtro reproducible de la web publicada: `scripts/generar_manifiesto_web.py`.
- Verificación posterior a la publicación: `scripts/verificar_biblioteca_publica.py`.
- Ejecución productiva protegida: `.github/workflows/import-biblioteca.yml` y `deploy/vps/import-biblioteca.sh`.
- Importación operativa separada por Excel/CSV: [`importacion-masiva-productos.md`](./importacion-masiva-productos.md).
- Decisión de separar identidad y precios: [`ADR-002-biblioteca-vitrina.md`](../adr/ADR-002-biblioteca-vitrina.md).
