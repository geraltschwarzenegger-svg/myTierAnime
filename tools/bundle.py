#!/usr/bin/env python3
"""Распаковка / сборка одностраничного бандла тир-листа.

Anime tier list*.html — это обёртка-бандлер: настоящее приложение лежит внутри
как JSON-строка в <script type="__bundler/template">, а шрифты — base64 в
<script type="__bundler/manifest">. Править приложение руками в такой строке
невозможно, поэтому:

    python3 tools/bundle.py unpack "Anime tier list26.07.2026.html" app.html
    ... правим app.html ...
    python3 tools/bundle.py pack   "Anime tier list26.07.2026.html" app.html

pack переписывает только строку с шаблоном, манифест шрифтов остаётся байт-в-байт.
"""
import json
import sys
import base64
import re
from pathlib import Path

TEMPLATE_TAG = '<script type="__bundler/template">'


def find_template_line(lines):
    for i, line in enumerate(lines):
        if TEMPLATE_TAG in line:
            return i + 1          # сама JSON-строка — на следующей строке
    raise SystemExit("не нашёл <script type=\"__bundler/template\">")


def unpack(bundle_path, out_path):
    lines = open(bundle_path, encoding="utf-8").read().split("\n")
    inner = json.loads(lines[find_template_line(lines)])
    open(out_path, "w", encoding="utf-8").write(inner)
    print(f"{out_path}: {len(inner)} символов")


def pack(bundle_path, app_path):
    lines = open(bundle_path, encoding="utf-8").read().split("\n")
    idx = find_template_line(lines)
    inner = open(app_path, encoding="utf-8").read()
    # Published covers travel inside the standalone file. Original collection
    # URLs remain untouched, so JSON exports and personal collections stay portable.
    cover_block = re.compile(r'(/\* LOCAL COVER MANIFEST BEGIN \*/\s*const LOCAL_COVERS = )(.*?)(;\s*/\* LOCAL COVER MANIFEST END \*/)', re.S)
    def embed_covers(match):
        covers = json.loads(match[2])
        root = Path(__file__).resolve().parent.parent
        library = (root / 'assets/covers/library').resolve()
        embedded = {}
        for url, name in covers.items():
            file = (root / name).resolve()
            if file.parent != library or file.suffix != '.webp':
                raise ValueError('Unexpected local cover path')
            embedded[url] = 'data:image/webp;base64,' + base64.b64encode(file.read_bytes()).decode()
        return match[1] + json.dumps(embedded, ensure_ascii=False, separators=(',', ':')) + match[3]
    inner = cover_block.sub(embed_covers, inner)
    encoded = json.dumps(inner, ensure_ascii=False)
    # экранируем косую черту в закрывающих тегах: иначе </script> внутри строки
    # закрыл бы сам <script type="__bundler/template">
    encoded = encoded.replace("</", "<\\u002F")
    lines[idx] = encoded
    open(bundle_path, "w", encoding="utf-8").write("\n".join(lines))
    print(f"{bundle_path}: шаблон обновлён ({len(inner)} символов)")


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("unpack", "pack"):
        raise SystemExit(__doc__)
    (unpack if sys.argv[1] == "unpack" else pack)(sys.argv[2], sys.argv[3])
