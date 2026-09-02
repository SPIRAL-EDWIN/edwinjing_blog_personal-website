"""Regression tests for the public search-index scope."""

import importlib.util
import unittest
from pathlib import Path


HOOK_PATH = Path(__file__).parents[1] / "hooks" / "search_scope.py"
SPEC = importlib.util.spec_from_file_location("search_scope", HOOK_PATH)
SEARCH_SCOPE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SEARCH_SCOPE)


class SearchScopeTests(unittest.TestCase):
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
