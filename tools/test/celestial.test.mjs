import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=name=>readFileSync(path.join(root,name));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=read('src/app.html').toString();
const manifest=JSON.parse(read('assets/art/celestial-art.json'));

test('celestial artwork preserves the supplied originals and matches every distribution',()=>{
 for(const entry of manifest.images){
  const bytes=read(entry.path),original=read('src/art/'+path.basename(entry.path,'.webp')+'.png');
  assert.equal(sha(bytes),entry.sha256);
  assert.equal(bytes.length,entry.sizeBytes);
  assert.equal(sha(original),entry.originalSha256);
  assert.equal(original.length,entry.originalByteCount);
  assert.equal(original.toString('hex',0,8),'89504e470d0a1a0a');
  assert.deepEqual([original.readUInt32BE(16),original.readUInt32BE(20)],[entry.width,entry.height]);
  assert.deepEqual(read('site/public/'+entry.path),bytes);
  const pattern=entry.path.includes('terrace')?/const HERO_BLOOM_ART="data:image\/webp;base64,([^"]+)"/:/--garden-image:\s*url\("data:image\/webp;base64,([^"]+)"\)/;
  assert.deepEqual(Buffer.from(source.match(pattern)[1],'base64'),bytes);
 }
 for(const name of ['index.html','site/public/index.html']){
  const html=read(name).toString();
  for(const entry of manifest.images)assert.ok(html.includes(entry.path));
  assert.ok(html.includes('scene-layout-ready celestial-edition'));
  assert.ok(html.includes('id="heroSceneDialog"'));
 }
 assert.deepEqual(read('index.html'),read('site/public/index.html'));
});

