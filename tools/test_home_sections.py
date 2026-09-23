"""Regression tests for maintainable Overview News and Publications data."""

import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from PIL import Image


HOOK_PATH = Path(__file__).parents[1] / "hooks" / "home_sections.py"
SPEC = importlib.util.spec_from_file_location("home_sections", HOOK_PATH)
HOME_SECTIONS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOME_SECTIONS)


def publication_data(authors, **entry_overrides):
    entry = {
        "id": "paper-one",
        "title": "A <safe> paper",
        "image": "",
        "placeholder": "PAPER",
        "authors": authors,
        "venue": {
            "name": "ICRA",
            "year": "2027",
            "status": "Under Review",
            "rank": "",
        },
        "lead": True,
        "links": [{"label": "Project Page", "url": "https://example.com/project"}],
    }
    entry.update(entry_overrides)
    return {
        "settings": {
            "self_author": "Chen Jing",
            "collapse_after": 4,
            "author_notes": {"*": "Equal contribution", "†": "Corresponding author"},
        },
        "entries": [entry],
    }


class HomeSectionsTests(unittest.TestCase):
    def test_news_is_sorted_and_escaped(self):
        markup = HOME_SECTIONS.render_news({
            "settings": {"visible_count": 1},
            "entries": [
                {"date": "2026-01-01", "text": "Older"},
                {"date": "2026-02-01", "text": "Newer <unsafe>"},
            ],
        })
        self.assertLess(markup.index("Newer"), markup.index("Older"))
        self.assertIn("Newer &lt;unsafe&gt;", markup)
        self.assertIn("overview-news-more", markup)
        self.assertIn('datetime="2026-02-01">02/2026</time>', markup)
        self.assertIn('datetime="2026-01-01">01/2026</time>', markup)

    def test_news_inline_link_wraps_the_named_phrase(self):
        markup = HOME_SECTIONS.render_news({
            "entries": [{
                "date": "2026-09-16",
                "text": "Accepted at the MoMA.v5 Workshop at IROS 2026.",
                "inline_link": {
                    "label": "MoMA.v5 Workshop at IROS 2026",
                    "url": "https://example.com/workshop",
                },
            }],
        })
        self.assertIn(
            '<a class="overview-news-inline-link" href="https://example.com/workshop" '
            'target="_blank" rel="noopener noreferrer">MoMA.v5 Workshop at IROS 2026</a>.',
            markup,
        )
        self.assertNotIn("overview-news-links", markup)

    def test_news_inline_link_label_must_match_once(self):
        with self.assertRaises(HOME_SECTIONS.HomeSectionError):
            HOME_SECTIONS.render_news({
                "entries": [{
                    "date": "2026-09-16",
                    "text": "Accepted.",
                    "inline_link": {
                        "label": "Workshop",
                        "url": "https://example.com/workshop",
                    },
                }],
            })

    def test_long_author_list_compacts_and_keeps_self(self):
        authors = [
            {"name": "First Author", "marks": "*"},
            {"name": "Second Author"},
            {"name": "Third Author"},
            {"name": "Chen Jing", "self": True},
            {"name": "Fifth Author"},
            {"name": "Senior Author", "marks": "†"},
        ]
        markup = HOME_SECTIONS.render_publications(publication_data(authors))
        summary = markup.split("overview-publication__authors-full", 1)[0]
        self.assertIn("overview-publication__authors-details", markup)
        self.assertIn("First Author*", summary)
        self.assertIn("Chen Jing", summary)
        self.assertIn("Senior Author†", summary)
        self.assertIn("authors-ellipsis", summary)
        self.assertNotIn("Second Author", summary)
        self.assertIn("Second Author", markup)
        self.assertIn("* Equal contribution", markup)
        self.assertIn("† Corresponding author", markup)
        author_summary = markup.split("<summary>", 1)[1].split("</summary>", 1)[0]
        self.assertLess(
            author_summary.index("overview-publication__authors-full"),
            author_summary.index("overview-publication__authors-toggle"),
        )
        self.assertNotIn('<p class="overview-publication__authors-full">', markup)

    def test_long_list_without_self_stays_expanded(self):
        authors = [{"name": f"Author {index}"} for index in range(1, 7)]
        markup = HOME_SECTIONS.render_publications(publication_data(authors))
        self.assertNotIn("authors-details", markup)
        self.assertIn("Author 6", markup)

    def test_publication_content_and_links_are_safe(self):
        markup = HOME_SECTIONS.render_publications(
            publication_data([{"name": "Chen Jing", "self": True}])
        )
        self.assertIn("A &lt;safe&gt; paper", markup)
        self.assertIn('target="_blank" rel="noopener noreferrer"', markup)
        self.assertIn("overview-publication is-lead", markup)

        unsafe = publication_data(
            [{"name": "Chen Jing"}],
            links=[{"label": "Bad", "url": "javascript:alert(1)"}],
        )
        with self.assertRaises(HOME_SECTIONS.HomeSectionError):
            HOME_SECTIONS.render_publications(unsafe)

    def test_missing_local_image_fails_the_build(self):
        with tempfile.TemporaryDirectory() as directory:
            data = publication_data(
                [{"name": "Chen Jing"}],
                image="assets/images/publications/missing.webp",
                image_alt="Missing teaser",
            )
            with self.assertRaises(HOME_SECTIONS.HomeSectionError):
                HOME_SECTIONS.render_publications(data, Path(directory))

    def test_publication_image_opts_out_of_lightbox(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = root / "docs/assets/images/publications/paper.webp"
            image.parent.mkdir(parents=True)
            Image.new("RGB", (480, 328), "white").save(image, "WEBP")
            data = publication_data(
                [{"name": "Chen Jing", "self": True}],
                image="assets/images/publications/paper.webp",
                image_alt="Paper teaser",
            )
            markup = HOME_SECTIONS.render_publications(data, root)
            self.assertIn('<img class="off-glb"', markup)
            self.assertNotIn('<a class="glightbox"', markup)
            self.assertIn('width="480" height="328"', markup)
            self.assertIn('loading="eager" decoding="async"', markup)

    def test_only_first_available_publication_image_loads_eagerly(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image_dir = root / "docs/assets/images/publications"
            image_dir.mkdir(parents=True)
            for name in ("first.webp", "second.webp"):
                Image.new("RGB", (24, 16), "white").save(image_dir / name, "WEBP")

            data = publication_data(
                [{"name": "Chen Jing", "self": True}],
                image="",
            )
            template = data["entries"][0]
            data["entries"] = [
                dict(template, id="placeholder", image=""),
                dict(template, id="first-image", image="assets/images/publications/first.webp", image_alt="First"),
                dict(template, id="second-image", image="assets/images/publications/second.webp", image_alt="Second"),
            ]

            markup = HOME_SECTIONS.render_publications(data, root)
            first = markup.split('src="assets/images/publications/first.webp"', 1)[1].split(">", 1)[0]
            second = markup.split('src="assets/images/publications/second.webp"', 1)[1].split(">", 1)[0]
            self.assertIn('loading="eager"', first)
            self.assertIn('loading="lazy"', second)
            self.assertIn('decoding="async"', first)
            self.assertIn('decoding="async"', second)

    def test_oversized_publication_image_fails_the_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = root / "docs/assets/images/publications/too-large.png"
            image.parent.mkdir(parents=True)
            Image.new("RGB", (1500, 1500), "white").save(image, "PNG")
            data = publication_data(
                [{"name": "Chen Jing", "self": True}],
                image="assets/images/publications/too-large.png",
                image_alt="Oversized teaser",
            )
            with self.assertRaisesRegex(HOME_SECTIONS.HomeSectionError, "no more than"):
                HOME_SECTIONS.render_publications(data, root)

    def test_hook_only_replaces_the_homepage_markers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data/homepage").mkdir(parents=True)
            (root / "data/homepage/news.yml").write_text(
                "settings:\n  visible_count: 5\nentries: []\n",
                encoding="utf-8",
            )
            (root / "data/homepage/publications.yml").write_text(
                "settings:\n  self_author: Chen Jing\nentries: []\n",
                encoding="utf-8",
            )
            config = SimpleNamespace(config_file_path=str(root / "mkdocs.yml"))
            other_page = SimpleNamespace(file=SimpleNamespace(src_uri="other.md"))
            self.assertEqual(
                HOME_SECTIONS.on_page_markdown("unchanged", other_page, config, None),
                "unchanged",
            )

            home_page = SimpleNamespace(file=SimpleNamespace(src_uri="index.md"))
            source = (
                HOME_SECTIONS.NEWS_MARKER
                + "\n"
                + HOME_SECTIONS.PUBLICATIONS_MARKER
            )
            rendered = HOME_SECTIONS.on_page_markdown(source, home_page, config, None)
            self.assertNotIn(HOME_SECTIONS.NEWS_MARKER, rendered)
            self.assertNotIn(HOME_SECTIONS.PUBLICATIONS_MARKER, rendered)
            self.assertEqual(rendered.count("overview-section-empty"), 2)


if __name__ == "__main__":
    unittest.main()
