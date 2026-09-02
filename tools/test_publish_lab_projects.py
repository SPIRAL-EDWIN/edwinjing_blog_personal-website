import hashlib
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish_lab_projects as publisher


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class PublisherTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.vault = self.root / "vault"
        (self.repo / ".codex").mkdir(parents=True)
        self.vault.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def write_note(self, rel, text):
        path = self.vault / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def manifest(self, notes, **extra):
        raw = {
            "schema_version": 1,
            "vault_root": str(self.vault),
            "staging_root": ".codex/staging/lab-projects",
            "asset_root": "docs/assets/lab-projects",
            "materialization_ready": True,
            "notes": notes,
        }
        raw.update(extra)
        path = self.repo / ".codex" / "manifest.json"
        path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
        return path

    def entry(self, note_id, source, destination, text, **extra):
        data = text.encode()
        result = {
            "id": note_id,
            "source": source,
            "destination": destination,
            "title": note_id,
            "section": "test",
            "state": "publish",
            "source_sha256": digest(data),
            "source_size": len(data),
            "protected_spans": [],
            "redaction_profile": "test",
        }
        result.update(extra)
        return result

    def plan(self, path):
        return publisher.resolve_plan(publisher.load_config(path))

    def test_cross_directory_heading_block_and_alias(self):
        target = "# 目标 页面\n\n## 小节 标题\n\nImportant paragraph ^key-1\n"
        source = "# Source\n\n[[folder/目标 页面#小节 标题|跳转]] and [[目标 页面#^key-1]]\n"
        self.write_note("folder/目标 页面.md", target)
        self.write_note("other/source.md", source)
        manifest = self.manifest([
            self.entry("target", "folder/目标 页面.md", "docs/A/目标 页面.md", target),
            self.entry("source", "other/source.md", "docs/B/source page.md", source),
        ])
        plan = self.plan(manifest)
        rendered_source = plan.outputs[Path("docs/B/source page.md")].decode()
        rendered_target = plan.outputs[Path("docs/A/目标 页面.md")].decode()
        self.assertIn("[跳转](../A/%E7%9B%AE%E6%A0%87%20%E9%A1%B5%E9%9D%A2.md#obsidian-heading-", rendered_source)
        self.assertIn("#obsidian-block-key-1", rendered_source)
        self.assertIn('<a id="obsidian-heading-', rendered_target)
        self.assertIn('<a id="obsidian-block-key-1"></a>', rendered_target)
        self.assertNotIn("^key-1", rendered_target)

    def test_protects_frontmatter_code_comments_math_and_inline_code(self):
        target = "# Target\n"
        source = (
            "---\nalias: '[[Target]]'\n---\n"
            "`[[Target]]` $[[Target]]$ <!-- [[Target]] -->\n"
            "```python\nx = [[Target]]\n```\n"
            "Visible [[Target]] and ==mark==.\n"
        )
        self.write_note("Target.md", target)
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("target", "Target.md", "docs/Target.md", target),
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertEqual(output.count("[[Target]]"), 5)
        self.assertIn("Visible [Target](Target.md)", output)
        self.assertIn("<mark>mark</mark>", output)

    def test_shared_unicode_asset_and_dimensions(self):
        image = b"same image bytes"
        image_path = self.vault / "共享 附件" / "实验 图.png"
        image_path.parent.mkdir()
        image_path.write_bytes(image)
        first = "# One\n\n![[共享 附件/实验 图.png|320x200]]\n"
        second = "# Two\n\n![[实验 图.png]]\n"
        self.write_note("a/One.md", first)
        self.write_note("b/Two.md", second)
        manifest = self.manifest([
            self.entry("one", "a/One.md", "docs/X/One.md", first),
            self.entry("two", "b/Two.md", "docs/Y/Two.md", second),
        ])
        plan = self.plan(manifest)
        self.assertEqual(len(plan.asset_sources), 1)
        one = plan.outputs[Path("docs/X/One.md")].decode()
        two = plan.outputs[Path("docs/Y/Two.md")].decode()
        self.assertIn('{width="320" height="200"}', one)
        asset_name = next(iter(plan.asset_sources)).name
        encoded_name = quote(asset_name, safe="._-")
        self.assertIn(encoded_name, one)
        self.assertIn(encoded_name, two)

    def test_duplicate_stem_is_hard_failure_without_path(self):
        a = "# A\n"
        b = "# B\n"
        source = "# S\n[[Same]]\n"
        self.write_note("a/Same.md", a)
        self.write_note("b/Same.md", b)
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("a", "a/Same.md", "docs/a.md", a),
            self.entry("b", "b/Same.md", "docs/b.md", b),
            self.entry("source", "Source.md", "docs/source.md", source),
        ])
        with self.assertRaisesRegex(publisher.PublishError, "ambiguous note link"):
            self.plan(manifest)

    def test_unpublished_target_is_hard_failure(self):
        hidden = "# Hidden\n"
        source = "# S\n[[Hidden]]\n"
        self.write_note("Hidden.md", hidden)
        self.write_note("Source.md", source)
        hidden_entry = self.entry("hidden", "Hidden.md", None, hidden)
        hidden_entry["state"] = "skip"
        hidden_entry.pop("destination")
        manifest = self.manifest([
            hidden_entry,
            self.entry("source", "Source.md", "docs/source.md", source),
        ])
        with self.assertRaisesRegex(publisher.PublishError, "not published"):
            self.plan(manifest)

    def test_apply_is_idempotent_and_refuses_overwrite(self):
        source = "# Source\n"
        self.write_note("Source.md", source)
        manifest = self.manifest([self.entry("source", "Source.md", "docs/Source.md", source)])
        plan = self.plan(manifest)
        publisher.materialize(plan)
        publisher.materialize(plan)
        staged = plan.config.staging_root / "docs" / "Source.md"
        staged.write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(publisher.PublishError, "refusing overwrite"):
            publisher.materialize(plan)

    def test_apply_requires_explicit_materialization_gate(self):
        source = "# Source\n"
        self.write_note("Source.md", source)
        manifest = self.manifest(
            [self.entry("source", "Source.md", "docs/Source.md", source)],
            materialization_ready=False,
        )
        with self.assertRaisesRegex(publisher.PublishError, "not approved for materialization"):
            publisher.materialize(self.plan(manifest))

    def test_cli_runs_math_validation_before_materialization(self):
        source = "# Source\n"
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        with patch.object(
            publisher,
            "validate_converted_outputs",
            side_effect=publisher.MathRenderingError("math gate failed"),
        ) as validator:
            with redirect_stderr(io.StringIO()):
                self.assertEqual(
                    publisher.main(["--manifest", str(manifest), "--apply"]),
                    2,
                )
        validator.assert_called_once()
        self.assertFalse((self.repo / ".codex/staging/lab-projects").exists())

    def test_apply_rejects_symlink_in_staging(self):
        source = "# Source\n"
        self.write_note("Source.md", source)
        manifest = self.manifest([self.entry("source", "Source.md", "docs/Source.md", source)])
        plan = self.plan(manifest)
        plan.config.staging_root.mkdir(parents=True)
        (plan.config.staging_root / "escape").symlink_to(self.root)
        with self.assertRaisesRegex(publisher.PublishError, "symbolic links"):
            publisher.materialize(plan)

    def test_source_hash_required_and_writer_updates_only_manifest(self):
        source = "# Source\n"
        source_path = self.write_note("Source.md", source)
        entry = self.entry("source", "Source.md", "docs/Source.md", source)
        entry["source_sha256"] = None
        entry["source_size"] = None
        manifest = self.manifest([entry])
        config = publisher.load_config(manifest)
        with self.assertRaisesRegex(publisher.PublishError, "inventory is incomplete"):
            publisher.resolve_plan(config)
        before = source_path.read_bytes()
        publisher.write_source_hashes(config)
        self.assertEqual(source_path.read_bytes(), before)
        refreshed = publisher.load_config(manifest)
        publisher.resolve_plan(refreshed)

    def test_approved_source_rename_alias(self):
        source = "# Source\n"
        self.write_note("Old.md", source)
        entry = self.entry("source", "New.md", "docs/Source.md", source)
        entry["source_aliases"] = ["Old.md"]
        manifest = self.manifest([entry])
        self.plan(manifest)
        self.write_note("New.md", source)
        with self.assertRaisesRegex(publisher.PublishError, "rename alias both exist"):
            self.plan(manifest)

    def test_diagnostics_do_not_echo_link_target(self):
        secret_target = "wandb_v1_super_secret_value"
        source = f"# S\n[[{secret_target}]]\n"
        self.write_note("Source.md", source)
        manifest = self.manifest([self.entry("source", "Source.md", "docs/Source.md", source)])
        err = None
        try:
            self.plan(manifest)
        except publisher.PublishError as exc:
            err = str(exc)
        self.assertIsNotNone(err)
        self.assertNotIn(secret_target, err)
        self.assertIn("target_fingerprint=", err)

    def test_rejects_destination_traversal(self):
        source = "# Source\n"
        self.write_note("Source.md", source)
        manifest = self.manifest([self.entry("source", "Source.md", "docs/../escape.md", source)])
        with self.assertRaisesRegex(publisher.PublishError, "unsafe destination"):
            publisher.load_config(manifest)

    def test_normalizes_image_followed_by_list(self):
        image = b"image"
        image_path = self.vault / "image.png"
        image_path.write_bytes(image)
        source = "# Source\n\n![[image.png]]\n- parent\n\t- child\n"
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertRegex(output, r"!\[[^\]]+\]\([^\n]+\)\n\n- parent")
        self.assertIn("\n    - child\n", output)

    def test_keeps_root_image_and_caption_list_with_parent_item(self):
        image = b"image"
        (self.vault / "image.png").write_bytes(image)
        source = "- parent\n![[image.png]]\n    - caption\n- next\n"
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertRegex(output, r"- parent\n\n    !\[[^\]]+\]\([^\n]+\)")
        self.assertIn("\n\n    - caption\n\n- next", output)

    def test_preserves_reviewed_image_presentation_classes(self):
        image = b"reviewed image"
        image_path = self.vault / "image.png"
        image_path.write_bytes(image)
        source = "# Source\n\n![[image.png]]\n"
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        destination = publisher.asset_destination(
            Path("docs/assets/lab-projects"), image_path, image
        )
        original = publisher.IMAGE_PRESENTATION_CLASSES.get(destination.name)
        publisher.IMAGE_PRESENTATION_CLASSES[destination.name] = (
            "trim-white-padding",
            "trim-white-padding--test",
        )
        try:
            output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        finally:
            if original is None:
                del publisher.IMAGE_PRESENTATION_CLASSES[destination.name]
            else:
                publisher.IMAGE_PRESENTATION_CLASSES[destination.name] = original
        self.assertIn(
            "{.trim-white-padding .trim-white-padding--test}", output
        )

    def test_normalizes_nested_image_followed_by_sibling_list_items(self):
        source = (
            "# Source\n\n- parent\n"
            "\t![](image.png)\n"
            "\t- first\n"
            "\t- second\n"
        )
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertIn("    ![](image.png)\n\n    - first", output)
        self.assertIn("    - first\n\n    - second", output)

    def test_normalizes_table_termination(self):
        source = (
            "# Source\n\n"
            "| Symbol | Meaning |\n"
            "| --- | --- |\n"
            "| `|` | pipe |\n"
            "This paragraph must not become a table row.\n"
        )
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertIn("| `|` | pipe |\n\nThis paragraph", output)

    def test_closes_obsidian_lists_before_headings_callouts_and_prose(self):
        source = (
            "- parent\n"
            "\t- child\n"
            "## Next heading\n"
            "Paragraph\n"
            "- fresh list\n"
            "> callout\n"
            "After list\n"
        )
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertIn("    - child\n\n## Next heading", output)
        self.assertIn("Paragraph\n\n- fresh list", output)
        self.assertIn("- fresh list\n\n> callout", output)

    def test_public_mdp_prefix_and_core_formula_dehighlight(self):
        source = (
            "## 说明\n"
            "- ==**核心计算公式**==：$$x=1$$\n"
            "### 【Loco-manipulation_reward】对`track_EE_pb` 的理解（Progress-Based）\n"
            "## `rewards.py`在整个MDP中的流程\n"
        )
        self.write_note("MDP.md", source)
        manifest = self.manifest([
            self.entry(
                "mdp-reward-analysis",
                "MDP.md",
                "docs/经验分享/Phi Lab/WBC/MDP.md",
                source,
            ),
        ])
        output = self.plan(manifest).outputs[
            Path("docs/经验分享/Phi Lab/WBC/MDP.md")
        ].decode()
        self.assertTrue(output.startswith('---\ntitle: "【MDP】奖励函数解构学习"'))
        self.assertIn("**核心计算公式**", output)
        self.assertNotIn("<mark>**核心计算公式**</mark>", output)

    def test_normalizes_single_line_display_math_inside_lists_and_quotes(self):
        source = (
            "- Formula: $$x=1$$ after\n"
            "> Formula: $$y=2$$\n"
            "$$a=1,\\qquad\n"
            "b=2$$\n"
        )
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertIn(
            '- Formula:\n\n    <span class="arithmatex arithmatex--display">'
            "&#92;&#91;x&#61;1&#92;&#93;</span>\n\n    after",
            output,
        )
        self.assertIn(
            '> Formula:\n>\n> <span class="arithmatex arithmatex--display">'
            "&#92;&#91;y&#61;2&#92;&#93;</span>",
            output,
        )
        self.assertIn("$$\na=1,\\qquad\nb=2\n$$", output)

    def test_repairs_previously_indented_display_math(self):
        source = (
            "- Formula:\n\n"
            "    $$\n"
            "    x=1\n"
            "    $$\n"
            "> $$\n"
            "> y=2\n"
            "> $$\n"
        )
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertIn(
            '    <span class="arithmatex arithmatex--display">'
            "&#92;&#91;x&#61;1&#92;&#93;</span>",
            output,
        )
        self.assertIn(
            '> <span class="arithmatex arithmatex--display">'
            "&#92;&#91;y&#61;2&#92;&#93;</span>",
            output,
        )

    def test_keeps_nested_bullets_after_display_math(self):
        source = (
            "- Position error:\n\n"
            "    $$e_P=1$$\n"
            "    - non-negative\n"
            "    - measured in metres\n"
        )
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertIn("</span>\n\n    - non-negative", output)
        self.assertIn("    - non-negative\n\n    - measured in metres", output)

    def test_starts_nested_bullets_after_same_indented_prose(self):
        source = (
            "1. Mapping:\n"
            "    Intuition:\n"
            "    - zero is best\n"
            "    - larger decays faster\n"
        )
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertIn("    Intuition:\n\n    - zero is best", output)

    def test_closes_list_display_math_before_next_root_item(self):
        source = (
            "- First formula:\n\n"
            "    $$\n"
            "    x=1\n"
            "    $$\n"
            "- Next root item\n"
        )
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertIn("</span>\n\n- Next root item", output)

    def test_injects_public_only_editorial_blocks_fail_closed(self):
        insertions = publisher.PUBLIC_NOTE_INSERTIONS["mdp-reward-analysis"]
        source = "---\ntitle: MDP\n---\n\n" + "\n".join(
            anchor for anchor, _paragraph in insertions
        )
        self.write_note("MDP.md", source)
        manifest = self.manifest([
            self.entry(
                "mdp-reward-analysis",
                "MDP.md",
                "docs/OsdNotes/Embodied AI/MDP.md",
                source,
            ),
        ])
        output = self.plan(manifest).outputs[
            Path("docs/OsdNotes/Embodied AI/MDP.md")
        ].decode()
        for _anchor, paragraph in insertions:
            self.assertEqual(output.count(paragraph.strip()), 1)

        changed = source.replace(insertions[0][0], "anchor changed\n")
        self.write_note("MDP.md", changed)
        manifest = self.manifest([
            self.entry(
                "mdp-reward-analysis",
                "MDP.md",
                "docs/OsdNotes/Embodied AI/MDP.md",
                changed,
            ),
        ])
        with self.assertRaisesRegex(publisher.PublishError, "insertion anchor changed"):
            self.plan(manifest)

    def test_does_not_normalize_inside_fenced_code(self):
        source = (
            "# Source\n\n```markdown\n"
            "![image](image.png)\n- remains adjacent\n"
            "| A | B |\n| --- | --- |\nnot a row\n"
            "```\n"
        )
        self.write_note("Source.md", source)
        manifest = self.manifest([
            self.entry("source", "Source.md", "docs/Source.md", source),
        ])
        output = self.plan(manifest).outputs[Path("docs/Source.md")].decode()
        self.assertIn("![image](image.png)\n- remains adjacent", output)
        self.assertIn("| --- | --- |\nnot a row", output)


if __name__ == "__main__":
    unittest.main()
