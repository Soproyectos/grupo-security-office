# Carga del consolidado por marca a la plantilla `catalogo-v1`

Estado: **plantilla rellenada y validada con el parser real; sin cargar a ninguna web.**
Fecha: 2026-10-30.

## Objetivo

Rellenar la hoja `Productos` de la plantilla oficial `plantilla-catalogo.xlsx` (`catalogo-v1`)
con los productos del consolidado por marca, para subirla desde *Importar catálogo*.

## Insumo y decisiones

- **Fuente:** `...\CONSOLIDADO_POR_MARCA_Y_PROVEEDOR\LISTAS_CONSOLIDADAS_POR_MARCA_Y_PROVEEDOR_CORREGIDO.xlsx`
  (5.032 SKU únicos, sin precios). El consolidado crudo tiene precios y 329 SKU repetidos, que la
  plantilla rechaza; por eso se usa el corregido.
- **Marca:** se usa la grafía del catálogo cuando existe (comparación sin acentos ni espacios);
  si no existe se deja el texto del consolidado (el producto queda con marca pendiente, con aviso,
  sin bloquear). `Sin identificar` y `GENÉRICOS` quedan vacías.
- **Categoría/subcategoría:** vacías; los productos quedan por clasificar.
- **NOMBRE:** primera línea no vacía del nombre; truncado a 200 caracteres. Si el texto completo
  aporta algo más, se conserva en `DESCRIPCION` (límite 2.000).
- **Tope de 5.000 productos por archivo:** los 32 productos excedentes (cola de ZKTeco) salen en un
  segundo archivo y quedan listados en el reporte.

## Archivos generados

| Archivo | Contenido |
| --- | --- |
| `C:\Users\sopor\Downloads\plantilla-catalogo-5000-catalogo.xlsx` | 5.000 productos. **Es el que se sube.** |
| `C:\Users\sopor\Downloads\plantilla-catalogo-resto-32.xlsx` | 32 productos fuera del tope, para una segunda carga. |
| `carga-consolidado-a-plantilla.report.json` | Conteos, marcas sin mapear y referencias del resto. |

El resto de hojas, los encabezados y la hoja oculta `_plantilla` (`catalogo-v1`) quedan intactos.

## Cómo se regenera

```powershell
python scripts/generar_plantilla_catalogo_desde_consolidado.py `
  --consolidado "D:\...\LISTAS_CONSOLIDADAS_POR_MARCA_Y_PROVEEDOR_CORREGIDO.xlsx" `
  --template "C:\Users\sopor\Downloads\plantilla-catalogo.xlsx" `
  --out "C:\Users\sopor\Downloads\plantilla-catalogo-5000-catalogo.xlsx"
```

## Evidencia

Validado con el parser real (`src/backend/src/modules/products/catalog-import/template/catalog-template.parser.ts`)
vía `ts-node`:

- `plantilla-catalogo-5000-catalogo.xlsx`: versión `catalogo-v1`, 5.000 productos, **0 errores, 0 avisos**.
- `plantilla-catalogo-resto-32.xlsx`: versión `catalogo-v1`, 32 productos, **0 errores, 0 avisos**.

Resumen del reporte:

- 5.032 filas de origen; 4.019 con marca del catálogo y 1.013 con marca pendiente.
- Marcas sin mapear: YALE 647, Sin identificar 192, LYNX 73, CONTROL ID 32, GENÉRICOS 22,
  SECO-LARM 17, DEXSON 9, EBS 7, CENTELSA 5, CODELCA 3, UNITEC 2, y 1 de EV POWER, EXA, INREMOL,
  INTERLOGIX.
- 299 nombres truncados, 4 referencias sin nombre en origen (se usó el SKU) y 816 con texto largo
  conservado en `DESCRIPCION`.

## Pendientes (no ejecutados por el agente)

- Cargar la plantilla por la interfaz y confirmar la vista previa (requiere sesión y permiso).
- Crear/confirmar las marcas faltantes y clasificar los productos sin categoría.
- Enriquecer con imágenes, especificaciones y demás hojas (la plantilla las admite).
- Nada de esto se aplicó en QA ni producción.
