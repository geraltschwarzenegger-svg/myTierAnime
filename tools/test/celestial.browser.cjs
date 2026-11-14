/* Celestial hero/background acceptance. Default: layout foundation/current art.
 * --require-celestial additionally requires the two supplied finished illustrations.
 * --live checks the published site through verified TLS; no production writes occur.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '../..');
const base = 'https://geraltschwarzenegger-svg.github.io/myTierAnime/';
const live = process.argv.includes('--live');
const requireCelestial = process.argv.includes('--require-celestial');
const screenshots = process.argv.includes('--screenshots');
const mode = requireCelestial ? 'celestial' : 'foundation-current-art';
const out = process.env.CELESTIAL_ARTIFACTS || '/workspace/artifacts/myTierAnime/celestial';
const collectionBytes = fs.readFileSync(path.join(root, 'data.json'));
const backupBytes = fs.readFileSync(path.join(root, 'anime-tierlist-2026-10-11.json'));
const published = JSON.parse(collectionBytes);
const count = published.state.tiers.reduce((n, t) => n + t.items.length, 0);
const art = {
  hero: {file:'assets/art/astrava-celestial-terrace.webp', dimensions:[1774, 887]},
  palace: {file:'assets/art/astrava-celestial-palace.webp', dimensions:[1672, 941]},
};
const mime = {'.html':'text/html; charset=utf-8','.json':'application/json','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function imageDigest(page, url) {
  return page.evaluate(async url => {
    let bytes;
    if (url.startsWith('data:')) {
      const data = atob(url.slice(url.indexOf(',') + 1));
      bytes = Uint8Array.from(data, c => c.charCodeAt(0));
    } else {
      const response = await fetch(new URL(url, location.href));
      if (!response.ok) throw new Error('Image HTTP ' + response.status);
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('');
  }, url);
}

async function fitViewport(page) {
  // Match the real sidebar breakpoint; resize can return before media queries settle.
  await page.waitForFunction(() => getComputedStyle(document.getElementById('capture')).marginLeft === (innerWidth >= 1100 ? '214px' : '0px'));
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1, null, {timeout:5000});
}

async function assertUncropped(image, label) {
  await image.evaluate(n => n.decode());
  const geometry = await image.evaluate(n => ({
    width:n.clientWidth, height:n.clientHeight,
    naturalWidth:n.naturalWidth, naturalHeight:n.naturalHeight,
    fit:getComputedStyle(n).objectFit,
  }));
  assert.ok(geometry.naturalWidth > 0 && geometry.naturalHeight > 0, label + ' decodes');
  assert.ok(geometry.width > 0 && geometry.height > 0, label + ' has a visible box');
  const equalAspect = Math.abs(geometry.width / geometry.height - geometry.naturalWidth / geometry.naturalHeight) < 0.025;
  assert.ok(['contain','scale-down'].includes(geometry.fit) || equalAspect, label + ' shows the entire picture without stretching/cropping');
  return geometry;
}

async function assertStaticPalace(page) {
  await page.evaluate(async () => {
    bg.scene = 'sakura-garden';
    bg.parallax = true; // A saved legacy preference must not make the building move.
    saveBg();
    await applyBg();
    scrollTo({top:0, behavior:'instant'});
  });
  const layerStyles = () => page.evaluate(() => {
    const scene = document.querySelector('.sakura-scene');
    const bough = document.querySelector('.sakura-bough');
    const read = (element, pseudo, name) => {
      if (!element) return null;
      const s = getComputedStyle(element, pseudo);
      const r = element.getBoundingClientRect();
      return {name, image:s.backgroundImage, display:s.display, content:s.content,
        visibility:s.visibility, opacity:Number(s.opacity), transform:s.transform,
        position:s.backgroundPosition, animation:s.animationName,
        duration:s.animationDuration, playState:s.animationPlayState,
        rect:[r.x,r.y,r.width,r.height]};
    };
    return [read(scene,null,'scene'),read(scene,'::before','before'),read(bough,null,'bough')].filter(Boolean);
  });
  const layers = await layerStyles();
  const visible = layer => layer.display !== 'none' && layer.visibility !== 'hidden' && layer.opacity > 0 && !(layer.name === 'before' && ['none','normal'].includes(layer.content));
  const buildings = layers.filter(layer => visible(layer) && layer.image.includes('astrava-celestial-palace.webp'));
  assert.equal(buildings.length, 1, 'one visible palace raster, no duplicated building contours');
  const primary = buildings[0];
  assert.ok(primary.animation === 'none' || primary.playState === 'paused' || primary.duration.split(',').every(n => parseFloat(n) === 0), 'the palace raster has no active animation');
  const url = primary.image.match(/url\(["']?(.*?)["']?\)/)?.[1];
  assert.ok(url, 'the palace has a real image URL');
  assert.equal(await imageDigest(page, url), digest(fs.readFileSync(path.join(root, art.palace.file))), 'background uses the supplied palace derivative');
  const dimensions = await page.evaluate(async url => {
    const image = new Image(); image.src = url; await image.decode();
    return [image.naturalWidth,image.naturalHeight];
  }, url);
  assert.deepEqual(dimensions, art.palace.dimensions, 'actual palace dimensions');
  for (const [x,y] of [[24,110],[900,650],[1600,180]]) {
    await page.mouse.move(x,y);
    await page.waitForTimeout(140); // Observe a real interval with motion enabled.
    const sample = (await layerStyles()).find(layer => layer.name === primary.name);
    assert.equal(sample.transform, primary.transform, 'pointer does not transform the building');
    assert.equal(sample.position, primary.position, 'pointer does not pan the raster');
    sample.rect.forEach((n,i) => assert.ok(Math.abs(n-primary.rect[i]) < .1, 'palace ancestors remain stationary'));
  }
}

(async () => {
  fs.mkdirSync(out, {recursive:true});
  if (requireCelestial) {
    for (const entry of Object.values(art)) assert.ok(fs.existsSync(path.join(root, entry.file)), 'Supplied celestial asset missing: ' + entry.file);
  }
  const launch = {args:['--no-sandbox']};
  const executablePath = process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium';
  if (fs.existsSync(executablePath)) launch.executablePath = executablePath;
  const browser = await chromium.launch(launch);
  const errors = [];
  const reports = [];
  const contextErrors = new Map();
  try {
    async function createContext(viewport={width:1920,height:1080}) {
      const context = await browser.newContext({viewport,locale:'ru-RU',timezoneId:'Europe/Moscow',reducedMotion:'no-preference',acceptDownloads:true});
      const violations = [];
      contextErrors.set(context, violations);
      await context.addInitScript(() => {
        window.celestialCspProblems = [];
        document.addEventListener('securitypolicyviolation', e => window.celestialCspProblems.push(e.effectiveDirective));
      });
      context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
      await context.route('https://**/*', async route => {
        const url = route.request().url();
        if (!url.startsWith(base)) return route.abort();
        const name = decodeURIComponent(new URL(url).pathname.slice(new URL(base).pathname.length)) || 'index.html';
        assert.ok(!name.split('/').includes('..'));
        if (name === '__celestial_seed__.html') return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Temporary storage fixture</title>'});
        if (live) {
          const response = await fetch(url, {signal:AbortSignal.timeout(30000),cache:'no-store'});
          const headers = Object.fromEntries(response.headers);
          delete headers['content-length']; delete headers['content-encoding'];
          return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
        }
        const file = path.join(root, name);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status:404,body:''});
        return route.fulfill({contentType:mime[path.extname(file)] || 'application/octet-stream',body:fs.readFileSync(file)});
      });
      return context;
    }
    async function ready(page) {
      await page.waitForFunction(n => !!window.AstralStudio && document.querySelectorAll('.card').length === n, count);
      assert.ok(await page.locator('body').evaluate(n => n.classList.contains('scene-layout-ready')), 'responsive hero foundation is enabled');
      if (requireCelestial) assert.ok(await page.locator('body').evaluate(n => n.classList.contains('celestial-edition')), 'supplied celestial edition is enabled');
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#heroAlbumImage').evaluate(n => n.decode());
    }
    async function finishPage(page, context) {
      contextErrors.get(context).push(...await page.evaluate(() => window.celestialCspProblems));
    }

    const context = await createContext();
    const page = await context.newPage();
    await page.goto(base + '?art=observatory&overview=1&celestial-check=' + mode, {waitUntil:'domcontentloaded'});
    await ready(page);
    assert.ok(await page.locator('#heroAlbumImage').isVisible());
    const originalState = await page.evaluate(() => JSON.stringify(state));
    const initialCollectionStorage = await page.evaluate(() => localStorage.getItem('anime-tierlist-v2'));
    const heroSrc = await page.locator('#heroAlbumImage').evaluate(n => n.currentSrc);
    const heroSize = await page.locator('#heroAlbumImage').evaluate(n => [n.naturalWidth,n.naturalHeight]);
    if (requireCelestial) {
      assert.ok(new URL(heroSrc).pathname.endsWith('/' + art.hero.file), 'web hero uses the new external asset');
      assert.deepEqual(heroSize, art.hero.dimensions, 'actual hero dimensions');
      assert.equal(await imageDigest(page, heroSrc), digest(fs.readFileSync(path.join(root, art.hero.file))), 'rendered hero matches the supplied derivative');
      const sceneChoice = page.locator('[data-bg="sakura-garden"]');
      assert.ok((await sceneChoice.textContent()).includes('Ночная обсерватория'), 'legacy scene ID has the new visible label');
      await assertStaticPalace(page);
    }
    reports.push('Hero loads with actual dimensions ' + heroSize.join('×') + (requireCelestial ? '; supplied celestial assets verified.' : '; current-art foundation only.'));

    for (const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:390,height:844},{width:320,height:568}]) {
      await page.setViewportSize(viewport);
      await fitViewport(page);
      await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
      const hero = page.locator('#heroAlbumImage');
      assert.ok(await hero.isVisible(), 'hero remains visible at ' + viewport.width);
      await assertUncropped(hero, 'Hero at ' + viewport.width);
      const trigger = page.locator('#heroSceneOpen');
      assert.equal(await trigger.getAttribute('aria-haspopup'), 'dialog');
      await trigger.focus();
      await page.keyboard.press('Enter');
      const viewer = page.locator('#heroSceneDialog');
      await page.waitForFunction(() => document.getElementById('heroSceneDialog').open);
      assert.equal(await viewer.evaluate(n => n.tagName), 'DIALOG');
      assert.ok(await viewer.getAttribute('aria-label') || await viewer.getAttribute('aria-labelledby'), 'full-scene dialog has an accessible name');
      assert.ok(await viewer.evaluate(n => {
        const r=n.getBoundingClientRect();
        return r.left >= -1 && r.top >= -1 && r.right <= innerWidth+1 && r.bottom <= innerHeight+1 && n.scrollWidth <= n.clientWidth+1;
      }), 'full viewer fits ' + viewport.width);
      assert.ok(await viewer.evaluate(n => {
        const r=n.getBoundingClientRect();
        return Math.abs(r.left - (innerWidth-r.right)) <= 2 && Math.abs(r.top - (innerHeight-r.bottom)) <= 2;
      }), 'full viewer is centered horizontally and vertically at ' + viewport.width);
      const full = page.locator('#heroSceneImage');
      const fullGeometry = await assertUncropped(full, 'Full hero at ' + viewport.width);
      assert.deepEqual([fullGeometry.naturalWidth,fullGeometry.naturalHeight], heroSize);
      assert.equal(await imageDigest(page, await full.evaluate(n => n.currentSrc)), await imageDigest(page, heroSrc), 'full viewer uses the same complete illustration');
      assert.equal(await viewer.evaluate(n => n.matches(':modal')), true, 'viewer is a real modal, not a non-modal open dialog');
      await page.keyboard.press('Tab');
      // Chromium can move from the sole dialog button to browser chrome. In that
      // case activeElement is BODY; it must never focus a control behind the modal.
      assert.ok(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('#heroSceneDialog')), 'Tab cannot focus page controls behind the modal');
      await page.evaluate(() => document.getElementById('heroSceneOpen').focus());
      assert.notEqual(await trigger.evaluate(n => n === document.activeElement), true, 'background trigger remains inert while the modal is open');
      await page.locator('#heroSceneClose').focus();
      if (screenshots && [1920,390].includes(viewport.width)) await page.screenshot({path:path.join(out,mode+'-viewer-'+viewport.width+'.png')});
      if (viewport.width === 390) await page.locator('#heroSceneClose').click();
      else await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('heroSceneDialog').open);
      assert.equal(await trigger.evaluate(n => n === document.activeElement), true, 'focus returns to full-scene trigger');
      await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
      if (screenshots && [1920,1440,390,320].includes(viewport.width)) await page.screenshot({path:path.join(out,mode+'-home-'+viewport.width+'.png')});
    }
    reports.push('1920/1440/390/320: whole hero, no horizontal overflow, keyboard opening, centered modal sizing, Escape/button close and focus return.');

    await page.setViewportSize({width:1440,height:900});
    await fitViewport(page);
    await page.locator('.card').first().click();
    await page.waitForFunction(() => document.getElementById('preview').classList.contains('show'));
    await page.locator('#postcardOpen').click();
    const postcard = page.locator('.postcard-landscape');
    await postcard.evaluate(n => n.decode());
    const backdropAspect = await postcard.evaluate(n => n.clientWidth / n.clientHeight);
    assert.ok(Math.abs(backdropAspect - 2) < .025, "postcard backdrop keeps the source aspect ratio without relying on unsupported export object-fit");
    assert.ok((await page.locator("#postcardCapture footer").textContent()).includes("ASTRAVA"));
    assert.equal(await imageDigest(page, await postcard.evaluate(n => n.currentSrc)), await imageDigest(page, heroSrc), 'postcard uses the updated hero source');
    const framesBeforeExport = await page.locator('.card > .as-frame').count();
    const pendingDownload = page.waitForEvent('download', {timeout:180000});
    pendingDownload.catch(() => {}); // Keep click failures from leaving an unhandled waiter.
    try {
      await page.locator('#postcardDownload').click();
      const download = await pendingDownload;
      const output = path.join(out, mode + '-postcard.png');
      await download.saveAs(output);
      const png = fs.readFileSync(output);
      assert.equal(png.subarray(1,4).toString(), 'PNG', 'postcard download is a real PNG');
      assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)], [960,1440], 'postcard PNG has the promised pixel size');
      await page.waitForFunction(() => !document.body.classList.contains('exporting'), null, {timeout:15000});
      assert.equal(await page.locator('.card > .as-frame').count(), framesBeforeExport, 'capture restores the original poster frame nodes');
    } catch (error) {
      const status = await page.locator('#postcardStatus').textContent().catch(() => '(unavailable)');
      throw new Error('Postcard PNG check failed; #postcardStatus=' + JSON.stringify(status) + '; ' + error.message, {cause:error});
    }
    reports.push('Real postcard PNG downloaded at 960×1440; export mode ended and poster frames restored.');
    await page.locator('#postcardClose').click();
    await page.locator('#previewClose').click();
    assert.equal(await page.evaluate(() => JSON.stringify(state)), originalState, 'visual changes leave collection state untouched');
    assert.equal(await page.evaluate(() => localStorage.getItem('anime-tierlist-v2')), initialCollectionStorage, 'public visual checks do not rewrite the personal collection');
    await page.emulateMedia({reducedMotion:'reduce'});
    if (requireCelestial) await assertStaticPalace(page);
    await finishPage(page, context);
    await context.close();

    // Seed once on a blank same-origin page; reload must use the app's persisted value.
    for (const selectedScene of ['sakura-garden','city']) {
      const saved = {version:2,scene:selectedScene,url:'',hasFile:false,dim:47,blur:2,sat:115,pos:'top',parallax:true};
      const savedContext = await createContext({width:1440,height:900});
      const savedPage = await savedContext.newPage();
      await savedPage.goto(base + '__celestial_seed__.html');
      await savedPage.evaluate(saved => {
        localStorage.setItem('anime-tierlist-v2:bg', JSON.stringify(saved));
        localStorage.setItem('anime-tierlist-astral-appearance-v1', JSON.stringify({schema:1,settings:{skin:'jade',atm:'midori',focus:false}}));
      }, saved);
      // Test the original compatibility URL and then the plain URL.
      await savedPage.goto(base + '?art=observatory', {waitUntil:'domcontentloaded'});
      await ready(savedPage);
      const before = await savedPage.evaluate(() => JSON.stringify(state));
      assert.deepEqual(await savedPage.evaluate(() => JSON.parse(localStorage.getItem('anime-tierlist-v2:bg'))), saved, 'saved scene/sliders survive first visit');
      assert.equal(await savedPage.evaluate(() => AstralStudio.settings().skin), 'jade', 'saved skin is preserved');
      const nextScene = selectedScene === 'city' ? 'sakura-garden' : 'city';
      await savedPage.evaluate(async scene => {bg.scene=scene;saveBg();await applyBg();}, nextScene);
      assert.equal(await savedPage.evaluate(() => bg.scene), nextScene);
      await finishPage(savedPage, savedContext);
      await savedPage.goto(base, {waitUntil:'domcontentloaded'});
      await ready(savedPage);
      assert.equal(await savedPage.evaluate(() => bg.scene), nextScene, 'scene switch survives plain URL reload');
      assert.deepEqual(await savedPage.evaluate(() => JSON.parse(localStorage.getItem('anime-tierlist-v2:bg'))), {...saved,scene:nextScene});
      assert.equal(await savedPage.evaluate(() => JSON.stringify(state)), before, 'saved-scene restoration does not alter anime');
      await finishPage(savedPage, savedContext);
      await savedContext.close();
    }
    reports.push('Existing sakura-garden/city scene IDs, sliders, parallax preference and jade skin survive compatibility/plain URLs and scene reloads.');
    assert.deepEqual(fs.readFileSync(path.join(root,'data.json')), collectionBytes, 'canonical data file unchanged');
    assert.deepEqual(fs.readFileSync(path.join(root,'anime-tierlist-2026-10-11.json')), backupBytes, 'backup data file unchanged');
    assert.deepEqual(errors, [], 'no JavaScript errors');
    for (const violations of contextErrors.values()) assert.deepEqual(violations, [], 'no CSP violations');
    const report = {mode,live,passed:true,animeCount:count,collectionSha256:digest(collectionBytes),heroDimensions:heroSize,reports,visualIdentityReview:'Not automated: character identity and facial details require inspecting supplied originals and rendered screenshots.'};
    fs.writeFileSync(path.join(out,mode+'-results.json'),JSON.stringify(report,null,2)+'\n');
    console.log((live?'Published ':'Local ')+mode+' PASS: '+reports.join(' '));
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
