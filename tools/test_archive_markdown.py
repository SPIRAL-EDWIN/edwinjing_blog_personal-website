"""Regression tests for the global Obsidian Markdown compatibility hook."""

import importlib.util
import sys
import unittest
from pathlib import Path


HOOK_PATH = Path(__file__).parents[1] / "hooks" / "archive.py"
SPEC = importlib.util.spec_from_file_location("archive_hook", HOOK_PATH)
ARCHIVE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ARCHIVE
SPEC.loader.exec_module(ARCHIVE)


class ArchiveMarkdownTests(unittest.TestCase):
    def test_marks_skip_inline_code_and_math(self):
        source = (
            "正文==重点==。\n"
            "`code == untouched`\n"
            "$a == b$ and \\(c == d\\)\n"
        )
        output = ARCHIVE._normalize_obsidian_marks(source)

        self.assertIn("正文<mark>重点</mark>。", output)
        self.assertIn("`code == untouched`", output)
        self.assertIn("$a == b$", output)
        self.assertIn(r"\(c == d\)", output)

    def test_short_obsidian_block_ids_receive_anchors(self):
        output = ARCHIVE._add_obsidian_block_anchors("Target sentence ^x\n")
        self.assertIn("id='x'", output)
        self.assertNotIn("^x", output)

    def test_marks_can_wrap_math_and_code_without_changing_their_contents(self):
        import markdown

        source = "系统==**热量** ($q_P$) 和 `a == b` 等于焓变==，保留==>与-->。"
        output = ARCHIVE._normalize_obsidian_marks(source)
        self.assertEqual(
            output,
            "系统<mark>**热量** ($q_P$) 和 `a == b` 等于焓变</mark>，保留==>与-->。",
        )
        rendered = markdown.markdown(
            output,
            extensions=["pymdownx.arithmatex"],
            extension_configs={"pymdownx.arithmatex": {"generic": True}},
        )
        self.assertIn('<mark><strong>热量</strong> (<span class="arithmatex">', rendered)
        self.assertIn("<code>a == b</code> 等于焓变</mark>", rendered)

    def test_mark_normalization_skips_fenced_code(self):
        source = "```text\n==not a mark==\n```\n==mark==\n"
        output = ARCHIVE._normalize_obsidian_marks(source)

        self.assertIn("==not a mark==", output)
        self.assertIn("<mark>mark</mark>", output)


if __name__ == "__main__":
    unittest.main()
