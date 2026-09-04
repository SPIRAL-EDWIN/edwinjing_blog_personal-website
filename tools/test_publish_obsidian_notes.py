import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish_obsidian_notes as workflow


class UnifiedWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repo"
        self.vault = self.root / "vault"
        (self.repo / ".codex").mkdir(parents=True)
        (self.repo / "docs").mkdir()
        self.vault.mkdir()
        (self.repo / "tools").mkdir()
        (self.repo / "mkdocs.yml").write_text("site_name: Test\n", encoding="utf-8")
        (self.repo / "requirements.txt").write_text("mkdocs\n", encoding="utf-8")
        self.manifest = self.repo / ".codex/obsidian-publishing-manifest.json"
        self.manifest.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "vault_root": str(self.vault),
                    "source_root": ".",
                    "staging_root": ".codex/staging/obsidian-notes/legacy-all",
                    "asset_root": "docs/assets/lab-projects",
                    "materialization_ready": False,
                    "notes": [],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        self.patchers = (
            mock.patch.object(workflow, "REPO_ROOT", self.repo),
            mock.patch.object(workflow, "STAGING_ROOT", self.repo / ".codex/staging"),
            mock.patch.object(
                workflow, "REVIEW_ROOT", self.repo / ".codex/staging/obsidian-notes"
            ),
            mock.patch.object(
                workflow, "PREVIEW_ROOT", self.repo / ".codex/staging/obsidian-preview"
            ),
            mock.patch.object(
                workflow, "BACKUP_ROOT", self.repo / ".codex/staging/obsidian-backups"
            ),
            mock.patch.object(workflow, "validate_converted_outputs", return_value=0),
        )
        for patcher in self.patchers:
            patcher.start()

    def tearDown(self):
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.temporary.cleanup()

    def source(self, name="Note.md", text="# Note\n\n- item\n"):
        path = self.vault / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def register(self):
        self.source()
        return workflow.register_note(
            self.manifest,
            source="Note.md",
            destination="docs/Notes/Note.md",
        )

    def test_registers_into_an_initially_empty_manifest(self):
        note_id = self.register()
        raw = json.loads(self.manifest.read_text(encoding="utf-8"))
        entry = raw["notes"][0]
        self.assertEqual(note_id, "note")
        self.assertEqual(entry["source"], "Note.md")
        self.assertEqual(entry["destination"], "docs/Notes/Note.md")
        self.assertEqual(entry["review_status"], "pending")
        self.assertNotIn("approved_source_sha256", entry)

    def test_accepting_changed_source_invalidates_approval(self):
        note_id = self.register()
        workflow.approve_source(self.manifest, note_id)
        self.source(text="# Note\n\nChanged.\n")
        workflow.accept_source(self.manifest, note_id)
        entry = json.loads(self.manifest.read_text(encoding="utf-8"))["notes"][0]
        self.assertEqual(entry["review_status"], "pending")
        self.assertNotIn("approved_source_sha256", entry)

    def test_stage_is_isolated_and_receipt_binds_outputs(self):
        note_id = self.register()
        stage = workflow.stage_review(self.manifest, [note_id])
        staged_note = stage / "docs/Notes/Note.md"
        self.assertTrue(staged_note.is_file())
        self.assertFalse((self.repo / "docs/Notes/Note.md").exists())
        report = workflow.verify_stage(self.manifest, stage)
        self.assertEqual(report["note_ids"], [note_id])
        staged_note.write_text("tampered\n", encoding="utf-8")
        with self.assertRaisesRegex(workflow.WorkflowError, "changed after conversion"):
            workflow.verify_stage(self.manifest, stage)

    def test_source_drift_invalidates_staging(self):
        note_id = self.register()
        stage = workflow.stage_review(self.manifest, [note_id])
        self.source(text="# Note\n\nChanged after staging.\n")
        with self.assertRaisesRegex(workflow.WorkflowError, "source changed after staging"):
            workflow.verify_stage(self.manifest, stage)

    def test_promotion_requires_approval_and_preview_receipt(self):
        note_id = self.register()
        stage = workflow.stage_review(self.manifest, [note_id])
        with self.assertRaisesRegex(workflow.WorkflowError, "preview receipt"):
            workflow.promote_stage(self.manifest, stage)

        report = workflow.verify_stage(self.manifest, stage)
        receipt = {
            "schema_version": 1,
            "mode": "successful-local-preview",
            "stage_report_sha256": workflow.stage_digest(stage),
            "manifest_sha256": workflow.digest_file(self.manifest),
            "preview_inputs": workflow.preview_input_inventory(),
        }
        (stage / workflow.PREVIEW_REPORT_NAME).write_text(
            json.dumps(receipt), encoding="utf-8"
        )
        with self.assertRaisesRegex(workflow.WorkflowError, "approval is missing"):
            workflow.promote_stage(self.manifest, stage)

    def test_approved_preview_can_promote_and_preserves_backup(self):
        note_id = self.register()
        workflow.approve_source(self.manifest, note_id)
        existing = self.repo / "docs/Notes/Note.md"
        existing.parent.mkdir(parents=True)
        existing.write_text("old\n", encoding="utf-8")
        stage = workflow.stage_review(self.manifest, [note_id])
        receipt = {
            "schema_version": 1,
            "mode": "successful-local-preview",
            "stage_report_sha256": workflow.stage_digest(stage),
            "manifest_sha256": workflow.digest_file(self.manifest),
            "preview_inputs": workflow.preview_input_inventory(),
        }
        (stage / workflow.PREVIEW_REPORT_NAME).write_text(
            json.dumps(receipt), encoding="utf-8"
        )

        backup = workflow.promote_stage(self.manifest, stage)
        self.assertIn("- item", existing.read_text(encoding="utf-8"))
        self.assertEqual((backup / "docs/Notes/Note.md").read_text(), "old\n")
        workflow.restore_backup(backup)
        self.assertEqual(existing.read_text(), "old\n")

    def test_stage_report_contains_no_absolute_vault_path(self):
        note_id = self.register()
        stage = workflow.stage_review(self.manifest, [note_id])
        report = (stage / workflow.REPORT_NAME).read_text(encoding="utf-8")
        self.assertNotIn(str(self.vault), report)
        self.assertIn(hashlib.sha256(self.source().read_bytes()).hexdigest(), report)


if __name__ == "__main__":
    unittest.main()
