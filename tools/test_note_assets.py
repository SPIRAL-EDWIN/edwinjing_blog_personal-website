"""Contracts for build-time note image loading, geometry, and preservation."""

import importlib.util
import struct
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).parents[1]
SPEC = importlib.util.spec_from_file_location("note_assets_hook", ROOT / "hooks/note_assets.py")
HOOK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOOK)


class NoteAssetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.docs = Path(self.temp.name)
        self.images = self.docs / "OsdNotes/CS101/images"
        self.images.mkdir(parents=True)
        self.png = self.images / "image sample.png"
        self.png.write_bytes(b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", 640, 480))
        self.page = SimpleNamespace(url="OsdNotes/CS101/Python/", file=SimpleNamespace(src_uri="OsdNotes/CS101/Python.md"))
        self.config = {"docs_dir": str(self.docs), "site_url": "https://example.com/"}

    def render(self, content, files=()):
        return HOOK.on_page_content(content, self.page, self.config, files)

    def test_adds_native_loading_and_geometry_preserving_lightbox_markup(self):
        content = '<p><a class="glightbox" href="../images/image%20sample.png"><img alt="A &amp; B" src="../images/image%20sample.png"></a></p>'
        output = self.render(content)
        self.assertEqual(output, content.replace('src="../images/image%20sample.png">', 'src="../images/image%20sample.png" loading="lazy" decoding="async" width="640" height="480">'))
        self.assertEqual(self.render(output), output)

    def test_explicit_attributes_and_dimension_intent_are_preserved(self):
        for attribute in ('width="100"', 'height="75"', 'style="width: 50%"', 'srcset="other.png 2x"'):
            with self.subTest(attribute=attribute):
                content = f'<img src="../images/image%20sample.png" {attribute} loading="eager" decoding="sync">'
                self.assertEqual(self.render(content), content)

    def test_parser_ignores_comments_code_and_script_preserves_case_and_multiline(self):
        untouched = '<!-- <img src="x"> --><script>var s = "<img src=x>";</script><code>&lt;img src=x&gt;</code>'
        content = untouched + '\n<IMG\n SRC="../images/image%20sample.png" />'
        output = self.render(content)
        self.assertTrue(output.startswith(untouched))
        self.assertIn('<IMG\n SRC="../images/image%20sample.png" loading="lazy" decoding="async" width="640" height="480" />', output)

    def test_hubs_and_non_notes_are_untouched(self):
        for source in ("OsdNotes/index.md", "OsdNotes/CS101/index.md", "index.md", "HOME/friends.md", "经验分享/article.md"):
            with self.subTest(source=source):
                self.page.file.src_uri = source
                self.assertEqual(self.render('<img src="x">'), '<img src="x">')

    def test_ui_images_are_not_modified(self):
        for content in ('<img class="profile-avatar" src="x">', '<img src="/assets/images/avatar.svg">', '<img class="emoji" src="x">'):
            self.assertEqual(self.render(content), content)

    def test_remote_missing_and_data_images_do_not_get_guessed_dimensions(self):
        for src in ("https://remote.example/image.png", "missing.png", "data:image/png;base64,AA", "../images/a.webp", "../images/a.svg"):
            with self.subTest(src=src):
                output = self.render(f'<img src="{src}">')
                self.assertIn('loading="lazy" decoding="async"', output)
                self.assertNotIn('width=', output)

    def test_absolute_same_origin_and_encoded_paths_resolve(self):
        for src in ("https://example.com/OsdNotes/CS101/images/image%20sample.png?v=1", "/OsdNotes/CS101/images/image%20sample.png"):
            with self.subTest(src=src):
                self.assertIn('width="640" height="480"', self.render(f'<img src="{src}">'))

    def test_site_subpath_and_output_asset_mapping(self):
        self.config["site_url"] = "https://example.com/project/"
        output = self.render('<img src="https://example.com/project/OsdNotes/CS101/images/image%20sample.png">')
        self.assertIn('width="640" height="480"', output)
        files = [SimpleNamespace(dest_uri="mapped.png", abs_src_path=str(self.png))]
        self.assertIn('width="640" height="480"', self.render('<img src="/mapped.png">', files))

    def test_gif_and_progressive_jpeg_headers(self):
        for name, data in (
            ("a.gif", b"GIF89a" + struct.pack("<HH", 320, 240)),
            ("a.jpg", b"\xff\xd8\xff\xe0" + struct.pack(">H", 4) + b"xx" + b"\xff\xc2" + struct.pack(">HBHH", 8, 8, 240, 320)),
        ):
            with self.subTest(name=name):
                (self.images / name).write_bytes(data)
                self.assertIn('width="320" height="240"', self.render(f'<img src="../images/{name}">'))

    def test_truncated_and_invalid_images_are_safe(self):
        for index, data in enumerate((b"\xff\xd8\xff\xc0\x00", b"GIF89a", b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff\xe0\x00\x01")):
            name = f"invalid{index}.png"
            (self.images / name).write_bytes(data)
            output = self.render(f'<img src="../images/{name}">')
            self.assertNotIn('width=', output)

    def test_symlink_outside_docs_cannot_supply_geometry(self):
        with tempfile.TemporaryDirectory() as other:
            path = Path(other) / "outside.png"
            path.write_bytes(self.png.read_bytes())
            (self.images / "outside.png").symlink_to(path)
            self.assertNotIn('width=', self.render('<img src="../images/outside.png">'))


if __name__ == "__main__":
    unittest.main()
