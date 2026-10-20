#!/usr/bin/env python3
"""Extract classic inline JavaScript without executing it; preserve provenance."""
import argparse
import hashlib
import json
import re
from pathlib import Path


def extract(source, destination):
    raw = source.read_bytes()
    html = raw.decode("utf-8")
    destination.mkdir(parents=True, exist_ok=True)
    scripts = []
    for match in re.finditer(r"<script\b([^>]*)>([\s\S]*?)</script\s*>", html, re.I):
        attributes, code = match.groups()
        if re.search(r"\bsrc\s*=", attributes, re.I):
            continue
        script_type = re.search(r'\btype\s*=\s*[\"\']([^\"\']+)[\"\']', attributes, re.I)
        if script_type and script_type.group(1).lower() not in (
            "text/javascript", "application/javascript", "module"
        ):
            continue
        if not code.strip():
            continue
        index = len(scripts) + 1
        name = "inline-{}.{}".format(index, "mjs" if script_type and script_type.group(1).lower() == "module" else "js")
        code_bytes = code.encode("utf-8")
        (destination / name).write_bytes(code_bytes)
        prefix = html[:match.start(2)]
        start_line = prefix.count("\n") + 1
        scripts.append({
            "path": name, "source": str(source.resolve()),
            "htmlSha256": hashlib.sha256(raw).hexdigest(),
            "htmlStartByteOffset": len(prefix.encode("utf-8")),
            "htmlStartLine": start_line,
            "lineMapping": "originalLine = extractedLine + htmlStartLine - 1",
            "bytes": len(code_bytes), "sha256": hashlib.sha256(code_bytes).hexdigest(),
        })
    result = {"method": "Inline script body copied verbatim; no code executed.", "scripts": scripts}
    (destination / "provenance.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    print(json.dumps(extract(args.source, args.destination), indent=2, ensure_ascii=False))
