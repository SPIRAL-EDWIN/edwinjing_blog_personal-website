"""Regression contracts for the EdwinOS UI entry points and ownership."""

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
MKDOCS_PATH = ROOT / "mkdocs.yml"
STYLES_DIR = ROOT / "docs" / "stylesheets"
EDWINOS_PATH = STYLES_DIR / "edwinos.css"


class UiArchitectureContractTests(unittest.TestCase):
    def test_mkdocs_loads_one_custom_ui_stylesheet(self):
        config = MKDOCS_PATH.read_text(encoding="utf-8")
        match = re.search(
            r"(?m)^extra_css:\s*\n(?P<body>(?:^[ \t]+-[^\n]*\n)+)",
            config,
        )

        self.assertIsNotNone(match)
        entries = re.findall(r"^[ \t]+-\s+([^\s#]+)", match.group("body"), re.M)
        self.assertEqual(1, len(entries))
        self.assertRegex(entries[0], r"^stylesheets/edwinos\.css\?v=\d+[a-z]$")

    def test_legacy_css_entry_points_are_removed(self):
        self.assertFalse((STYLES_DIR / "extra.css").exists())
        self.assertFalse((STYLES_DIR / "edwinos-overrides.css").exists())
        self.assertTrue(EDWINOS_PATH.is_file())

    def test_all_font_imports_precede_non_import_rules(self):
        stylesheet = EDWINOS_PATH.read_text(encoding="utf-8")
        imports = list(re.finditer(r"(?m)^@import\s+[^;]+;", stylesheet))

        self.assertEqual(2, len(imports))
        prefix = stylesheet[: imports[-1].end()]
        self.assertEqual(2, len(re.findall(r"(?m)^@import\s+", prefix)))
        self.assertNotRegex(stylesheet[imports[-1].end() :], r"(?m)^@import\s+")

    def test_stylesheet_documents_its_cascade_contract(self):
        stylesheet = EDWINOS_PATH.read_text(encoding="utf-8")

        self.assertIn("EdwinOS unified stylesheet", stylesheet[:2000])
        self.assertIn("CASCADE CONTRACT", stylesheet[:2000])
        self.assertIn("Historical Material and site baseline", stylesheet)
        self.assertIn("EdwinOS final component layer", stylesheet)


if __name__ == "__main__":
    unittest.main()
