"""Scope the search corpus, then prebuild its browser-compatible Lunr index."""

import hashlib
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


def _publish_deferred_corpus(index_path):
    # Material needs the tokenizer config immediately for article highlighting,
    # but the corpus and prepared Lunr index belong to the deferred worker load.
    # Content-addressing prevents an older manifest from loading a newer corpus.
    corpus = index_path.read_bytes()
    data = json.loads(corpus)
    digest = hashlib.sha256(corpus).hexdigest()[:20]
    corpus_name = "edwinos_corpus." + digest + ".json"
    index_path.with_name(corpus_name).write_bytes(corpus)
    config = dict(data.get("config") or {})
    config.pop("edwinos_index", None)
    config["edwinos_corpus"] = "../../../search/" + corpus_name
    index_path.write_text(
        json.dumps({"config": config, "docs": []}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


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
    _publish_deferred_corpus(index_path)
