#!/usr/bin/env python3
"""Fail-closed audit for the public Lab Projects publishing set.

Diagnostics report only categories and counts. They never print private source
values or matching public text.
"""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path
from urllib.parse import unquote


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / ".codex/obsidian-publishing-manifest.json"
PUBLIC_ROOTS = (
    REPO_ROOT / "docs/OsdNotes/Embodied AI",
    REPO_ROOT / "docs/经验分享/Phi Lab",
)
ASSET_ROOT = REPO_ROOT / "docs/assets/lab-projects"

EXPECTED_PAGES = {
    "docs/OsdNotes/Embodied AI/【Hand-Eye Calibration】 手眼标定理论与实践.md",
    "docs/经验分享/Phi Lab/WBC/【MDP】奖励函数解构学习.md",
    "docs/OsdNotes/Embodied AI/仿真框架RFM的初步学习.md",
    "docs/经验分享/Phi Lab/WBC/Gprogress的意义.md",
    "docs/经验分享/Phi Lab/WBC/如何确定__init__.py中特定task选取的robot asset.md",
    "docs/经验分享/Phi Lab/Diffusion Policy/Diffusion-policy-training中global steps和epoch的区分实例.md",
    "docs/OsdNotes/Embodied AI/Bash命令与服务器训练操作查表指南.md",
    "docs/经验分享/Phi Lab/WBC/补充插件：Tensorboard & WandB.md",
    "docs/经验分享/Phi Lab/Diffusion Policy/Diffusion Policy checkpoint 数值与可视化评估流程.md",
    "docs/经验分享/Phi Lab/Diffusion Policy/Diffusion Policy 真机部署概念架构.md",
    "docs/经验分享/Phi Lab/Diffusion Policy/Diffusion Policy数据训练流程.md",
    "docs/经验分享/Phi Lab/Diffusion Policy/基于Ubuntu+4090GPU服务器的UMI-diffusion-training框架搭建指南.md",
    "docs/经验分享/Phi Lab/Diffusion Policy/基于Ubuntu+RTX50系列的UMI-diffusion-training框架搭建指南.md",
    "docs/经验分享/Phi Lab/Diffusion Policy/🦾UMI_Matrix-Studio配置架构.md",
    "docs/经验分享/Phi Lab/WBC/Sim2Sim配置与训练.md",
    "docs/经验分享/Phi Lab/WBC/UMI-on-Tron 仿真训练流程.md",
    "docs/经验分享/Phi Lab/WBC/基于Ubuntu+RTX50系列的Isaac Lab仿真框架搭建指南.md",
}

DERIVED_ASSETS = {
    "0a3c3e074f0b2e07-df456e7a2af7c5aca9e4cdf24b7c1ad7.png",
    "3432d246c9d7a40d-7eea2938551cffa09ab51fba0e231870.png",
    "48235f4560d03efd-Pasted-image-20260625205605.png",
    "60f5f2d05965873d-Pasted-image-20260718225944.png",
    "7775b0fb1676dd92-e433d1c01c9a58c7ffe22f3ea315bc25.png",
    "851b866c43cbfb66-Pasted-image-20260625204835.png",
    "860de49962fd4994-Pasted-image-20260625205634.png",
    "9188e9696961d2ea-Pasted-image-20260611115304.png",
    "c09ce3d26717c37f-Pasted-image-20260616230143.png",
    "d1ec1638e36034b6-f61feee5ec1ede62157f1ad5c9ae3591.png",
    "eaef03e5e961f561-Pasted-image-20260611110855.png",
    "f2441a2f8d51b2e0-f22abc1c15b696d1c7b5105d11606a43.png",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_secret_values() -> tuple[str, ...]:
    sys.path.insert(0, str(REPO_ROOT))
    from tools import publish_lab_projects as publisher

    config = publisher.load_config(MANIFEST_PATH)
    by_id = {note.note_id: note for note in config.notes}
    tensor = publisher.manifest_source_path(
        config, by_id["tensorboard-wandb"]
    ).read_text(encoding="utf-8").splitlines()
    matrix = publisher.manifest_source_path(
        config, by_id["matrix-studio"]
    ).read_text(encoding="utf-8").splitlines()
    values = (
        tensor[3].strip(),
        tensor[8].strip(),
        matrix[134].strip(" \t-"),
        matrix[135].strip(" \t-"),
    )
    if any(len(value) < 6 for value in values):
        raise RuntimeError("private source credential layout changed")
    return values


def public_pages() -> list[Path]:
    expected = [REPO_ROOT / rel for rel in sorted(EXPECTED_PAGES)]
    missing = [path for path in expected if not path.is_file()]
    if missing:
        raise RuntimeError(f"missing expected public pages: {len(missing)}")
    return expected


def audit_text(paths: list[Path]) -> list[str]:
    failures: list[str] = []
    blobs = [path.read_text(encoding="utf-8") for path in paths]
    combined = "\n".join(blobs)

    if any(value in combined for value in source_secret_values()):
        failures.append("private credential exact-value match")

    infra_ipv4 = re.compile(
        r"(?i)(?:ssh|rsync|scp|sftp|host|主机|服务器|@|https?://)[^\n]{0,80}?"
        r"((?:\d{1,3}\.){3}\d{1,3})"
    )
    context_ipv4 = [match.group(1) for match in infra_ipv4.finditer(combined)]
    if any(
        value not in {"127.0.0.1", "0.0.0.0"}
        and all(int(part) <= 255 for part in value.split("."))
        for value in context_ipv4
    ):
        failures.append("non-loopback IPv4")

    patterns = {
        "personal home path": re.compile(r"/(?:home|Users)/(?!<|USER|SERVER_USER|LOCAL_PATH)[^/\s`]+/"),
        "private infrastructure marker": re.compile(
            r"(?:New_WBC|IsaacLab_RFM|arx-difussion-deploy|zhejiang-univerisity)",
            re.I,
        ),
        "W&B run URL": re.compile(r"https?://wandb\.ai/[^\s)`]+/(?:runs?|projects?)/", re.I),
        "Obsidian embed/link": re.compile(r"!?\[\[[^\]]+\]\]"),
        "Obsidian block id": re.compile(r"(?m)(?<![#\w-])\^[A-Za-z0-9_-]{4,}\s*$"),
        "placeholder inside asset path": re.compile(r"assets/lab-projects/[^)\s]*<[A-Z_]+>"),
        "empty excluded note": re.compile(r"Handwriting Recognition", re.I),
    }
    for label, pattern in patterns.items():
        if pattern.search(combined):
            failures.append(label)
    return failures


def audit_markdown_blocks(paths: list[Path]) -> list[str]:
    """Require public pages to contain explicit Python-Markdown block boundaries."""

    sys.path.insert(0, str(REPO_ROOT))
    from tools import publish_lab_projects as publisher

    failures: list[str] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        normalized, changes = publisher.normalize_obsidian_blocks(
            text,
            close_obsidian_lists=path.name in {
                "【MDP】奖励函数解构学习.md",
                "Gprogress的意义.md",
            },
        )
        if changes or normalized != text:
            failures.append("public Markdown requires block-boundary normalization")
    return failures


IMAGE_RE = re.compile(r"!\[[^\]]*\]\(\s*(<[^>]+>|[^)\n]+)\)")


def audit_assets(paths: list[Path]) -> list[str]:
    failures: list[str] = []
    files = {path.name: path for path in ASSET_ROOT.glob("*") if path.is_file()}
    if len(files) != 27:
        failures.append(f"asset count is {len(files)}, expected 27")
    if set(files) != set(files) | DERIVED_ASSETS:
        failures.append("derived asset missing")

    referenced: set[Path] = set()
    for page in paths:
        text = page.read_text(encoding="utf-8")
        for match in IMAGE_RE.finditer(text):
            raw = match.group(1).strip().strip("<>").split()[0]
            if raw.startswith(("http://", "https://", "data:")):
                continue
            target = (page.parent / unquote(raw)).resolve()
            if ASSET_ROOT.resolve() in target.parents:
                referenced.add(target)
            if not target.is_file():
                failures.append("missing referenced image")
    if len(referenced) != 27:
        failures.append(f"referenced public assets are {len(referenced)}, expected 27")

    # Import the converter only for its validated source-to-destination map.
    sys.path.insert(0, str(REPO_ROOT))
    from tools import publish_lab_projects as publisher

    config = publisher.load_config(MANIFEST_PATH)
    plan = publisher.resolve_plan(config)
    source_by_name = {Path(dest).name: source for dest, source in plan.asset_sources.items()}
    for name, public in files.items():
        source = source_by_name.get(name)
        if source is None:
            failures.append("asset is absent from converter manifest")
            continue
        same = digest(source) == digest(public)
        if name in DERIVED_ASSETS and same:
            failures.append("sensitive asset copied without derivation")
        if name not in DERIVED_ASSETS and not same:
            failures.append("safe asset bytes changed unexpectedly")
    return failures


def audit_built_site() -> list[str]:
    failures: list[str] = []
    site_root = REPO_ROOT / "site"
    if not site_root.is_dir():
        return ["built site is missing"]
    text_extensions = {".html", ".json", ".xml", ".txt", ".js", ".css"}
    blobs = [
        path.read_text(encoding="utf-8", errors="ignore")
        for path in site_root.rglob("*")
        if path.is_file() and path.suffix.casefold() in text_extensions
    ]
    combined = "\n".join(blobs)
    if any(value in combined for value in source_secret_values()):
        failures.append("built site contains private credential exact value")
    built_patterns = {
        "built site contains private infrastructure marker": re.compile(
            r"(?:New_WBC|IsaacLab_RFM|arx-difussion-deploy|zhejiang-univerisity)",
            re.I,
        ),
        "built site contains W&B run URL": re.compile(
            r"https?://wandb\.ai/[^\s<]+/(?:runs?|projects?)/", re.I
        ),
        "built site contains excluded empty note": re.compile(r"Handwriting Recognition", re.I),
    }
    for label, pattern in built_patterns.items():
        if pattern.search(combined):
            failures.append(label)

    archive = (site_root / "HOME/Archive/index.html").read_text(encoding="utf-8")
    expectations = {
        'class="archive-card ': 39,
        '<span class="archive-card__category">Phi Lab</span>': 15,
        '<span class="archive-card__category">Embodied AI</span>': 8,
    }
    for marker, expected in expectations.items():
        actual = archive.count(marker)
        if actual != expected:
            failures.append(f"built Archive marker count is {actual}, expected {expected}")
    return failures


def main() -> int:
    try:
        pages = public_pages()
        failures = (
            audit_text(pages)
            + audit_markdown_blocks(pages)
            + audit_assets(pages)
            + audit_built_site()
        )
    except Exception as exc:
        print(f"FAIL: audit setup error ({type(exc).__name__})", file=sys.stderr)
        return 2
    if failures:
        for label in sorted(set(failures)):
            print(f"FAIL: {label}", file=sys.stderr)
        return 1
    print(
        f"PASS: {len(pages)} pages, 27 referenced assets, built-site, "
        "Archive and safety gates"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
