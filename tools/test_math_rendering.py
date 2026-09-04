"""Regression tests for the self-contained MathJax rendering pipeline."""

import unittest
from pathlib import Path

try:
    from tools import math_rendering_checks as checks
except ModuleNotFoundError:  # unittest discovery with tools as the top-level path
    import math_rendering_checks as checks


ROOT = Path(__file__).parents[1]


class MathRenderingTests(unittest.TestCase):
    def test_mathjax_runtime_is_local_and_versioned(self):
        source, version, runtime = checks.configured_runtime(ROOT)
        self.assertNotIn("cdn.jsdelivr.net", source)
        self.assertIn("document.currentScript", source)
        self.assertIn('boldsymbol: ["\\\\mathbf{#1}", 1]', source)
        self.assertIn('mathclap: ["\\\\smash{#1}", 1]', source)
        self.assertTrue(runtime.is_file(), runtime)

        vendor_root = runtime.parents[2]
        version_record = (vendor_root / "VERSION").read_text(encoding="utf-8")
        self.assertIn(f"MathJax {version}", version_record)

    def test_runtime_fonts_and_license_are_vendored(self):
        _, _, runtime = checks.configured_runtime(ROOT)
        vendor_root = runtime.parents[2]
        fonts = sorted((runtime.parent / "output/chtml/fonts/woff-v2").glob("*.woff"))

        self.assertEqual(len(fonts), 23)
        self.assertTrue(all(font.stat().st_size > 0 for font in fonts))
        license_text = (vendor_root / "LICENSE").read_text(encoding="utf-8")
        self.assertIn("Apache License", license_text)

    def test_config_is_cache_busted_and_notes_need_no_missing_extensions(self):
        self.assertEqual(checks.validate_mathjax_assets(ROOT), "3.2.2")
        self.assertGreater(checks.validate_repository_notes(ROOT), 0)

    def test_missing_extension_is_rejected_but_code_examples_are_ignored(self):
        with self.assertRaises(checks.MathRenderingError):
            checks.validate_markdown_items((("note.md", r"Formula: $\ce{H2O}$"),))
        self.assertEqual(
            checks.validate_markdown_items((("note.md", r"`$\ce{H2O}$`"),)),
            1,
        )

    def test_inline_display_math_delimiters_are_rejected(self):
        with self.assertRaises(checks.MathRenderingError):
            checks.validate_markdown_items((("note.md", "Text: $$x=1$$\n"),))
        self.assertEqual(
            checks.validate_markdown_items((("note.md", "$$\nx=1\n$$\n"),)),
            1,
        )

    def test_unbalanced_display_math_is_rejected(self):
        with self.assertRaisesRegex(checks.MathRenderingError, "balanced"):
            checks.validate_markdown_items((("note.md", "$$\nx=1\n"),))

    def test_escaped_display_delimiter_in_prose_is_ignored(self):
        self.assertEqual(
            checks.validate_markdown_items(
                (("note.md", r"A literal delimiter looks like \$\$ in prose."),)
            ),
            1,
        )

    def test_display_delimiters_inside_quoted_fences_are_ignored(self):
        markdown = "> ```text\n> $$not math$$\n> ```\n"
        self.assertEqual(checks.validate_markdown_items((("note.md", markdown),)), 1)


if __name__ == "__main__":
    unittest.main()
