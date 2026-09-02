"""Shared, dependency-free validation for the local MathJax pipeline."""

from __future__ import annotations

import re
from pathlib import Path, PurePosixPath
from typing import Iterable, Mapping, Tuple, Union


RUNTIME_RE = re.compile(
    r'"(?P<path>vendor/mathjax/(?P<version>\d+\.\d+\.\d+)/es5/tex-mml-chtml\.js)"'
)
UNVENDORED_EXTENSION_RE = re.compile(r"\\(?:require|ce|cancel|bbox)\b")
FENCE_RE = re.compile(r"^[ \t]*(?:`{3,}|~{3,})")
INLINE_CODE_RE = re.compile(r"`+[^`\n]*`+")


class MathRenderingError(ValueError):
    """The converted notes cannot be rendered by the vendored MathJax set."""


def prose_without_code(markdown: str) -> str:
    """Remove fenced and inline code before checking TeX-only commands."""
    prose = []
    in_fence = False
    for line in markdown.splitlines():
        if FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        if not in_fence:
            prose.append(INLINE_CODE_RE.sub("", line))
    return "\n".join(prose)


def unvendored_extensions(markdown_items: Iterable[Tuple[str, str]]) -> Tuple[str, ...]:
    """Return source-neutral diagnostics for TeX extensions not in the bundle."""
    failures = []
    for label, markdown in markdown_items:
        prose = prose_without_code(markdown)
        for match in UNVENDORED_EXTENSION_RE.finditer(prose):
            line = prose.count("\n", 0, match.start()) + 1
            failures.append(f"{label}:{line}:{match.group(0)}")
    return tuple(failures)


def malformed_display_math(markdown_items: Iterable[Tuple[str, str]]) -> Tuple[str, ...]:
    """Return display-math delimiters that are not isolated on their own line."""
    failures = []
    for label, markdown in markdown_items:
        prose = prose_without_code(markdown)
        for line_number, line in enumerate(prose.splitlines(), 1):
            candidate = re.sub(r"^[ \t]*(?:>[ \t]*)+", "", line).strip()
            if "$$" in candidate and candidate != "$$":
                failures.append(f"{label}:{line_number}")
    return tuple(failures)


def validate_markdown_items(markdown_items: Iterable[Tuple[str, str]]) -> int:
    """Fail before publishing notes that require absent MathJax components."""
    items = tuple(markdown_items)
    failures = unvendored_extensions(items)
    if failures:
        commands = sorted({failure.rsplit(":", 1)[-1] for failure in failures})
        raise MathRenderingError(
            "MathJax extension is not vendored: " + ", ".join(commands)
        )
    malformed = malformed_display_math(items)
    if malformed:
        raise MathRenderingError("display math delimiters must be on separate lines")
    return len(items)


def configured_runtime(repo_root: Path) -> Tuple[str, str, Path]:
    """Resolve the versioned same-origin runtime declared by mathjax.js."""
    docs = repo_root / "docs"
    config_path = docs / "javascripts" / "mathjax.js"
    source = config_path.read_text(encoding="utf-8")
    match = RUNTIME_RE.search(source)
    if not match:
        raise MathRenderingError("mathjax.js must reference a versioned local runtime")
    runtime = docs / "javascripts" / match.group("path")
    return source, match.group("version"), runtime


def validate_mathjax_assets(repo_root: Path) -> str:
    """Validate the runtime, fonts, license and cache-busted loader."""
    source, version, runtime = configured_runtime(repo_root)
    if "cdn.jsdelivr.net" in source or "document.currentScript" not in source:
        raise MathRenderingError("MathJax loader must use the versioned same-origin runtime")
    if not re.search(r'\bboldsymbol\s*:\s*\["\\\\mathbf\{#1\}"\s*,\s*1\]', source):
        raise MathRenderingError("MathJax configuration must define the boldsymbol macro")
    if not re.search(r'\bmathclap\s*:\s*\["\\\\smash\{#1\}"\s*,\s*1\]', source):
        raise MathRenderingError("MathJax configuration must define the mathclap fallback")
    if not runtime.is_file():
        raise MathRenderingError("vendored MathJax runtime is missing")

    vendor_root = runtime.parents[2]
    version_record = (vendor_root / "VERSION").read_text(encoding="utf-8")
    if f"MathJax {version}" not in version_record:
        raise MathRenderingError("MathJax VERSION does not match the runtime path")

    fonts = tuple((runtime.parent / "output/chtml/fonts/woff-v2").glob("*.woff"))
    if len(fonts) != 23 or any(font.stat().st_size == 0 for font in fonts):
        raise MathRenderingError("vendored MathJax font set is incomplete")

    license_text = (vendor_root / "LICENSE").read_text(encoding="utf-8")
    if "Apache License" not in license_text:
        raise MathRenderingError("vendored MathJax license is missing")

    mkdocs_config = (repo_root / "mkdocs.yml").read_text(encoding="utf-8")
    if not re.search(r"javascripts/mathjax\.js\?v=\d+[a-z]?", mkdocs_config):
        raise MathRenderingError("MathJax configuration script needs a cache-busting version")
    return version


def validate_repository_notes(repo_root: Path) -> int:
    docs = repo_root / "docs"
    return validate_markdown_items(
        (str(path.relative_to(repo_root)), path.read_text(encoding="utf-8"))
        for path in docs.rglob("*.md")
    )


def validate_converted_outputs(
    repo_root: Path,
    outputs: Mapping[PurePosixPath, Union[bytes, str]],
) -> int:
    """Run the publish-time gate against final converted Markdown outputs."""
    validate_mathjax_assets(repo_root)
    items = []
    for destination, payload in outputs.items():
        if destination.suffix.casefold() != ".md":
            continue
        text = payload.decode("utf-8") if isinstance(payload, bytes) else payload
        items.append((destination.name, text))
    return validate_markdown_items(items)
