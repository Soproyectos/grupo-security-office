---
name: catalog-librarian
description: "Trigger: biblioteca de catalogo, enriquecer productos, listas de proveedor, fichas de vitrina. Despliega un agente OpenCode que investiga referencias en la web y genera la ficha de cada producto."
license: Apache-2.0
metadata:
  author: zatairo
  version: "1.0"
---

## Activation Contract

Load when building or refreshing the product library from supplier price lists: extracting references from Excel, researching them on the web, or producing per-product vitrina data for later DB import.

Do not load for a routine list import (price refresh) — the import wizard already covers that.

## Hard Rules

| Rule | Requirement |
|------|-------------|
| No commercial data leaves the extractor | `catalogo-base.json` carries reference, description, origin sheet and brand hint only. Never cost, margin or price columns. |
| Every field declares its origin | `lista`, `web` (with URL) or `inferido` (with `razon`). A field without origin is invalid output. |
| Inference is allowed, silence is not | The agent may deduce a value from evidence, but must record why. |
| Web data needs an exact match | Accept a page only when the exact reference appears on it. Otherwise `no_encontrado`. |
| One file per product | Write `biblioteca/<slug>.json`; skip files that exist, so runs resume after any interruption. |
| Never invent a source | A URL that was not fetched must not appear in `fuentes_consultadas`. |

## Decision Gates

| Situación | Acción |
|---|---|
| La lista ya trae nombre útil (<=70 chars) | Úsalo con `origen: lista`. No gastes búsqueda web. |
| Descripción larga sin nombre corto | Redacta uno <=70 chars desde esa descripción, `origen: inferido` + `razon`. |
| Referencia de marca reconocible | Busca ficha oficial; completa specs e imagen con `fuente`. |
| Genérico sin ficha (cable, resorte, patch cord) | `estado: no_encontrado`. No adivines de qué producto se trata. |
| La página encontrada no contiene la referencia exacta | Descártala. No es ese producto. |

## Execution Steps

1. Run `assets/extract-catalog.cjs <carpeta-listas> <salida>` locally → `catalogo-base.json`.
2. Copy that file and `assets/agent-bibliotecario.md` to the server; the agent definition goes in `~/.config/opencode/agent/`.
3. Launch the agent over a batch range; it writes one JSON per product.
4. Validate every output against `assets/producto.schema.json`.
5. Report counts per `estado` before importing anything into the database.

## Output Contract

Return: total products processed, the count for each `estado` (`verificado` / `parcial` / `no_encontrado`), which fields came back empty most often, and the output path. Never report success without the per-`estado` counts.

## References

- `references/vitrina-fields.md` — meaning and rule of each vitrina field.
- `assets/producto.schema.json` — per-product output contract.
- `assets/agent-bibliotecario.md` — the OpenCode agent definition deployed to the server.
