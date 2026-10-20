from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("verificar_biblioteca_publica.py")
SPEC = importlib.util.spec_from_file_location("verificar_biblioteca_publica", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FetchAllTest(unittest.TestCase):
    @patch.object(MODULE.time, "sleep")
    @patch.object(MODULE, "fetch_page")
    def test_waits_between_pages_to_respect_public_rate_limit(self, fetch_page, sleep):
        fetch_page.side_effect = [
            ([{"sku": "A"}], 2),
            ([{"sku": "B"}], 2),
        ]

        products, total = MODULE.fetch_all("https://example.test/products", page_delay=1.2)

        self.assertEqual(products, [{"sku": "A"}, {"sku": "B"}])
        self.assertEqual(total, 2)
        self.assertEqual(fetch_page.call_count, 2)
        sleep.assert_called_once_with(1.2)

    @patch.object(MODULE.time, "sleep")
    @patch.object(MODULE, "fetch_page")
    def test_can_disable_page_delay_for_local_checks(self, fetch_page, sleep):
        fetch_page.side_effect = [
            ([{"sku": "A"}], 2),
            ([{"sku": "B"}], 2),
        ]

        MODULE.fetch_all("https://example.test/products", page_delay=0)

        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
