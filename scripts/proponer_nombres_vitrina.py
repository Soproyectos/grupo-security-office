#!/usr/bin/env python3
"""Propone nombres de vitrina y prepara una importación solo de nombres aprobados.

No se conecta a la base de datos ni publica productos. La propuesta usa solo
la descripción disponible en el manifiesto oficial y preserva los modelos.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "biblioteca-import-39-listas.json"
AUDIT = ROOT / "biblioteca-import-39-listas.report.json"
PROPOSALS = ROOT / "biblioteca-nombres-propuestos.csv"
APPROVED = ROOT / "biblioteca-nombres-aprobados.csv"
UPDATE_MANIFEST = ROOT / "biblioteca-import-nombres-aprobados.json"
MAX_NAME = 70

WORDS = {
    "CAMARA": "Cámara", "CAMARAS": "Cámaras", "CABLE": "Cable",
    "CONEXION": "Conexión", "CONEXIONES": "Conexiones", "ELECTRICO": "Eléctrico",
    "ELECTRICA": "Eléctrica", "PROTECCION": "Protección", "AUTOMATIZACION": "Automatización",
    "SENSOR": "Sensor", "SENSORES": "Sensores", "MODULO": "Módulo",
    "METALICO": "Metálico", "MAGNETICO": "Magnético", "BATERIA": "Batería",
    "VIDEO": "Video", "ALIMENTACION": "Alimentación", "GRABADOR": "Grabador",
    "BOTON": "Botón", "PANTALLA": "Pantalla", "FUENTE": "Fuente",
    "PARA": "para", "CON": "con", "DE": "de", "DEL": "del", "Y": "y", "EN": "en",
    "POR": "por", "SIN": "sin", "TIPO": "tipo", "HASTA": "hasta",
}
ACRONYMS = {"IP", "HD", "HDMI", "USB", "UPS", "UTP", "FTP", "POE", "PTZ", "DVR", "NVR", "CCTV", "LED", "LCD", "RFID", "WIFI", "WI-FI", "AC", "DC"}


def normalize_sku(value: str) -> str:
    return re.sub(r"\s+", "", value).upper()


def load_manifest(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    products = raw.get("products") if isinstance(raw, dict) else None
    if not isinstance(raw, dict) or raw.get("schemaVersion") != 1 or not isinstance(products, list):
        raise ValueError(f"Manifiesto inválido: {path}")
    seen: set[str] = set()
    for product in products:
        sku = product.get("referencia") if isinstance(product, dict) else None
        if not isinstance(sku, str) or not sku.strip():
            raise ValueError("Producto sin SKU")
        key = normalize_sku(sku)
        if key in seen:
            raise ValueError(f"SKU duplicado: {sku}")
        seen.add(key)
    return products


def title_word(word: str) -> str:
    prefix_match = re.fullmatch(r"([^\w]*)([\wÁÉÍÓÚÜÑ-]+)([^\w]*)", word)
    if not prefix_match:
        return word
    prefix, core, suffix = prefix_match.groups()
    upper = core.upper()
    if upper in ACRONYMS:
        result = upper
    elif any(char.isdigit() for char in core) or any(char in core for char in "/-_"):
        result = core
    else:
        result = WORDS.get(upper, core.capitalize())
    return prefix + result + suffix


def propose_name(description: str) -> str:
    compact = re.sub(r"\s+", " ", description).strip()
    if not compact:
        return ""
    words = [title_word(word) for word in compact.split(" ")]
    result: list[str] = []
    for word in words:
        candidate = " ".join(result + [word])
        if len(candidate) > MAX_NAME:
            break
        result.append(word)
    return " ".join(result).rstrip(" ,;-/")


def conflict_skus(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {
        duplicate["sku"]
        for duplicate in raw.get("duplicates", [])
        if duplicate.get("hasDescriptionConflict") or duplicate.get("hasCategoryConflict")
    }


def write_proposals(source: Path, audit: Path, output: Path) -> Counter[str]:
    products = load_manifest(source)
    conflicts = conflict_skus(audit)
    rows: list[dict[str, str]] = []
    counts: Counter[str] = Counter()
    for ficha in products:
        if ficha.get("estado") != "pendiente_enriquecimiento":
            continue
        sku = ficha["referencia"]
        description = ficha.get("descripcion", {}).get("valor", "")
        name = propose_name(description) if isinstance(description, str) else ""
        needs_attention = normalize_sku(sku) in conflicts
        status = (
            "sin_descripcion" if not description else
            "sin_propuesta" if not name else
            "revisar_conflicto" if needs_attention else
            "revisar_recorte" if len(description) > MAX_NAME else
            "revisar"
        )
        rows.append({
            "referencia": sku,
            "nombre_propuesto": name,
            "nombre_aprobado": "",
            "categoria": ficha.get("categoria", {}).get("valor", ""),
            "descripcion_original": description,
            "estado_revision": status,
            "skus_con_este_nombre": "",
        })
        counts[status] += 1
    name_counts = Counter(row["nombre_propuesto"].casefold() for row in rows if row["nombre_propuesto"])
    for row in rows:
        name = row["nombre_propuesto"]
        if name and name_counts[name.casefold()] > 1:
            row["skus_con_este_nombre"] = str(name_counts[name.casefold()])
            counts["propuestas_con_nombre_repetido"] += 1
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]) if rows else [
            "referencia", "nombre_propuesto", "nombre_aprobado", "categoria",
            "descripcion_original", "estado_revision", "skus_con_este_nombre",
        ])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Propuestas: {output} | {len(rows)} pendientes | {dict(counts)}")
    return counts


def write_approved_manifest(source: Path, approvals: Path, output: Path) -> int:
    products = load_manifest(source)
    pending = {normalize_sku(p["referencia"]): p for p in products if p.get("estado") == "pendiente_enriquecimiento"}
    accepted: list[dict[str, Any]] = []
    seen: set[str] = set()
    with approvals.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or not {"referencia", "nombre_aprobado"}.issubset(reader.fieldnames):
            raise ValueError("El CSV requiere columnas referencia y nombre_aprobado")
        for line, row in enumerate(reader, start=2):
            sku = (row.get("referencia") or "").strip()
            approved_name = re.sub(r"\s+", " ", row.get("nombre_aprobado") or "").strip()
            if not approved_name:
                continue
            key = normalize_sku(sku)
            if key in seen:
                raise ValueError(f"SKU aprobado dos veces en fila {line}: {sku}")
            if key not in pending:
                raise ValueError(f"SKU fuera de pendientes en fila {line}: {sku}")
            if len(approved_name) > MAX_NAME:
                raise ValueError(f"Nombre de más de {MAX_NAME} caracteres en fila {line}: {sku}")
            if normalize_sku(approved_name) == key:
                raise ValueError(f"Nombre aprobado igual al SKU en fila {line}: {sku}")
            ficha = dict(pending[key])
            ficha["estado"] = "parcial"
            ficha["nombre_vitrina"] = {
                "valor": approved_name,
                "origen": "revision-humana",
                "razon": "Nombre revisado en biblioteca-nombres-aprobados.csv",
            }
            accepted.append(ficha)
            seen.add(key)
    if not accepted:
        raise ValueError("No hay nombres aprobados; no se generó manifiesto")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        "schemaVersion": 1,
        "source": f"Nombres aprobados para {source.name}",
        "metadata": {"approvedNames": len(accepted), "updatesOnly": True},
        "products": accepted,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Manifiesto de actualización: {output} | {len(accepted)} nombres aprobados")
    return len(accepted)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--audit", type=Path, default=AUDIT)
    parser.add_argument("--proposals", type=Path, default=PROPOSALS)
    parser.add_argument("--approved", type=Path, help=f"CSV revisado; ejemplo: {APPROVED}")
    parser.add_argument("--output", type=Path, default=UPDATE_MANIFEST)
    args = parser.parse_args()
    if args.approved:
        write_approved_manifest(args.source, args.approved, args.output)
    else:
        write_proposals(args.source, args.audit, args.proposals)


if __name__ == "__main__":
    main()
