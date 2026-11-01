"""Homepage generated links expose separated, descriptive accessible names."""
import tempfile
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from hooks.archive import _render_home_collections, _render_home_updates

class HomeAccessibleNamesTest(unittest.TestCase):
    def test_collection_name(self):
        note = SimpleNamespace()
        page = SimpleNamespace(file=SimpleNamespace(url=''))
        target = SimpleNamespace(src_uri='collections/CS101/index.md', url='collections/CS101/')
        with patch('hooks.archive._note_collections', return_value={'CS101': [(note, 'Python', date(2026, 9, 2))]}), patch('hooks.archive._relative_url', return_value='collections/CS101/'):
            result = _render_home_collections({}, [target], page)
        self.assertIn('aria-label="Computer Science, 1 note, updated 09/2026"', result)

    def test_update_name_and_escaping(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'data/homepage').mkdir(parents=True)
            (root / 'data/homepage/blog-titles.yml').write_text('{}', encoding='utf-8')
            (root / 'docs').mkdir()
            (root / 'docs/note.md').write_text('# A & B', encoding='utf-8')
            config = type('Config', (dict,), {})({'docs_dir': str(root / 'docs')})
            config.config_file_path = str(root / 'mkdocs.yml')
            entry = SimpleNamespace(src_uri='note.md', title='A & B', page_url='note/', activity_date=date(2026, 9, 2))
            result = _render_home_updates([entry], config)
            self.assertIn('aria-label="A &amp; B, updated 09/2026"', result)

if __name__ == '__main__':
    unittest.main()
