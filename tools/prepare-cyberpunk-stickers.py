#!/usr/bin/env python3
"""Slice the owner's original sticker sheets without redrawing their artwork.

Optional asset preparation only: requires Pillow. Regular site builds do not.
Black connected to the outside is removed; enclosed black details are retained.
"""
from collections import Counter, deque
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CELL, COLS, ROWS = 256, 8, 4
ROMAN = [
    ('think', 'Наблюдаю'), ('fire', 'Снимаю'), ('laugh', 'Класс!'), ('cozy', 'Без слов'), ('star', 'Красиво…'),
    ('shock', 'Удивлён'), ('heart', 'Спасибо!'), ('think', 'Думаю'), ('angry', 'Не в настроении'), ('star', 'Найт-Сити'),
    ('bolt', 'Круто'), ('think', 'Есть вопрос'), ('star', 'Взгляд'), ('sleep', 'Сплю'), ('fire', 'Камера готова'),
    ('heart', 'Люблю'), ('goldheart', 'Всё будет хорошо'), ('angry', 'Ну серьёзно…'), ('cozy', 'На своей волне'), ('shock', 'А!'),
    ('sleep', 'Я устал'), ('bolt', 'Готово!'), ('cry', 'Это настоящее…'), ('cry', 'Грустно'), ('laugh', 'Пока!'),
    ('cozy', 'Слушаю'), ('heart', 'Ты особенный'), ('fire', 'Камера — моя свобода'), ('goldheart', 'Мечта'), ('star', 'Продолжай снимать'),
]
TALIA = [
    ('heart', 'Нравится'), ('heart', 'Талия'), ('think', 'Серьёзно'), ('bolt', 'Глитч'), ('heart', 'Сердце'),
    ('sleep', 'Устала…'), ('cozy', 'Обнимашки'), ('laugh', 'Ха-ха'), ('star', 'Взгляд сбоку'), ('think', 'Без слов'),
    ('angry', 'Злюсь'), ('angry', 'Не моя проблема'), ('goldheart', 'Ты важен'), ('shock', 'Что?..'), ('bolt', 'Сбой сигнала'),
    ('think', 'Молчание'), ('fire', 'Включаюсь'), ('cozy', 'Задумалась'), ('heart', 'Иди сюда'), ('shock', 'Снова кровь?'),
    ('cozy', 'Хорошо'), ('sleep', 'Сладкий сон'), ('laugh', 'Смеюсь'), ('goldheart', 'Ты доверяешь мне?'), ('cry', 'Тихо грущу'),
    ('cry', 'Скрываю слёзы'), ('bolt', 'Цифровая буря'), ('star', 'Ночная королева'), ('fire', 'Магнитный взгляд'), ('sleep', 'Пора спать'), ('heart', 'Ром'),
]


def rectangles(name):
    if name == 'roman':
        ys = [0, 220, 408, 603, 774, 917, 1080]
        edges = [[0, 189, 399, 620, 833, 1080], [0, 202, 411, 625, 837, 1080],
                 [0, 216, 418, 620, 842, 1080], [0, 205, 420, 629, 842, 1080],
                 [0, 211, 426, 636, 847, 1080], [0, 210, 420, 633, 842, 1080]]
        rects = [(xs[c], ys[r], xs[c+1], ys[r+1]) for r, xs in enumerate(edges) for c in range(5)]
        rects[18] = (640, 603, 842, 774)
        rects[21] = (211, 782, 426, 917)
        rects[24] = (847, 774, 1080, 911)
        rects[29] = (842, 913, 1080, 1080)
        return rects
    ys = [0, 216, 393, 576, 739, 902, 1052]
    edges = [[0, 212, 418, 624, 848, 1080], [0, 214, 423, 634, 836, 1080],
             [0, 207, 418, 628, 843, 1080], [0, 208, 421, 628, 841, 1080],
             [0, 210, 416, 626, 843, 1080], [0, 178, 350, 522, 704, 865, 1080]]
    rects = [(xs[c], ys[r], xs[c+1], ys[r+1]) for r, xs in enumerate(edges) for c in range(len(xs)-1)]
    # The full-body sticker reaches lower than the other portraits in its row.
    rects[4] = (848, 0, 1080, 240)
    rects[5] = (0, 216, 236, 393)
    rects[9] = (836, 240, 1080, 393)
    return rects


def outside_matte(image):
    image = image.convert('RGBA')
    width, height = image.size
    pixels = image.load()
    # Work on the full original, before cutting cells: intact die-cut outlines
    # keep enclosed black clothing and speech bubbles out of the exterior fill.
    mask = Image.new('L', image.size)
    data = image.get_flattened_data() if hasattr(image, 'get_flattened_data') else image.getdata()
    mask.putdata([255 if max(rgb[:3]) > 38 else 0 for rgb in data])
    protected = mask.load()
    seen = bytearray(width * height)
    queue = deque()

    def visit(x, y):
        pos = y * width + x
        if seen[pos] or protected[x, y]:
            return
        seen[pos] = 1
        queue.append((x, y))

    for x in range(width):
        visit(x, 0)
        visit(x, height-1)
    for y in range(height):
        visit(0, y)
        visit(width-1, y)
    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
            if 0 <= nx < width and 0 <= ny < height:
                visit(nx, ny)
    return image


def discard_neighbour_edges(image, core):
    """Discard small components cut from the adjacent cell, retaining captions."""
    width, height = image.size
    alpha = image.getchannel('A').load()
    seen, components = set(), []
    for y in range(height):
        for x in range(width):
            if (x, y) in seen or not alpha[x, y]:
                continue
            queue, points, edge = deque([(x, y)]), [], False
            seen.add((x, y))
            while queue:
                px, py = queue.popleft()
                points.append((px, py))
                edge |= px == 0 or py == 0 or px == width-1 or py == height-1
                for nx, ny in ((px-1, py), (px+1, py), (px, py-1), (px, py+1)):
                    if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen and alpha[nx, ny]:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            components.append((points, edge))
    largest = max(len(c[0]) for c in components)
    pixels = image.load()
    for points, edge in components:
        inside = sum(core[0] <= x < core[2] and core[1] <= y < core[3] for x,y in points)
        xs, ys = zip(*points)
        w, h = max(xs)-min(xs)+1, max(ys)-min(ys)+1
        sliver = max(w,h) > min(w,h)*5 and min(w,h) < 24 and len(points) < largest*.05
        if ((edge or inside < len(points)*.5) and len(points) < largest*.22) or sliver:
            for x, y in points:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def main():
    packs, sources = [], []
    preview_dir = ROOT.parent / 'scratch/v513-sticker-review'
    preview_dir.mkdir(parents=True, exist_ok=True)
    for name, sheet, captions in [('roman', 8, ROMAN), ('talia', 9, TALIA)]:
        original = ROOT / f'src/art/reactions/{name}-original.png'
        rects = rectangles(name)
        assert len(rects) == len(captions)
        atlas = Image.new('RGBA', (COLS*CELL, ROWS*CELL))
        transparent = outside_matte(Image.open(original))
        counts = Counter()
        keys = []
        for index, (rect, (mood, _)) in enumerate(zip(rects, captions)):
            # A little overlap protects the original outlines at uneven seams;
            # neighbour fragments touching the crop edge are discarded separately.
            x0, y0, x1, y1 = rect
            expanded = (max(0,x0-12), max(0,y0-12), min(1080,x1+12), min(1080,y1+12))
            if name == 'roman':
                if index in (16, 24):
                    expanded = (expanded[0], expanded[1], expanded[2], y1)
                if index in (21, 29):
                    expanded = (expanded[0], y0, expanded[2], expanded[3])
                if index == 18:
                    expanded = (x0, expanded[1], expanded[2], expanded[3])
            core = (x0-expanded[0], y0-expanded[1], x1-expanded[0], y1-expanded[1])
            crop = discard_neighbour_edges(transparent.crop(expanded), core)
            box = crop.getbbox()
            if not box:
                raise ValueError(f'Empty sticker: {name} {index}')
            crop = crop.crop(box)
            scale = min((CELL-24)/crop.width, (CELL-24)/crop.height)
            crop = crop.resize((round(crop.width*scale),round(crop.height*scale)), Image.Resampling.LANCZOS)
            x = (index % COLS)*CELL + (CELL-crop.width)//2
            y = (index // COLS)*CELL + (CELL-crop.height)//2
            atlas.alpha_composite(crop, (x, y))
            counts[mood] += 1
            keys.append(mood if counts[mood] == 1 else f'{mood}-{counts[mood]}')
        output = ROOT / f'assets/reactions/cyber-{name}.webp'
        atlas.save(output, quality=93, method=6, exact=True)
        preview = Image.new('RGBA', atlas.size, '#b6c9d8')
        preview.alpha_composite(atlas)
        preview.convert('RGB').resize((1024, 512)).save(preview_dir / f'{name}-contact.png')
        character = 'Роман' if name == 'roman' else 'Талия'
        packs.append({'id':f'cyber-{name}', 'title':f'Киберпанк · {character}', 'uid':72,
                      'sheet':sheet, 'cols':COLS, 'rows':ROWS,
                      'characters':[character]*len(captions), 'moods':[c[0] for c in captions],
                      'keys':keys, 'labels':[c[1] for c in captions]})
        sources.append({'pack':f'cyber-{name}', 'originalPath':str(original.relative_to(ROOT)),
                        'originalSha256':hashlib.sha256(original.read_bytes()).hexdigest(),
                        'path':str(output.relative_to(ROOT)), 'width':atlas.width, 'height':atlas.height,
                        'count':len(captions), 'bytes':output.stat().st_size,
                        'sha256':hashlib.sha256(output.read_bytes()).hexdigest(), 'rectangles':rects})
    (ROOT / 'assets/reactions/cyberpunk-sources.json').write_text(json.dumps({
        'source':'Original finished sticker sheets supplied by the owner in зим.7z',
        'processing':'Manual cell boundaries; only exterior connected dark matte removed; originals preserved. No generative redraw.',
        'encoding':{'format':'WebP','quality':93,'cell':CELL,'cols':COLS,'rows':ROWS},
        'items':sources}, ensure_ascii=False, indent=2)+'\n')
    (ROOT.parent / 'scratch/v513-new-packs.json').write_text(json.dumps(packs, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'stickers':sum(len(p['moods']) for p in packs),'packs':len(packs),'bytes':sum(s['bytes'] for s in sources)}))


if __name__ == '__main__':
    main()
