#!/usr/bin/env python3
"""Reconcile the official library manifest against the public storefront API."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST = ROOT / "biblioteca-import-39-listas.json"
DEFAULT_BASELINE = ROOT / "biblioteca-import-web.json"
DEFAULT_API = "https://dev.gruposecurity.cloud/api/public/products"
EXPECTED_OFFICIAL = 5038
PAGE_SIZE = 48


def normalize_sku(value: str) -> str:
    return "".join(value.upper().split())


def load_manifest(path: Path) -> dict[str, dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    products = payload.get("products") if isinstance(payload, dict) else None
    if payload.get("schemaVersion") != 1 or not isinstance(products, list):
        raise ValueError(f"{path} does not contain schemaVersion=1/products[]")

    result: dict[str, dict[str, Any]] = {}
    for product in products:
        sku = product.get("referencia") if isinstance(product, dict) else None
        if not isinstance(sku, str) or not sku.strip():
            raise ValueError(f"{path} contains a product without referencia")
        key = normalize_sku(sku)
        if key in result:
            raise ValueError(f"{path} contains duplicate SKU {sku}")
        result[key] = product
    return result


def fetch_page(api_url: str, offset: int) -> tuple[list[dict[str, Any]], int]:
    query = urlencode({"offset": offset, "limit": PAGE_SIZE})
    request = Request(
        f"{api_url}?{query}",
        headers={"Accept": "application/json", "User-Agent": "grupo-security-library-verifier/1"},
    )
    with urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    value: Any = payload
    for _ in range(3):
        if isinstance(value, dict) and isinstance(value.get("data"), list):
            items = value["data"]
            meta = value.get("meta")
            if not isinstance(meta, dict) or not isinstance(meta.get("total"), int):
                raise ValueError("public API response has no numeric meta.total")
            return items, meta["total"]
        if isinstance(value, dict) and "data" in value:
            value = value["data"]
            continue
        break
    raise ValueError("public API response has no data[]/meta envelope")


def fetch_all(api_url: str) -> tuple[list[dict[str, Any]], int]:
    products: list[dict[str, Any]] = []
    expected_total: int | None = None
    offset = 0
    while expected_total is None or offset < expected_total:
        page, total = fetch_page(api_url, offset)
        if expected_total is None:
            expected_total = total
        elif total != expected_total:
            raise ValueError(f"public total changed during pagination: {expected_total} -> {total}")
        if not page and offset < expected_total:
            raise ValueError(f"pagination stopped at {offset} of {expected_total}")
        products.extend(page)
        offset += len(page)
    if expected_total is None or len(products) != expected_total:
        raise ValueError(f"incomplete public read: expected {expected_total}, received {len(products)}")
    return products, expected_total


def reconcile(
    official: dict[str, dict[str, Any]],
    baseline: dict[str, dict[str, Any]],
    public_products: list[dict[str, Any]],
    total: int,
) -> tuple[dict[str, Any], list[str]]:
    public_by_sku: dict[str, dict[str, Any]] = {}
    duplicate_public: list[str] = []
    for product in public_products:
        sku = product.get("sku") if isinstance(product, dict) else None
        if not isinstance(sku, str) or not sku.strip():
            duplicate_public.append("<sin SKU>")
            continue
        key = normalize_sku(sku)
        if key in public_by_sku:
            duplicate_public.append(sku)
        else:
            public_by_sku[key] = product

    official_keys = set(official)
    baseline_keys = set(baseline)
    required_keys = official_keys | baseline_keys
    missing_official = sorted(official_keys - set(public_by_sku))
    missing_baseline = sorted(baseline_keys - set(public_by_sku))
    without_category = sorted(
        key
        for key in official_keys & set(public_by_sku)
        if not str(public_by_sku[key].get("categoryName") or "").strip()
    )
    without_name = sorted(
        key
        for key in official_keys & set(public_by_sku)
        if not str(public_by_sku[key].get("name") or "").strip()
    )
    informational = sum(
        public_by_sku[key].get("isInformational") is True
        for key in official_keys & set(public_by_sku)
    )

    errors: list[str] = []
    if len(official) != EXPECTED_OFFICIAL:
        errors.append(f"official manifest has {len(official)} SKU, expected {EXPECTED_OFFICIAL}")
    if missing_official:
        errors.append(f"{len(missing_official)} official SKU are missing")
    if missing_baseline:
        errors.append(f"{len(missing_baseline)} previously public SKU disappeared")
    if without_category:
        errors.append(f"{len(without_category)} official SKU have no public category")
    if without_name:
        errors.append(f"{len(without_name)} official SKU have no public name")
    if duplicate_public:
        errors.append(f"{len(duplicate_public)} duplicate/missing public SKU values were returned")
    if total < len(required_keys):
        errors.append(f"public total {total} is below required union {len(required_keys)}")

    summary = {
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
        "officialSkuCount": len(official),
        "previouslyPublicSkuCount": len(baseline),
        "requiredUnionCount": len(required_keys),
        "publicTotal": total,
        "officialVisible": len(official_keys) - len(missing_official),
        "officialInformational": informational,
        "officialCommercial": len(official_keys) - len(missing_official) - informational,
        "officialWithoutCategory": without_category,
        "officialWithoutName": without_name,
        "missingOfficialSkus": missing_official,
        "missingPreviouslyPublicSkus": missing_baseline,
        "duplicatePublicSkus": sorted(duplicate_public),
        "status": "ok" if not errors else "failed",
        "errors": errors,
    }
    return summary, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--attempts", type=int, default=12)
    parser.add_argument("--delay", type=float, default=10.0)
    args = parser.parse_args()

    official = load_manifest(args.manifest)
    baseline = load_manifest(args.baseline)
    last_summary: dict[str, Any] | None = None
    last_error: Exception | None = None

    for attempt in range(1, max(args.attempts, 1) + 1):
        try:
            public_products, total = fetch_all(args.api)
            last_summary, errors = reconcile(official, baseline, public_products, total)
            if not errors:
                break
            last_error = ValueError("; ".join(errors))
        except Exception as exc:  # Network/API consistency is retried as a unit.
            last_error = exc
        if attempt < args.attempts:
            print(f"Attempt {attempt}/{args.attempts} failed: {last_error}; retrying...")
            time.sleep(args.delay)

    if last_summary is None:
        last_summary = {
            "verifiedAt": datetime.now(timezone.utc).isoformat(),
            "status": "failed",
            "errors": [str(last_error or "verification did not run")],
        }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(last_summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(last_summary, ensure_ascii=False, indent=2))
    return 0 if last_summary.get("status") == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
