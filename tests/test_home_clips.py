"""Published quilt assets and parser-time media safety."""
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class QuiltParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_quilt = False
        self.clips = []
        self.videos = []
        self.posters = []
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'section' and 'data-home-clips' in attrs:
            self.in_quilt = True
        if not self.in_quilt:
            return
        if tag == 'figure' and 'data-home-clip' in attrs:
            self.clips.append(attrs)
        if tag == 'video':
            self.videos.append(attrs)
        if tag == 'img':
            self.images.append(attrs)
        if tag == 'img' and 'home-clip__poster' in attrs.get('class', '').split():
            self.posters.append(attrs)

    def handle_endtag(self, tag):
        if tag == 'section' and self.in_quilt:
            self.in_quilt = False


class QuiltMarkupTests(unittest.TestCase):
    def test_selected_clips_are_local_and_not_preloaded(self):
        parser = QuiltParser()
        parser.feed((ROOT / 'docs/index.md').read_text())
        names = ('z-workspace', 'orientation', 'lower', 'board')
        self.assertEqual([f'assets/media/home-clip-{name}.mp4' for name in names],
                         [item.get('data-src') for item in parser.clips])
        self.assertEqual(4, len(parser.videos))
        self.assertEqual(4, len(parser.posters))
        self.assertEqual(8, len(parser.images))
        self.assertTrue(all('off-glb' in image.get('class', '').split() for image in parser.images))
        for clip, video, poster in zip(parser.clips, parser.videos, parser.posters):
            self.assertNotIn('src', video)
            self.assertEqual('none', video.get('preload'))
            self.assertTrue({'muted', 'loop', 'playsinline'} <= video.keys())
            self.assertEqual('640', poster.get('width'))
            self.assertEqual('800', poster.get('height'))
            self.assertTrue((ROOT / 'docs' / clip['data-src']).is_file())
            self.assertTrue((ROOT / 'docs' / poster['src']).is_file())


if __name__ == '__main__':
    unittest.main()
