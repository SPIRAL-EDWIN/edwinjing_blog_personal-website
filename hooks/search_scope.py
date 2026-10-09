"""Scope the search corpus, then prebuild its browser-compatible Lunr index."""

import json
import logging
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import unquote

from mkdocs.plugins import event_priority


ALLOWED_ROOTS = ("OsdNotes/", "经验分享/")
LOG = logging.getLogger("mkdocs.hooks.search_scope")


def _prebuild_lunr_index(index_path):
    # Node is build-time only. A Python-only local installation can still build
    # the site: the worker will create the identical index in the background.
    node = os.environ.get("EDWINOS_NODE") or shutil.which("node") or shutil.which("nodejs")
    if not node:
        LOG.info("Search: Node not found; using the worker's local-index fallback")
        return
    builder = Path(__file__).parents[1] / "tools" / "build_search_index.cjs"
    try:
        result = subprocess.run(
            [node, str(builder), str(index_path.resolve())],
            check=True,
            capture_output=True,
            text=True,
            timeout=90,
        )
    except subprocess.CalledProcessError as error:
        raise RuntimeError("Lunr prebuilding failed: " + (error.stderr or str(error)).strip()) from error
    LOG.info(result.stdout.strip())


def _is_searchable(location):
    normalized = unquote(location or "").lstrip("/")
    return normalized.startswith(ALLOWED_ROOTS)


@event_priority(-100)
def on_post_build(config, **kwargs):
    index_path = Path(config["site_dir"]) / "search" / "search_index.json"
    if not index_path.exists():
        return

    data = json.loads(index_path.read_text(encoding="utf-8"))
    # Never retain an index built for an earlier or broader corpus.
    data.pop("edwinos_index", None)
    data.pop("edwinos_search_version", None)
    if isinstance(data.get("config"), dict):
        data["config"].pop("edwinos_index", None)
        data["config"].pop("edwinos_search_version", None)
    data["docs"] = [
        document
        for document in data.get("docs", [])
        if _is_searchable(document.get("location", ""))
    ]
    index_path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    _prebuild_lunr_index(index_path)
