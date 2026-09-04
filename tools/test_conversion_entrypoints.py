"""Regression tests for the repository's auxiliary conversion entrypoints."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]


def load_script(name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


GENERIC = load_script(
    "generic_obsidian_converter",
    ".github/skills/obsidian-to-mkdocs/scripts/convert_obsidian.py",
)
NORMALIZER = load_script(
    "obsidian_list_normalizer",
    ".github/skills/obsidian-to-mkdocs/scripts/normalize_tabs.py",
)
WIKILINKS = load_script(
    "obsidian_wikilink_converter",
    ".github/skills/obsidian-wikilink-converter/scripts/convert_obsidian_wikilinks.py",
)


class ConversionEntrypointTests(unittest.TestCase):
    def test_generic_converter_protects_code_comments_and_math(self):
        source = (
            "Visible [[Page]].\n"
            "`[[Inline]]`\n"
            "```text\n![[Code.png]]\n```\n"
            "<!-- [[Comment]] -->\n"
            "$$[[Math]]$$\n"
        )
        output = GENERIC.convert_wiki_links(source)
        output = GENERIC.convert_image_embeds(output)

        self.assertIn("[Page](Page.md)", output)
        self.assertIn("`[[Inline]]`", output)
        self.assertIn("![[Code.png]]", output)
        self.assertIn("<!-- [[Comment]] -->", output)
        self.assertIn("$$[[Math]]$$", output)

    def test_auxiliary_normalizer_uses_four_columns_and_protects_quote_fences(self):
        source = [
            "- root",
            "\t- child",
            "> - quoted root",
            "> \t- quoted child",
            "> ```text",
            "> \t- code example",
            "> ```",
        ]
        output, changes = NORMALIZER.normalize_leading_tabs(source)

        self.assertGreater(changes, 0)
        self.assertEqual(output[1], "    - child")
        self.assertEqual(output[3], ">     - quoted child")
        self.assertEqual(output[5], "> \t- code example")

    def test_wikilink_converter_protects_code_and_rejects_ambiguous_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            docs = Path(directory)
            (docs / "a").mkdir()
            (docs / "b").mkdir()
            (docs / "a" / "Same.md").write_text("# Same A\n", encoding="utf-8")
            (docs / "b" / "Same.md").write_text("# Same B\n", encoding="utf-8")
            source = docs / "Source.md"
            source.write_text("[[Same]] and `[[Same]]`\n", encoding="utf-8")
            note_index = WIKILINKS.build_note_index(docs)
            image_index = WIKILINKS.build_image_index(docs)

            with self.assertRaises(WIKILINKS.ConversionError):
                WIKILINKS.convert_file(
                    source,
                    docs,
                    note_index,
                    image_index,
                    "markdown",
                    True,
                )


if __name__ == "__main__":
    unittest.main()
