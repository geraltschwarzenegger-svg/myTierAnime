import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const app=read('src/app.html'),web=read('index.html'),snapshot=JSON.parse(read('data.json'));
const block=/\/\* LOCAL COVER MANIFEST BEGIN \*\/\s*const LOCAL_COVERS = (.*?);\s*\/\* LOCAL COVER MANIFEST END \*\//s;
const covers=JSON.parse(app.match(block)[1]);
test('V5 embeds exactly the maintained Studio sources and gates the previous ambient renderer',()=>{
 assert.equal(app.match(/<script id="asStudioCode">\n([\s\S]*?)\n<\/script>/)[1],read('addons/astral-studio/studio.js'));
 assert.equal(app.match(/<style id="asStudioStyles">\n([\s\S]*?)\n<\/style>/)[1],read('addons/astral-studio/studio.css'));
 assert.equal(app.split('<!-- ASTRAL STUDIO BEGIN -->').length,2);
 assert.equal(app.split('if (window.AstralStudio?.ownsAmbient || document.hidden').length,2);
});
test('public artifacts agree on the V5 release, identity, description and favicon',()=>{
 assert.equal(web,read('site/public/index.html'));
 assert.equal((web.match(/name="description"/g)||[]).length,1);
 assert.equal((web.match(/rel="icon"/g)||[]).length,1);
 assert.ok(web.includes('<b>V5.0.0</b>'));assert.ok(web.includes('<title>ASTRAVA'));
});
test('each published anime has a documented local cover without rewriting its saved URL',()=>{
 const manifest=JSON.parse(read('assets/covers/library.json')).items;
 const items=snapshot.state.tiers.flatMap(t=>t.items);
 assert.equal(manifest.length,items.length);assert.equal(Object.keys(covers).length,items.length+manifest.reduce((n,e)=>n+(e.aliases?.length||0),0));
 for(const item of items){const entry=manifest.find(e=>e.uid===item.uid);assert.ok(entry);assert.equal(entry.originalUrl,item.cover);assert.equal(covers[item.cover],entry.file);for(const alias of entry.aliases||[])assert.equal(covers[alias],entry.file);assert.match(entry.sourceUrl,/^https:\/\//);assert.ok(entry.width>100&&entry.height>100);}
});
test('all local poster files and Worker copies are valid WebP files with documented byte sizes',()=>{
 for(const e of JSON.parse(read('assets/covers/library.json')).items){
  const file=readFileSync(new URL('../../'+e.file,import.meta.url));
  assert.equal(file.subarray(0,4).toString(),'RIFF');assert.equal(file.subarray(8,12).toString(),'WEBP');assert.equal(file.length,e.bytes);
  assert.deepEqual(file,readFileSync(new URL('../../site/public/'+e.file,import.meta.url)));
 }
});
test('standalone bundle embeds every published poster and keeps original collection snapshots equal',()=>{
 const lines=read('NEWAnime tier list11-08-2026.html').split('\n');
 const i=lines.findIndex(s=>s.includes('<script type="__bundler/template">'));
 const embedded=JSON.parse(lines[i+1]);const map=JSON.parse(embedded.match(block)[1]);
 assert.equal(embedded.match(/const HERO_BLOOM_ART="([^"]*)";/)[1],app.match(/const HERO_BLOOM_ART="([^"]*)";/)[1],'standalone artwork matches the main application');
 for(const [url,file] of Object.entries(covers)){assert.match(map[url],/^data:image\/webp;base64,/);assert.deepEqual(Buffer.from(map[url].split(',')[1],'base64'),readFileSync(new URL('../../'+file,import.meta.url)));}
 assert.equal(read('data.json'),read('anime-tierlist-2026-10-11.json'));
});
test('cover resolver rejects prototype names and unsafe links while preserving custom HTTPS images',async()=>{
 const {runInNewContext}=await import('node:vm');
 const context={URL,LOCAL_COVERS:covers,MOON_COVER_URL:'moon-current',MOON_COVER_LEGACY_URL:'moon-old',MOON_COVER_ART:'moon-art',catalogCover:()=>''};
 const safe=app.match(/function safeImageUrl\(value\) \{[\s\S]*?\n\}/)[0];
 const cover=app.match(/function itemCover\(item\) \{[\s\S]*?\n\}/)[0];
 runInNewContext(safe+'\n'+cover+'\nthis.resolveCover=itemCover;',context);
 for(const url of ['__proto__','constructor','javascript:alert(1)','http://example.org/a.jpg','https://user:password@example.org/a.jpg'])assert.equal(context.resolveCover({cover:url}),'');
 assert.equal(context.resolveCover({cover:'https://example.org/custom.webp'}),'https://example.org/custom.webp');
 const [url,file]=Object.entries(covers)[0];assert.equal(context.resolveCover({cover:url}),file);assert.equal(context.resolveCover({noCover:true}),'');
});
