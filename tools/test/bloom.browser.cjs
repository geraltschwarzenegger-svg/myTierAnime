/* Neko reaction integration checks; --live checks published site, --screenshots refreshes README images. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../..");
const snapshot = JSON.parse(fs.readFileSync(path.join(root, "data.json")));
const count = snapshot.state.tiers.reduce((n, t) => n + t.items.length, 0);
const live = process.argv.includes("--live"),
  shots = process.argv.includes("--screenshots");
const fallback = fs.readFileSync(
  path.join(root, "assets/covers/class-de-2-banme.jpg"),
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const server = http.createServer((req, res) => {
  const name =
    decodeURIComponent(new URL(req.url, "http://localhost").pathname).slice(
      1,
    ) || "index.html";
  if (
    !(
      name === "index.html" ||
      name === "data.json" ||
      name.startsWith("assets/") || name.startsWith("docs/images/")
    ) ||
    name.split("/").includes("..")
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  const file = path.join(root, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    "content-type": types[path.extname(file)] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  if (!live) await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = live
    ? "https://geraltschwarzenegger-svg.github.io/myTierAnime/"
    : `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
      locale: "ru-RU",
      reducedMotion: "no-preference",
    });
    const cacheFile='/workspace/artifacts/myTierAnime/cover-cache/manifest.json';
    const cache=fs.existsSync(cacheFile)?JSON.parse(fs.readFileSync(cacheFile)):{};
    await c.route('https://**/*',async route=>{
      const url=route.request().url();
      if(cache[url])return route.fulfill({contentType:'image/jpeg',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(cache[url])});
      if(!live&&new URL(url).hostname==='geraltschwarzenegger-svg.github.io')return route.abort();
      try{const response=await fetch(url,{signal:AbortSignal.timeout(15000)}),headers=Object.fromEntries(response.headers);delete headers['content-length'];delete headers['content-encoding'];headers['access-control-allow-origin']='*';return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});}catch{return route.abort();}
    });
    const p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(() => {
      window.cspProblems = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        window.cspProblems.push(e.effectiveDirective),
      );
    });
    await p.goto(base, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      () =>
        document.querySelectorAll(".card").length === 66 &&
        document.body.classList.contains("read-only"),
    );
    await p.evaluate(() => document.fonts.ready);
    const original=await p.evaluate(()=>JSON.stringify(state));
    assert.equal(await p.evaluate(()=>STICKER_ORDER.length),138);
    assert.equal(await p.evaluate(()=>STICKER_PACKS.length),19);
    assert.equal(await p.locator('.card .neko-mark').count(),66);
    assert.equal(await p.locator('.card .neko-mark').evaluateAll(els=>new Set(els.map(el=>el.dataset.reaction)).size),66);
    assert.equal(await p.locator('.card .botanical-frame svg').count(),66);
    assert.ok((await p.locator('.release-version').textContent()).includes('V4.0.0'));
    assert.ok(await p.locator('.hero-art-photo img').evaluate(el=>el.complete&&el.naturalWidth>=1400));
    assert.equal(await p.locator('img[loading="lazy"]').count()>20,true);
    const originalDates=await p.evaluate(()=>JSON.stringify(state.tiers.flatMap(t=>t.items.map(i=>[i.uid,i.watched,i.reaction,i.fav]))));
    await p.locator('#fxGear').click();
    await p.locator('#qualityControls [data-quality="lite"]').click();
    assert.equal(await p.evaluate(()=>document.body.classList.contains('performance-lite')),true);
    await p.reload({waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelectorAll('.card').length===66);
    assert.equal(await p.evaluate(()=>document.body.dataset.quality),'lite');
    assert.equal(await p.evaluate(()=>document.body.classList.contains('performance-lite')),true);
    await p.locator('#fxGear').click();await p.locator('#qualityControls [data-quality="detail"]').click();await p.locator('#fxClose').click();
    await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    if(shots)await p.screenshot({path:path.join(root,'docs/images/bloom-home.png'),animations:'disabled'});
    await p.locator('.tier[data-tier="S"]').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
    await p.waitForFunction(()=>document.querySelector('.tier[data-tier="S"] .lstage').classList.contains('motion-visible'));
    const sculpture=p.locator('.tier[data-tier="S"] .lumen-plate').first(),before=await sculpture.evaluate(el=>getComputedStyle(el).transform);
    await p.waitForFunction(before=>getComputedStyle(document.querySelector('.tier[data-tier="S"] .lumen-plate')).transform!==before,before);
    if(shots){const r=await p.locator('.tier[data-tier="S"] .badge').boundingBox();await p.screenshot({path:path.join(root,'docs/images/bloom-seal.png'),clip:{x:r.x-4,y:Math.max(0,r.y-28),width:r.width+8,height:r.height+32},animations:'disabled'});}
    for(const width of [320,390,768,1440]){
      await p.setViewportSize({width,height:844});
      await p.locator('.card[data-uid="68"]').scrollIntoViewIfNeeded();
      await p.waitForFunction(()=>{
        const c=document.querySelector('.card[data-uid="68"]'),r=c.querySelector('.neko-mark').getBoundingClientRect(),n=c.querySelector('.nm').getBoundingClientRect();return r.width>=40&&r.bottom<=n.top-4;
      });
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no document overflow '+width);
    }
    await p.setViewportSize({width:1440,height:1080});
    for(const [uid,pack,name]of [[14,'call-night','bloom-nazuna'],[44,'dress-up','bloom-marin']]){
      await p.locator(`.card[data-uid="${uid}"]`).click();await p.locator('#previewReaction').click();
      await p.locator('#nekoPack').selectOption(pack);
      assert.equal(await p.locator('#nekoOptions [data-rx]').count(),12);
      assert.equal(await p.locator('#nekoPack option[value="cats"]').count(),0);
      await p.locator(`#nekoOptions [data-rx="${pack}-heart"]`).click();
      if(shots)await p.locator('#reactionDialog').screenshot({path:path.join(root,`docs/images/${name}.png`),animations:'disabled'});
      await p.locator('#nekoCancel').click();await p.waitForFunction(()=>!document.getElementById('reactionDialog').open&&document.getElementById('preview').classList.contains('show'));await p.keyboard.press('Escape');
    }
    await p.locator('#frameOpen').click();await p.locator('#atelierScope').selectOption('68');await p.locator('[data-frame="6"]').click();
    assert.equal(await p.locator('#atelierFrame svg').count(),1);
    await p.waitForFunction(()=>document.getElementById('atelierImage').complete&&document.getElementById('atelierImage').naturalWidth>0);
    if(shots)await p.locator('#frameAtelier').screenshot({path:path.join(root,'docs/images/bloom-atelier.png'),animations:'disabled'});
    await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.getElementById('frameAtelier').open);
    await p.locator('.card[data-uid="1"]').click();await p.locator('#postcardOpen').click();
    assert.equal(await p.locator('#postcardDialog').evaluate(el=>el.open),true);
    assert.equal(await p.locator('#postcardTitle').textContent(),'Violet Evergarden');
    assert.equal(await p.locator('#postcardDates time').first().textContent(),'30.03.2026');
    await p.locator('#postcardTheme').selectOption('lagoon');
    assert.equal(await p.locator('#postcardCapture').getAttribute('data-theme'),'lagoon');
    if(shots)await p.locator('#postcardDialog').screenshot({path:path.join(root,'docs/images/bloom-postcard.png'),animations:'disabled'});
    const downloaded=p.waitForEvent('download',{timeout:120000});await p.locator('#postcardDownload').click();const file=await downloaded;
    const target='/workspace/artifacts/myTierAnime/bloom/postcard-violet.png';fs.mkdirSync(path.dirname(target),{recursive:true});await file.saveAs(target);
    const png=fs.readFileSync(target);assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),960);assert.equal(png.readUInt32BE(20),1440);
    await p.waitForFunction(()=>!document.getElementById('postcardDownload').disabled);
    assert.equal(await p.locator('#postcardFrame svg').count(),1,'frame restored after PNG');
    assert.equal(await p.locator('#postcardFrame [data-relic-export]').count(),0);
    await p.locator('#postcardClose').click();await p.waitForFunction(()=>!document.getElementById('postcardDialog').open&&document.getElementById('preview').classList.contains('show'));await p.keyboard.press('Escape');
    await p.setViewportSize({width:390,height:844});await p.locator('.card[data-uid="14"]').click();await p.locator('#previewReaction').click();await p.locator('#nekoPack').selectOption('call-night');await p.locator('#nekoOptions [data-rx="call-night-star"]').click();
    assert.ok(await p.locator('#reactionDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    if(shots)await p.screenshot({path:path.join(root,'docs/images/bloom-mobile.png'),animations:'disabled'});
    await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.getElementById('reactionDialog').open&&document.getElementById('preview').classList.contains('show'));await p.keyboard.press('Escape');
    assert.equal(await p.evaluate(()=>JSON.stringify(state)),original,'visual customization and postcards do not change collection data');
    assert.equal(await p.evaluate(()=>JSON.stringify(state.tiers.flatMap(t=>t.items.map(i=>[i.uid,i.watched,i.reaction,i.fav])))),originalDates);
    assert.deepEqual(errors,[]);assert.deepEqual(await p.evaluate(()=>window.cspProblems),[]);
    console.log('Bloom PASS: 138 anime stickers, 66 unique decorations, one SVG per frame, adaptive quality preference, visible 3D motion, two new 12-sticker packs, four sizes, full PNG postcard 960x1440, restored frame, unchanged dates/impressions, CSP.');
  } finally {
    await browser.close();
    if (!live) await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
