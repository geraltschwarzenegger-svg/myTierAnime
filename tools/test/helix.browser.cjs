const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),base='https://geraltschwarzenegger-svg.github.io/myTierAnime/';
const live=process.argv.includes('--live'),shots=process.argv.includes('--screenshots'),exportsOn=process.argv.includes('--exports');
const snapshot=JSON.parse(fs.readFileSync(path.join(root,'data.json'))),count=snapshot.state.tiers.flatMap(t=>t.items).length;
const mime={'.html':'text/html','.json':'application/json','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp','.jpg':'image/jpeg'};
const dir='/workspace/artifacts/myTierAnime/helix';fs.mkdirSync(dir,{recursive:true});
async function choose(p,index){await p.locator('#memoryProgress').evaluate((el,index)=>{el.value=index;el.dispatchEvent(new Event('input',{bubbles:true}));},index);}
async function otherPoint(p){return p.evaluate(()=>{
 for(const el of document.querySelectorAll('.memory-poster:not([aria-current="true"])')){
  const r=el.getBoundingClientRect();
  for(const a of [.2,.5,.8])for(const b of [.2,.5,.8]){const x=r.left+r.width*a,y=r.top+r.height*b;
   if(document.elementFromPoint(x,y)?.closest('.memory-poster')===el)return {x,y,uid:el.dataset.uid};
  }
 }
});}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];
 try{
  async function context(options={}){
   const c=await browser.newContext({viewport:{width:1440,height:1080},reducedMotion:'no-preference',acceptDownloads:true,...options});
   await c.addInitScript(()=>{try{localStorage.setItem('anime-tierlist-quality-v1','detail');}catch{}window.cspProblems=[];document.addEventListener('securitypolicyviolation',e=>window.cspProblems.push(e.effectiveDirective));});
   const cacheFile='/workspace/artifacts/myTierAnime/cover-cache/manifest.json',cache=fs.existsSync(cacheFile)?JSON.parse(fs.readFileSync(cacheFile)):{};
   await c.route('https://**/*',async route=>{
    const url=route.request().url();if(cache[url])return route.fulfill({contentType:'image/webp',body:fs.readFileSync(cache[url])});
    if(!url.startsWith(base))return route.abort();
    if(!live){const name=decodeURIComponent(new URL(url).pathname.slice(new URL(base).pathname.length))||'index.html';assert.ok(!name.split('/').includes('..'));const file=path.join(root,name);if(!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}
    const r=await fetch(url,{signal:AbortSignal.timeout(20000)}),headers=Object.fromEntries(r.headers);delete headers['content-length'];delete headers['content-encoding'];return route.fulfill({status:r.status,headers,body:Buffer.from(await r.arrayBuffer())});
   });
   c.on('page',p=>p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);}));return c;
  }
  const c=await context(),p=await c.newPage();await p.goto(base+'?v=4.2.0',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(n=>document.querySelectorAll('.card').length===n,count);
  const original=await p.evaluate(()=>JSON.stringify(state));
  await p.locator('#memoryHelixOpen').click();await p.waitForFunction(()=>document.getElementById('memoryHelix').open);
  assert.equal(await p.locator('#memoryProgress').getAttribute('max'),String(count-1));assert.ok(await p.locator('.memory-poster').count()<=17);
  await p.locator('#memoryHelixClose').focus();await p.keyboard.press('ArrowRight');assert.equal(await p.locator('#memoryProgress').inputValue(),'1');
  await p.keyboard.press('End');assert.equal(await p.locator('#memoryProgress').inputValue(),String(count-1));
  await p.keyboard.press('Home');assert.equal(await p.locator('#memoryProgress').inputValue(),'0');
  await p.keyboard.press('g');assert.ok(await p.evaluate(()=>document.getElementById('memoryHelix').open&&view==='grid'),'global shortcuts do not leak into the dialog');
  await p.waitForFunction(()=>document.querySelector('.memory-poster[data-uid="1"]')?.getAttribute('aria-current')==='true');
  await p.waitForTimeout(300);const point=await otherPoint(p);assert.ok(point,'another poster is clickable');await p.mouse.click(point.x,point.y);
  await p.waitForFunction(uid=>document.querySelector('.memory-poster[aria-current="true"]')?.dataset.uid===uid,point.uid);
  await choose(p,10);const beforeWheel=Number(await p.locator('#memoryProgress').inputValue());const vp=await p.locator('#memoryViewport').boundingBox();
  await p.mouse.move(vp.x+vp.width/2,vp.y+vp.height/2);await p.mouse.wheel(0,250);await p.waitForFunction(n=>Number(document.getElementById('memoryProgress').value)>n,beforeWheel);
  await choose(p,20);await p.mouse.move(vp.x+vp.width*.75,vp.y+vp.height*.5);await p.mouse.down();await p.mouse.move(vp.x+vp.width*.35,vp.y+vp.height*.5,{steps:10});await p.mouse.up();
  assert.ok(Number(await p.locator('#memoryProgress').inputValue())>20,'drag rotates without acting as a tap');
  await p.locator('#memoryTiers [data-tier="C"]').click();assert.ok((await p.locator('#memoryCurrentMeta').textContent()).startsWith('C ·'));
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.getElementById('memoryHelix').open);
  assert.equal(await p.locator('.memory-poster').count(),0,'scene releases nodes on close');
  await p.locator('#viewSeg [data-view="chips"]').click();await p.locator('#memoryHelixOpen').click();assert.equal(await p.locator('#memoryProgress').getAttribute('max'),String(count-1),'chips keep the complete collection');
  const chosenIndex=snapshot.state.tiers.flatMap(t=>t.items).findIndex(i=>i.uid===69);await choose(p,chosenIndex);await p.locator('#memoryOriginal').click();
  await p.waitForFunction(()=>document.getElementById('preview').classList.contains('show'));assert.equal(await p.locator('#previewTitle').textContent(),'Детектив уже мёртв');await p.locator('#previewClose').click();
  await p.locator('#viewSeg [data-view="grid"]').click();await p.locator('#favBtn').click();await p.locator('#searchInput').fill('Violet');
  await p.locator('#memoryHelixOpen').click();await choose(p,chosenIndex);await p.locator('#memoryOriginal').click();await p.waitForFunction(()=>document.getElementById('preview').classList.contains('show'));
  assert.ok(await p.locator('.card[data-uid="69"]').isVisible());assert.equal(await p.locator('#searchInput').inputValue(),'');assert.equal(await p.evaluate(()=>favOnly),false);
  await p.locator('#previewClose').click();
  // Native settings must gate the one existing tilt loop and the helix animation budget.
  await p.locator('[data-seg="motion"] [data-v="off"]').evaluate(el=>el.click());const card=p.locator('.card[data-uid="1"]');await card.scrollIntoViewIfNeeded();const box=await card.boundingBox();await p.mouse.move(box.x+box.width*.7,box.y+box.height*.3);
  assert.equal(await card.evaluate(el=>getComputedStyle(el).transform),'none');assert.equal(await card.locator('.poster-optics').evaluate(el=>getComputedStyle(el).display),'none');
  await p.locator('#memoryHelixOpen').click();await choose(p,chosenIndex);assert.ok((await p.locator('#memoryCurrentMeta').textContent()).includes('5 ч'));
  await p.locator('#memoryHelixClose').click();await p.locator('[data-seg="motion"] [data-v="on"]').evaluate(el=>el.click());
  await p.locator('#qualityControls [data-quality="lite"]').evaluate(el=>el.click());await p.locator('#memoryHelixOpen').click();await choose(p,35);await p.waitForFunction(()=>document.querySelectorAll('.memory-poster').length<=9);assert.equal(await p.locator('#memoryHelix').getAttribute('data-lite'),'true');
  await p.locator('#memoryHelixClose').click();await p.locator('#qualityControls [data-quality="detail"]').evaluate(el=>el.click());
  await p.locator('#memoryHelixOpen').click();await choose(p,chosenIndex);
  // The selected UID survives a live redraw; custom tiers have navigation too.
  await p.evaluate(()=>{state.tiers.push({id:'X',label:'Новый тир',accent:'rose',tagline:'',items:[{uid:state.nextUid,name:'<img src=x onerror=alert(1)>',cover:'',fav:false,reaction:null,watched:[]}]});state.nextUid++;render();});
  assert.equal(await p.locator('#memoryProgress').getAttribute('max'),String(count));assert.ok((await p.locator('#memoryCurrentTitle').textContent()).includes('Детектив'));
  await p.locator('#memoryTiers [data-tier="X"]').click();assert.equal(await p.locator('#memoryCurrentTitle').textContent(),'<img src=x onerror=alert(1)>');
  assert.equal(await p.locator('.memory-poster-name img').count(),0,'custom names are text, never HTML');
  await p.evaluate(()=>{state.tiers.pop();state.nextUid--;render();});assert.equal(await p.locator('#memoryProgress').getAttribute('max'),String(count-1));
  await p.evaluate(text=>{state=JSON.parse(text);render();},original);await choose(p,chosenIndex-1);
  await p.waitForFunction(()=>document.querySelector('.memory-poster[data-uid="68"] img')?.naturalWidth>0);
  if(shots)await p.locator('#memoryHelix').screenshot({path:path.join(root,'docs/images/memory-helix-desktop.png'),animations:'disabled'});
  for(const size of [{width:1440,height:1080},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
    await p.setViewportSize(size);await p.waitForFunction(()=>{const r=document.getElementById('memoryHelix').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});
    assert.ok(await p.locator('#memoryHelix').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    assert.ok(await p.locator('#memoryOriginal').evaluate(el=>{const r=el.getBoundingClientRect();return r.bottom<=innerHeight&&r.right<=innerWidth;}),'open control remains on screen');
    if(shots&&size.width===390)await p.screenshot({path:path.join(root,'docs/images/memory-helix-mobile.png'),animations:'disabled'});
  }
  await p.locator('#memoryHelixClose').click();await p.setViewportSize({width:1440,height:1080});
  assert.equal(await p.evaluate(()=>JSON.stringify(state)),original,'3D navigation does not change dates, reactions, time or tiers');
  assert.equal(await p.evaluate(()=>localStorage.getItem('anime-tierlist-v2')),null,'public browsing creates no author data writes');
  await p.locator('#watchTimeOpen').click();await p.locator('#watchTimeOwn').click();await p.waitForFunction(()=>!document.body.classList.contains('read-only'));
  await p.locator('#editBtn').click();await p.locator('#memoryHelixOpen').click();await choose(p,chosenIndex);await p.locator('#memoryOriginal').click();await p.waitForFunction(()=>document.getElementById('preview').classList.contains('show'));
  assert.equal(await p.evaluate(()=>editing),false,'returning from edit mode opens the normal preview');assert.equal(await p.locator('#overlay').evaluate(el=>el.classList.contains('show')),false);await p.locator('#previewClose').click();
  if(exportsOn){
   await p.locator('#memoryHelixOpen').click();const pending=p.waitForEvent('download',{timeout:180000}).then(file=>({file}),error=>({error}));await p.locator('#exportBtn').evaluate(el=>el.click());const result=await pending;if(result.error)throw result.error;await result.file.saveAs(dir+'/collection.png');
   const png=fs.readFileSync(dir+'/collection.png');assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.readUInt32BE(16)>2000);assert.ok(png.readUInt32BE(20)>5000);
   await p.waitForFunction(()=>!document.body.classList.contains('exporting'));assert.equal(await p.locator('.card .botanical-frame svg').count(),count);assert.equal(await p.locator('.memory-poster').count(),0);
   await p.locator('.card[data-uid="69"]').click();await p.locator('#postcardOpen').click();const cardDownload=p.waitForEvent('download',{timeout:120000}).then(file=>({file}),error=>({error}));await p.locator('#postcardDownload').click();const postcard=await cardDownload;if(postcard.error)throw postcard.error;await postcard.file.saveAs(dir+'/postcard.png');
   const bytes=fs.readFileSync(dir+'/postcard.png');assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),1440);await p.locator('#postcardClose').click();
  }
  const mobile=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),mp=await mobile.newPage();await mp.goto(base+'?v=4.2.0',{waitUntil:'domcontentloaded'});await mp.waitForFunction(()=>!document.getElementById('memoryHelixOpen').disabled);await mp.locator('#memoryHelixOpen').click();
  await mp.waitForFunction(()=>document.querySelectorAll('.memory-poster').length>1);
  const mobileTarget=mp.locator('.memory-poster').nth(1),touchUid=await mobileTarget.getAttribute('data-uid');
  await mobileTarget.tap();await mp.waitForFunction(uid=>document.querySelector('.memory-poster[aria-current="true"]')?.dataset.uid===uid,touchUid);
  const client=await mobile.newCDPSession(mp),mr=await mp.locator('#memoryViewport').boundingBox();const start=Number(await mp.locator('#memoryProgress').inputValue());
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mr.x+mr.width*.8,y:mr.y+mr.height*.5}]});
  for(let i=1;i<=6;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mr.x+mr.width*(.8-i*.08),y:mr.y+mr.height*.5}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(Number(await mp.locator('#memoryProgress').inputValue())>start,'real touch drag rotates on a phone');assert.ok(await mp.locator('.memory-poster').count()<=9);
  assert.deepEqual(await p.evaluate(()=>window.cspProblems),[]);assert.deepEqual(await mp.evaluate(()=>window.cspProblems),[]);assert.deepEqual(errors,[]);
  assert.equal(await p.evaluate(()=>JSON.stringify(state)),original);
  console.log((live?'Published':'Local')+' helix PASS: 68 titles, 17/9-node budget, actual poster taps, drag/wheel/keyboard, chips, filters, edit-to-preview, custom tiers/live render, four sizes, real touch, motion/lite, unchanged data, CSP'+(exportsOn?', collection PNG and 960x1440 postcard.':'.'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
