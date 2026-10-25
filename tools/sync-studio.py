#!/usr/bin/env python3
"""Synchronize Astral Studio sources into the main application before a normal build."""
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('astral_installer', ROOT/'addons/astral-studio/install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
app = ROOT/'src/app.html'
source = app.read_text(encoding='utf-8')
start = source.index(installer.START)
end = source.index('<!-- ASTRAL STUDIO END -->', start) + len('<!-- ASTRAL STUDIO END -->')
source = source[:start] + installer.snippet().rstrip('\n') + source[end:]
app.write_text(source, encoding='utf-8')
print('Astral Studio synchronized. Run the normal site and bundle builds next.')
