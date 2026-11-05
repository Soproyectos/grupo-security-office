# Bitácora — Bot de biblioteca: anexos por producto + modo Lista Excel con búsqueda en internet

**Fecha:** 27/10/2026 (dos entregas el mismo día) · **Agente:** DeepSeek Harness (DSH) · **Rama:** `Esnaider/validacion-biblioteca` (worktree `validacion-biblioteca`) · **Sin commits, push, merge, migraciones ni despliegues.**

## Qué cambió (archivos nuevos)

| Archivo | Contenido |
|---|---|
| `odd/tasks/bot-biblioteca-anexos-gui.md` | Documento de tarea ODD (T1–T11, todas completadas). |
| `tools/bot-biblioteca/descargar-anexos.mjs` | Fase 1 — modo fichas: descarga imagen + PDFs de las fuentes de cada ficha `biblioteca/*.json`, carpetas por producto, informe con rutas, resumen con tres listas, reanudable. |
| `tools/bot-biblioteca/extraer-lista.mjs` | Fase 2 — modo lista: lee la lista Excel (solo REFERENCIA/DESCRIPCION, nunca precios), busca cada referencia en internet (DuckDuckGo), verifica la referencia exacta en las páginas, extrae evidencia (título, descripción, imagen og:image, PDFs enlazados), descarga anexos, escribe informe por producto e índice `catalogo-extraido.json`. |
| `tools/bot-biblioteca/servidor-bot.mjs` | Servidor local 127.0.0.1: API JSON con selector de origen (lista/fichas), lanza el CLI adecuado, expone estado/listas/informes/archivos y abre carpetas. |
| `tools/bot-biblioteca/interfaz/index.html` | Interfaz gráfica: modo Lista Excel o Fichas, origen, destino, límite/pausa, progreso en vivo, tres listas por resultado de búsqueda (verificadas/parciales/no encontradas + pendientes) y por anexos, informe e imagen por producto. |
| `tools/bot-biblioteca/README.md` | Documentación de la herramienta (ambos modos). |
| `docs/procedimientos/bot-anexos-biblioteca.md` | Procedimiento completo con comandos, contratos y reversión. |

Además: una fila en la tabla de estado de `docs/biblioteca-dominio/README.md` (obra «fuente única de avance»).

**Qué NO cambió:** fichas de `biblioteca/` del repo principal (solo lectura), listas Excel de `D:\Empresa\...` (solo lectura; nunca se leen columnas de precios), base de datos, aplicación, skill `catalog-librarian`, contenedores ni servicios.

## Decisiones

- **Fase 2 por petición directa del usuario:** la primera entrega solo consumía fichas ya investigadas; el usuario aclaró que el flujo requerido es «le doy una lista → el bot lee los SKU → busca en internet». Se implementó sin eliminar el modo fichas.
- **Seguridad por construcción heredada:** la lectura del Excel replica la lógica de `extract-catalog.cjs` (solo columnas REFERENCIA/DESCRIPCION; costos, utilidades, márgenes y precios nunca se leen ni salen del extractor). El paquete `xlsx` 0.18.5 se toma del propio `node_modules` del repositorio.
- **Regla de verificación dura:** una página solo cuenta si contiene la referencia exacta (comparación con y sin separadores); buscadores y redes sociales se ignoran como fuentes. Los errores (403/429/timeout) se registran, nunca se rellenan.
- **Sidecar de rutas, no duplicación:** el informe registra rutas, URL y procedencia de las descargas; el redactado de la ficha de vitrina (nombre, categoría, specs del checklist) sigue siendo del agente bibliotecario (fase 3 pendiente).
- **Carpetas separadas por modo:** modo lista → `salida-lista`, modo fichas → `salida-anexos` (evita que un mismo slug sobrescriba informes del otro modo).
- Sin dependencias nuevas; sin instalar nada.

## Qué probé (comandos y resultados reales)

### Fase 1 — modo fichas (tarde)

1. `node --check` sobre `descargar-anexos.mjs` y `servidor-bot.mjs`: **salida 0 en ambos**.
2. Humo del CLI, dos pasadas `--estados verificado --limite 2 --pausa-ms 300`: 1 **imagen real descargada** (ASU650SS-256GT-R, 115.935 bytes, og:image de pcx.com.ph) con informe de rutas absoluta/relativa; errores registrados honestamente (pbtech.co.nz HTTP 403; pcx.com.ph HTTP 429 al repetir en <1 min); **reanudación verificada** (saltó informes existentes); conteos completos tras corregir un defecto de reporte con `--limite` (774 leídas / 764 válidas / 22-587-155 por estado / 10 inválidas).
3. Humo del servidor: **9/9** — página, sugerencias, analizar (764 válidas), listas (fusión ficha+informe), estado, informe, archivo de imagen (200, image/jpeg), ruta fuera de la salida → **403**, ruta desconocida → **404**.

### Fase 2 — modo lista (noche)

1. Verificación previa: `xlsx` 0.18.5 localizado en `node_modules` del worktree; DuckDuckGo HTML responde 200 desde Node con UA de navegador.
2. `node --check` sobre `extraer-lista.mjs` y `servidor-bot.mjs` reescrito: **salida 0 en ambos**.
3. **E2E con lista real** (`LISTA ACCESORIOS HIKVISION GRUPO.xlsx`, 28 referencias únicas, `--limite 2 --pausa-ms 1200`):
   - `DS-1275ZJ` → **verificado**, 2 **PDFs descargados** (203 KB y 866 KB) desde páginas verificadas.
   - `DS-1275ZJ/HWB` → **verificado**, 1 **imagen descargada** (24 KB) y dos páginas verificadas (visiotechsecurity.com, artesecur.com) con título y descripción registrados.
   - `catalogo-extraido.json`: 28 filas (2 procesadas, 26 pendientes).
4. Servidor reiniciado con el código nuevo y endpoints modo lista: `analizar` → total 28, pendientes 26, ya procesadas 2 (conserva resultados previos); `listas` → verificadas 2 / pendientes 26.

## Qué NO probé

- Corrida completa de una lista (28 referencias) ni de las 39 listas; límites de tasa de DuckDuckGo en lotes grandes.
- Navegación real del usuario en el navegador (se probó la API que alimenta la página y la página se sirve correctamente).
- El redactado de fichas de vitrina desde la evidencia: **no está implementado** (fase 3).
- Reproceso con `--forzar` en modo lista sobre informes previos (diseño revisado, sin ejecución).

## Pendientes

- Corrida completa desde la interfaz (reanudable) y reproceso posterior de los `sin_anexos` con error (403/429 de algunos sitios).
- Fase 3: construcción de la ficha de vitrina (nombre, categoría, specs del checklist `producto.schema.json`) a partir de la evidencia; evaluar el `webfetch` del agente bibliotecario para páginas que bloquean bots.
- Decidir si `salida-lista/` y `salida-anexos/` entran en `.gitignore` (decisión del usuario).
- Espejo Engram del documento ODD (runtime sin herramientas `mem_*`).

## Cómo revertir

Borrar `tools/bot-biblioteca/`, `salida-lista/`, `salida-anexos/`, `odd/tasks/bot-biblioteca-anexos-gui.md`, `docs/procedimientos/bot-anexos-biblioteca.md`, esta bitácora y la fila añadida en `docs/biblioteca-dominio/README.md`. No hay cambios en la aplicación, en las fichas ni en bases de datos; sin commits.
