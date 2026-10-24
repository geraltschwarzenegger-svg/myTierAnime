import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validateState} from '../../site/src/security.mjs';
import {watchDurationIssue,normalizeWatchDuration,watchMinutes,formatWatchTime,sumWatchTime,itemWatchTime,collectionWatchTime} from '../../site/src/watchtime.mjs';
const read=name=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
const source=read('src/app.html');
const manual=minutes=>({duration:{mode:'total',basis:'manual',minutes}});
const episodes=(count,minutes)=>({duration:{mode:'episodes',basis:'manual',episodes:count,episodeMinutes:minutes}});
const catalog={mode:'episodes',basis:'catalog',episodes:12,episodeMinutes:25,sourceUrl:'https://myanimelist.net/anime/46471',sourceTitle:'MyAnimeList'};

test('episode arithmetic, films, explicit zero and unknown time stay distinct',()=>{
 assert.equal(watchMinutes(episodes(12,25)),300);
 assert.equal(watchMinutes(manual(263)),263);
 assert.equal(watchMinutes(manual(0)),0);
 assert.equal(watchMinutes({}),null);
 assert.equal(watchMinutes({duration:{...catalog,episodes:-1}}),null);
 const s=sumWatchTime([episodes(12,25),manual(263),manual(0),{}]);
 assert.equal(s.minutes,563);assert.equal(s.known,3);assert.equal(s.unknown,1);assert.equal(s.estimated,1);
});
test('Russian hour/minute wording is correct at boundaries and large totals',()=>{
 for(const [m,text] of [[0,'0 минут'],[1,'1 минута'],[2,'2 минуты'],[11,'11 минут'],[60,'1 час'],[121,'2 часа 1 минута'],[263,'4 часа 23 минуты'],[1260,'21 час'],[1320,'22 часа'],[40266,'671 час 6 минут']])assert.equal(formatWatchTime(m),text);
 assert.equal(formatWatchTime(263,true),'4 ч 23 мин');
});
test('a per-anime total replaces season values rather than counting them twice',()=>{
 const item={watched:[{date:'01.01.2026',...manual(100)},{date:'02.01.2026',...manual(200)}],watchTotal:manual(500).duration};
 assert.equal(itemWatchTime(item).minutes,500);
 assert.equal(collectionWatchTime({tiers:[{items:[item]}]}).minutes,500);
 delete item.watchTotal;assert.equal(itemWatchTime(item).minutes,300);
 item.watchTotal=manual(0).duration;assert.equal(itemWatchTime(item).minutes,0);
});
test('malformed numbers, overflowing totals and executable source URLs are rejected by client and server',()=>{
 const state=JSON.parse(read('data.json')).state,item=state.tiers[0].items[0];
 for(const bad of [{...catalog,episodes:1.2},{...catalog,episodeMinutes:0},{...catalog,episodeMinutes:Infinity},{...catalog,episodes:10001}, {...catalog,sourceUrl:'javascript:alert(1)'},{...catalog,sourceUrl:'https://user:password@example.test/'},{...catalog,sourceTitle:{}},{mode:'total',basis:'manual',minutes:-1},{mode:'total',basis:'manual',minutes:NaN},{mode:'total',basis:'manual',minutes:600001},{mode:'total',basis:'catalog',minutes:300}]){
  assert.ok(watchDurationIssue(bad));assert.equal(normalizeWatchDuration(bad),null);
  item.watched[0].duration=bad;assert.ok(validateState(state));
 }
 item.watched[0].duration=catalog;assert.equal(validateState(state),null);
 item.watchTotal={...catalog,episodes:0};assert.ok(validateState(state));
});
test('frontend and server share the same duration math; old dates and imported time survive normalization',()=>{
 const helpers=source.match(/\/\* WATCHTIME HELPERS BEGIN \*\/[\s\S]*?\/\* WATCHTIME HELPERS END \*\//)[0];
 assert.equal(helpers,read('site/src/watchtime.mjs').match(/\/\* WATCHTIME HELPERS BEGIN \*\/[\s\S]*?\/\* WATCHTIME HELPERS END \*\//)[0]);
 const norm=source.slice(source.indexOf('function normWatched(w)'),source.indexOf('function parseRuDate'));
 const context=vm.createContext({URL});vm.runInContext(helpers+'\n'+norm,context);
 context.fixture=[{date:'20.10.2026',label:'1 сезон · 12 серий',duration:catalog}];
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(normWatched(fixture))',context)),context.fixture);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(normWatched("20.10.2026"))',context)),[{label:'',date:'20.10.2026'}]);
 vm.runInContext(source.slice(source.indexOf('function watchedEq(a, b)'),source.indexOf('function importDiff')),context);
 context.changed=structuredClone(context.fixture);context.changed[0].duration.episodeMinutes=24;
 assert.equal(vm.runInContext('watchedEq(fixture,changed)',context),false,'time-only import must be detected');
});
test('both published JSON snapshots match, validate and sum once to the documented total',()=>{
 assert.equal(read('data.json'),read('anime-tierlist-2026-10-11.json'));
 const state=JSON.parse(read('data.json')).state;assert.equal(validateState(state),null);
 const total=collectionWatchTime(state);assert.equal(total.minutes,40530);assert.equal(total.completeItems,68);assert.equal(total.unknownItems,0);
 const all=state.tiers.flatMap(t=>t.items);
 assert.equal(watchMinutes(all.find(i=>i.uid===69).watched[0]),300);
 assert.equal(all.find(i=>i.uid===58).watched[0].duration.episodes,76);
 assert.equal(itemWatchTime(all.find(i=>i.uid===21)).minutes,36*23);
 const added=all.find(i=>i.uid===70);assert.equal(watchMinutes(added.watched[0]),264);assert.equal(added.watched[0].date,'24.10.2026');assert.equal(added.watched[0].duration.episodes,11);assert.equal(added.watched[0].duration.episodeMinutes,24);
 assert.ok(state.tiers.find(t=>t.id==='A').items.includes(added));
 const catalogData=JSON.parse(read('assets/catalog/watchtime.json'));assert.equal(catalogData.items.length,68);
 assert.deepEqual(JSON.parse(source.match(/const WATCHTIME_CATALOG = (\[.*?\]);\n/s)[1]),catalogData.items,'runtime catalog and documented catalog stay synchronized');
 for(const entry of catalogData.items){
  for(const option of entry.options)assert.equal(watchDurationIssue(option.duration),null,entry.name);
  for(const part of entry.parts)assert.equal(part.totalMinutes,part.episodes*part.episodeMinutes,entry.name);
 }
 assert.equal(catalogData.items.find(i=>i.uid===2).parts.reduce((n,p)=>n+p.episodes,0),89);
 assert.equal(catalogData.items.find(i=>i.uid===61).parts.length,6,'Mugen Train TV version must not double-count the film');
});
