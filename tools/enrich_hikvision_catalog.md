# Enriquecedor de Catálogo Hikvision

## Propósito

`enrich_hikvision_catalog.py` es una herramienta de línea de comandos **externa, de solo lectura**, que enriquece una lista de SKU de Hikvision consultando **páginas públicas oficiales de `hikvision.com`** usando un navegador real (Playwright + Chromium).

- Usa **Playwright con Chromium headless** para renderizar páginas dinámicas (Hikvision es una SPA).
- No requiere credenciales, cookies ni tokens.
- Descarga imágenes y metadatos cuando el SKU se confirma de forma estricta contra contenido oficial.

## Qué hace

1. Lee una lista de productos desde un archivo **CSV** o **XLSX**.
2. Identifica la columna que contiene el SKU/referencia (manual o automática).
3. Normaliza cada SKU internamente (mayúsculas, trim, colapso de espacios).
4. Descubre las URLs de producto navegando las páginas públicas de categorías como lo haría un visitante (ver [Descubrimiento del catálogo](#descubrimiento-del-catálogo)).
5. Valida estrictamente que el SKU aparezca en:
   - Título visible (`<title>`)
   - Metadato `og:title`
   - JSON-LD (`application/ld+json`)
   - Texto visible principal
   - URL canónica
6. Extrae información comercial y técnica disponible públicamente:
   - Nombre del producto, descripción, categoría (breadcrumb).
   - Especificaciones técnicas desde tablas y JSON-LD.
   - URLs oficiales de imágenes y PDFs (datasheet, manual, quick-start).
7. Descarga imágenes oficiales distintas (hasta `--max-images`) **solo si el SKU coincide exactamente** (ver [Imágenes](#imágenes)).
8. Marca cada SKU con un estado claro (`matched`, `partial`, `ambiguous`, `not_found`, `invalid_sku`, `error`).
9. Genera archivos de salida para revisión humana:
   - `catalogo_hikvision_enriquecido.xlsx`
   - `catalogo_hikvision_enriquecido.csv`
   - `catalogo_hikvision_especificaciones.json`
   - `enrichment_log.csv`
   - `<SKU_SEGURO>/images/` y `<SKU_SEGURO>/pdfs/` (imágenes y PDFs por SKU)
   - `discovery_index.json` (índice modelo → URL, reutilizado entre corridas)
10. Guarda el índice de catálogo para acelerar el procesamiento de lotes.

## Qué **no** hace

- No forzar el acceso a contenidos restringidos.
- No persiste datos en la base de datos del backend.
- No sustituye precios ni información comercial.
- No utiliza servicios de terceros (Google, Bing Images, marketplaces, etc.).
- No navega auténticamente ni reutiliza sesiones.
- No usa credenciales, cookies ni tokens.

## Requisitos de instalación

Python 3.8 o superior.

```bash
pip install -r requirements.txt
playwright install chromium  # Instalar navegador Chromium
```

Contenido de `requirements.txt`:

```txt
requests>=2.31.0
beautifulsoup4>=4.12.0
pandas>=2.0.0
openpyxl>=3.1.0
playwright>=1.40.0
```

## Ejemplos de uso

### CSV con columna SKU detectada automáticamente

```bash
python tools/enrich_hikvision_catalog.py \
  --input data/productos.csv \
  --output-dir tools/enrichment_output
```

### XLSX con columna SKU explícita

```bash
python tools/enrich_hikvision_catalog.py \
  --input data/productos.xlsx \
  --sku-column Referencia \
  --output-dir tools/enrichment_output
```

### Modo prueba controlada (dry-run, limite de 3 filas)

```bash
python tools/enrich_hikvision_catalog.py \
  --input data/productos.csv \
  --output-dir tools/enrichment_output \
  --dry-run \
  --limit 3
```

### Retomar ejecución anterior

```bash
python tools/enrich_hikvision_catalog.py \
  --input data/productos.csv \
  --output-dir tools/enrichment_output \
  --resume
```

### Usar mapeo manual de URLs (prioridad sobre búsqueda automática)

```bash
python tools/enrich_hikvision_catalog.py \
  --input data/productos.csv \
  --output-dir tools/enrichment_output \
  --source-map config/mapa_manual.csv
```

## Argumentos CLI

| Argumento             | Tipo     | Requerido | Por defecto | Descripción                                                                 |
|----------------------|----------|-----------|-------------|-----------------------------------------------------------------------------|
| `--input`            | str      | Sí        | —           | Archivo de entrada (.csv o .xlsx)                                           |
| `--output-dir`       | str      | Sí        | —           | Directorio de salida                                                        |
| `--sku-column`       | str      | No        | `None`      | Nombre de la columna SKU (detecta: sku, referencia, modelo, model)         |
| `--max-images`       | int      | No        | `5`         | Máximo imágenes por SKU (1–10)                                              |
| `--delay-seconds`    | float    | No        | `1.5`       | Pausa entre consultas (mínimo 1.5; `robots.txt` pide `Crawl-delay: 1`)      |
| `--limit`            | int      | No        | `None`      | Limita a primeras `n` filas                                                 |
| `--dry-run`          | flag     | No        | `False`     | No descarga imágenes ni PDFs                                                |
| `--resume`           | flag     | No        | `False`     | Retoma ejecución previa, salta SKUs finalizados                             |
| `--source-map`       | str      | No        | `None`      | Archivo CSV con mapeos `sku,source_url` (prioridad sobre auto-búsqueda)      |
| `--refresh-discovery`| flag     | No        | `False`     | Ignora `discovery_index.json` y vuelve a navegar las categorías             |
| `--verbose`          | flag     | No        | `False`     | Muestra logs de depuración                                                  |

## Descubrimiento del catálogo

Antes se recorrían solo 7 páginas de serie fijas de `es-co` (por eso todos los aciertos salían de `Value-Series` y `ColorVu-Series`). Ahora:

1. Se recorren, en `/es-co/` y solo si hace falta en `/en/`, las familias `Turbo-HD-Products`, `IP-Products` y `Accessories` (`DEFAULT_FAMILIES` en el script): familia → subcategoría → serie.
2. Cada página de listado se pagina con su propio botón "siguiente", igual que un visitante, y de cada tarjeta se toma el modelo y la URL.
3. Si el listado ya muestra todos los productos de su subárbol (`N Products Matches`), no se visitan sus hijos.
4. Se construye un índice `modelo → URLs` (clave sin mayúsculas ni signos; el sufijo de lente `(2.8MM)` se ignora, pero `(C)` se conserva). `es-co` se rastrea primero; `/en/` solo cuando el SKU no apareció en `es-co`.
5. La validación estricta del SKU sobre la página del producto no cambió.
6. El índice se guarda en `<output-dir>/discovery_index.json` y se reutiliza; use `--refresh-discovery` para rehacerlo.

Reglas del descubrimiento:

- **No** se consulta `sitemap.xml` ni ningún endpoint protegido por el desafío anti-bot del sitio.
- Si una página muestra un desafío en lugar de contenido, se omite y se registra un aviso (`Challenge page instead of content, skipped`). La herramienta no resuelve desafíos ni intenta evadir la detección de bots.
- Se respeta `Crawl-delay: 1` de `robots.txt`: pausa mínima de 1.5 s entre páginas y entre clics de paginación.

## Imágenes

Causa del defecto observado (`DS-2CE19U1T-AIT3ZF`: "3 encontradas, 1 guardada"): la lista de candidatas mezclaba (a) tres variantes de la misma foto (`.png`, `.png.thumb.140.100.png`, `?eo-img.format=webp`) y (b) iconos y banners del propio sitio (`/content/dam/...`, `/etc/clientlibs/...`) que el servidor responde con HTML. El recorte a `--max-images` se hacía antes de descargar, así que las candidatas basura ocupaban los cupos y solo se guardaba la foto real.

Ahora:

- Solo se aceptan imágenes de producto del CDN oficial (`assets.hikvision.com`, ruta `/image/`) y, si se detecta la carpeta de medios del producto (`mNNNNNN`), solo las de esa carpeta (se descartan accesorios relacionados).
- Las variantes de una misma foto (miniatura, `?eo-img.format=...`) se agrupan; se prefiere el original y, si falla, la miniatura más grande de la página.
- Se descartan logos, iconos, banners y placeholders por nombre, respuestas que no son imagen (páginas HTML) y archivos menores a 2 KB; también duplicados por contenido (hash).
- Se recorren las fotos distintas hasta guardar `--max-images`: una descarga fallida no consume cupo y los archivos se numeran `01`, `02`, … sin colisiones. La extensión sigue el `Content-Type` real.
- `imagenes_encontradas` en `enrichment_log.csv` cuenta fotos **distintas**. Un producto cuya página solo publica una foto guardará una sola: no se inventan más.

## Plantilla mínima de archivo de entrada (CSV)

```csv
sku,nombre,categoria
DS-2CD2026G2-IU (D),Cámara de red 4K,Hikvision
,Producto sin SKU,
```

## Formato del mapa manual de URLs

Archivo CSV con columnas:

```csv
sku,source_url
DS-2CD2026G2-IU (D),https://www.hikvision.com/es-co/products/IP-Products/xxx
```

Este mapeo tiene **prioridad** sobre la búsqueda automática.

## Estructura de archivos de salida

```
tools/enrichment_output/
├── catalogo_hikvision_enriquecido.xlsx
├── catalogo_hikvision_especificaciones.json
├── enrichment_log.csv
├── discovery_index.json
└── DS_2CD2026G2_IU_D/            # SKU normalizado (sanitize_filename)
    ├── images/
    │   ├── hikvision__DS_2CD2026G2_IU_D__01.png
    │   └── hikvision__DS_2CD2026G2_IU_D__02.jpg
    └── pdfs/
        └── hikvision__DS_2CD2026G2_IU_D__datasheet.pdf
```

## Estados (`match_status`)

| Estado            | Significado                                                                 |
|------------------|-----------------------------------------------------------------------------|
| `matched`        | SKU confirmado exactamente; información técnica completa extraída           |
| `partial`        | SKU confirmado, pero faltan algunos campos o assets                          |
| `ambiguous`      | Múltiples resultados posibles; no se descargan imágenes ni documentos        |
| `not_found`      | SKU no encontrado en Hikvision                                              |
| `invalid_sku`    | SKU vacío o inválido                                                        |
| `error`          | Error durante el procesamiento (HTTP 403, CAPTCHA, bloqueo, etc.)            |

## Reglas de seguridad

- **No** usar cookies, tokens, credenciales ni sesiones de navegador.
- **Únicamente** dominios oficiales permitidos:
  - `www.hikvision.com`
  - `hikvision.com`
  - `display.hikvision.com`
  - `pro-av.hikvision.com`
- Las URLs de redirección o recursos fuera de estos hosts se rechazan automáticamente.
- El `User-Agent` identifica claramente la herramienta:
  `GrupoSecurityCatalogEnricher/1.0 (authorized-catalog-enrichment)`
- Respeta `robots.txt` cuando es consultable.
- No sobrescribe imágenes existentes en disco.
- No persiste datos sensibles en logs ni en el repositorio.
- No extrae ni modifica precios.

## Limitaciones

- **Variantes regionales**: Pueden no estar disponibles en todas las regiones.
- **Productos descontinuados**: Pueden retornar 404 o redirigir a una página genérica.
- **Bloqueos HTTP**: Responderá con estado `error` y continuará con el siguiente SKU.
- **Cambios en HTML**: El parser es tolerante pero sensible a estructuras inesperadas.
- **Datos faltantes**: Si una sección no existe, se retornará vacío o `null`.
- **Estructura de URLs**: Hikvision usa listados dinámicos y paginados; el script recorre las categorías públicas de las familias configuradas. Un modelo fuera de esas familias o no listado en `es-co` ni `/en/` queda `not_found` (use `--source-map` para casos puntuales).
- **Desafío anti-bot**: si el sitio responde con un desafío, esa página se omite y se registra; no se intenta superarlo.
- **SKUs no encontrados**: Algunos SKUs pueden no tener página individual en el sitio oficial de Hikvision.

## Revisión manual requerida

Los archivos de salida generados (`*.xlsx`, `*.csv`, `*.json`) requieren **revisión humana** antes de cualquier uso posterior (importación, sincronización o carga en sistemas internos). No se garantiza exactitud comercial ni técnica plena.
