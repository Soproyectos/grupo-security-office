"""Pruebas de la generación y del contrato de aprobación de nombres."""

from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from proponer_nombres_vitrina import propose_name, write_approved_manifest, write_proposals


class ProponerNombresVitrinaTest(unittest.TestCase):
    def test_propone_nombre_corto_sin_inventar_modelo(self) -> None:
        self.assertEqual(propose_name("CÁMARA IP 4MP MODELO DS-2CD1043"), "Cámara IP 4MP Modelo DS-2CD1043")
        name = propose_name("CÁMARA IP 4MP MODELO DS-2CD1043 CON UNA DESCRIPCIÓN EXTREMADAMENTE LARGA")
        self.assertLessEqual(len(name), 70)
        self.assertIn("DS-2CD1043", name)
        self.assertEqual(propose_name("   "), "")

    def test_genera_propuestas_solo_para_pendientes(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent.parent) as temp:
            root = Path(temp)
            source = root / "source.json"
            source.write_text(json.dumps({"schemaVersion": 1, "products": [
                {"referencia": "SKU-1", "estado": "pendiente_enriquecimiento", "descripcion": {"valor": "CAMARA IP 4MP"}, "categoria": {"valor": "Cámaras IP"}},
                {"referencia": "SKU-2", "estado": "pendiente_enriquecimiento"},
                {"referencia": "SKU-3", "estado": "parcial", "nombre_vitrina": {"valor": "Ya curado"}},
            ]}), encoding="utf-8")
            output = root / "propuestas.csv"
            counts = write_proposals(source, root / "no-audit.json", output)
            with output.open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["nombre_propuesto"], "Cámara IP 4MP")
            self.assertEqual(rows[0]["nombre_aprobado"], "")
            self.assertEqual(rows[0]["skus_con_este_nombre"], "")
            self.assertEqual(counts["sin_descripcion"], 1)

    def test_solo_los_nombres_aprobados_pasan_a_parcial(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent.parent) as temp:
            root = Path(temp)
            source = root / "source.json"
            source.write_text(json.dumps({"schemaVersion": 1, "products": [
                {"referencia": "SKU-1", "estado": "pendiente_enriquecimiento", "categoria": {"valor": "Cámaras IP"}},
                {"referencia": "SKU-2", "estado": "pendiente_enriquecimiento"},
            ]}), encoding="utf-8")
            approvals = root / "aprobados.csv"
            approvals.write_text("referencia,nombre_aprobado\nSKU-1,Cámara IP aprobada\nSKU-2,\n", encoding="utf-8")
            output = root / "updates.json"
            self.assertEqual(write_approved_manifest(source, approvals, output), 1)
            records = json.loads(output.read_text(encoding="utf-8"))["products"]
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["estado"], "parcial")
            self.assertEqual(records[0]["categoria"]["valor"], "Cámaras IP")
            self.assertEqual(records[0]["nombre_vitrina"]["valor"], "Cámara IP aprobada")

    def test_rechaza_sku_ajeno(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent.parent) as temp:
            root = Path(temp)
            source = root / "source.json"
            source.write_text(json.dumps({"schemaVersion": 1, "products": []}), encoding="utf-8")
            approvals = root / "aprobados.csv"
            approvals.write_text("referencia,nombre_aprobado\nAJENO,Nombre aprobado\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "fuera de pendientes"):
                write_approved_manifest(source, approvals, root / "updates.json")
            self.assertFalse((root / "updates.json").exists())


if __name__ == "__main__":
    unittest.main()
