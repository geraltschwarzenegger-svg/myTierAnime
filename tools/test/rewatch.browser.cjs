const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '../..');
const live = process.argv.includes('--live');
const base = live ? 'https://geraltschwarzenegger-svg.github.io/myTierAnime/' : 'https://astrava-rewatch.invalid/';
const types = {'.html':'text/html','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args:['--no-sandbox']});
  try {
    for (const viewport of [{width:1440,height:900}, {width:390,height:844}, {width:320,height:568}]) {
      const phone = viewport.width < 500;
      const page = await browser.newPage({viewport, isMobile:phone, hasTouch:phone, reducedMotion:'reduce'});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.cspProblems = [];
        document.addEventListener('securitypolicyviolation', event => window.cspProblems.push(event.effectiveDirective));
      });
      if (!live) await page.route('**/*', route => {
        const url = route.request().url();
        if (!url.startsWith(base)) return route.abort();
        const file = path.resolve(root, decodeURIComponent(new URL(url).pathname.slice(1)) || 'index.html');
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.abort();
        return route.fulfill({body:fs.readFileSync(file), contentType:types[path.extname(file)]});
      });
      await page.goto(base, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => document.body.classList.contains('read-only') && document.querySelectorAll('.card').length === 77);
      const card = page.locator('.card[data-uid="1"]');
      const dialog = page.locator('#rewatchDialog');
      const choose = el => phone ? el.tap() : el.click();
      await choose(card);
      await choose(page.locator('#previewRewatch'));
      await dialog.waitFor();
      assert.equal(await dialog.locator('#rewatchForm').isVisible(), false);
      assert.equal(await page.evaluate(() => readLS()), null);
      await choose(dialog.locator('#rewatchOwn'));
      await page.waitForFunction(() => document.getElementById('rewatchDialog').open && !document.getElementById('rewatchForm').hidden);
      assert.equal(await dialog.locator('#rewatchAnime').textContent(), 'Violet Evergarden');
      assert.match(await dialog.locator('#rewatchDate').inputValue(), /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));

      await dialog.locator('#rewatchDate').fill('2026-11-17');
      await dialog.locator('#rewatchLabel').fill('Первый сезон');
      await dialog.locator('.wtime-mode').selectOption('total');
      await dialog.locator('.wtime-hours').fill('1');
      await dialog.locator('.wtime-minutes').fill('20');
      await choose(dialog.getByRole('button', {name:'Сохранить пересмотр'}));
      await dialog.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(() => itemWatchTime(findItem(1).item).minutes), 623);
      assert.equal(await page.locator('#preview .rewatch-entry').textContent(), 'Пересмотр · Первый сезон');
      assert.equal(await page.evaluate(() => findItem(1).item.watched[0].date), '30.03.2026');
      await page.keyboard.press('Escape');
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => !document.body.classList.contains('read-only') && document.querySelectorAll('.card').length === 77);
      assert.equal(await page.evaluate(() => findItem(1).item.watched[1].rewatch), true);
      await choose(page.locator('#historyBtn'));
      const day = page.locator('#calendarGrid [data-day="2026-11-17"]');
      assert.equal(await day.locator('.calendar-rewatch').textContent(), 'П');
      assert.match(await day.getAttribute('aria-label'), /1 пересмотр/);
      await choose(day);
      const repeat = page.locator('#historyList .history-entry.is-rewatch[data-uid="1"]');
      assert.ok(await repeat.isVisible());
      assert.ok(await page.locator('#historyList .history-entry[data-uid="77"]').isVisible());
      assert.equal(await page.locator('[data-day="2026-11-19"] .calendar-rewatch').count(), 0);
      if (process.env.ASTRAVA_REWATCH_SHOTS && viewport.width !== 320)
        await page.locator('#historyOverlay .history-modal').screenshot({path:path.join(process.env.ASTRAVA_REWATCH_SHOTS, `calendar-${viewport.width}.png`)});
      if (!phone) {
        await repeat.click();
        const edit = page.locator('#fWatchedList .wrow').last();
        assert.equal(await edit.locator('.wrewatch').isChecked(), true);
        await edit.locator('.wrewatch').uncheck();
        await page.locator('#mSave').click();
        await page.locator('#historyBtn').click();
        assert.equal(await day.locator('.calendar-rewatch').count(), 0);
        assert.equal(await page.evaluate(() => itemWatchTime(findItem(1).item).minutes), 623);
      }
      assert.deepEqual(await page.evaluate(() => window.cspProblems), []);
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}px · personal copy, rewatch date and duration, original record, reload, mixed calendar day and editing`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
