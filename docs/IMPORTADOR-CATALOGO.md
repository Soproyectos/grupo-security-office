# Importador de Catálogo Grupo Security Office

> **Objetivo:** Convertir las listas crudas de proveedor (`listas/*.xlsx`) en fichas de producto (`biblioteca/<slug>.json`) y un archivo consolidado listo para importar a la vitrina web.

> **Carga masiva actual:** para crear la biblioteca en la base de datos no es necesario conservar un archivo por producto. El importador acepta un único manifiesto JSON con `schemaVersion` y `products`; el contrato y el comando están en [`procedimientos/importacion-masiva-biblioteca-vitrina.md`](procedimientos/importacion-masiva-biblioteca-vitrina.md). La carpeta de fichas individuales sigue siendo compatible como formato histórico.

> **Artefactos reproducibles:** `scripts/generar_manifiesto_biblioteca.py` consolida exactamente los 39 Excel autorizados de `D:\Empresa\web-gruposecurity\listas\LISTA_DE_PRECIOS_EXCEL` en `biblioteca-import-39-listas.json` y deja la auditoría en `biblioteca-import-39-listas.report.json`. `scripts/generar_manifiesto_web.py` filtra ese universo a los SKUs ya publicados y produce `biblioteca-import-web.json`; este último se importa con `--updates-only`.

> **Autor:** Bibliotecario de catálogo
> **Fecha:** 2026-10-15
> **Base de datos:** `catalogo-base.json` (764 productos parseados de 6 archivos Excel)

---

## 1. Fuentes (Archivos Excel)

La carpeta `listas/` contiene 6 archivos Excel con un total de **764 productos** distribuidos en las siguientes secciones (títulos de bloque del Excel):

| Archivo | Hojas / Secciones | Productos |
|---|---|---|
| `LISTA ALMACENAMIENTO GRUPO.xlsx` | ALMACENAMIENTO | (conteo en base) |
| `LISTA AUTOMATIZACIÓN GRUPO.xlsx` | AUTOMATIZACIÓN | |
| `LISTA DE PRECIOS EXCEL/` | (múltiples hojas) | |
| `LISTA HIKVISION TURBO GRUPO.xlsx` | HIKVISION TURBO | |
| `LISTA PROTECCION GRUPO.xlsx` | PROTECCIÓN | |
| `PLANTILLA GRUPO SECURITY.xlsx` | PLANTILLA | |

> **Nota:** El script `scripts/parsear_listas.py` ya convirtió estos Excel a `productos[]` con `referencia`, `descripcion`, `origen.{archivo,hoja,seccion}` y `pista_marca`. **No modifique ese script.**

---

## 2. Mapeo Excel → Web (Campos de la ficha)

Cada producto tiene estos campos en la ficha final `biblioteca/<referencia-en-slug>.json`. La tabla indica el origen por defecto y las reglas de normalización.

| Campo Web | Origen por defecto | Regla de normalización |
|---|---|---|
| `referencia` | `lista` | Se usa tal cual de la columna `referencia` del Excel. Se conserva la formateo original (ej. `DS-2CE10DF0T-F(2.8mm)`). **Nunca se incluye en el `nombre_vitrina`.** |
| `descripcion` | `lista` | Texto tal cual de la columna `descripcion` del Excel. Mayúsculas preservadas tal cual vienen en la celda. |
| `categoria` | `inferido` | Se deduce de `origen.seccion` usando la normalización de abajo. Se marca `origen: "inferido"` con `razon: "Sección de hoja X del archivo Y"`. |
| `marca` | `inferido` | Se deduce de `pista_marca` + confirmación en web si está disponible. Marca `origen: "inferido"` con `razon`. |
| `nombre_vitrina` | **redactado** | Ver sección 3. Nunca incluye la referencia. Máx. 70 caracteres. |
| `imagen` | `web` / `no_encontrado` | Se busca en web (ver procedimiento). Si no hay ficha oficial, se deja vacío u `origen: "no_encontrado"`. |
| `estado` | según confirmación | `verificado` | `parcial` | `no_encontrado` |
| `fuentes_consultadas` | `web` | URLs reales abiertas con `webfetch`. Solo los que tuvieron búsqueda web exitosa. |

---

## 3. Lógica de `nombre_vitrina` (título de vitrina, ≤70 caracteres)

**Regla:** El título debe ser comprensible para un cliente y máximo 70 caracteres.

### Caso A: Descripción ya basta (no se busca web)
Si `descripcion` mide 70 caracteres o menos y ya es comprensible, se usa **tal cual** con `origen: "lista"`.

### Caso B: Descripción larga → redactar corto
Si `descripcion` supera los 70 caracteres, se redacta un nombre corto usando **solo palabras que ya estén en la descripcion o en la ficha oficial**: tipo de producto + marca + modelo + la característica que lo distingue. Se botan los rellenos técnicos (que quedan en `descripcion`).

**Ejemplo:**
- `descripcion`: `CAMARA TURBO 1080P BALA 0.001LUX 2.8MM`
- `nombre_vitrina`: `Camara Turbo 1080P Bala 0.001Lux 2.8mm`

**Ejemplo de transformación:**
- `descripcion`: `MOTOR DE GARAJE ELITE MG 750 SILENCIOSO Y RAPIDO DE USO CONTINUO. ALIMENTACION 110V/24V. FUERZA 1/2 HP (750N)...` (larga)
- `nombre_vitrina`: `Motor de Garaje Elite MG 750 - 1/2 HP Silencioso`

### Patrones por tipo de producto

| Tipo | Patrón de nombre_vitrina |
|---|---|
| Camara | `Marca Modelo - Tipo (mm)` |
| Motor para puerta | `Marca Modelo - HP/Fuerza` |
| UPS | `Marca - VA / Tipo On-Line/Interactiva` |
| Panel Solar | `Marca - Panel / W` |
| Cables | `Tipo Cable - Categoria (ej. Cat 6)` |
| Accesorios | `Nombre comercial del accesorio` |

---

## 4. Lógica de `categoria` (normalización de secciones)

Usar `origen.seccion` como pista principal. Normalización:

| Sección del Excel | Categoría valor | Razón (origen: inferido) |
|---|---|---|
| `HIKVISION TURBO` | `Camaras Turbo` | "Hoja HIKVISION TURBO de la lista" |
| `MOTORES PARA PUERTAS LEVADIZAS` | `Motores para Puertas Levadizas` | "Título de bloque del Excel" |
| `CERCOS ELECTRICOS` | `Cercos Electricos` | "Título de bloque del Excel" |
| `ALMACENAMIENTO` | `Almacenamiento` | "Título de bloque del Excel" |
| `SMART LOCK` | `Cerraduras Inteligentes` | "Título de bloque del Excel" |
| `1. VARIADORES DE FRECUENCIA.` | `Variadores de Frecuencia` | "Título de bloque del Excel" |
| `3. PROTECTORES DE VOLTAJE.` | `Protectores de Voltaje` | "Título de bloque del Excel" |
| `4. UPS INTERACTIVAS MICRONET` | `UPS Interactivas` | "Título de bloque del Excel" |
| `5. UPS ON LINE INCLUYE BATERIAS (AUTONOMIA). POWEST` | `UPS On Line` | "Título de bloque del Excel" |
| `6. BANCO BATERIAS UPS ONLINE ADICIONALES...` | `Bancos de Baterías para UPS` | "Título de bloque del Excel" |
| `7. ACCESORIOS UPS ONLINE TIPO TORRE` | `Accesorios para UPS` | "Título de bloque del Excel" |
| `8. TRANSFORMADORES DE AISLAMIENTO` | `Transformadores de Aislamiento` | "Título de bloque del Excel" |
| `15. TRANSFORMADORES DE AISLAMIENTO POWEST EA` | `Transformadores de Aislamiento` | "Título de bloque del Excel + marca POWEST" |
| `12-13. UPS POWEST` | `UPS On Line Trifásicas` | "Título de bloque del Excel + marca POWEST" |
| `19-19.3. BATERIAS FULI` | `Baterías (Gel/Plomo/Litio)` | "Título de bloque del Excel + marca FULI" |
| `24. PANELES SOLARES` | `Paneles Solares` | "Título de bloque del Excel" |
| `23. CABLEADO CAT 5E/6/6A` | `Cableado Categoría X` | "Título de bloque del Excel" |
| `ACCESORIOS SOLARES` | `Accesorios Solares` | "Título de bloque del Excel" |
| *Otro no listado* | `Variados` o `no_encontrado` | "Sección no reconocida; revisar manualmente" |

> **Regla:** Si la sección es muy específica (ej. `15.1 TRANSFORMADORES DE AISLAMIENTO POWEST EA + CHASIS UL`), la categoría es la misma que la padre (`Transformadores de Aislamiento`) pero se deja la razón completa.

---

## 5. Estados de cada ficha

| Estado | Cuándo usar |
|---|---|
| `verificado` | Confirmaste el producto en una página web que trae la referencia exacta. El archivo `biblioteca/<slug>.json` fue generado tras búsqueda web exitosa. |
| `parcial` | Nombre y categoría resueltos desde la lista, pero **sin confirmación web**. Se usa cuando no se encontró ficha oficial o la búsqueda falló. |
| `no_encontrado` | Producto genérico sin ficha confiable (cables, resortes, aisladores, patch cords, tornillería). Se deja `descripcion` y lo que la lista ya daba. `estado: "no_encontrado"`. |

---

## 6. Generación del archivo consolidado para importar

Una vez procesados todos los productos, se genera `biblioteca/titulos-vitrina.csv` con tres columnas:

```
referencia,nombre_vitrina,estado
```

- **UTF-8**.
- **Regenerado completo cada vez** que se cierra un lote (incluye fichas ya existentes).
- Para productos `no_encontrado`, el `nombre_vitrina` va vacío (el estado lo explica; nunca se rellena con algo no sustentado).

### Archivo de importación masiva: `data/catalogo-import-ready.json`

Además del CSV de vitrina, se genera `data/catalogo-import-ready.json` con la estructura plana lista para ser consumida por el backend:

```json
[
  {
    "referencia": "DS-2CE10DF0T-F(2.8mm)",
    "nombre_vitrina": "Camara Turbo 1080P Bala 0.001Lux 2.8mm",
    "categoria": "Camaras Turbo",
    "marca": "Hikvision",
    "descripcion": "CAMARA TURBO 1080P BALA 0.001LUX 2.8MM",
    "estado": "verificado",
    "origen_datos": "lista",
    "fuentes_consultadas": ["https://example.com/hikvision-ds2ce10df0t"]
  },
  ...
]
```

**Campos incluidos solo si pueden sustentarse:**
- `marca` solo si tiene `origen: "web"` o `origen: "inferido"` con `razon`
- `categoria` solo si tiene `origen: "inferido"` con `razon` o `origen: "lista"`
- `fuentes_consultadas` solo si es array no vacío

---

## 7. Validaciones y buenas prácticas

1. **Referencia obligatoria y única:** No debe haber dos productos con la misma `referencia`.
2. **Sin precios:** Nunca se incluyen precios en la salida. La entrada no los trae y la salida tampoco.
3. **Nombre_vitrina ≤70:** Si el nombre redactado pasa de 70 caracteres, hay que truncar manteniendo el sentido (quitar subtipo/accessory details).
4. **No meter referencia en el nombre:** La referencia es un campo aparte; el `nombre_vitrina` es solo para el cliente.
5. **Inferencias con trazabilidad:** Todo campo `inferido` debe tener `razon` explicado. Nunca presentar una inferencia como dato verificado.
6. **`origen` siempre presente:** Ningún campo debe carecer de `origen`. Los valores válidos son `"lista"`, `"web"` (con `fuente`) o `"inferido"` (con `razon`).

---

## 8. Pasos siguientes (flujo de trabajo)

1. **Ejecutar parseo:** `python3 scripts/parsear_listas.py` (ya hecho: `catalogo-base.json` existe con 764 productos).
2. **Procesar productos uno por uno:** Para cada producto en `catalogo-base.json`:
   - Comprobar si `biblioteca/<referencia-en-slug>.json` ya existe → saltarlo.
   - Si no existe, aplicar el procedimiento:
     a. Decidir si necesita web (si la descripción ya da nombre, marca y categoría, **no buscar**).
     b. Si necesita: `websearch` con referencia exacta.
     c. `webfetch` de los resultados prometedores. Confirmar que la referencia aparece **textualmente** en la página.
     d. Extraer nombre, marca, imagen, specs de la página.
     e. Escribir `biblioteca/<slug>.json` con la forma oficial.
     f. Solo entonces pasar al siguiente producto.
3. **Generar `titulos-vitrina.csv`:** Al terminar el lote.
4. **Generar `data/catalogo-import-ready.json`:** Consolidado para el backend.
5. **Revisar estados:** Contar `verificado`, `parcial`, `no_encontrado` y decidir si es necesario reabrir algunos `parciales` con búsquedas web adicionales.

---

## 9. Ejemplo real (1 fila completa)

**Entrada Excel (LISTA HIKVISION TURBO GRUPO):**
- Referencia: `DS-2CE10DF0T-F(2.8mm)`
- Descripción: `CAMARA TURBO 1080P BALA 0.001LUX 2.8MM`
- Sección: `HIKVISION TURBO`
- Pista marca: `ALMACENAMIENTO` (ejemplo genérico; en realidad sería Hikvision)

**Ficha generada `biblioteca/ds-2ce10df0t-f-2-8mm.json`:**
```json
{
  "referencia": "DS-2CE10DF0T-F(2.8mm)",
  "nombre": { "valor": "Camara Turbo 1080P Bala 0.001Lux Hikvision", "origen": "web", "fuente": "https://www.hikvision.com/.../ds-2ce10df0t-f" },
  "categoria": { "valor": "Camaras Turbo", "origen": "inferido", "razon": "Hoja HIKVISION TURBO de la lista" },
  "marca": { "valor": "Hikvision", "origen": "inferido", "razon": "pista_marca de la hoja + confirmacion en la pagina oficial" },
  "descripcion": { "valor": "CAMARA TURBO 1080P BALA 0.001LUX 2.8MM", "origen": "lista" },
  "imagen": { "valor": "https://www.hikvision.com/.../ds-2ce10df0t-f.jpg", "origen": "web", "fuente": "https://www.hikvision.com/.../ds-2ce10df0t-f" },
  "estado": "verificado",
  "fuentes_consultadas": ["https://www.hikvision.com/.../ds-2ce10df0t-f"]
}
```

**Nombre vitrina (≤70):** `Camara Turbo 1080P Bala 0.001Lux 2.8mm`

---

## 10. Preguntas frecuentes

### ¿Qué pasa si la descripción ya dice todo?
→ No se busca la web. Se usa `origen: "lista"` para `descripcion` y `nombre_vitrina` se redacta a partir de la descripción (o se usa la descripción completa si mide ≤70).

### ¿Y si el webfetch falla?
→ No reintentar más de una vez. Marcar el producto como `parcial` y pasar al siguiente. Un PDF que no responde no debe trabar el lote.

### ¿El `nombre_vitrina` puede ser la descripción completa?
→ Solo si su longitud es ≤70 caracteres. Si es más larga, hay que redactar uno corto (ver sección 3).

### ¿Qué hacer con los `no_encontrado`?
→ Quedar con `descripcion` tal cual de la lista, `estado: "no_encontrado"`, y `nombre_vitrina` vacío. El archivo `titulos-vitrina.csv` tendrá esa referencia y estado, y el nombre vacío explicita que no hay ficha comercial disponible.

