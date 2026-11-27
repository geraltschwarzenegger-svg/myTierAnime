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
test('an overall duration replaces ordinary records and adds only the marked repeat viewings',()=>{
 const item={watchTotal:manual(500).duration,watched:[
  {date:'01.11.2026',...manual(100)},
  {date:'17.11.2026',rewatch:true,...manual(80)},
  {date:'18.11.2026',rewatch:true},
 ]};
 const withOverride=itemWatchTime(item);
 assert.equal(withOverride.minutes,580);assert.equal(withOverride.known,2);assert.equal(withOverride.unknown,1);
 assert.equal(collectionWatchTime({tiers:[{items:[item]}]}).partialItems,1);
 delete item.watchTotal;
 assert.equal(itemWatchTime(item).minutes,180);
});
test('the server accepts dated repeat viewings and rejects incompatible flags and missing dates',()=>{
 const state=JSON.parse(read('data.json')).state;
 const record={date:'17.11.2026',label:'Фильм',rewatch:true};
 state.tiers[0].items[0].watched.push(record);
 assert.equal(validateState(state),null);
 record.rewatch='true';assert.match(validateState(state),/пересмотра/);
 record.rewatch=true;record.date='';assert.match(validateState(state),/дату пересмотра/);
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
 context.changed=structuredClone(context.fixture);context.changed[0].rewatch=true;
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(normWatched(changed))',context)),context.changed);
 assert.equal(vm.runInContext('watchedEq(fixture,changed)',context),false,'rewatch-only import must be detected');
});
test('both published JSON snapshots match, validate and sum once to the documented total',()=>{
 assert.equal(read('data.json'),read('anime-tierlist-2026-10-11.json'));
 const state=JSON.parse(read('data.json')).state;assert.equal(validateState(state),null);
 const total=collectionWatchTime(state);assert.equal(total.minutes,46196);assert.equal(total.completeItems,77);assert.equal(total.unknownItems,0);
 const all=state.tiers.flatMap(t=>t.items);
 assert.deepEqual(Object.fromEntries(state.tiers.map(t=>[t.id,t.items.length])),{S:18,A:26,B:18,C:15});
 assert.equal(all.reduce((n,i)=>n+i.watched.length,0),95);
 assert.equal(state.nextUid,80);
 for(const [uid,tier,dates] of [[72,'S',['05.11.2026','06.11.2026']],[73,'A',['07.11.2026','08.11.2026']],[74,'B',['10.11.2026']],[75,'B',['12.11.2026']],[76,'A',['17.11.2026','19.11.2026']],[77,'S',['12.11.2026','13.11.2026','17.11.2026']],[78,'S',['23.11.2026','24.11.2026','25.11.2026']],[79,'A',['26.11.2026','27.11.2026']]]){
  const item=all.find(i=>i.uid===uid);assert.ok(item,'new title '+uid);
  assert.ok(state.tiers.find(t=>t.id===tier).items.includes(item),'tier for '+uid);
  assert.deepEqual(item.watched.map(w=>w.date),dates,'dates for '+uid);
  assert.ok(item.cover&&item.sticker,'poster and decoration for '+uid);
 }
 assert.deepEqual(all.find(i=>i.uid===72).watched.map(w=>w.duration.episodes),[10,10]);
 assert.deepEqual(all.find(i=>i.uid===72).watched.map(w=>watchMinutes(w)),[250,280]);
 for(const [uid,minutes] of [[72,530],[73,529],[74,288],[75,1046],[76,552],[77,772],[78,712],[79,600]])assert.equal(itemWatchTime(all.find(i=>i.uid===uid)).minutes,minutes,'new title runtime '+uid);
 assert.deepEqual(all.find(i=>i.uid===77).watched.map(w=>watchMinutes(w)),[97,100,575]);
 assert.deepEqual(all.find(i=>i.uid===78).watched.map(w=>watchMinutes(w)),[288,288,136]);
 const kuroko=all.find(i=>i.uid===79);
 assert.deepEqual(kuroko.watched.map(w=>[w.label,w.duration.episodes,watchMinutes(w)]),[
  ['1 сезон · 13/25 серий',13,312],
  ['1 сезон · 25/25 серий',12,288],
 ]);
 assert.deepEqual(all.find(i=>i.uid===73).watched.map(w=>w.duration.episodes),[12,11]);
 assert.equal(watchMinutes(all.find(i=>i.uid===69).watched[0]),300);
 assert.equal(all.find(i=>i.uid===58).watched[0].duration.episodes,76);
 assert.equal(itemWatchTime(all.find(i=>i.uid===21)).minutes,36*23);
 const added=all.find(i=>i.uid===70);assert.equal(watchMinutes(added.watched[0]),264);assert.equal(added.watched[0].date,'24.10.2026');assert.equal(added.watched[0].duration.episodes,11);assert.equal(added.watched[0].duration.episodeMinutes,24);
 assert.ok(state.tiers.find(t=>t.id==='A').items.includes(added));
 const catalogData=JSON.parse(read('assets/catalog/watchtime.json'));assert.equal(catalogData.items.length,77);
 assert.deepEqual(JSON.parse(source.match(/const WATCHTIME_CATALOG = (\[.*?\]);\n/s)[1]),catalogData.items,'runtime catalog and documented catalog stay synchronized');
 for(const entry of catalogData.items){
  for(const option of entry.options)assert.equal(watchDurationIssue(option.duration),null,entry.name);
  for(const part of entry.parts)assert.equal(part.totalMinutes,part.episodes*part.episodeMinutes,entry.name);
 }
 assert.equal(catalogData.items.find(i=>i.uid===2).parts.reduce((n,p)=>n+p.episodes,0),89);
 assert.equal(catalogData.items.find(i=>i.uid===61).parts.length,6,'Mugen Train TV version must not double-count the film');
});
