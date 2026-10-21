"""Check the real lightbox/parser pair preserves authored image elements."""

import unittest
from html.parser import HTMLParser

from mkdocs_glightbox.plugin import LightboxPlugin


class Images(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.images = []
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            self.images.append(dict(attrs))


class LightboxCompatibilityTests(unittest.TestCase):
    def test_avatar_and_article_images_survive_lightbox_wrapping(self):
        plugin = LightboxPlugin()
        plugin.load_config({})
        plugin.using_material_privacy = False
        markup = (
            '<div class="profile-avatar"><img src="./assets/images/avatar-edwin-notionists.svg" '
            'alt="Chen Jing (经宸)" loading="eager" fetchpriority="high"></div>'
            '<p><img src="article.png" alt="Article figure"></p>'
            '<img class="off-glb" src="thumbnail.webp" alt="Static thumbnail">'
        )
        output = plugin.wrap_img_with_anchor_selectolax(
            markup, plugin.config, {}, ["off-glb"]
        )
        self.assertEqual(Images(output).images, Images(markup).images)
        self.assertEqual(output.count('class="glightbox"'), 2)


if __name__ == "__main__":
    unittest.main()
