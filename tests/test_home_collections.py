"""The home index discovers new subjects without a hand-maintained catalog."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from hooks.archive import _note_collections, _collection_name

class CollectionsTest(unittest.TestCase):
    def test_unmapped_subject_and_redirect_handling(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            def file(path, text):
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(text, encoding='utf-8')
                return SimpleNamespace(src_uri=path, abs_src_path=str(target))
            files = [file('OsdNotes/Mechanical Engineering/Mechanisms.md', '# Mechanisms\n中文 English'),
                     file('OsdNotes/Mechanical Engineering/redirect.md', '---\narchive: false\n---\nredirect'),
                     file('OsdNotes/Mechanical Engineering/index.md', '# Index')]
            config = type('Config', (dict,), {})()
            config['docs_dir'] = str(root)
            config.config_file_path = str(root / 'mkdocs.yml')
            with patch('hooks.archive._git_dates', return_value=(None, None)):
                groups = _note_collections(config, files)
            self.assertEqual(list(groups), ['Mechanical Engineering'])
            self.assertEqual(len(groups['Mechanical Engineering']), 1)
            self.assertEqual(_collection_name('Mechanical Engineering'), 'Mechanical Engineering')

if __name__ == '__main__':
    unittest.main()
