"""Regression contracts for build-time anchors and runtime UI ownership."""

import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).parents[1]
HOOK_PATH = ROOT / "hooks" / "archive.py"
BLOCK_LINKS_PATH = ROOT / "docs" / "javascripts" / "block-links.js"
MATHJAX_PATH = ROOT / "docs" / "javascripts" / "mathjax.js"

SPEC = importlib.util.spec_from_file_location("runtime_contract_archive_hook", HOOK_PATH)
ARCHIVE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ARCHIVE
SPEC.loader.exec_module(ARCHIVE)


class RuntimeUiContractTests(unittest.TestCase):
    def test_page_markdown_builds_all_supported_block_anchors(self):
        source = (
            "Paragraph target ^paragraph-id\n"
            "- List target **with formatting** ^list_id\n"
            "^standalone\n"
            "```text\n"
            "Code marker stays literal ^inside-fence\n"
            "```\n"
        )
        page = SimpleNamespace(file=SimpleNamespace(src_uri="notes/example.md"))

        output = ARCHIVE.on_page_markdown(source, page, {}, None)

        self.assertIn("<span id='paragraph-id' class='block-anchor'></span>", output)
        self.assertIn("<span id='list_id' class='block-anchor'></span>", output)
        self.assertIn("<span id='standalone' class='block-anchor'></span>", output)
        self.assertIn("Code marker stays literal ^inside-fence", output)

    def test_block_links_does_not_rewrite_content_html_for_anchors(self):
        script = BLOCK_LINKS_PATH.read_text(encoding="utf-8")

        self.assertNotIn("upgradeLegacyBlockAnchors", script)
        self.assertNotIn("root.innerHTML", script)
        self.assertIn('"edwinos:hash-layout-settled"', script)

    def test_mathjax_delegates_hash_positioning_to_block_links(self):
        mathjax = MATHJAX_PATH.read_text(encoding="utf-8")
        block_links = BLOCK_LINKS_PATH.read_text(encoding="utf-8")

        self.assertIn('new CustomEvent(HASH_LAYOUT_SETTLED_EVENT', mathjax)
        self.assertNotIn("window.scrollTo", mathjax)
        self.assertIn("realignHashAfterLayout", block_links)
        self.assertIn('behavior: "instant"', block_links)
        self.assertIn("+ 40", block_links)


if __name__ == "__main__":
    unittest.main()
