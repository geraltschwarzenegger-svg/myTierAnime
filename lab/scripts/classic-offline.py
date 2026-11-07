from pathlib import Path
import json,base64,re
r=Path(__file__).resolve().parent.parent
source=Path('/workspace/myTierAnime/NEWAnime tier list11-08-2026.html')
lines=source.read_text().split('\n');i=next(i+1 for i,l in enumerate(lines) if '<script type="__bundler/template">' in l)
inner=json.loads(lines[i]);assert 'const isFileUrl = () => location.protocol === "file:";' in inner;inner=inner.replace('const isFileUrl = () => location.protocol === "file:";','const isFileUrl = () => true;',1);inner=inner.replace('assets/astrava-mark.svg','data:image/svg+xml;base64,'+base64.b64encode((r/'public/mark.svg').read_bytes()).decode());inner=re.sub(r'<link rel="preconnect"[^>]*>','',inner);classic=(r/'public/classic/index.html').read_text();guard=classic.split('<script>',1)[1].split('</script>',1)[0]
inner=inner.replace('<head>','<head>\n<script>'+guard+'</script>',1)
inner=inner.replace('</body>','<a href="./ASTRAVA-Lab.html" style="position:fixed;bottom:12px;left:12px;z-index:2147483647;background:#e8d0a5;color:#101827;padding:10px 16px;border-radius:10px;font:600 13px sans-serif;text-decoration:none">ASTRAVA Lab · тестовая копия</a></body>',1)
lines[i]=json.dumps(inner,ensure_ascii=False).replace('</','<\\u002F')
(r/'downloads/offline/ASTRAVA-V5-test.html').write_text('\n'.join(lines))
print('Prepared isolated self-contained V5 compatibility HTML.')
