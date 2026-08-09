#!/usr/bin/env python3
"""Write GitHub repository counters for the same-origin EdwinOS header widget."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_REPOSITORY = "SPIRAL-EDWIN/edwinjing_blog_personal-website"
DEFAULT_OUTPUT = Path("docs/assets/data/github-repo.json")


class RepoFactsError(RuntimeError):
    """Raised when repository facts cannot be safely generated."""


def validate_facts(data: object, repository: str) -> dict[str, object]:
    if not isinstance(data, dict):
        raise RepoFactsError("repository facts must be a JSON object")

    payload_repository = data.get("repository", data.get("full_name"))
    if payload_repository is not None and payload_repository != repository:
        raise RepoFactsError("repository facts belong to a different repository")

    stars = data.get("stars", data.get("stargazers_count"))
    forks = data.get("forks", data.get("forks_count"))
    if type(stars) is not int or stars < 0:  # bool is intentionally rejected
        raise RepoFactsError("invalid stars count")
    if type(forks) is not int or forks < 0:
        raise RepoFactsError("invalid forks count")

    generated_at = data.get("generated_at")
    if generated_at is None:
        generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    elif not isinstance(generated_at, str):
        raise RepoFactsError("invalid repository facts timestamp")
    else:
        try:
            parsed_timestamp = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise RepoFactsError("invalid repository facts timestamp") from exc
        if parsed_timestamp.tzinfo is None:
            raise RepoFactsError("repository facts timestamp must include a timezone")

    return {
        "repository": repository,
        "stars": stars,
        "forks": forks,
        "generated_at": generated_at,
    }


def fetch_facts(repository: str, token: str | None, timeout: float = 15.0) -> dict[str, object]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "edwinjing-blog-pages-build",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except (OSError, urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError) as exc:
        raise RepoFactsError(f"GitHub repository facts request failed: {type(exc).__name__}") from exc
    return validate_facts(payload, repository)


def load_fallback(path: Path, repository: str) -> dict[str, object]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RepoFactsError("no valid repository facts fallback is available") from exc
    if not isinstance(payload, dict) or "generated_at" not in payload:
        raise RepoFactsError("repository facts fallback has no timestamp")
    return validate_facts(payload, repository)


def write_atomic(path: Path, data: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    ) as handle:
        temp_path = Path(handle.name)
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(temp_path, path)


def refresh_facts(repository: str, output: Path, token: str | None) -> str:
    try:
        facts = fetch_facts(repository, token)
        status = "refreshed"
    except RepoFactsError as exc:
        facts = load_fallback(output, repository)
        status = f"kept valid fallback ({exc})"
    write_atomic(output, facts)
    return status


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repository",
        default=os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPOSITORY),
        help="GitHub owner/repository (defaults to GITHUB_REPOSITORY)",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.repository.count("/") != 1:
        raise RepoFactsError("repository must use owner/name format")

    status = refresh_facts(
        args.repository,
        args.output,
        os.environ.get("GITHUB_TOKEN") or None,
    )
    print(f"GitHub repository facts {status}: {args.repository}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RepoFactsError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
