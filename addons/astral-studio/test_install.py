"""Integration safeguards for inserting code into a protected/offline HTML file."""
import base64
import hashlib
import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('astral_installer', Path(__file__).with_name('install.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
APP = '''<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-old'; object-src 'none'; base-uri 'none'"></head><body><script>
/* ABSTRACT AMBIENT CANVAS: test fixture */
if (document.hidden || document.querySelector("dialog[open]")) return;
</script></body></html>'''


class InstallerTest(unittest.TestCase):
    def test_policy_hashes_actual_scripts_without_weakening_directives(self):
        html = installer.build(APP)
        policy = re.search(r'Content-Security-Policy" content="([^"]+)', html)[1]
        for _, code in re.findall(r'<script\b([^>]*)>(.*?)</script>', html, re.S):
            digest = base64.b64encode(hashlib.sha256(code.encode()).digest()).decode()
            self.assertIn("'sha256-" + digest + "'", policy)
        self.assertNotIn('sha256-old', policy)
        self.assertNotIn('unsafe-inline', policy)
        self.assertIn("object-src 'none'", policy)
        self.assertIn("base-uri 'none'", policy)

    def test_only_old_ambient_loop_is_gated(self):
        html = installer.build(APP)
        self.assertEqual(html.count('window.AstralStudio?.ownsAmbient'), 1)
        self.assertIn('asNativeAmbientGate', html)

    def test_duplicate_insertion_fails(self):
        with self.assertRaises(ValueError):
            installer.build(installer.build(APP))

    def test_unknown_app_fails_instead_of_partial_installation(self):
        with self.assertRaises(ValueError):
            installer.build('<html><body></body></html>')

    def test_source_and_bundle_manifest_are_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, out = Path(tmp)/'source.html', Path(tmp)/'output.html'
            lines = ['<html>', '<script type="__bundler/manifest">', '{"fonts":"unchanged"}', '</script>', '<script type="__bundler/template">', json.dumps(APP), '</script></html>']
            text = '\n'.join(lines)
            source.write_text(text)
            installer.install(source, out)
            self.assertEqual(source.read_text(), text)
            after = out.read_text().split('\n')
            self.assertEqual(after[:5], lines[:5])
            inner = json.loads(after[5])
            self.assertIn(installer.START, inner)
            self.assertIn('<\\u002Fscript>', after[5])

    def test_same_input_and_output_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)/'app.html'
            source.write_text(APP)
            with self.assertRaises(ValueError):
                installer.install(source, source)
            self.assertEqual(source.read_text(), APP)


if __name__ == '__main__':
    unittest.main()
