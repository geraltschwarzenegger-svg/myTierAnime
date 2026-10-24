import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {helixEntries,helixWindow,helixPose} from '../../site/src/helix.mjs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const data=JSON.parse(read('data.json'));
test('helix reads every title in tier order without changing names, dates or time',()=>{
 const before=JSON.stringify(data.state),items=helixEntries(data.state);
 assert.equal(items.length,68);assert.equal(new Set(items.map(e=>e.uid)).size,68);
 assert.deepEqual(items.map(e=>e.uid),data.state.tiers.flatMap(t=>t.items.map(i=>i.uid)));
 assert.equal(items.find(e=>e.uid===69).item.watched[0].duration.episodeMinutes,25);
 assert.equal(JSON.stringify(data.state),before);
});
test('custom tiers are included and invalid or duplicated identifiers never create duplicate posters',()=>{
 const items=helixEntries({tiers:[{id:'X',items:[{uid:10,name:'<img onerror=alert(1)>'},{uid:10,name:'Duplicate'},{uid:0},{uid:NaN}]},{id:'星',items:[{uid:11,name:'Новое'}]}]});
 assert.equal(items.length,2);assert.equal(items[0].item.name,'<img onerror=alert(1)>');assert.equal(items[1].tier.id,'星');
});
test('virtual window is bounded to 17 desktop or 9 lite posters, even for 2000 anime',()=>{
 for(const length of [0,1,67,2000])for(const p of [-100,0,.5,36,66,100000,NaN])for(const lite of [true,false]){
  const w=helixWindow(length,p,lite);assert.ok(w.start>=0&&w.end<=length&&w.start<=w.end);assert.ok(w.end-w.start<=(lite?9:17));
  if(length)assert.ok(w.center>=w.start&&w.center<w.end);
 }
});
test('3D coordinates stay finite and the selected poster remains centered across phone and desktop widths',()=>{
 for(const width of [280,320,390,768,1440])for(const position of [0,16.5,66]){
  const w=helixWindow(67,position,false);
  for(let i=w.start;i<w.end;i++){const pose=helixPose(i,position,width);for(const v of Object.values(pose))assert.ok(Number.isFinite(v));assert.ok(pose.opacity>=.22&&pose.opacity<=1);}
  const selected=helixPose(position,position,width);assert.equal(selected.x,0);assert.equal(selected.y,0);assert.ok(selected.z>0);
 }
});
test('client and reusable geometry module are identical',()=>{
 const marker=/\/\* MEMORY HELIX MODEL BEGIN \*\/[\s\S]*?\/\* MEMORY HELIX MODEL END \*\//;
 assert.equal(read('src/app.html').match(marker)[0],read('site/src/helix.mjs').match(marker)[0]);
});
