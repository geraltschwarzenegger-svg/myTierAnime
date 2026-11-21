/* Browser regression check for the poster showcase and local collectible cards. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '../..');
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
const total = snapshot.state.tiers.reduce((sum, tier) => sum + tier.items.length, 0);
const base = 'https://geraltschwarzenegger-svg.github.io/myTierAnime/';
const live = process.argv.includes('--live');
const shots = process.argv.includes('--screenshots');
const output = '/workspace/artifacts/myTierAnime/showcase';
const types = {'.html':'text/html; charset=utf-8','.json':'application/json','.js':'text/javascript',
  '.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};

(async () => {
  if (shots) fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({
    executablePath:process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium',
    args:['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.route('https://**/*', async route => {
      const url = route.request().url();
      if (!url.startsWith(base)) return route.abort();
      const relative = decodeURIComponent(new URL(url).pathname.slice(new URL(base).pathname.length)) || 'index.html';
      assert.ok(!relative.split('/').includes('..'));
      if (!live) {
        const file = path.join(root, relative);
        if (!fs.existsSync(file)) return route.fulfill({status:404,body:''});
        return route.fulfill({contentType:types[path.extname(file)] || 'application/octet-stream',body:fs.readFileSync(file)});
      }
      const response = await fetch(url, {signal:AbortSignal.timeout(20000)});
      const headers = Object.fromEntries(response.headers);
      delete headers['content-length'];
      delete headers['content-encoding'];
      return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.cspProblems = [];
      document.addEventListener('securitypolicyviolation', event => window.cspProblems.push(event.effectiveDirective));
    });
    await page.goto(base + '?view=showcase&update=cards', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(n => window.AstralStudio && document.querySelectorAll('.showcase-card').length === n,total);
    const original = await page.evaluate(() => JSON.stringify(state));
    assert.equal(await page.locator('[data-view="showcase"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#showcaseResults').textContent(),`Показано ${total} из ${total}`);

    const tierS = page.locator('.tier[data-tier="S"] .showcase-card');
    const canonical = await tierS.evaluateAll(cards => cards.map(card => card.dataset.uid));
    const sao = page.locator('.showcase-card[data-uid="77"]');
    assert.equal(await sao.locator('time').textContent(),'17.11.2026');
    assert.match(await sao.locator('.showcase-duration').textContent(),/12 ч 52 мин/);
    assert.ok(await sao.locator('.showcase-art > .as-frame').count(), 'Studio frame is inside the artwork');
    const separated = await sao.evaluate(card => {
      const art = card.querySelector('.showcase-art').getBoundingClientRect();
      const name = card.querySelector('.nm').getBoundingClientRect();
      return name.top >= art.bottom - 1;
    });
    assert.ok(separated, 'caption is under the illustration');
    const order = page.locator('#showcaseOrder');
    await order.selectOption('recent');
    assert.equal(await tierS.first().getAttribute('data-uid'),'77');
    assert.equal(await tierS.first().locator('.rank').textContent(),'17');
    await order.selectOption('title');
    assert.notDeepEqual(await tierS.evaluateAll(cards => cards.map(card => card.dataset.uid)),canonical);
    await order.selectOption('rank');
    assert.deepEqual(await tierS.evaluateAll(cards => cards.map(card => card.dataset.uid)),canonical);

    const search = page.locator('#searchInput');
    await search.fill('Мастера Меча Онлайн');
    assert.equal(await page.locator('.showcase-card:visible').count(),1);
    assert.equal(await page.locator('#showcaseResults').textContent(),`Показано 1 из ${total}`);
    await sao.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#previewTitle').textContent(),'Мастера Меча Онлайн');
    assert.equal(await page.locator('#preview .wrow-p').count(),3);
    await page.locator('#previewClose').click();
    await search.fill('несуществующий_тайтл_9014');
    assert.ok(await page.locator('#showcaseEmpty').isVisible());
    await search.clear();
    if (shots) await page.locator('.tier[data-tier="S"] .panel').screenshot({path:output+'/showcase-desktop.png'});

    const openDeck = page.locator('#keepsakeDeckOpen');
    const pack = page.locator('#keepsakePackOpen');
    const cards = page.locator('#keepsakeGrid .deck-card');
    await openDeck.click();
    assert.equal(await cards.count(),0);
    await pack.click();
    assert.equal(await cards.count(),3);
    assert.equal(await page.locator('.deck-card.fresh').count(),3);
    if (shots) await page.locator('#keepsakeDeck').screenshot({path:output+'/cards-desktop.png'});
    await pack.click();
    const collected = await cards.evaluateAll(items => items.map(item => item.dataset.uid));
    assert.equal(collected.length,6);
    assert.equal(new Set(collected).size,6);
    await page.keyboard.press('Escape');
    assert.ok(await openDeck.evaluate(element => document.activeElement === element));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(n => document.querySelectorAll('.showcase-card').length === n,total);
    await openDeck.click();
    assert.deepEqual(new Set(await cards.evaluateAll(items => items.map(item => item.dataset.uid))),new Set(collected));
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(() => getComputedStyle(document.getElementById('capture')).marginLeft === '0px');
    assert.ok(await page.locator('#keepsakeDeck').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    if (shots) await page.locator('#keepsakeDeck').screenshot({path:output+'/cards-mobile.png'});
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (shots) await page.locator('.tier[data-tier="S"] .panel').screenshot({path:output+'/showcase-mobile.png'});
    await page.locator('[data-view="grid"]').click();
    assert.ok(!new URL(page.url()).searchParams.has('view'));
    assert.equal(await page.locator('.card:visible').count(),total);
    assert.equal(await page.locator('.showcase-card').count(),0);
    assert.equal(await page.evaluate(() => JSON.stringify(state)),original);
    assert.deepEqual(await page.evaluate(() => window.cspProblems),[]);
    assert.deepEqual(errors,[]);
    console.log((live ? 'Published' : 'Local')+' showcase PASS: poster captions, sorting, strict search, preview, unique packs, saved collection, mobile and CSP.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
