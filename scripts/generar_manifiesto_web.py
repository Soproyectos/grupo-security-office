#!/usr/bin/env python3
"""Filtra el manifiesto maestro a los SKUs publicados por el storefront.

Consulta únicamente el endpoint público de productos, pagina hasta completar el
total reportado y genera un manifiesto apto para ``--updates-only``. No usa
credenciales ni modifica la web o la base de datos.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT / "biblioteca-import-39-listas.json"
DEFAULT_OUTPUT = ROOT / "biblioteca-import-web.json"
DEFAULT_API = "https://api-dev.gruposecurity.com.co/api/public/products"
PAGE_SIZE = 48


def normalize_sku(value: str) -> str:
    return re.sub(r"\s+", "", value).upper()


def read_page(api_url: str, offset: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    query = urlencode({"limit": PAGE_SIZE, "offset": offset})
    request = Request(
        f"{api_url}?{query}",
        headers={"Accept": "application/json", "User-Agent": "grupo-security-manifest/1"},
    )
    with urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    result = payload.get("data", payload)
    if not isinstance(result, dict):
        raise ValueError("Respuesta pública sin objeto data/meta")
    items = result.get("data")
    meta = result.get("meta")
    if not isinstance(items, list) or not isinstance(meta, dict):
        raise ValueError("Respuesta pública sin colección data o metadata")
    return items, meta


def fetch_public_products(api_url: str) -> list[dict[str, Any]]:
    products: list[dict[str, Any]] = []
    expected_total: int | None = None
    offset = 0

    while expected_total is None or offset < expected_total:
        page, meta = read_page(api_url, offset)
        page_total = int(meta.get("total", 0))
        if expected_total is None:
            expected_total = page_total
        elif page_total != expected_total:
            raise ValueError(
                f"El total público cambió durante la lectura: {expected_total} -> {page_total}"
            )
        products.extend(page)
        if not page:
            break
        offset += len(page)

    if expected_total is None or len(products) != expected_total:
        raise ValueError(
            f"Lectura pública incompleta: se esperaban {expected_total}, llegaron {len(products)}"
        )
    return products


def build_web_manifest(
    source_manifest: dict[str, Any],
    public_products: list[dict[str, Any]],
    api_url: str,
) -> dict[str, Any]:
    source_products = source_manifest.get("products")
    if source_manifest.get("schemaVersion") != 1 or not isinstance(source_products, list):
        raise ValueError("El manifiesto maestro no cumple schemaVersion=1/products[]")

    by_sku: dict[str, dict[str, Any]] = {}
    for ficha in source_products:
        reference = ficha.get("referencia") if isinstance(ficha, dict) else None
        if not isinstance(reference, str) or not reference.strip():
            raise ValueError("El manifiesto maestro contiene una ficha sin referencia")
        normalized = normalize_sku(reference)
        if normalized in by_sku:
            raise ValueError(f"Referencia duplicada en manifiesto maestro: {reference}")
        by_sku[normalized] = ficha

    selected: list[dict[str, Any]] = []
    missing: list[str] = []
    seen_public: set[str] = set()
    for product in public_products:
        sku = product.get("sku") if isinstance(product, dict) else None
        if not isinstance(sku, str) or not sku.strip():
            raise ValueError("El catálogo público contiene un producto sin SKU")
        normalized = normalize_sku(sku)
        if normalized in seen_public:
            raise ValueError(f"SKU público duplicado: {sku}")
        seen_public.add(normalized)
        ficha = by_sku.get(normalized)
        if ficha:
            selected.append(ficha)
        else:
            missing.append(sku)
            selected.append(
                {
                    "referencia": sku,
                    "estado": "pendiente_enriquecimiento",
                    "fuentes_consultadas": [api_url],
                }
            )

    selected.sort(key=lambda ficha: normalize_sku(ficha["referencia"]))
    curated = sum(1 for ficha in selected if ficha["estado"] != "pendiente_enriquecimiento")
    return {
        "schemaVersion": 1,
        "source": "catálogo público vigente + biblioteca-import-39-listas.json",
        "metadata": {
            "generatedOn": date.today().isoformat(),
            "generator": "scripts/generar_manifiesto_web.py",
            "publicApi": api_url,
            "publicProducts": len(public_products),
            "curatedProducts": curated,
            "pendingProducts": len(selected) - curated,
            "matchedFromMaster": len(selected) - len(missing),
            "missingFromMaster": len(missing),
            "missingSkus": missing,
        },
        "products": selected,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--api-url", default=DEFAULT_API)
    args = parser.parse_args()

    source = json.loads(args.source.resolve().read_text(encoding="utf-8"))
    public_products = fetch_public_products(args.api_url)
    manifest = build_web_manifest(source, public_products, args.api_url)
    output = args.output.resolve()
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    metadata = manifest["metadata"]
    print(
        f"{output}: {metadata['publicProducts']} productos publicados "
        f"({metadata['curatedProducts']} curados, {metadata['pendingProducts']} pendientes, "
        f"{metadata['missingFromMaster']} ausentes del manifiesto maestro)"
    )


if __name__ == "__main__":
    main()
