import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=name=>readFileSync(new URL('../../'+name,import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('Cyberpunk originals, transparent atlases and website copies agree with their provenance',()=>{
 const source=read('src/app.html').toString(),web=read('index.html').toString();
 const manifest=JSON.parse(read('assets/reactions/cyberpunk-sources.json'));
 assert.deepEqual(manifest.items.map(e=>e.count),[30,31]);
 for(const [index,entry] of manifest.items.entries()){
  const bytes=read(entry.path);
  assert.equal(hash(bytes),entry.sha256);
  assert.equal(hash(read(entry.originalPath)),entry.originalSha256);
  assert.equal(bytes.length,entry.bytes);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.ok(bytes.includes(Buffer.from('ALPH')),'atlas carries transparency');
  assert.deepEqual([entry.width,entry.height],[2048,1024]);
  assert.equal(entry.rectangles.length,entry.count);
  const embedded=source.match(new RegExp('\\.cat-sticker\\.sheet-'+(index+8)+' \\{ background-image:url\\("data:image/webp;base64,([^"\\n]+)"\\)'));
  assert.deepEqual(Buffer.from(embedded[1],'base64'),bytes);
  assert.ok(web.includes('url("'+entry.path+'")'));
  assert.deepEqual(read('site/public/'+entry.path),bytes);
 }
 const album=JSON.parse(read('assets/album/replacements.json')).items.find(e=>e.index===15);
 assert.equal(album.title,'Киберпанк: Бегущие по краю');
 assert.equal(hash(read(album.file)),album.sha256);
 assert.equal(hash(read(album.originalPath)),album.originalSha256);
 assert.deepEqual(read('site/public/'+album.file),read(album.file));
});
