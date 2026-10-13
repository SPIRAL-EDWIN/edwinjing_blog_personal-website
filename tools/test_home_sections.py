"""Regression tests for maintainable Overview News and Publications data."""

import importlib.util
import json
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urljoin

from jinja2 import DictLoader, Environment
from mkdocs.exceptions import PluginError
from PIL import Image


HOOK_PATH = Path(__file__).parents[1] / "hooks" / "home_sections.py"
SPEC = importlib.util.spec_from_file_location("home_sections", HOOK_PATH)
HOME_SECTIONS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOME_SECTIONS)


class Markup(HTMLParser):
    def __init__(self, content):
        super().__init__(convert_charrefs=False)
        self.nodes = []
        self.text = []
        self.feed(content)

    def handle_starttag(self, tag, attrs):
        self.nodes.append((tag, dict(attrs)))

    def handle_data(self, data):
        self.text.append(data)

    def select(self, tag):
        return [attrs for name, attrs in self.nodes if name == tag]


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
    def test_profile_preserves_all_authored_personal_information(self):
        home = (HOOK_PATH.parents[1] / "docs/index.md").read_text(encoding="utf-8")
        authored = Markup(HOME_SECTIONS._ProfileMarkup(home).sidebars[0])
        copied = Markup(HOME_SECTIONS.render_profile_sidebar(home, "HOME/friends/"))
        self.assertEqual(copied.text, authored.text)
        self.assertEqual(
            [(tag, attrs) for tag, attrs in copied.nodes if tag in ("svg", "path")],
            [(tag, attrs) for tag, attrs in authored.nodes if tag in ("svg", "path")],
        )
        self.assertIn("data-search-exclude", copied.select("aside")[0])
        self.assertEqual(len(copied.nodes), len(authored.nodes))
        for (tag, source), (_, target) in zip(authored.nodes, copied.nodes):
            if tag not in ("a", "img"):
                continue
            attribute = "href" if tag == "a" else "src"
            self.assertEqual(
                urljoin("https://example.com/project/", source[attribute]),
                urljoin("https://example.com/project/HOME/friends/", target[attribute]),
            )
            self.assertEqual(
                {key: value for key, value in source.items() if key != attribute},
                {key: value for key, value in target.items() if key != attribute},
            )

    def test_profile_rebases_local_urls_and_srcset_for_project_deploys(self):
        home = '''<aside class="academic-sidebar">
        <a href="./HOME/Archive/?year=2026#recent">Archive</a>
        <a href="#about">About</a><a href="mailto:edwin@example.com">Email</a>
        <a href="https://example.com/x?q=1#anchor">External</a>
        <img src="./assets/avatar.svg" srcset="./assets/a.webp 1x, /assets/b.webp 2x">
        <img src="data:image/svg+xml;base64,AAAA" srcset="data:image/png;base64,AAAA 1x, ./assets/c.webp 2x">
        </aside>'''
        for page_url in ("HOME/friends/", "HOME/Archive/", "HOME/friends.html"):
            sidebar = Markup(HOME_SECTIONS.render_profile_sidebar(home, page_url))
            prefix = "../" if page_url.endswith(".html") else "../../"
            self.assertEqual(sidebar.select("img")[0]["src"], prefix + "assets/avatar.svg")
            self.assertEqual(
                sidebar.select("img")[0]["srcset"],
                f"{prefix}assets/a.webp 1x, {prefix}assets/b.webp 2x",
            )
            self.assertEqual(sidebar.select("img")[1]["src"], "data:image/svg+xml;base64,AAAA")
            self.assertEqual(
                sidebar.select("img")[1]["srcset"],
                f"data:image/png;base64,AAAA 1x, {prefix}assets/c.webp 2x",
            )
            self.assertEqual(sidebar.select("a")[1]["href"], prefix + "#about")
            self.assertEqual(sidebar.select("a")[2]["href"], "mailto:edwin@example.com")
            self.assertEqual(sidebar.select("a")[3]["href"], "https://example.com/x?q=1#anchor")
            self.assertEqual(
                urljoin("https://example.com/project/" + page_url, sidebar.select("a")[0]["href"]),
                "https://example.com/project/HOME/Archive/?year=2026#recent",
            )

    def test_profile_build_wraps_only_intended_subpages_once_and_preserves_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.md").write_text(
                '<aside class="academic-sidebar"><p>Authored profile</p></aside>', encoding="utf-8"
            )
            config = {"docs_dir": str(root)}
            content = '<h1 id="friends">Friends</h1>\n<p>Body &amp; links</p>'
            for path, url in (("HOME/friends.md", "HOME/friends/"),
                              ("HOME/Archive/index.md", "HOME/Archive/")):
                page = SimpleNamespace(file=SimpleNamespace(src_uri=path), url=url)
                output = HOME_SECTIONS.on_page_content(content, page, config, None)
                parsed = Markup(output)
                self.assertEqual(sum("academic-home-layout--subpage" in attrs.get("class", "").split()
                                     for _, attrs in parsed.nodes), 1)
                self.assertEqual(len(parsed.select("aside")), 1)
                self.assertIn(content, output)
                self.assertEqual(
                    HOME_SECTIONS.on_page_content(output, page, config, None), output
                )
            for path in ("index.md", "HOME/more.md", "OsdNotes/index.md"):
                page = SimpleNamespace(file=SimpleNamespace(src_uri=path))
                self.assertEqual(
                    HOME_SECTIONS.on_page_content(content, page, config, None), content
                )

    def test_profile_missing_or_duplicate_source_fails_instead_of_silent_drift(self):
        for markup in ("<p>No profile</p>", '<aside class="academic-sidebar"></aside>' * 2):
            with self.assertRaises(HOME_SECTIONS.HomeSectionError):
                HOME_SECTIONS.render_profile_sidebar(markup, "HOME/friends/")

    def test_repository_snapshot_is_validated_and_matches_configured_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / HOME_SECTIONS.REPOSITORY_FACTS
            snapshot.parent.mkdir(parents=True)
            facts = {"repository": "owner/source", "stars": 4, "forks": 0}
            snapshot.write_text(json.dumps(facts), encoding="utf-8")
            config = {"docs_dir": str(root), "repo_url": "https://github.com/owner/source/"}
            self.assertIs(HOME_SECTIONS.on_config(config), config)
            self.assertEqual(config["extra"]["edwinos_github_repo_facts"], facts)
            config["repo_url"] = "https://github.com/owner/deployment"
            HOME_SECTIONS.on_config(config)
            self.assertEqual(config["extra"]["edwinos_github_repo_facts"], {})
            for invalid in (True, -1, "4", 1.5):
                snapshot.write_text(json.dumps(dict(facts, stars=invalid)), encoding="utf-8")
                with self.assertRaises(PluginError):
                    HOME_SECTIONS.on_config(config)

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
        self.assertIn("First Author*", summary)
        self.assertIn("Chen Jing", summary)
        self.assertIn("Senior Author†", summary)
        self.assertIn("authors-ellipsis", summary)
        self.assertNotIn("Second Author", summary)
        self.assertIn("Second Author", markup)
        self.assertIn("* Equal contribution", markup)
        self.assertIn("† Corresponding author", markup)
        author_summary = markup.split('<p class="overview-publication__authors">', 1)[1].split("</p>", 1)[0]
        self.assertLess(
            author_summary.index("overview-publication__authors-full"),
            author_summary.index("overview-publication__authors-toggle"),
        )
        self.assertNotIn('<p class="overview-publication__authors-full">', markup)
        # Author text must not become a native disclosure click target again.
        self.assertNotIn("<summary", author_summary)
        self.assertNotIn("<details", markup)
        self.assertIn('<button type="button" class="overview-publication__authors-toggle"', author_summary)
        self.assertIn('aria-expanded="false" aria-controls="publication-paper-one-authors-full"', author_summary)
        self.assertIn('id="publication-paper-one-authors-full"', author_summary)

    def test_author_buttons_control_their_own_publication(self):
        authors = [{"name": "Chen Jing"}] + [{"name": f"Author {index}"} for index in range(5)]
        data = publication_data(authors)
        data["entries"].append(dict(data["entries"][0], id="paper-two"))
        markup = HOME_SECTIONS.render_publications(data)
        for entry_id in ("paper-one", "paper-two"):
            full_id = f"publication-{entry_id}-authors-full"
            self.assertEqual(markup.count(f'id="{full_id}"'), 1)
            self.assertEqual(markup.count(f'aria-controls="{full_id}"'), 1)

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
            self.assertIn('loading="eager" fetchpriority="auto" decoding="sync"', markup)

    def test_first_real_publication_image_is_ready_early_and_later_images_stay_lazy(self):
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
            self.assertIn('fetchpriority="auto"', first)
            self.assertIn('decoding="sync"', first)
            self.assertIn('loading="lazy"', second)
            self.assertIn('fetchpriority="low"', second)
            self.assertIn('decoding="async"', second)
            self.assertEqual(markup.count('loading="eager"'), 1)

    def test_home_image_preloads_are_bounded_and_keep_responsive_candidates(self):
        content = '''<div class="academic-home-layout">
        <img src="assets/avatar.webp">
        <div class="overview-education-logo"><img src="./assets/zju-180.webp"
          srcset="./assets/zju-180.webp 180w, ./assets/zju-360.webp 360w"
          sizes="(max-width: 680px) 32vw, 180px"></div>
        <div class="overview-publication__media overview-publication__media--placeholder"><span>PAPER</span></div>
        <div class="overview-publication__media"><img src="assets/paper.webp"></div>
        <div class="overview-publication__media"><img src="assets/later-paper.webp"></div>
        <div class="overview-workshop__media overview-publication__media"><div>
          <img src="assets/workshop-175.webp" srcset="assets/workshop-175.webp 175w, assets/workshop-350.webp 350w"
          sizes="(max-width: 420px) 100px, 175px"></div></div>
        <div class="overview-workshop__media"><img src="assets/later-workshop.webp"></div>
        </div>'''
        page = SimpleNamespace(file=SimpleNamespace(src_uri="index.md"), url="", content=content)
        self.assertEqual(HOME_SECTIONS.on_page_content(content, page, {}, None), content)
        self.assertEqual([image["src"] for image in page.edwinos_home_image_preloads], [
            "./assets/zju-180.webp", "assets/paper.webp", "assets/workshop-175.webp",
        ])
        env = Environment(loader=DictLoader({
            "main.html": (HOOK_PATH.parents[1] / "overrides/main.html").read_text(encoding="utf-8"),
            "partials/image-previews.html": (HOOK_PATH.parents[1] / "overrides/partials/image-previews.html").read_text(encoding="utf-8"),
            "base.html": "{% block extrahead %}{% endblock %}",
        }), autoescape=True)
        env.filters["url"] = lambda value: value
        output = Markup(env.get_template("main.html").render(page=page, config={"site_name": "Site"}))
        preloads = [node for node in output.select("link") if node.get("as") == "image"]
        self.assertEqual(len(preloads), 3)
        for descriptor, preload in zip(page.edwinos_home_image_preloads, preloads):
            self.assertEqual(preload["href"], descriptor["src"])
            self.assertEqual(preload.get("imagesrcset", ""), descriptor["srcset"])
            self.assertEqual(preload.get("imagesizes", ""), descriptor["sizes"])
        # Page scope is enforced in the template as well as the content hook.
        for url in ("HOME/friends/", "HOME/Archive/", "articles/example/"):
            page.url = url
            output = Markup(env.get_template("main.html").render(page=page, config={"site_name": "Site"}))
            self.assertFalse(any(node.get("as") == "image" for node in output.select("link")))

    def test_home_preload_hook_skips_other_pages_and_external_assets(self):
        content = '''<div class="overview-education-logo"><img src="https://other.test/zju.webp"></div>
        <div class="overview-publication__media"><img src="data:image/webp;base64,AAAA"></div>
        <div class="overview-workshop__media"><img src="assets/workshop.webp"
          srcset="assets/workshop.webp 1x, https://other.test/workshop.webp 2x"></div>'''
        home = SimpleNamespace(file=SimpleNamespace(src_uri="index.md"))
        HOME_SECTIONS.on_page_content(content, home, {}, None)
        self.assertEqual(home.edwinos_home_image_preloads, [])
        article = SimpleNamespace(file=SimpleNamespace(src_uri="articles/example.md"))
        HOME_SECTIONS.on_page_content(content, article, {}, None)
        self.assertEqual(article.edwinos_home_image_preloads, [])

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
