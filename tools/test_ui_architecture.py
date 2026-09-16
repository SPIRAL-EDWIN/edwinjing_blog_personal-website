"""Regression contracts for the EdwinOS UI entry points and ownership."""

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
MKDOCS_PATH = ROOT / "mkdocs.yml"
STYLES_DIR = ROOT / "docs" / "stylesheets"
EDWINOS_PATH = STYLES_DIR / "edwinos.css"


def section_span(stylesheet, start, end):
    """Return a named EdwinOS component slice and fail on missing/reordered owners."""
    start_index = stylesheet.index(start)
    end_index = stylesheet.index(end, start_index + len(start))
    return start_index, end_index, stylesheet[start_index:end_index]


def qualified_rules(stylesheet):
    """Yield flat qualified rules; sufficient for ownership/property guardrails."""
    without_comments = re.sub(r"/\*.*?\*/", "", stylesheet, flags=re.S)
    for match in re.finditer(r"(?P<selectors>[^{}]+)\{(?P<body>[^{}]*)\}", without_comments):
        selectors = match.group("selectors").strip()
        if selectors.startswith("@"):
            continue
        properties = set(re.findall(r"(?m)(?:^|;)\s*(--?[\w-]+|[a-zA-Z][\w-]*)\s*:", match.group("body")))
        yield selectors, properties


class UiArchitectureContractTests(unittest.TestCase):
    def test_mkdocs_loads_one_custom_ui_stylesheet(self):
        config = MKDOCS_PATH.read_text(encoding="utf-8")
        match = re.search(
            r"(?m)^extra_css:\s*\n(?P<body>(?:^[ \t]+-[^\n]*\n)+)",
            config,
        )

        self.assertIsNotNone(match)
        entries = re.findall(r"^[ \t]+-\s+([^\s#]+)", match.group("body"), re.M)
        self.assertEqual(1, len(entries))
        self.assertRegex(entries[0], r"^stylesheets/edwinos\.css\?v=\d+[a-z]$")

    def test_legacy_css_entry_points_are_removed(self):
        self.assertFalse((STYLES_DIR / "extra.css").exists())
        self.assertFalse((STYLES_DIR / "edwinos-overrides.css").exists())
        self.assertTrue(EDWINOS_PATH.is_file())

    def test_fonts_are_site_hosted_without_remote_imports(self):
        stylesheet = EDWINOS_PATH.read_text(encoding="utf-8")
        config = MKDOCS_PATH.read_text(encoding="utf-8")
        self.assertNotRegex(stylesheet, r"(?m)^@import\s+")
        self.assertNotIn("fonts.googleapis.com", stylesheet)
        self.assertRegex(config, r"(?m)^\s+font:\s+false\s*$")
        for family in (
            "source-serif-4", "jetbrains-mono", "inter", "playfair-display",
            "cinzel", "cormorant-garamond",
        ):
            self.assertIn(f"../assets/fonts/{family}/{family}-latin.woff2", stylesheet)
            self.assertTrue((ROOT / "docs" / "assets" / "fonts" / family / f"{family}-latin.woff2").is_file())

    def test_stylesheet_documents_its_cascade_contract(self):
        stylesheet = EDWINOS_PATH.read_text(encoding="utf-8")

        self.assertIn("EdwinOS unified stylesheet", stylesheet[:2000])
        self.assertIn("CASCADE CONTRACT", stylesheet[:2000])
        self.assertIn("Historical Material and site baseline", stylesheet)
        self.assertIn("EdwinOS final component layer", stylesheet)

    def test_migrated_components_have_one_final_owner(self):
        stylesheet = EDWINOS_PATH.read_text(encoding="utf-8")
        final_zone = stylesheet.index("2. EdwinOS final component layer")
        owners = (
            ("Markdown Lists", "Code Blocks"),
            ("Header, tabs, search, and source", "Drawer Navigation"),
            ("Drawer Navigation and Article TOC", "Profile Card and HOME shell"),
            ("Profile Card and HOME shell", "About Me"),
            ("Friends Page", "Archive"),
        )

        previous = final_zone
        for owner, following_owner in owners:
            self.assertEqual(1, stylesheet.count(owner), owner)
            start, end, _ = section_span(stylesheet, owner, following_owner)
            self.assertGreater(start, final_zone, owner)
            self.assertGreater(start, previous, owner)
            self.assertGreater(end, start, owner)
            previous = start

        self.assertNotIn("--compact-header-nav-space", stylesheet)

    def test_migrated_core_selectors_stay_inside_their_owner(self):
        stylesheet = EDWINOS_PATH.read_text(encoding="utf-8")
        contracts = (
            (
                "Markdown Lists",
                "Code Blocks",
                (r"\.md-typeset\s+:where\(ul:not\(\[class\]\)",),
            ),
            (
                "Header, tabs, search, and source",
                "Drawer Navigation",
                (r"\.md-search__input", r"\.md-tabs__list", r"\.md-header__source", r"\.md-source__facts"),
            ),
            (
                "Drawer Navigation and Article TOC",
                "Profile Card and HOME shell",
                (r'\[data-md-component="toc"\]', r"\.edwinos-toc-", r"\.edwinos-drawer-"),
            ),
            (
                "Profile Card and HOME shell",
                "About Me",
                (r"\.profile-card", r"\.profile-avatar", r"\.profile-meta"),
            ),
            (
                "Friends Page",
                "Archive",
                (r"\.friend-card", r"\.friend-avatar-stack"),
            ),
        )

        for owner, following_owner, selector_tokens in contracts:
            start, end, owned = section_span(stylesheet, owner, following_owner)
            outside = stylesheet[:start] + stylesheet[end:]
            for selector_token in selector_tokens:
                self.assertRegex(owned, selector_token, f"{owner}: {selector_token}")
                self.assertNotRegex(outside, selector_token, f"selector escaped {owner}: {selector_token}")

    def test_overview_section_titles_stay_in_final_typography_owner(self):
        stylesheet = EDWINOS_PATH.read_text(encoding="utf-8")
        final_zone = stylesheet.index("2. EdwinOS final component layer")
        start, end, owned = section_span(
            stylesheet,
            "\n   Typography\n",
            "\n   Markdown Lists\n",
        )
        outside = stylesheet[:start] + stylesheet[end:]

        self.assertGreater(start, final_zone)
        self.assertRegex(owned, r"\.section-title")
        self.assertNotRegex(outside, r"\.section-title")

    def test_pre_owner_header_references_are_shared_primitives_only(self):
        stylesheet = EDWINOS_PATH.read_text(encoding="utf-8")
        header_start = stylesheet.index("Header, tabs, search, and source")
        shared_properties = {"font-family", "animation", "transition", "transform"}
        component_token = re.compile(r"\.(?:md-header|md-tabs|md-search|md-source)(?:\b|__)")

        matching_rules = [
            (selectors, properties)
            for selectors, properties in qualified_rules(stylesheet[:header_start])
            if component_token.search(selectors)
        ]
        self.assertTrue(matching_rules)
        for selectors, properties in matching_rules:
            self.assertTrue(
                properties <= shared_properties,
                f"pre-owner Header rule is not an allowed typography/motion primitive: "
                f"{selectors!r} declares {sorted(properties)}",
            )

    def test_post_owner_header_references_are_documented_drawer_controls(self):
        stylesheet = EDWINOS_PATH.read_text(encoding="utf-8")
        _, header_end, _ = section_span(
            stylesheet,
            "Header, tabs, search, and source",
            "Drawer Navigation",
        )
        component_token = re.compile(r"\.(?:md-header|md-tabs|md-search|md-source)(?:\b|__)")
        matching_selectors = [
            selectors
            for selectors, _ in qualified_rules(stylesheet[header_end:])
            if component_token.search(selectors)
        ]

        self.assertTrue(matching_selectors)
        for selectors in matching_selectors:
            self.assertRegex(selectors, r'\.md-header__button\[for="__drawer"\]')
            self.assertNotRegex(selectors, r"\.(?:md-tabs|md-search|md-source)(?:\b|__)")

    def test_section_drawer_reserves_the_header_glass_clearance(self):
        stylesheet = EDWINOS_PATH.read_text(encoding="utf-8")
        _, _, drawer_owner = section_span(
            stylesheet,
            "Drawer Navigation and Article TOC",
            "Profile Card and HOME shell",
        )

        self.assertRegex(
            drawer_owner,
            r"--edwinos-drawer-glass-clearance:\s*calc\(\s*"
            r"var\(--edwinos-mobile-header-height, 3\.5rem\)\s*\+\s*0\.42rem\s*\)",
        )
        self.assertRegex(
            drawer_owner,
            r"\.edwinos-drawer-section-nav\s*>\s*\.md-nav__list\s*\{[^}]*"
            r"box-sizing:\s*border-box\s*!important;[^}]*"
            r"padding-top:\s*var\(--edwinos-drawer-glass-clearance\)\s*!important;",
        )

if __name__ == "__main__":
    unittest.main()
