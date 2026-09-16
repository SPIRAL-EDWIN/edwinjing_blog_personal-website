"""Contracts for bounded, local-only Archive cover previews."""

import importlib.util
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from types import SimpleNamespace

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("archive_assets_hook", ROOT / "hooks/archive_assets.py")
HOOK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOOK)


class Tags(HTMLParser):
    def handle_starttag(self, tag, attrs):
        if tag == "img":
            self.image = dict(attrs)


class ArchiveAssetsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.docs = self.root / "docs"
        self.site = self.root / "site"
        self.docs.mkdir()
        self.site.mkdir()
        self.original = self.docs / "source image.png"
        Image.new("RGB", (2000, 1000), "orange").save(self.original)
        self.original_bytes = self.original.read_bytes()
        self.page = SimpleNamespace(url="HOME/Archive/", file=SimpleNamespace(src_uri=HOOK.ARCHIVE_PAGE))
        self.config = {"docs_dir": str(self.docs), "site_dir": str(self.site), "site_url": "https://example.com/"}
        self.content = '<a href="../../note/"><img class="archive-card__image off-glb" src="../../source%20image.png" alt="A &amp; B" loading="lazy" decoding="async"></a>'

    def render(self, content=None, files=()):
        return HOOK.on_post_page(content or self.content, self.page, self.config, files=files)

    def image(self, output):
        parser = Tags()
        parser.feed(output)
        return parser.image

    def test_bounded_webp_originals_and_links_preserved(self):
        output = self.render()
        attrs = self.image(output)
        self.assertTrue(attrs["src"].startswith("../../assets/archive-thumbnails/"))
        self.assertEqual((attrs["width"], attrs["height"]), ("640", "320"))
        self.assertEqual(attrs["fetchpriority"], "low")
        self.assertEqual((attrs["loading"], attrs["decoding"], attrs["alt"]), ("lazy", "async", "A & B"))
        self.assertIn('<a href="../../note/">', output)
        self.assertEqual(self.original.read_bytes(), self.original_bytes)
        target = self.site / attrs["src"].removeprefix("../../")
        with Image.open(target) as preview:
            self.assertEqual((preview.format, preview.size), ("WEBP", (640, 320)))

    def test_remote_svg_missing_and_animated_sources_are_not_replaced(self):
        (self.docs / "vector.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
        Image.new("RGB", (10, 10), "red").save(self.docs / "animated.gif", save_all=True, append_images=[Image.new("RGB", (10, 10), "blue")], duration=100, loop=0)
        for src in ("https://other.example/img.png", "../../vector.svg", "../../missing.png", "../../animated.gif", "data:image/png;base64,AA"):
            with self.subTest(src=src):
                content = f'<img class="archive-card__image" src="{src}">'
                attrs = self.image(self.render(content))
                self.assertEqual(attrs["src"], src)
                self.assertEqual(attrs["fetchpriority"], "low")
        self.assertFalse((self.site / HOOK.THUMBNAIL_DIR).exists())

    def test_only_archive_cover_tags_are_changed(self):
        for content in ('<img src="../../source%20image.png">', '<!-- <img class="archive-card__image" src="x"> --><script>var x="<img class=archive-card__image src=x>";</script>'):
            self.assertEqual(self.render(content), content)
        self.page.file.src_uri = "OsdNotes/CS101/Python.md"
        self.assertEqual(self.render(), self.content)

    def test_explicit_author_attributes_and_responsive_sources_preserved(self):
        output = self.render(self.content.replace('loading="lazy"', 'width="100" fetchpriority="high" loading="eager"'))
        attrs = self.image(output)
        self.assertEqual((attrs["width"], attrs["fetchpriority"], attrs["loading"]), ("100", "high", "eager"))
        self.assertNotIn("height", attrs)
        for extra in ('srcset="other.png 2x"', 'sizes="50vw"'):
            attrs = self.image(self.render(self.content.replace('alt=', extra + ' alt=')))
            self.assertEqual(attrs["src"], "../../source%20image.png")

    def test_idempotency_repeat_build_and_content_hash_invalidation(self):
        output = self.render()
        self.assertEqual(self.render(output), output)
        self.assertEqual(self.render(), output)
        target = next((self.site / HOOK.THUMBNAIL_DIR).glob("*.webp"))
        target.unlink()  # Simulate MkDocs clean output between builds.
        self.assertEqual(self.render(), output)
        self.assertTrue(target.is_file())
        Image.new("RGB", (2000, 1000), "blue").save(self.original)
        self.assertNotEqual(self.image(self.render())["src"], self.image(output)["src"])

    def test_site_subpath_same_origin_and_file_output_mapping(self):
        self.config["site_url"] = "https://example.com/project/"
        content = '<img class="archive-card__image" src="https://example.com/project/source%20image.png">'
        self.assertIn("archive-thumbnails", self.image(self.render(content))["src"])
        files = [SimpleNamespace(dest_uri="mapped.png", abs_src_path=str(self.original))]
        self.assertIs(HOOK.on_files(files, self.config), files)
        content = '<img class="archive-card__image" src="../../mapped.png">'
        output = HOOK.on_post_page(content, self.page, self.config)
        self.assertIn("archive-thumbnails", self.image(output)["src"])

    def test_outside_docs_symlink_and_output_symlink_are_rejected(self):
        outside = self.root / "outside.png"
        Image.new("RGB", (10, 10), "red").save(outside)
        (self.docs / "escape.png").symlink_to(outside)
        content = '<img class="archive-card__image" src="../../escape.png">'
        self.assertEqual(self.image(self.render(content))["src"], "../../escape.png")
        (self.site / "assets").symlink_to(self.root / "elsewhere")
        self.assertEqual(self.image(self.render())["src"], "../../source%20image.png")

    def test_portrait_fit_and_transparency(self):
        Image.new("RGBA", (1000, 2000), (255, 0, 0, 100)).save(self.original)
        attrs = self.image(self.render())
        self.assertEqual((attrs["width"], attrs["height"]), ("240", "480"))
        with Image.open(self.site / attrs["src"].removeprefix("../../")) as preview:
            self.assertIn("A", preview.getbands())

    def test_src_rewrite_does_not_modify_data_src(self):
        output = self.render(self.content.replace('src="../../source', 'data-src="author-value" src="../../source'))
        self.assertEqual(self.image(output)["data-src"], "author-value")
        self.assertIn("archive-thumbnails", self.image(output)["src"])


if __name__ == "__main__":
    unittest.main()
