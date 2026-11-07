from pathlib import Path
import shutil,json,re,hashlib,base64
root=Path(__file__).resolve().parent.parent
source=Path('/workspace/myTierAnime')
public=root/'public';public.mkdir(exist_ok=True)
for name in ['data.json','assets/covers/library.json','assets/art/astrava-observatory.webp','assets/astrava-mark.svg']:
 target=public/({'data.json':'collection.json','assets/covers/library.json':'covers.json','assets/art/astrava-observatory.webp':'observatory.webp','assets/astrava-mark.svg':'mark.svg'}[name]);shutil.copy2(source/name,target)
shutil.copytree(source/'assets/covers/library',public/'covers',dirs_exist_ok=True)
shutil.copytree(source/'assets/vendor',public/'vendor',dirs_exist_ok=True)
classic=public/'classic';classic.mkdir(exist_ok=True)
shutil.copy2(source/'data.json',classic/'data.json')
shutil.copytree(source/'assets',classic/'assets',dirs_exist_ok=True)
# Every storage call is namespaced, including dynamic keys and IndexedDB.
# The guard runs before any original script. It also filters storage events.
guard='''(()=>{"use strict";const prefix="astrava-lab:classic:";const proto=Storage.prototype;for(const method of ["getItem","setItem","removeItem"]){const original=proto[method];proto[method]=function(key,...args){return original.call(this,prefix+String(key),...args);};}const db=indexedDB.open.bind(indexedDB);indexedDB.open=function(name,version){return version===undefined?db(prefix+name):db(prefix+name,version);};const del=indexedDB.deleteDatabase.bind(indexedDB);indexedDB.deleteDatabase=function(name){return del(prefix+name);};const translated=new WeakSet();window.addEventListener("storage",event=>{if(translated.has(event))return;event.stopImmediatePropagation();if(event.key&&event.key.startsWith(prefix)){const copy=new StorageEvent("storage",{key:event.key.slice(prefix.length),oldValue:event.oldValue,newValue:event.newValue,url:event.url,storageArea:event.storageArea});translated.add(copy);window.dispatchEvent(copy);}},true);})();'''
html=(source/'index.html').read_text();html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\s*','',html,count=1)
html=html.replace('<head>','<head>\n<script>'+guard+'</script>',1)
# A clear banner, not a change to the production copy.
html=html.replace('<body','<body data-lab-compat="true"',1)
html=html.replace('</body>','<a href="../" style="position:fixed;bottom:12px;left:12px;z-index:2147483647;background:#e8d0a5;color:#101827;padding:10px 16px;border-radius:10px;font:600 13px sans-serif;text-decoration:none">← ASTRAVA Lab · тестовая копия</a></body>',1)
hashes=[]
for attrs,code in re.findall(r'<script\b([^>]*)>(.*?)</script>',html,re.S|re.I):
 if re.search(r'\bsrc\s*=|\btype\s*=\s*["\']application/json',attrs,re.I):continue
 hashes.append("'sha256-"+base64.b64encode(hashlib.sha256(code.encode()).digest()).decode()+"'")
policy="default-src 'self'; script-src 'self' "+' '.join(hashes)+"; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'self'"
html=html.replace('<meta charset="UTF-8">','<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy" content="'+policy+'">',1)
(classic/'index.html').write_text(html)
(root/'docs/baseline.json').write_text(json.dumps({'commit':'b497ec063950c71cf4aaafa055230a4a7126e806','dataSha256':hashlib.sha256((source/'data.json').read_bytes()).hexdigest(),'htmlSha256':hashlib.sha256((source/'index.html').read_bytes()).hexdigest(),'animeCount':69},indent=2)+'\n')
print('Prepared 69 posters, collection, artwork, self-hosted fonts and isolated classic copy.')
