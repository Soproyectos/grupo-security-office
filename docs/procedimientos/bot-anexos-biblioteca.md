# Bot de biblioteca: lista Excel → búsqueda en internet → anexos por producto

**Fecha:** 27/10/2026 (dos entregas el mismo día) · **Worktree:** `Esnaider/validacion-biblioteca` · **Herramienta:** `tools/bot-biblioteca/` · **Sin commits** (pendiente aprobación).

## Objetivo

El usuario selecciona **una lista Excel** en la interfaz; el bot lee las referencias (SKU), **las busca una a una en internet**, verifica que la referencia exacta aparezca en las páginas encontradas, y por producto descarga la **imagen** y los **PDFs** (datasheets / "data chip"), los guarda en **carpetas con el nombre del producto** y registra las **rutas en el informe de cada producto**, clasificando en **tres listas** para validación manual: ✅ verificadas · ⚠️ parciales · ❌ no encontradas (más ⏳ pendientes mientras corre).

## Alcance y límites

- **Nunca lee costos, utilidades, márgenes ni precios** del Excel: solo las columnas REFERENCIA y DESCRIPCION (misma seguridad por construcción que `extract-catalog.cjs`, cuya lógica de lectura se replica).
- No modifica la aplicación, las bases de datos ni el repo principal: escribe solo en la carpeta de salida (por defecto `salida-lista` para el modo lista).
- Sin dependencias nuevas: Node ≥ 18 (`node:http`, `node:fs`, `fetch` global) y el paquete `xlsx` 0.18.5 ya presente en `node_modules` del repositorio.
- Solo escucha en `127.0.0.1`. `/api/archivo` y `/api/abrir` solo aceptan rutas dentro de la carpeta de salida elegida.
- **Pendiente de fase 3:** el redactado de la ficha de vitrina (nombre, categoría, specs del checklist) a partir de la evidencia; hoy el bot deja evidencia cruda + anexos + informe.

## Ejecución con interfaz

```powershell
node tools/bot-biblioteca/servidor-bot.mjs
```

Abrir <http://127.0.0.1:8126>:

1. **Origen** → modo «Lista Excel nueva» → ruta del `.xlsx` (o carpeta) → *Analizar lista* (cuenta referencias).
2. **Destino** → carpeta de salida (`salida-lista` sugerida en modo lista).
3. **Límite** 5–10 para validar; **pausa** ≥ 1200 ms.
4. **Buscar en internet y descargar anexos** → progreso en vivo; reanudable y detener/continuar cuando se quiera.
5. **Listas** → tres vistas por resultado de búsqueda (verificadas/parciales/no encontradas), pendientes y clasificación de anexos; botones de informe (JSON con rutas), carpeta (Explorador) e imagen.

El modo «Fichas ya investigadas» conserva su flujo anterior (solo descarga anexos de `biblioteca/*.json`).

## Ejecución por consola

```powershell
node tools/bot-biblioteca/extraer-lista.mjs `
  --lista "D:\Empresa\web-gruposecurity\listas\LISTA_DE_PRECIOS_EXCEL\LISTA ACCESORIOS HIKVISION GRUPO.xlsx" `
  --salida "<worktree>\salida-lista" --limite 10 --pausa-ms 1200
```

`--solo-extractar` lee la lista y prepara el índice sin internet; `--forzar` reprocesa informes existentes.

## Contratos de salida

| Ruta | Contenido |
|---|---|
| `catalogo-base.json` | referencias únicas de la lista (referencia, descripcion, origen archivo/hoja/sección, pista de marca). Sin precios. |
| `catalogo-extraido.json` | índice por producto: estado (verificado/parcial/no_encontrado/pendiente), anexos descargados, clasificación, carpeta |
| `anexos/<slug>/imagenes/` | imagen de la página verificada (`og:image`), con `url` y página de origen en el informe |
| `anexos/<slug>/pdfs/` | PDFs enlazados en las páginas verificadas (máx. 4 por producto, verificados magic `%PDF-`) |
| `informes/<slug>.json` | rutas absolutas y relativas, resultado de búsqueda, páginas verificadas (url, título, descripción), errores |
| `informe-resumen.json` | conteos y las tres listas |
| `estado-descarga.json` + `bot.log` | progreso y registro |

## Reglas de procedencia

Heredadas del skill `catalog-librarian`: referencia exacta en la página (si no aparece, no es ese producto), ignorar buscadores y redes, no inventar fuentes, registrar errores (403/429/timeout) sin rellenar. `no_encontrado` es un resultado correcto para genéricos sin ficha.

## Validación

Ejecutada el 27/10/2026 (detalle en la [bitácora](../bitacora/2026-10-27-bot-anexos-biblioteca.md)):

1. `node --check` sobre los tres `.mjs`: salida 0.
2. **Fase 1 (modo fichas):** imagen real descargada (115.935 bytes) con informe de rutas; reanudación verificada; conteos completos (774 leídas / 764 válidas / 22-587-155); servidor 9/9 endpoints con rechazo 403 de rutas fuera de la salida.
3. **Fase 2 (modo lista), E2E con lista real** (`LISTA ACCESORIOS HIKVISION GRUPO.xlsx`, 28 referencias, límite 2): DS-1275ZJ **verificado** con 2 PDFs descargados (203 KB + 866 KB) y DS-1275ZJ/HWB **verificado** con 1 imagen (24 KB) y dos páginas verificadas (visiotechsecurity.com, artesecur.com) con título y descripción; `analizar` conserva resultados previos (2 procesadas / 26 pendientes); `listas` agrupa correctamente.

**Limitación conocida:** algunos sitios bloquean peticiones automatizadas (hikvision.com 403, pbtech 403, pcx.com.ph 429). El bot lo registra en `errores` sin inventar datos. Para lotes grandes usar pausa ≥ 1200 ms y reprocesar los fallidos.

## Reversión

Borrar `tools/bot-biblioteca/`, `salida-lista/`, `salida-anexos/`, `odd/tasks/bot-biblioteca-anexos-gui.md`, este documento, la bitácora y la fila añadida en `docs/biblioteca-dominio/README.md`. No hay cambios en la aplicación, en las fichas ni en bases de datos; sin commits.
