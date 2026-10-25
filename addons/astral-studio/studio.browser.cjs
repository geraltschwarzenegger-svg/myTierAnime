/* Local release checks; external requests are intercepted with repository files. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out='/workspace/artifacts/myTierAnime/v5';
const count=JSON.parse(fs.readFileSync(path.join(root,'data.json'))).state.tiers.reduce((n,t)=>n+t.items.length,0);
const live=process.argv.includes('--live');
const base='https://geraltschwarzenegger-svg.github.io/myTierAnime/';
const types={'.svg':'image/svg+xml','.html':'text/html','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
async function verifyOffline(browser,errors){
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),url=base+'offline.html';
 await context.route('https://**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'NEWAnime tier list11-08-2026.html'))}):r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.AstralStudio);
 assert.equal(await page.locator('.card').count(),0,'fresh offline browser has no collection until import');
 await page.locator('#importFile').setInputFiles(path.join(root,'data.json'));await page.locator('#impReplace').click();await page.waitForFunction(n=>document.querySelectorAll('.card').length===n,count);await page.evaluate(()=>flushMirrors());
 await page.locator('#asOpen').click();await page.locator('#asStudio [data-world="snow"]').click();await page.locator('.as-close').click();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(n=>!!window.AstralStudio&&document.querySelectorAll('.card').length===n,count);
 assert.equal(await page.evaluate(()=>AstralStudio.settings().atm),'snow');await page.locator('.card[data-uid="69"]').click();assert.equal(await page.locator('#previewTitle').textContent(),'Детектив уже мёртв');await context.close();assert.deepEqual(errors,[]);
 console.log('PASS: self-contained bundle, no external downloads, empty first visit, actual JSON import, 68 titles after reload, saved world and regular preview. file:// navigation is restricted by environment policy.');
}
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const errors=[];if(process.argv.includes('--offline-only')){await verifyOffline(browser,errors);return;}
  const c=await browser.newContext({viewport:{width:1440,height:1024},locale:'ru-RU',timezoneId:'Europe/Moscow',reducedMotion:'no-preference',acceptDownloads:true});
  await c.addInitScript(()=>{window.cspProblems=[];document.addEventListener('securitypolicyviolation',e=>window.cspProblems.push(e.effectiveDirective));});
  const cache=JSON.parse(fs.readFileSync('/workspace/artifacts/myTierAnime/cover-cache/manifest.json'));
  const serve=async route=>{const url=route.request().url();if(live&&url.startsWith(base)){const r=await fetch(url,{signal:AbortSignal.timeout(25000)}),headers=Object.fromEntries(r.headers);delete headers['content-length'];delete headers['content-encoding'];return route.fulfill({status:r.status,headers,body:Buffer.from(await r.arrayBuffer())});}if(cache[url])return route.fulfill({contentType:'image/webp',body:fs.readFileSync(cache[url])});if(!url.startsWith(base))return route.abort();const name=decodeURIComponent(new URL(url).pathname.slice(new URL(base).pathname.length))||'index.html';if(name.split('/').includes('..'))return route.abort();const file=name==='index.html'?path.join(root,'index.html'):path.join(root,name);if(!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});};await c.route('https://**/*',serve);
  const p=await c.newPage();p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});await p.goto(base,{waitUntil:'domcontentloaded'});await p.waitForFunction(n=>window.AstralStudio&&document.querySelectorAll('.card').length===n,count);
  const original=await p.evaluate(()=>JSON.stringify(state));
  assert.ok((await p.locator('.release-version').textContent()).includes('V5.0.0'));
  assert.ok((await p.title()).includes('ASTRAVA'));
  await p.locator('#asOpen').click();
  const beforeAppearance=await p.evaluate(()=>AstralStudio.settings());
  await p.locator('#asStudio [data-world="snow"]').click();await p.locator('#asUndo').click();
  assert.deepEqual(await p.evaluate(()=>AstralStudio.settings()),beforeAppearance,'undo restores the complete previous appearance');
  await p.locator('#asRedo').click();assert.equal(await p.evaluate(()=>AstralStudio.settings().atm),'snow');
  const beforeIntensity=await p.evaluate(()=>AstralStudio.settings().intensity);
  await p.locator('#asIntensity').evaluate(n=>{for(const value of [30,40,50]){n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));}n.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await p.evaluate(()=>AstralStudio.settings().intensity),.5);await p.locator('#asUndo').click();assert.equal(await p.evaluate(()=>AstralStudio.settings().intensity),beforeIntensity,'one slider gesture is one undo step');
  await p.locator('.as-close').click();
  const second=await c.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(base,{waitUntil:'domcontentloaded'});await second.waitForFunction(()=>!!window.AstralStudio);
  await second.evaluate(()=>AstralStudio.set({particles:false,atm:'midori'}));
  await p.waitForFunction(()=>AstralStudio.settings().atm==='midori'&&!AstralStudio.settings().particles&&!document.body.classList.contains('fx-particles'));
  assert.equal(await p.locator('[data-fx="fx-particles"]').getAttribute('aria-pressed'),'false');
  await p.evaluate(()=>AstralStudio.set({particles:true}));await second.waitForFunction(()=>AstralStudio.settings().particles&&document.body.classList.contains('fx-particles'));
  await second.close();await p.bringToFront();
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>!AstralStudio.effective().running);await p.emulateMedia({reducedMotion:'no-preference'});
  await p.evaluate(()=>AstralStudio.reset());

  assert.equal(await p.locator('.card > .as-frame').count(),count);assert.equal(await p.locator('.tier .as-emblem').count(),4);
  assert.equal(await p.locator('[data-seg="atm"] button').count(),9);
  assert.equal(await p.evaluate(()=>AstralStudio.ownsAmbient),true);
  await p.locator('#asOpen').click();assert.equal(await p.locator('#asStudio').evaluate(n=>n.open),true);
  const sculpture=await p.locator('.as-demo .as-emblem').evaluateAll(a=>a.map(n=>n.innerHTML));assert.equal(new Set(sculpture).size,4,'four different elemental sculptures');
  await p.locator('#asStudio [data-world="snow"]').click();assert.equal(await p.evaluate(()=>AstralStudio.settings().atm),'snow');
  await p.locator('.as-close').click();
  await p.evaluate(async()=>{bg.scene='photo';bg.url='';await applyBg();bg.dim=41;bg.blur=4;bg.sat=130;bg.parallax=false;saveBg();await applyBg();});
  assert.equal(await p.evaluate(()=>AstralStudio.effective().atmosphere),'snow','photo sliders retain the chosen atmosphere');
  await p.locator('[data-seg="atm"] [data-v="midori"]').evaluate(n=>n.click());assert.equal(await p.evaluate(()=>AstralStudio.settings().atm),'midori','old panel is an input to canonical state');
  await p.locator('[data-fx="fx-neon"]').evaluate(n=>n.click());await p.waitForTimeout(40);
  assert.equal(await p.evaluate(()=>AstralStudio.effective().atmosphere),'midori','unrelated effect cannot reset the world');
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('anime-tierlist-fx')).atm),'midori');
  await p.evaluate(async()=>{bg.scene='ember';await applyBg();});assert.equal(await p.evaluate(()=>AstralStudio.settings().atm),'ember','old scene maps to its world');
  await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>!!window.AstralStudio);assert.equal(await p.evaluate(()=>AstralStudio.settings().atm),'ember','canonical state survives reload');
  for(const atm of ['midnight','ember','abyss','sakura','shibuya','midori','hinode','storm','snow'])for(const skin of ['midnight','velvet','jade','pearl']){
   await p.evaluate(({atm,skin})=>AstralStudio.set({atm,skin}),{atm,skin});
   assert.equal(await p.locator('body').getAttribute('data-as-world'),atm);assert.equal(await p.locator('body').getAttribute('data-as-skin'),skin);
   const atmClasses=await p.evaluate(()=>[...document.body.classList].filter(x=>x.startsWith('atm-')));assert.deepEqual(atmClasses,['atm-'+atm]);
  }
  await p.locator('[data-seg="motion"] [data-v="off"]').evaluate(n=>n.click());assert.equal(await p.evaluate(()=>AstralStudio.effective().running),false);
  await p.locator('[data-seg="motion"] [data-v="on"]').evaluate(n=>n.click());await p.waitForFunction(()=>AstralStudio.effective().running);
  await p.locator('#qualityControls [data-quality="lite"]').evaluate(n=>n.click());assert.equal(await p.evaluate(()=>AstralStudio.effective().running),false);
  await p.locator('#qualityControls [data-quality="detail"]').evaluate(n=>n.click());await p.waitForFunction(()=>AstralStudio.effective().running);
  await p.locator('[data-fx="fx-particles"]').evaluate(n=>n.click());assert.equal(await p.evaluate(()=>AstralStudio.settings().particles),false);assert.equal(await p.evaluate(()=>AstralStudio.effective().running),false);await p.evaluate(()=>AstralStudio.set({particles:true}));assert.equal(await p.locator('[data-fx="fx-particles"]').getAttribute('aria-pressed'),'true');await p.waitForFunction(()=>AstralStudio.effective().running);
  await p.evaluate(()=>AstralStudio.set({atm:'midori',skin:'jade',frame:'botanic',layer:'new',sigil:'elements',focus:false}));
  await p.locator('#asOpen').click();await p.locator('#asStudio').screenshot({path:out+'/studio-desktop.png'});await p.locator('.as-close').click();
  for(const frame of ['palace','gem','botanic','kintsugi','foil','sumi','tech','constellation']){await p.evaluate(frame=>AstralStudio.set({frame}),frame);assert.equal(await p.locator('.card > .as-frame').first().getAttribute('data-frame'),frame);}
  await p.evaluate(()=>AstralStudio.set({frame:'botanic'}));await p.locator('.card[data-uid="69"]').click();await p.waitForFunction(()=>document.getElementById('preview').classList.contains('show'));assert.equal(await p.locator('#preview .as-frame').getAttribute('data-frame'),'botanic');await p.locator('#previewClose').click();
  await p.evaluate(()=>{AstralStudio.set({followTier:true});document.querySelector('.tier[data-tier="B"]').scrollIntoView();});await p.waitForFunction(()=>AstralStudio.effective().atmosphere==='storm');
  await p.locator('[data-seg="atm"] [data-v="snow"]').evaluate(n=>n.click());assert.equal(await p.evaluate(()=>AstralStudio.settings().followTier),false);
  await p.evaluate(()=>AstralStudio.set({focus:true}));for(const selector of ['.masthead','.watchtime-summary','.impressions'])assert.equal(await p.locator(selector).isVisible(),false);await p.evaluate(()=>AstralStudio.set({focus:false,atm:'midnight',skin:'midnight',frame:'auto'}));
  await p.locator('#asOpen').click();const download=p.waitForEvent('download');await p.getByRole('button',{name:'Экспорт оформления',exact:true}).click();const d=await download;await d.saveAs(out+'/appearance-test.json');const profile=JSON.parse(fs.readFileSync(out+'/appearance-test.json'));assert.equal(profile.application,'myTierAnime.appearance');assert.ok(!('state' in profile));assert.deepEqual(Object.keys(profile).sort(),['application','schema','settings']);
  await p.locator('#asStudio input[type="file"]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"state":{"tiers":[]}}')});await p.waitForFunction(()=>document.getElementById('asStatus').textContent.includes('Не удалось'));assert.equal(await p.evaluate(()=>JSON.stringify(state)),original);
  await p.locator('.as-close').click();
  await p.evaluate(()=>{findItem(69).item.watched=Array.from({length:80},(_,i)=>({label:`Сезон ${i+1} · длинная подпись`,date:'20.10.2026'}));render();});await p.locator('.card[data-uid="69"]').click();assert.equal(await p.locator('#preview .wrow-p').count(),80);await p.locator('#preview .wlist').evaluate(n=>n.scrollTop=n.scrollHeight);assert.ok(await p.locator('#preview .wlist').evaluate(n=>n.scrollTop>0));await p.locator('#previewClose').click();await p.evaluate(original=>{state=JSON.parse(original);render();},original);
  await p.evaluate(()=>{render();});assert.equal(await p.locator('.card > .as-frame').count(),count);assert.equal(await p.locator('.tier .as-emblem').count(),4);
  await p.evaluate(async()=>{bg.scene='sakura-garden';saveBg();await applyBg();scrollTo({top:0,behavior:'instant'});});await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:out+'/home-desktop.png'});
  await p.locator('.tier[data-tier="S"]').scrollIntoViewIfNeeded();await p.screenshot({path:out+'/collection-desktop.png'});
  const moving=p.locator('.tier[data-tier="S"] .as-emblem-plane:not(.back)');const t1=await moving.evaluate(n=>getComputedStyle(n).transform);await p.waitForTimeout(300);assert.notEqual(await moving.evaluate(n=>getComputedStyle(n).transform),t1,'the sculpture actually moves');
  await p.locator('[data-fx="fx-tier-motion"]').evaluate(n=>n.click());assert.equal(await moving.evaluate(n=>getComputedStyle(n).animationPlayState),'paused');await p.locator('[data-fx="fx-tier-motion"]').evaluate(n=>n.click());
  await p.evaluate(()=>{const ctx=document.getElementById('fx').getContext('2d');window.nativeClears=0;window.savedClear=ctx.clearRect;ctx.clearRect=function(...args){window.nativeClears++;return window.savedClear.apply(this,args);};});await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>window.nativeClears),0,'old particle renderer has stopped');
  await p.clock.setFixedTime(new Date('2026-10-24T12:00:00+03:00'));await p.evaluate(()=>AstralStudio.set({skin:'velvet',daylight:true}));assert.equal(await p.evaluate(()=>AstralStudio.effective().skin),'pearl');
  await p.clock.setFixedTime(new Date('2026-10-24T22:00:00+03:00'));await p.evaluate(()=>AstralStudio.set({daylight:true}));assert.equal(await p.evaluate(()=>AstralStudio.effective().skin),'velvet');await p.evaluate(()=>AstralStudio.set({daylight:false}));
  await p.evaluate(()=>AstralStudio.set({skin:'pearl'}));await p.screenshot({path:out+'/collection-pearl.png'});
  assert.equal(await p.locator('.tier[data-tier="S"] .label').evaluate(n=>getComputedStyle(n).color),'rgb(37, 54, 66)');
  await p.locator('#asOpen').click();await p.screenshot({path:out+'/studio-pearl.png'});
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390}]){await p.setViewportSize(viewport);await p.waitForFunction(()=>getComputedStyle(document.getElementById('capture')).marginLeft===(innerWidth>=1100?'214px':'0px'));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.ok(await p.locator('#asStudio').evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(viewport.width===390){assert.equal(await p.evaluate(()=>AstralStudio.effective().particles),28);await p.screenshot({path:out+'/studio-mobile.png'});}}
  await p.locator('.as-close').click();await p.setViewportSize({width:1440,height:1024});await p.evaluate(()=>AstralStudio.reset());
  assert.equal(await p.evaluate(()=>JSON.stringify(state)),original,'appearance never changes collection state');assert.equal(await p.evaluate(()=>localStorage.getItem('anime-tierlist-v2')),null);
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await mobile.route('https://**/*',serve);const mp=await mobile.newPage();mp.on('pageerror',e=>errors.push(e.message));await mp.goto(base,{waitUntil:'domcontentloaded'});await mp.waitForFunction(()=>!!window.AstralStudio);await mp.locator('#asOpen').tap();await mp.locator('#asStudio [data-world="snow"]').tap();assert.equal(await mp.evaluate(()=>AstralStudio.settings().atm),'snow');assert.equal(await mp.evaluate(()=>AstralStudio.effective().running),false);await mp.locator('.as-close').tap();await mobile.close();
  await p.evaluate(()=>{window.realStore=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Blocked','QuotaExceededError')};AstralStudio.set({atm:'midori'});});assert.ok((await p.locator('#asStatus').textContent()).includes('не разрешил сохранение'));await p.evaluate(()=>{Storage.prototype.setItem=window.realStore;AstralStudio.reset();});
  if(process.argv.includes('--exports')){
   const pending=p.waitForEvent('download',{timeout:180000});await p.locator('#exportBtn').evaluate(n=>n.click());const result=await pending;await result.saveAs(out+'/collection-export.png');const png=fs.readFileSync(out+'/collection-export.png');assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.readUInt32BE(16)>2000);await p.waitForFunction(()=>!document.body.classList.contains('exporting'));assert.equal(await p.locator('.card > .as-frame').count(),count);
   await p.locator('.card[data-uid="69"]').click();await p.locator('#postcardOpen').click();const pendingCard=p.waitForEvent('download',{timeout:120000});await p.locator('#postcardDownload').click();const card=await pendingCard;await card.saveAs(out+'/postcard-export.png');const bytes=fs.readFileSync(out+'/postcard-export.png');assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),1440);await p.locator('#postcardClose').click();await p.waitForFunction(()=>AstralStudio.effective().running);
  }
  await p.evaluate(async()=>{document.querySelectorAll('.card img').forEach(n=>n.loading='eager');await Promise.all([...document.querySelectorAll('.card img')].map(n=>n.decode()));});
  assert.equal(await p.locator('.card img').evaluateAll(a=>a.filter(n=>n.complete&&n.naturalWidth>0).length),count,'all 68 poster covers decode without external image hosts');
  assert.deepEqual(await p.evaluate(()=>window.cspProblems),[]);assert.deepEqual(errors,[]);
  if(process.argv.includes('--offline'))await verifyOffline(browser,errors);
  console.log((live?'Published ':'Local ')+'PASS: undo/redo, slider history, two-tab particle sync, reduced-motion changes, 68 local covers; nine worlds × four skins; legacy FX and background synchronization; reload; four sculptures; eight frames; preview; redraw; focus; tier automation; motion/lite; JSON validation; four viewports; unchanged collection; CSP.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
