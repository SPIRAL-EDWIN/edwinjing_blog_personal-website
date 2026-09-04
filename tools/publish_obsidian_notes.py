#!/usr/bin/env python3
"""Unified Obsidian-to-MkDocs publication workflow.

This is the public command-line entrypoint for registering, validating,
staging, previewing, and promoting Obsidian notes.  Conversion mechanics stay
in ``publish_lab_projects.py`` for backward compatibility; this module owns the
review workflow and deliberately keeps Git commit/push as separate actions.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path, PurePosixPath
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple


TOOLS_ROOT = Path(__file__).resolve().parent
REPO_ROOT = TOOLS_ROOT.parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import publish_lab_projects as converter
from math_rendering_checks import validate_converted_outputs


DEFAULT_MANIFEST = REPO_ROOT / ".codex/obsidian-publishing-manifest.json"
STAGING_ROOT = REPO_ROOT / ".codex/staging"
REVIEW_ROOT = STAGING_ROOT / "obsidian-notes"
PREVIEW_ROOT = STAGING_ROOT / "obsidian-preview"
BACKUP_ROOT = STAGING_ROOT / "obsidian-backups"
REPORT_NAME = "publish-report.json"
PREVIEW_REPORT_NAME = "preview-report.json"
APPROVED_REVIEW_STATUS = "public-safe"
PENDING_REVIEW_STATUS = "pending"


class WorkflowError(RuntimeError):
    """A safe, user-facing workflow error."""


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def digest_file(path: Path) -> str:
    return digest_bytes(path.read_bytes())


def within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def load_raw_manifest(path: Path) -> Dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WorkflowError("unable to read the publication manifest") from exc
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise WorkflowError("unsupported publication manifest")
    return value


def serialized_manifest(raw: Mapping[str, object]) -> bytes:
    return (json.dumps(raw, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def validate_manifest_candidate(path: Path, raw: Mapping[str, object]) -> None:
    """Validate a candidate manifest from the real .codex directory."""

    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=".obsidian-manifest-", suffix=".json", dir=str(path.parent)
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(serialized_manifest(raw))
        config = converter.load_config(temporary)
        plan = converter.resolve_plan(config)
        validate_converted_outputs(config.repo_root, plan.outputs)
    finally:
        temporary.unlink(missing_ok=True)


def write_manifest(path: Path, raw: Mapping[str, object]) -> None:
    validate_manifest_candidate(path, raw)
    fd, temporary_name = tempfile.mkstemp(
        prefix=".obsidian-manifest-write-", suffix=".json", dir=str(path.parent)
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(serialized_manifest(raw))
        os.replace(str(temporary), str(path))
    finally:
        temporary.unlink(missing_ok=True)


def registration_roots(
    manifest_path: Path, raw: Mapping[str, object]
) -> Tuple[Path, Path]:
    repo_root = manifest_path.resolve().parent.parent
    vault_raw = raw.get("vault_root")
    if not isinstance(vault_raw, str) or not vault_raw:
        raise WorkflowError("manifest requires vault_root")
    vault_root = Path(vault_raw).expanduser().resolve()
    if not vault_root.is_dir():
        raise WorkflowError("vault root does not exist")
    source_raw = raw.get("source_root", ".")
    if not isinstance(source_raw, str):
        raise WorkflowError("manifest source_root must be a path")
    source_rel = (
        PurePosixPath(".")
        if source_raw == "."
        else converter.safe_relpath(source_raw, field_name="source_root")
    )
    source_root = (vault_root / Path(source_rel)).resolve()
    if not within(source_root, vault_root) or not source_root.is_dir():
        raise WorkflowError("source root must be an existing child of vault_root")
    return repo_root, source_root


def normalize_source(
    source_root: Path, raw_source: str
) -> Tuple[Path, PurePosixPath]:
    source = Path(raw_source).expanduser()
    if not source.is_absolute():
        source = source_root / source
    source = source.resolve()
    if not within(source, source_root) or not source.is_file() or source.is_symlink():
        raise WorkflowError("source must be a regular Markdown file below the vault root")
    if source.suffix.casefold() != ".md":
        raise WorkflowError("source must end in .md")
    return source, PurePosixPath(source.relative_to(source_root).as_posix())


def normalize_destination(repo_root: Path, raw_destination: str) -> PurePosixPath:
    destination = Path(raw_destination).expanduser()
    if not destination.is_absolute():
        destination = repo_root / destination
    destination = destination.resolve()
    docs_root = (repo_root / "docs").resolve()
    if not within(destination, docs_root) or destination.suffix.casefold() != ".md":
        raise WorkflowError("destination must be a Markdown file below repository docs/")
    return PurePosixPath(destination.relative_to(repo_root).as_posix())


def stable_note_id(source_rel: PurePosixPath) -> str:
    normalized = unicodedata.normalize("NFKD", source_rel.stem).casefold()
    tokens = re.findall(r"[a-z0-9]+", normalized)
    readable = "-".join(tokens)[:48].strip("-")
    if readable:
        return readable
    return "note-" + hashlib.sha256(str(source_rel).encode("utf-8")).hexdigest()[:12]


def first_title(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    heading = converter.first_heading(text)
    return heading or path.stem


def entries(raw: Mapping[str, object]) -> List[Dict[str, object]]:
    value = raw.get("notes")
    if not isinstance(value, list):
        raise WorkflowError("manifest notes must be a list")
    if not all(isinstance(item, dict) for item in value):
        raise WorkflowError("manifest note entries must be objects")
    return value  # type: ignore[return-value]


def register_note(
    manifest_path: Path,
    *,
    source: str,
    destination: str,
    note_id: Optional[str] = None,
    title: Optional[str] = None,
    section: Optional[str] = None,
) -> str:
    raw = load_raw_manifest(manifest_path)
    repo_root, source_root = registration_roots(manifest_path, raw)
    source_path, source_rel = normalize_source(source_root, source)
    destination_rel = normalize_destination(repo_root, destination)
    candidate_id = note_id or stable_note_id(source_rel)
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", candidate_id):
        raise WorkflowError("note id must use lowercase ASCII letters, numbers, _ or -")

    note_entries = entries(raw)
    if any(item.get("id") == candidate_id for item in note_entries):
        raise WorkflowError("note id already exists")
    if any(item.get("source") == str(source_rel) for item in note_entries):
        raise WorkflowError("source is already registered")
    if any(item.get("destination") == str(destination_rel) for item in note_entries):
        raise WorkflowError("destination is already registered")

    data = source_path.read_bytes()
    note_entries.append(
        {
            "id": candidate_id,
            "source": str(source_rel),
            "destination": str(destination_rel),
            "title": title or first_title(source_path),
            "section": section or str(destination_rel.parent),
            "state": "publish",
            "source_sha256": digest_bytes(data),
            "source_size": len(data),
            "protected_spans": [],
            "redaction_profile": "manual-review-required",
            "review_status": PENDING_REVIEW_STATUS,
        }
    )
    write_manifest(manifest_path, raw)
    return candidate_id


def accept_source(manifest_path: Path, note_id: str) -> Tuple[str, int]:
    raw = load_raw_manifest(manifest_path)
    config = converter.load_config(manifest_path)
    target = next((item for item in entries(raw) if item.get("id") == note_id), None)
    if target is None:
        raise WorkflowError("unknown note id")
    manifest_note = next(item for item in config.notes if item.note_id == note_id)
    source_path = converter.manifest_source_path(config, manifest_note)
    data = source_path.read_bytes()
    target["source_sha256"] = digest_bytes(data)
    target["source_size"] = len(data)
    target["review_status"] = PENDING_REVIEW_STATUS
    target.pop("approved_source_sha256", None)
    write_manifest(manifest_path, raw)
    return str(target["source_sha256"]), len(data)


def approve_source(manifest_path: Path, note_id: str) -> str:
    """Bind a public-safety approval to the exact registered source bytes."""

    raw = load_raw_manifest(manifest_path)
    config = converter.load_config(manifest_path)
    target = next((item for item in entries(raw) if item.get("id") == note_id), None)
    if target is None:
        raise WorkflowError("unknown note id")
    manifest_note = next(item for item in config.notes if item.note_id == note_id)
    source_path = converter.manifest_source_path(config, manifest_note)
    data = source_path.read_bytes()
    digest = digest_bytes(data)
    if target.get("source_sha256") != digest or target.get("source_size") != len(data):
        raise WorkflowError("source inventory changed; run accept-source before approval")
    target["review_status"] = APPROVED_REVIEW_STATUS
    target["approved_source_sha256"] = digest
    write_manifest(manifest_path, raw)
    return digest


def review_approvals(
    manifest_path: Path, note_ids: Sequence[str]
) -> Dict[str, bool]:
    raw = load_raw_manifest(manifest_path)
    selected = set(note_ids)
    approvals: Dict[str, bool] = {}
    for item in entries(raw):
        note_id = item.get("id")
        if not isinstance(note_id, str) or note_id not in selected:
            continue
        approvals[note_id] = (
            item.get("review_status") == APPROVED_REVIEW_STATUS
            and item.get("approved_source_sha256") == item.get("source_sha256")
        )
    if set(approvals) != selected:
        raise WorkflowError("unable to resolve selected review approvals")
    return approvals


def resolved_plan(manifest_path: Path) -> converter.Plan:
    config = converter.load_config(manifest_path)
    plan = converter.resolve_plan(config)
    validate_converted_outputs(config.repo_root, plan.outputs)
    return plan


def published_note_ids(plan: converter.Plan) -> Tuple[str, ...]:
    return tuple(item.manifest.note_id for item in plan.notes)


def selected_ids(
    plan: converter.Plan, requested: Sequence[str], select_all: bool = False
) -> Tuple[str, ...]:
    available = set(published_note_ids(plan))
    if select_all:
        return tuple(sorted(available))
    if not requested:
        raise WorkflowError("specify --note-id or --all")
    unknown = sorted(set(requested) - available)
    if unknown:
        raise WorkflowError("unknown or unpublished note id: " + ", ".join(unknown))
    return tuple(dict.fromkeys(requested))


def outputs_for_notes(
    plan: converter.Plan, note_ids: Sequence[str]
) -> Dict[PurePosixPath, bytes]:
    selected = set(note_ids)
    paths: Set[PurePosixPath] = set()
    for item in plan.notes:
        if item.manifest.note_id not in selected:
            continue
        if item.manifest.destination_rel is None:
            raise WorkflowError("selected note has no public destination")
        paths.add(item.manifest.destination_rel)
        for occurrence in item.occurrences:
            if occurrence.asset_destination is not None:
                paths.add(occurrence.asset_destination)
    return {path: plan.outputs[path] for path in sorted(paths, key=str)}


def selection_key(note_ids: Sequence[str]) -> str:
    if len(note_ids) == 1:
        return note_ids[0]
    identity = "\n".join(sorted(note_ids)).encode("utf-8")
    return "all-" + hashlib.sha256(identity).hexdigest()[:12]


def safe_stage_path(path: Path) -> Path:
    path = path.resolve()
    if not within(path, STAGING_ROOT) or path == STAGING_ROOT.resolve():
        raise WorkflowError("staging path must be a child of .codex/staging")
    return path


def helper_inventory() -> Dict[str, str]:
    helpers = (
        REPO_ROOT / "tools/publish_obsidian_notes.py",
        REPO_ROOT / "tools/publish_lab_projects.py",
        REPO_ROOT / "tools/math_rendering_checks.py",
    )
    return {
        str(path.relative_to(REPO_ROOT)): digest_file(path)
        for path in helpers
        if path.is_file()
    }


def preview_input_inventory() -> Dict[str, str]:
    candidates: Set[Path] = {
        REPO_ROOT / "mkdocs.yml",
        REPO_ROOT / "requirements.txt",
    }
    for pattern in (
        "hooks/**/*.py",
        "data/**/*.yml",
        "overrides/**/*",
        "docs/stylesheets/**/*.css",
        "docs/javascripts/**/*.js",
    ):
        candidates.update(REPO_ROOT.glob(pattern))
    return {
        str(path.relative_to(REPO_ROOT)): digest_file(path)
        for path in sorted(candidates)
        if path.is_file() and not path.is_symlink()
    }


def destination_inventory(outputs: Mapping[PurePosixPath, bytes]) -> Dict[str, object]:
    inventory: Dict[str, object] = {}
    for rel in outputs:
        destination = REPO_ROOT / Path(rel)
        inventory[str(rel)] = (
            {
                "exists": True,
                "sha256": digest_file(destination),
                "size": destination.stat().st_size,
            }
            if destination.is_file() and not destination.is_symlink()
            else {"exists": False}
        )
    return inventory


def report_for(
    manifest_path: Path,
    plan: converter.Plan,
    note_ids: Sequence[str],
    outputs: Mapping[PurePosixPath, bytes],
) -> Dict[str, object]:
    inventory = {
        item.manifest.note_id: {
            "source_sha256": item.manifest.source_sha256,
            "source_size": item.manifest.source_size,
        }
        for item in plan.notes
        if item.manifest.note_id in set(note_ids)
    }
    return {
        "schema_version": 1,
        "mode": "review-staging",
        "manifest": str(
            manifest_path.resolve().relative_to(plan.config.repo_root.resolve())
        ),
        "manifest_sha256": digest_file(manifest_path),
        "note_ids": list(note_ids),
        "source_inventory": inventory,
        "review_approvals": review_approvals(manifest_path, note_ids),
        "converter_inventory": helper_inventory(),
        "destination_inventory": destination_inventory(outputs),
        "outputs": [
            {"path": str(path), "sha256": digest_bytes(data), "size": len(data)}
            for path, data in sorted(outputs.items(), key=lambda item: str(item[0]))
        ],
    }


def remove_review_tree(path: Path) -> None:
    safe_stage_path(path)
    if path.is_symlink() or any(child.is_symlink() for child in path.rglob("*")):
        raise WorkflowError("refusing to replace staging tree containing symbolic links")
    shutil.rmtree(path)


def stage_review(
    manifest_path: Path,
    note_ids: Sequence[str],
    *,
    replace: bool = False,
    destination: Optional[Path] = None,
) -> Path:
    plan = resolved_plan(manifest_path)
    normalized_ids = selected_ids(plan, note_ids)
    outputs = outputs_for_notes(plan, normalized_ids)
    target = safe_stage_path(
        destination or (REVIEW_ROOT / selection_key(normalized_ids))
    )
    if target.exists():
        if not replace:
            raise WorkflowError("review staging already exists; pass --replace to refresh it")
        remove_review_tree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{target.name}-", dir=str(target.parent)))
    try:
        for rel, data in outputs.items():
            output = temporary / Path(rel)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(data)
        report = report_for(manifest_path, plan, normalized_ids, outputs)
        (temporary / REPORT_NAME).write_bytes(serialized_manifest(report))
        os.replace(str(temporary), str(target))
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return target


def read_stage_report(stage: Path) -> Dict[str, object]:
    stage = safe_stage_path(stage)
    report_path = stage / REPORT_NAME
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WorkflowError("review staging report is missing or invalid") from exc
    if not isinstance(report, dict) or report.get("mode") != "review-staging":
        raise WorkflowError("unexpected review staging report")
    return report


def verify_stage(manifest_path: Path, stage: Path) -> Dict[str, object]:
    stage = safe_stage_path(stage)
    if stage.is_symlink() or any(child.is_symlink() for child in stage.rglob("*")):
        raise WorkflowError("review staging must not contain symbolic links")
    report = read_stage_report(stage)
    if report.get("manifest_sha256") != digest_file(manifest_path):
        raise WorkflowError("manifest changed after staging; stage the note again")
    if report.get("converter_inventory") != helper_inventory():
        raise WorkflowError("conversion code changed after staging; stage the note again")
    raw_source_inventory = report.get("source_inventory")
    if not isinstance(raw_source_inventory, dict):
        raise WorkflowError("review staging has no source inventory")
    config = converter.load_config(manifest_path)
    notes_by_id = {note.note_id: note for note in config.notes}
    for note_id, expected in raw_source_inventory.items():
        if not isinstance(note_id, str) or not isinstance(expected, dict):
            raise WorkflowError("review staging source inventory is invalid")
        note = notes_by_id.get(note_id)
        if note is None:
            raise WorkflowError("registered source disappeared after staging")
        source = converter.manifest_source_path(config, note)
        if (
            digest_file(source) != expected.get("source_sha256")
            or source.stat().st_size != expected.get("source_size")
        ):
            raise WorkflowError("source changed after staging; accept and stage it again")
    expected: Set[Path] = set()
    raw_outputs = report.get("outputs")
    if not isinstance(raw_outputs, list):
        raise WorkflowError("review staging report has no outputs")
    for item in raw_outputs:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            raise WorkflowError("review staging output record is invalid")
        rel = Path(item["path"])
        source = (stage / rel).resolve()
        if not within(source, stage) or not source.is_file():
            raise WorkflowError("review staging output is missing")
        if digest_file(source) != item.get("sha256") or source.stat().st_size != item.get("size"):
            raise WorkflowError("review staging output changed after conversion")
        expected.add(rel)
    actual = {
        path.relative_to(stage)
        for path in stage.rglob("*")
        if path.is_file() and path.name not in {REPORT_NAME, PREVIEW_REPORT_NAME}
    }
    if actual != expected:
        raise WorkflowError("review staging contains unplanned files")
    return report


def stage_digest(stage: Path) -> str:
    return digest_file(stage / REPORT_NAME)


def targeted_public_audit(
    manifest_path: Path, stage: Path, report: Mapping[str, object]
) -> Tuple[str, ...]:
    """Run secret, Markdown-boundary, and sensitive-asset checks on the selection."""

    from audit_lab_projects_public import DERIVED_ASSETS, audit_markdown_blocks, audit_text

    markdown: List[Path] = []
    output_records = report.get("outputs")
    if not isinstance(output_records, list):
        raise WorkflowError("review staging report has no outputs")
    for item in output_records:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            raise WorkflowError("review staging output record is invalid")
        path = stage / Path(item["path"])
        if path.suffix.casefold() == ".md":
            markdown.append(path)
    failures = audit_text(markdown) + audit_markdown_blocks(markdown)

    plan = resolved_plan(manifest_path)
    selected_outputs = {
        str(item["path"])
        for item in output_records
        if isinstance(item, dict) and isinstance(item.get("path"), str)
    }
    for destination, source in plan.asset_sources.items():
        if str(destination) not in selected_outputs or destination.name not in DERIVED_ASSETS:
            continue
        staged_asset = stage / Path(destination)
        if digest_file(source) == digest_file(staged_asset):
            failures.append("sensitive asset copied without derivation")
    return tuple(sorted(set(failures)))


def stage_for_ids(note_ids: Sequence[str]) -> Path:
    return REVIEW_ROOT / selection_key(note_ids)


def prepare_preview(manifest_path: Path, stage: Path) -> Tuple[Path, Path, Dict[str, object]]:
    report = verify_stage(manifest_path, stage)
    # A failed new build must never leave an older successful receipt usable.
    (stage / PREVIEW_REPORT_NAME).unlink(missing_ok=True)
    note_ids = report.get("note_ids")
    if not isinstance(note_ids, list) or not all(isinstance(value, str) for value in note_ids):
        raise WorkflowError("review staging note ids are invalid")
    root = safe_stage_path(PREVIEW_ROOT / selection_key(note_ids))
    if root.exists():
        remove_review_tree(root)
    root.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(REPO_ROOT / "docs", root / "docs")
    for support_directory in ("hooks", "overrides", "data"):
        source_directory = REPO_ROOT / support_directory
        if source_directory.is_dir():
            shutil.copytree(source_directory, root / support_directory)
    for item in report["outputs"]:  # type: ignore[index]
        rel = Path(item["path"])
        source = stage / rel
        destination = root / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    relative_base = os.path.relpath(REPO_ROOT / "mkdocs.yml", root)
    config = root / "mkdocs.preview.yml"
    config.write_text(
        "INHERIT: " + json.dumps(relative_base) + "\n"
        "docs_dir: docs\n"
        "site_dir: site\n",
        encoding="utf-8",
    )
    return root, config, report


def run_preview_build(config: Path) -> int:
    mkdocs = REPO_ROOT / ".venv/bin/mkdocs"
    if not mkdocs.is_file():
        raise WorkflowError(".venv/bin/mkdocs is missing")
    command = [str(mkdocs), "build", "-f", str(config), "--clean", "--strict"]
    return subprocess.run(command, cwd=str(REPO_ROOT), check=False).returncode


def write_preview_receipt(
    manifest_path: Path,
    stage: Path,
    preview_root: Path,
    report: Mapping[str, object],
) -> None:
    failures = targeted_public_audit(manifest_path, stage, report)
    receipt = {
        "schema_version": 1,
        "mode": "successful-local-preview" if not failures else "failed-local-preview",
        "stage_report_sha256": stage_digest(stage),
        "manifest_sha256": digest_file(manifest_path),
        "preview_inputs": preview_input_inventory(),
        "site_file_count": sum(
            path.is_file() for path in (preview_root / "site").rglob("*")
        ),
        "targeted_public_audit": {
            "passed": not failures,
            "failure_categories": list(failures),
        },
    }
    (stage / PREVIEW_REPORT_NAME).write_bytes(serialized_manifest(receipt))
    if failures:
        raise WorkflowError(
            "preview built, but public-safety audit failed: " + ", ".join(failures)
        )


def run_preview_server(config: Path, address: str) -> int:
    mkdocs = REPO_ROOT / ".venv/bin/mkdocs"
    return subprocess.run(
        [str(mkdocs), "serve", "-f", str(config), "-a", address],
        cwd=str(REPO_ROOT),
        check=False,
    ).returncode


def verify_preview_receipt(manifest_path: Path, stage: Path) -> Dict[str, object]:
    try:
        receipt = json.loads((stage / PREVIEW_REPORT_NAME).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WorkflowError("successful preview receipt is missing; run preview again") from exc
    if not isinstance(receipt, dict) or receipt.get("mode") != "successful-local-preview":
        raise WorkflowError("latest preview did not pass its safety gates")
    if receipt.get("stage_report_sha256") != stage_digest(stage):
        raise WorkflowError("staging changed after preview; run preview again")
    if receipt.get("manifest_sha256") != digest_file(manifest_path):
        raise WorkflowError("manifest changed after preview; run stage and preview again")
    if receipt.get("preview_inputs") != preview_input_inventory():
        raise WorkflowError("site rendering inputs changed after preview; run preview again")
    return receipt


def promote_stage(manifest_path: Path, stage: Path) -> Path:
    report = verify_stage(manifest_path, stage)
    verify_preview_receipt(manifest_path, stage)
    note_ids = report["note_ids"]
    if not isinstance(note_ids, list) or not all(isinstance(value, str) for value in note_ids):
        raise WorkflowError("review staging note ids are invalid")
    approvals = review_approvals(manifest_path, note_ids)
    pending = sorted(note_id for note_id, approved in approvals.items() if not approved)
    if pending:
        raise WorkflowError("source safety approval is missing for: " + ", ".join(pending))
    destination_state = report.get("destination_inventory")
    if not isinstance(destination_state, dict):
        raise WorkflowError("staging has no destination inventory")
    for raw_rel, expected in destination_state.items():
        if not isinstance(raw_rel, str) or not isinstance(expected, dict):
            raise WorkflowError("invalid destination inventory")
        destination = (REPO_ROOT / raw_rel).resolve()
        if destination.is_symlink():
            raise WorkflowError("promotion destination must not be a symbolic link")
        if expected.get("exists") is True:
            if not destination.is_file() or digest_file(destination) != expected.get("sha256"):
                raise WorkflowError("public destination changed after staging; stage again")
        elif destination.exists():
            raise WorkflowError("new public destination appeared after staging; stage again")
    backup_parent = safe_stage_path(BACKUP_ROOT)
    backup_parent.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix=selection_key(note_ids) + "-", dir=str(backup_parent)))
    backed_up: List[str] = []
    promoted: List[str] = []
    try:
        for item in report["outputs"]:  # type: ignore[index]
            rel = Path(item["path"])
            if not rel.parts or rel.parts[0] != "docs":
                raise WorkflowError("only docs/ outputs may be promoted")
            source = stage / rel
            destination = (REPO_ROOT / rel).resolve()
            if not within(destination, REPO_ROOT / "docs"):
                raise WorkflowError("promotion destination escapes docs/")
            if destination.exists():
                backup_path = backup / rel
                backup_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(destination, backup_path)
                backed_up.append(str(rel))
            destination.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary_name = tempfile.mkstemp(
                prefix=".promote-", dir=str(destination.parent)
            )
            os.close(fd)
            temporary = Path(temporary_name)
            try:
                shutil.copy2(source, temporary)
                os.replace(str(temporary), str(destination))
            finally:
                temporary.unlink(missing_ok=True)
            promoted.append(str(rel))
    except Exception:
        for raw_rel in reversed(promoted):
            destination = REPO_ROOT / raw_rel
            backup_path = backup / raw_rel
            if backup_path.is_file():
                shutil.copy2(backup_path, destination)
            else:
                destination.unlink(missing_ok=True)
        raise
    backup_report = {
        "schema_version": 1,
        "mode": "pre-promotion-backup",
        "note_ids": note_ids,
        "backed_up": backed_up,
        "promoted": promoted,
    }
    (backup / REPORT_NAME).write_bytes(serialized_manifest(backup_report))
    return backup


def restore_backup(backup: Path) -> None:
    report = json.loads((backup / REPORT_NAME).read_text(encoding="utf-8"))
    backed_up = set(report.get("backed_up", []))
    for raw_rel in reversed(report.get("promoted", [])):
        destination = REPO_ROOT / raw_rel
        backup_path = backup / raw_rel
        if raw_rel in backed_up:
            shutil.copy2(backup_path, destination)
        else:
            destination.unlink(missing_ok=True)


def run_local_gates() -> int:
    commands = (
        [sys.executable, "-m", "unittest", "discover", "-s", "tools", "-p", "test_*.py"],
        [str(REPO_ROOT / ".venv/bin/mkdocs"), "build", "--clean", "--strict"],
    )
    for command in commands:
        completed = subprocess.run(command, cwd=str(REPO_ROOT), check=False)
        if completed.returncode:
            return completed.returncode
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument(
        "--manifest",
        default=str(DEFAULT_MANIFEST),
        help="unified Obsidian publication manifest",
    )
    commands = root.add_subparsers(dest="command", required=True)

    commands.add_parser("list", help="list registered notes")

    register = commands.add_parser("register", help="register one Obsidian note")
    register.add_argument("--source", required=True)
    register.add_argument("--destination", required=True)
    register.add_argument("--id")
    register.add_argument("--title")
    register.add_argument("--section")

    accept = commands.add_parser("accept-source", help="accept one reviewed source revision")
    accept.add_argument("--note-id", required=True)

    approve = commands.add_parser(
        "approve-source", help="bind a public-safety review to the current source"
    )
    approve.add_argument("--note-id", required=True)
    approve.add_argument("--confirm-public-safe", action="store_true")

    check = commands.add_parser("check", help="validate conversion without writing")
    check.add_argument("--note-id", action="append", default=[])
    check.add_argument("--all", action="store_true")

    stage = commands.add_parser("stage", help="write isolated review output")
    stage.add_argument("--note-id", action="append", default=[])
    stage.add_argument("--all", action="store_true")
    stage.add_argument("--replace", action="store_true")

    preview = commands.add_parser("preview", help="build or serve a complete staged-site preview")
    preview.add_argument("--note-id", action="append", required=True)
    preview.add_argument("--serve", action="store_true")
    preview.add_argument("--address", default="127.0.0.1:8000")

    promote = commands.add_parser("promote", help="copy reviewed staging into live docs/")
    promote.add_argument("--note-id", action="append", required=True)
    promote.add_argument("--confirm-reviewed", action="store_true")
    return root


def print_registered(manifest_path: Path) -> None:
    raw = load_raw_manifest(manifest_path)
    for item in entries(raw):
        state = item.get("state", "publish")
        print(f"{item.get('id')}\t{state}\t{item.get('source')}\t{item.get('destination', '-')}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parser().parse_args(argv)
    manifest_path = Path(args.manifest).expanduser().resolve()
    try:
        if args.command == "list":
            print_registered(manifest_path)
            return 0
        if args.command == "register":
            note_id = register_note(
                manifest_path,
                source=args.source,
                destination=args.destination,
                note_id=args.id,
                title=args.title,
                section=args.section,
            )
            print(f"Registered: {note_id}")
            return 0
        if args.command == "accept-source":
            digest, size = accept_source(manifest_path, args.note_id)
            print(f"Accepted source revision: {args.note_id} sha256={digest[:12]} size={size}")
            return 0
        if args.command == "approve-source":
            if not args.confirm_public_safe:
                raise WorkflowError(
                    "approval requires --confirm-public-safe after content and privacy review"
                )
            digest = approve_source(manifest_path, args.note_id)
            print(f"Approved exact source revision: {args.note_id} sha256={digest[:12]}")
            return 0

        plan = resolved_plan(manifest_path)
        if args.command == "check":
            note_ids = selected_ids(plan, args.note_id, args.all)
            selected = outputs_for_notes(plan, note_ids)
            print(f"Validation passed: notes={len(note_ids)} outputs={len(selected)}")
            return 0
        if args.command == "stage":
            note_ids = selected_ids(plan, args.note_id, args.all)
            stage = stage_review(manifest_path, note_ids, replace=args.replace)
            print(f"Review staging: {stage}")
            return 0
        if args.command == "preview":
            note_ids = selected_ids(plan, args.note_id)
            stage = stage_for_ids(note_ids)
            root, config, report = prepare_preview(manifest_path, stage)
            print(f"Preview workspace: {root}")
            result = run_preview_build(config)
            if result:
                return result
            write_preview_receipt(manifest_path, stage, root, report)
            print("Preview gates: passed")
            return run_preview_server(config, args.address) if args.serve else 0
        if args.command == "promote":
            if not args.confirm_reviewed:
                raise WorkflowError("promotion requires --confirm-reviewed after content review")
            note_ids = selected_ids(plan, args.note_id)
            stage = stage_for_ids(note_ids)
            backup = promote_stage(manifest_path, stage)
            print(f"Promoted {len(note_ids)} note(s); backup: {backup}")
            result = run_local_gates()
            if result:
                restore_backup(backup)
                raise WorkflowError("post-promotion gates failed; live docs were rolled back")
            return 0
        raise WorkflowError("unknown command")
    except (WorkflowError, converter.PublishError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    except Exception:
        print("ERROR: unexpected workflow failure (details intentionally suppressed)", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
