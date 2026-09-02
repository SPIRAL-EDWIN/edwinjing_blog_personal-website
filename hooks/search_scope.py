"""Limit the generated search index to ENotes and More Experiences."""

import json
from pathlib import Path
from urllib.parse import unquote

from mkdocs.plugins import event_priority


ALLOWED_ROOTS = ("OsdNotes/", "经验分享/")


def _is_searchable(location):
    normalized = unquote(location or "").lstrip("/")
    return normalized.startswith(ALLOWED_ROOTS)


@event_priority(-100)
def on_post_build(config, **kwargs):
    index_path = Path(config["site_dir"]) / "search" / "search_index.json"
    if not index_path.exists():
        return

    data = json.loads(index_path.read_text(encoding="utf-8"))
    data["docs"] = [
        document
        for document in data.get("docs", [])
        if _is_searchable(document.get("location", ""))
    ]
    index_path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
