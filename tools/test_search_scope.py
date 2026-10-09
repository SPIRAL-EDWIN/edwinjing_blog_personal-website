"""Regression tests for the public search-index scope."""

import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

from material.plugins.search.plugin import Parser


HOOK_PATH = Path(__file__).parents[1] / "hooks" / "search_scope.py"
SPEC = importlib.util.spec_from_file_location("search_scope", HOOK_PATH)
SEARCH_SCOPE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SEARCH_SCOPE)

ARCHIVE_SPEC = importlib.util.spec_from_file_location(
    "search_metadata_archive", HOOK_PATH.with_name("archive.py")
)
ARCHIVE = importlib.util.module_from_spec(ARCHIVE_SPEC)
sys.modules[ARCHIVE_SPEC.name] = ARCHIVE
ARCHIVE_SPEC.loader.exec_module(ARCHIVE)


class SearchScopeTests(unittest.TestCase):
    def test_article_provenance_is_visible_but_not_indexed(self):
        metadata = ARCHIVE._article_meta(
            {"inspired_by": "Metadata-only source"},
            date(2026, 2, 23), date(2026, 7, 3), "Chen Jing (经宸)",
        )
        # Material's real parser excludes the semantic container, including its
        # nested spans/times. Body text before and after it remains searchable.
        parser = Parser()
        parser.feed(
            '<h1 id="note">Example note</h1><p>Preface remains.</p>'
            + metadata
            + '<p>Chen Jing studies reinforcement learning.</p>'
            '<h2 id="body">Body</h2><p>Published results on 2026-07-03.</p>'
        )
        indexed = " ".join("".join(section.text) for section in parser.data)
        self.assertIn("Published", metadata)
        self.assertIn("Updated", metadata)
        self.assertIn("By Chen Jing", metadata)
        self.assertIn("Preface remains.", indexed)
        self.assertIn("Chen Jing studies reinforcement learning.", indexed)
        self.assertIn("Published results on 2026-07-03.", indexed)
        self.assertNotIn("2026-02-23", indexed)
        self.assertNotIn("By Chen Jing", indexed)
        self.assertNotIn("Updated", indexed)
        self.assertNotIn("Metadata-only source", indexed)

    def test_prebuild_runs_after_scope_and_drops_stale_index(self):
        with tempfile.TemporaryDirectory() as directory:
            index = Path(directory) / "search" / "search_index.json"
            index.parent.mkdir()
            index.write_text(json.dumps({
                "docs": [{"location": "OsdNotes/one/"}, {"location": "HOME/friends/"}],
                "edwinos_index": {"stale": True}, "edwinos_search_version": 0,
                "config": {"lang": ["zh"], "edwinos_index": {"stale": True}, "edwinos_search_version": 0},
            }), encoding="utf-8")

            def check_scoped(path):
                data = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(data["docs"], [{"location": "OsdNotes/one/"}])
                self.assertNotIn("edwinos_index", data)
                self.assertNotIn("edwinos_search_version", data)
                self.assertEqual(data["config"], {"lang": ["zh"]})

            with mock.patch.object(SEARCH_SCOPE, "_prebuild_lunr_index", side_effect=check_scoped) as builder:
                SEARCH_SCOPE.on_post_build({"site_dir": directory})
            builder.assert_called_once_with(index)

    def test_node_is_optional_for_python_only_builds(self):
        with mock.patch.dict("os.environ", {}, clear=True), \
                mock.patch.object(SEARCH_SCOPE.shutil, "which", return_value=None), \
                mock.patch.object(SEARCH_SCOPE.subprocess, "run") as run:
            SEARCH_SCOPE._prebuild_lunr_index(Path("unused.json"))
            run.assert_not_called()

    def test_only_notes_and_experiences_are_searchable(self):
        searchable = (
            "OsdNotes/index/",
            "OsdNotes/CS101/Python/#functions",
            "%E7%BB%8F%E9%AA%8C%E5%88%86%E4%BA%AB/",
            "经验分享/Phi Lab/guide/",
        )
        excluded = (
            "",
            "HOME/friends/",
            "HOME/Archive/",
            "blog/",
        )

        for location in searchable:
            with self.subTest(location=location):
                self.assertTrue(SEARCH_SCOPE._is_searchable(location))

        for location in excluded:
            with self.subTest(location=location):
                self.assertFalse(SEARCH_SCOPE._is_searchable(location))


if __name__ == "__main__":
    unittest.main()
