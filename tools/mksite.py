#!/usr/bin/env python3
"""Собрать index.html для GitHub Pages из src/app.html.

Офлайн-файл возит внутри 254 подмножества шрифтов и html2canvas — суммарно
10,8 МБ base64. Для сайта это лишнее: браузер возьмёт то же самое с CDN и
закеширует. Скрипт вырезает встроенный блок @font-face вместе со ссылкой на
локальный html2canvas и подставляет внешние адреса.

    python3 tools/mksite.py src/app.html index.html
"""
import re
import sys

FONTS_CSS = (
    "https://fonts.googleapis.com/css2"
    "?family=Manrope:wght@400;500;600;700;800"
    "&family=Prata"
    "&family=Shippori+Mincho:wght@500;700"
    "&display=swap"
)
HTML2CANVAS = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"

# блок встроенных шрифтов начинается этим маркером и тянется до </style>,
# сразу за ним идёт <script src="<uuid>"> с html2canvas
FONT_BLOCK = re.compile(
    r'<style>/\* cyrillic-ext \*/.*?</style>\s*<script src="[0-9a-f-]{36}"></script>',
    re.S,
)

REPLACEMENT = (
    f'<link rel="stylesheet" href="{FONTS_CSS}">\n'
    f'<script src="{HTML2CANVAS}" defer></script>'
)

EXTRA_HEAD = """<meta name="description" content="Личный аниме тир-лист: ранжированный по силе впечатления.">
<meta name="theme-color" content="#07060e">
<meta property="og:type" content="website">
<meta property="og:title" content="Аниме · Тир-лист">
<meta property="og:description" content="Личный канон: тиры S · A · B · C, обложки, даты просмотра.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23120e24'/%3E%3Ctext x='32' y='45' font-family='Georgia,serif' font-size='38' fill='%23ff5c95' text-anchor='middle'%3ES%3C/text%3E%3C/svg%3E">
"""


def build(app_path: str, out_path: str) -> None:
    src = open(app_path, encoding="utf-8").read()

    out, n = FONT_BLOCK.subn(REPLACEMENT, src, count=1)
    if n != 1:
        raise SystemExit("не нашёл встроенный блок шрифтов — формат src/app.html изменился")

    # html2canvas грузится с defer, поэтому ждём его перед экспортом PNG:
    # проверка на undefined в приложении уже есть, дополнительных правок не нужно
    out = out.replace("<title>", EXTRA_HEAD + "<title>", 1)

    open(out_path, "w", encoding="utf-8").write(out)
    before, after = len(src.encode()), len(out.encode())
    print(f"{out_path}: {after/1024:.0f} КБ (исходник {before/1024:.0f} КБ)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    build(sys.argv[1], sys.argv[2])
