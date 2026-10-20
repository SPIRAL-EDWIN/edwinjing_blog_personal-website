"""Keep note-section footer metadata aligned with the Overview contract."""

import unittest
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from types import SimpleNamespace

from jinja2 import ChoiceLoader, DictLoader, Environment, FileSystemLoader


ROOT = Path(__file__).parents[1]


class FooterStructure(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.in_article = False
        self.notes_in_article = False
        self.search_excluded = False
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "article":
            self.in_article = True
        if tag == "footer" and attrs.get("class") == "edwinos-notes-footer":
            self.notes_in_article = self.in_article
            self.search_excluded = "data-search-exclude" in attrs

    def handle_endtag(self, tag):
        if tag == "article":
            self.in_article = False


class FooterMetadataTests(unittest.TestCase):
    def render(self, source, url, built=None):
        environment = Environment(loader=ChoiceLoader([
            DictLoader({"base.html": (
                '<article class="md-content__inner">'
                '{% block content %}<p>Article body</p>{% endblock %}</article>'
                '{% block footer %}<footer class="native-footer">Unchanged legacy footer</footer>{% endblock %}'
            )}),
            FileSystemLoader(str(ROOT / "overrides")),
        ]))
        environment.filters["url"] = lambda value: value
        return environment.get_template("main.html").render(
            page=SimpleNamespace(url=url, file=SimpleNamespace(src_uri=source)),
            config={"copyright": "Unchanged legacy footer", "extra": {"generator": False}},
            build_date_utc=built or datetime(2026, 10, 20, tzinfo=timezone.utc),
        )

    def test_note_landing_and_child_pages_share_metadata_without_visitor_badges(self):
        for source, url in (
            ("OsdNotes/index.md", "OsdNotes/"),
            ("经验分享/index.md", "经验分享/"),
            ("OsdNotes/CHEM/CHEM 102.md", "OsdNotes/CHEM/CHEM 102/"),
            ("经验分享/Phi Lab/note.md", "经验分享/Phi Lab/note/"),
        ):
            with self.subTest(source=source):
                markup = self.render(source, url)
                self.assertIn('class="edwinos-notes-footer"', markup)
                self.assertIn("Content licensed under", markup)
                self.assertIn('href="https://creativecommons.org/licenses/by-nc-sa/4.0/"', markup)
                self.assertIn("&copy; Chen Jing", markup)
                self.assertIn('datetime="2026-10">Latest updated Oct. 2026</time>', markup)
                self.assertIn("data-visitor-deployment-time", markup)
                self.assertIn('data-deployment-repository="SPIRAL-EDWIN/edwinjing-blog-website"', markup)
                self.assertNotIn("Unchanged legacy footer", markup)
                self.assertNotIn("visitorbadge", markup)
                self.assertNotIn("<img", markup)
                structure = FooterStructure(markup)
                self.assertTrue(structure.notes_in_article)
                self.assertTrue(structure.search_excluded)
                self.assertNotIn('class="native-footer"', markup)
                self.assertLess(markup.index("Article body"), markup.index('class="edwinos-notes-footer"'))

    def test_static_fallback_uses_the_build_month(self):
        markup = self.render("OsdNotes/index.md", "OsdNotes/", datetime(2027, 1, 8, tzinfo=timezone.utc))
        self.assertIn('datetime="2027-01">Latest updated Jan. 2027</time>', markup)

    def test_other_routes_keep_their_existing_footer(self):
        for source, url in (("HOME/friends.md", "HOME/friends/"), ("HOME/Archive/index.md", "HOME/Archive/"), ("blog/index.md", "blog/")):
            with self.subTest(source=source):
                markup = self.render(source, url)
                self.assertIn("Unchanged legacy footer", markup)
                self.assertNotIn("edwinos-notes-footer", markup)
                self.assertNotIn("data-visitor-deployment", markup)

    def test_homepage_keeps_its_authored_footer(self):
        markup = self.render("index.md", "")
        self.assertIn("Article body", markup)
        self.assertNotIn("edwinos-notes-footer", markup)
        self.assertNotIn('class="native-footer"', markup)


if __name__ == "__main__":
    unittest.main()
