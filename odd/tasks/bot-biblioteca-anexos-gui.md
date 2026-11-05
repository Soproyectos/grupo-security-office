# Bot Biblioteca: anexos (imágenes/PDFs) por producto + interfaz gráfica

**Fecha:** 2026-10-27 · **Agente:** DeepSeek Harness (DSH) · **Rama:** `Esnaider/validacion-biblioteca` (worktree `validacion-biblioteca`) · **Sin commits** (requieren aprobación explícita).

## Objetivo

Extender el bot de biblioteca para que, por cada ficha de producto (`biblioteca/*.json` del repo principal):

1. Descargue la **imagen oficial** y los **PDFs** (datasheets / "data chip") disponibles en las fuentes consultadas.
2. Guarde los archivos en **carpetas con el nombre de cada producto** (`salida-anexos/anexos/<slug>/imagenes|pdfs/`).
3. Registre las **rutas de ubicación** en un **informe por producto** (`salida-anexos/informes/<slug>.json`) y en un resumen general con las **tres listas** (completos / parciales / sin anexos).
4. Ofrezca una **interfaz gráfica local** para elegir origen/destino, lanzar la descarga, ver progreso y recorrer las tres listas con acceso a carpetas e informes.

## Problema

Las 774 fichas existentes solo guardan URLs (`fuentes_consultadas`), no los archivos; el checklist actual (`producto.schema.json`) no tiene campo para PDFs y la mayoría de fichas ni siquiera trae `imagen`. No existe interfaz: el flujo previo es solo CLI.

## Por qué

El usuario necesita validar manualmente con tres listas y quiere los anexos reales (imágenes, PDFs) adjuntos por producto, no solo enlaces.

## Alcance autorizado (por el usuario, 27/10/2026)

- Profundizar primero en descarga de PDFs e imágenes ancladas a carpetas por producto, con rutas en el informe de cada producto.
- Después, la interfaz gráfica del bot.
- Todo documentado en este worktree. Sin commits, sin push, sin tocar bases de datos, servicios ni la aplicación.

## Restricciones

- **Una autoridad por dato**: las fichas del repo principal NO se modifican; el informe es un anexo de rutas con su propia procedencia, sin duplicar datos de vitrina ni precios.
- Sin dependencias nuevas (Node 24, solo `node:*`). Sin secretos. Solo localhost.
- Se ignoran archivos no-ficha de `biblioteca/` (respaldos > 512 KB).
- Procedencia honesta: cada anexo registra `url`, `fuente_pagina` (de donde se dedujo, si aplica), bytes y fecha; los errores se registran, no se ocultan.

## Checklist

- [x] T1 — Leer reglas del dominio (`docs/biblioteca-dominio/README.md`, `INSTRUCCIONES-AGENTES.md`) y fichas reales (estructura verificada: sin `imagen`/`slug`, respaldos mezclados).
- [x] T2 — CLI `tools/bot-biblioteca/descargar-anexos.mjs` (descarga imagen + PDFs, reanudable, filtro por estado/límite/slugs, informe por producto, resumen con 3 listas).
- [x] T3 — Servidor local `tools/bot-biblioteca/servidor-bot.mjs` (API JSON en 127.0.0.1, lanza el CLI, expone estado/listas/informes/archivos).
- [x] T4 — Interfaz gráfica `tools/bot-biblioteca/interfaz/index.html` (origen, destino, filtros, progreso, vista de 3 listas por estado y por clasificación de anexos, informe y apertura de carpeta).
- [x] T5 — Documentación: `tools/bot-biblioteca/README.md`, `docs/procedimientos/bot-anexos-biblioteca.md`, bitácora `docs/bitacora/2026-10-27-bot-anexos-biblioteca.md`, fila en la tabla de estado de `docs/biblioteca-dominio/README.md`.
- [x] T6 — Validación ejecutada (27/10/2026): `node --check` salida 0 en ambos .mjs; humo del CLI en 2 pasadas (2+2 productos, reanudación verificada, conteos completos 774/764 y 22-587-155, imagen real de 115.935 bytes descargada); humo del servidor 9/9 endpoints (incluye 403 para rutas fuera de la salida). Evidencia en la bitácora.
- [x] T7 — Evidencia real registrada en `docs/bitacora/2026-10-27-bot-anexos-biblioteca.md` y `docs/procedimientos/bot-anexos-biblioteca.md`.
- [x] T8 — Fase 2 por petición del usuario (27/10/2026): CLI `extraer-lista.mjs` que lee la lista Excel (solo REFERENCIA/DESCRIPCION, nunca precios), busca cada referencia en internet, verifica la referencia exacta en las páginas y descarga imagen + PDFs con informe e índice.
- [x] T9 — Servidor e interfaz ampliados con selector de origen «Lista Excel / Fichas ya investigadas» y vistas por resultado de búsqueda.
- [x] T10 — Validación E2E real con `LISTA ACCESORIOS HIKVISION GRUPO.xlsx` (28 referencias, 2 procesadas: ambas verificadas; 2 PDFs y 1 imagen descargados; endpoints modo lista correctos, conservando resultados previos).
- [x] T11 — Documentación actualizada en ambas fases (README de la herramienta, procedimiento, bitácora, fila en el índice del dominio).

## Ruta de implementación

Directa (un solo escritor, DSH): herramienta nueva autocontenida en `tools/bot-biblioteca/`, sin tocar código de la aplicación ni de la skill `catalog-librarian`.

## TDD

No activado para esta herramienta nueva (no hay runner configurado para .mjs del tool). Validación funcional acordada: `node --check` + pruebas de humo reales (CLI y servidor) documentadas en bitácora.

## Espejo Engram

Pendiente: las herramientas `mem_*` de Engram no están disponibles en este runtime. Este archivo es la copia de recuperación local hasta que un agente con Engram lo refleje en `odd/bot-biblioteca-anexos-gui/tasks`.

## Próxima fase (fase 3, no autorizada todavía)

Construcción de la **ficha de vitrina completa** (nombre ≤70, categoría, specs del checklist `producto.schema.json`) a partir de la evidencia que hoy deja el bot (páginas verificadas, título, descripción, imagen, PDFs), hoy tarea del agente bibliotecario; y reproceso de los `sin_anexos` con error 403/429.
