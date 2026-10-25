#!/usr/bin/env python3
"""Build a separate HTML copy with Astral Studio; never overwrite the input.

python3 addons/astral-studio/install.py index.html --output /tmp/astral-preview.html
Also accepts the project's single-file offline bundle.
"""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
START = '<!-- ASTRAL STUDIO BEGIN -->'


def snippet():
    css = (HERE / 'studio.css').read_text(encoding='utf-8')
    js = (HERE / 'studio.js').read_text(encoding='utf-8')
    return (START + '\n<template id="asNativeAmbientGate"></template>\n'
            '<style id="asStudioStyles">\n' + css + '\n</style>\n'
            '<script id="asStudioCode">\n' + js + '\n</script>\n'
            '<!-- ASTRAL STUDIO END -->\n')


def build(app):
    if START in app:
        raise ValueError('Astral Studio уже установлена. Используй исходный HTML.')
    marker = 'ABSTRACT AMBIENT CANVAS:'
    if app.count(marker) != 1:
        raise ValueError('Не найден известный цикл частиц myTierAnime 4.2. Файл не изменён.')
    pos = app.index(marker)
    end = app.index('</script>', pos)
    block = app[pos:end]
    old = 'if (document.hidden || document.querySelector("dialog[open]")) return;'
    if block.count(old) != 1:
        raise ValueError('Формат цикла частиц изменён. Нужна проверка совместимости.')
    block = block.replace(old, 'if (window.AstralStudio?.ownsAmbient || document.hidden || document.querySelector("dialog[open]")) return;', 1)
    app = app[:pos] + block + app[end:]
    if not re.search(r'</body>', app, re.I):
        raise ValueError('Нет закрывающего тега body.')
    app = re.sub(r'</body>', lambda _: snippet() + '</body>', app, count=1, flags=re.I)

    # Preserve every directive. Only regenerate the inline script hash allowlist.
    hashes = []
    for attrs, code in re.findall(r'<script\b([^>]*)>(.*?)</script>', app, re.S | re.I):
        if re.search(r'\bsrc\s*=|\btype\s*=\s*["\'](?:application/json|__bundler/)', attrs, re.I):
            continue
        hashes.append("'sha256-" + base64.b64encode(hashlib.sha256(code.encode()).digest()).decode() + "'")
    csp = re.compile(r'(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(">)', re.I)
    def replace_policy(match):
        policy, n = re.subn(r'(?<![\w-])script-src\s+[^;]*', "script-src 'self' " + ' '.join(hashes), match[2], count=1)
        if n != 1:
            raise ValueError('CSP без script-src: нужна ручная проверка, политика не ослаблена.')
        return match[1] + policy + match[3]
    app = csp.sub(replace_policy, app)
    return app


def install(source, output):
    if source.resolve() == output.resolve():
        raise ValueError('Выходной файл должен отличаться от исходного.')
    text = source.read_text(encoding='utf-8')
    template = '<script type="__bundler/template">'
    if template in text:
        lines = text.split('\n')
        index = next(i + 1 for i, line in enumerate(lines) if template in line)
        app = json.loads(lines[index])
        lines[index] = json.dumps(build(app), ensure_ascii=False).replace('</', '<\\u002F')
        result = '\n'.join(lines)
    else:
        result = build(text)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(result, encoding='utf-8')
    insert = output.parent / 'astral-studio-insert.html'
    insert.write_text(snippet(), encoding='utf-8')
    return output, insert


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        out, insert = install(args.source, args.output)
    except (ValueError, OSError, StopIteration, json.JSONDecodeError) as error:
        parser.exit(1, str(error) + '\n')
    print(f'Готовая копия: {out}\nВставка: {insert}\nИсходный сайт и коллекция не изменены.')


if __name__ == '__main__':
    main()
