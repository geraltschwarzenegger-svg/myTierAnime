/* Real browser checks for frame selection, animated emblems and fixed tier panels.
   Requires Playwright + Chromium. Add --live for the published GitHub Pages build. */
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
      name.startsWith("assets/")
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
    await c.route("https://**/*", async (route) => {
      const url = route.request().url();
      if (
        new URL(url).hostname !== "geraltschwarzenegger-svg.github.io" ||
        !live
      )
        return route.fulfill({ contentType: "image/jpeg", body: fallback });
      const response = await fetch(url),
        headers = Object.fromEntries(response.headers);
      delete headers["content-length"];
      delete headers["content-encoding"];
      return route.fulfill({
        status: response.status,
        headers,
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    const p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(() => {
      // Reproduce V3.0's forced-off saved preference on the first visit only.
      if (!localStorage.getItem("anime-tierlist-fx"))
        localStorage.setItem(
          "anime-tierlist-fx",
          JSON.stringify({
            "fx-tier-motion": false,
            emblemVersion: 2,
            motion: "auto",
          }),
        );
      window.cspProblems = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        window.cspProblems.push(e.effectiveDirective),
      );
    });
    await p.goto(base, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      (n) => document.querySelectorAll(".card").length === n,
      count,
    );
    await p.evaluate(() => document.fonts.ready);
    const collection = await p.evaluate(() => JSON.stringify(state));
    assert.equal(
      await p.locator('.tier[data-tier="B"] .card[data-uid="40"]').count(),
      1,
    );
    assert.equal(
      await p.locator('.tier[data-tier="C"] .card[data-uid="40"]').count(),
      0,
    );
    assert.equal(
      await p.evaluate(() =>
        document.body.classList.contains("fx-tier-motion"),
      ),
      true,
      "legacy forced-off preference is migrated",
    );
    async function moving(selector) {
      await p.waitForFunction(
        (selector) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const css = getComputedStyle(el);
          return (
            css.animationName !== "none" && css.animationPlayState === "running"
          );
        },
        selector,
        { timeout: 5000 },
      );
      const before = await p
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).transform);
      await p.waitForFunction(
        ({ selector, before }) =>
          getComputedStyle(document.querySelector(selector)).transform !==
          before,
        { selector, before },
        { timeout: 6000 },
      );
    }
    for (const mode of ["elements", "orbits", "classic"]) {
      await p
        .locator(`[data-seg="emblems"] [data-v="${mode}"]`)
        .evaluate((el) => el.click());
      for (const tier of ["S", "A", "B", "C"]) {
        const prefix = `.tier[data-tier="${tier}"] .badge`;
        await p
          .locator(prefix)
          .evaluate((el) =>
            el.scrollIntoView({ block: "start", behavior: "instant" }),
          );
        await moving(prefix + " .l3d-in");
        if (mode === "elements")
          await moving(
            prefix +
              " " +
              {
                S: ".radiance-ray",
                A: ".facet-glass",
                B: ".ink-drop",
                C: ".sakura-sprig",
              }[tier] +
              ":first-of-type",
          );
      }
    }
    await p
      .locator('[data-seg="emblems"] [data-v="elements"]')
      .evaluate((el) => el.click());
    await p.locator('[data-fx="fx-tier-motion"]').evaluate((el) => el.click());
    assert.equal(
      await p.evaluate(() =>
        document.body.classList.contains("fx-tier-motion"),
      ),
      false,
    );
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      (n) => document.querySelectorAll(".card").length === n,
      count,
    );
    assert.equal(
      await p.evaluate(() =>
        document.body.classList.contains("fx-tier-motion"),
      ),
      false,
      "explicit user choice is preserved after migration",
    );
    await p.locator("#fxGear").click();
    await p.locator("#motionEnable").click();
    await p.waitForFunction(
      () =>
        document
          .getElementById("motionDiagnostics")
          .textContent.includes("Анимация работает"),
      null,
      { timeout: 6000 },
    );
    await p.locator('[data-seg="motion"] [data-v="auto"]').click();
    await p.locator("#fxClose").click();
    assert.equal(
      await p
        .locator(".card .relic-frame-3d")
        .evaluateAll((els) => new Set(els.map((e) => e.dataset.model)).size),
      50,
    );
    assert.ok(
      await p
        .locator(".release-version")
        .innerText()
        .then((s) => /V\d+\.\d+(?:\.\d+)?/.test(s)),
    );
    const badge = p.locator('.tier[data-tier="S"] .badge');
    await badge.evaluate((el) =>
      el.scrollIntoView({ block: "start", behavior: "instant" }),
    );
    const position = () =>
      badge
        .locator(".badge-body")
        .evaluate((el) => el.getBoundingClientRect().top + scrollY);
    const original = await position();
    await p.evaluate(() => scrollBy({ top: 220, behavior: "instant" }));
    assert.ok(
      Math.abs((await position()) - original) < 1,
      "tier emblem stays in its normal document position during scroll",
    );
    await badge.hover({ position: { x: 30, y: 35 } });
    await p.waitForTimeout(150);
    assert.equal(
      await badge.evaluate((el) => getComputedStyle(el).transform),
      "none",
    );
    await moving('.tier[data-tier="S"] .badge .l3d-in');
    await p.locator("#frameOpen").click();
    const dialog = p.locator("#frameAtelier");
    assert.equal(await dialog.evaluate((el) => el.open), true);
    const seen = new Set();
    for (let page = 0; page < 5; page++) {
      for (const id of await p
        .locator(".atelier-tile")
        .evaluateAll((els) => els.map((e) => +e.dataset.frame)))
        seen.add(id);
      if (page < 4) await p.locator("#atelierNext").click();
    }
    assert.equal(seen.size, 50);
    assert.equal(await p.locator("#atelierNext").isDisabled(), true);
    for (let i = 0; i < 4; i++) await p.locator("#atelierPrev").click();
    await p.locator('[data-frame="4"]').click();
    assert.equal(
      await p.locator("#atelierName").textContent(),
      "Рубиновая роза",
    );
    assert.equal(
      await p.evaluate(() => JSON.stringify(state)),
      collection,
      "trying a frame does not change data",
    );
    if (shots)
      await dialog.screenshot({
        path: path.join(root, "docs/images/atelier-v3.png"),
      });
    await p.locator("#atelierScope").selectOption("68");
    assert.ok(
      await p
        .locator("#atelierImage")
        .evaluate((el) => el.complete && el.naturalWidth > 0),
    );
    await p.locator('[data-filter="C"]').click();
    await p.locator("#atelierNext").click();
    await p.locator('[data-frame="49"]').click();
    await p.locator("#atelierApply").click();
    assert.equal(
      await p
        .locator('.card[data-uid="68"] .relic-frame-3d')
        .getAttribute("data-model"),
      "49",
    );
    assert.notEqual(
      await p
        .locator('.card[data-uid="61"] .relic-frame-3d')
        .getAttribute("data-model"),
      "49",
    );
    assert.equal(
      await p.evaluate(() => JSON.stringify(state)),
      collection,
      "frame choice leaves dates and saved collection intact",
    );
    await p.keyboard.press("Escape");
    assert.equal(await dialog.evaluate((el) => el.open), false);
    await p.waitForFunction(
      () => document.querySelectorAll(".atelier-tile").length === 0,
      null,
      { timeout: 3000 },
    );
    assert.equal(
      await p.locator(".atelier-tile").count(),
      0,
      "closed gallery releases SVG trees",
    );
    assert.equal(
      await p.evaluate(() => document.activeElement.id),
      "frameOpen",
    );
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      (n) => document.querySelectorAll(".card").length === n,
      count,
    );
    assert.equal(
      await p
        .locator('.card[data-uid="68"] .relic-frame-3d')
        .getAttribute("data-model"),
      "49",
      "individual choice survives reload",
    );
    await p.locator('.card[data-uid="68"]').click();
    assert.equal(
      await p.locator("#preview .relic-frame-3d").getAttribute("data-model"),
      "49",
    );
    assert.ok(
      await p
        .locator("#preview .wlist")
        .innerText()
        .then((s) => s.includes("14.10.2026")),
    );
    if (shots)
      await p.locator("#preview").screenshot({
        path: path.join(root, "docs/images/moonlit-anime-v3.png"),
      });
    await p.keyboard.press("Escape");
    await p.locator("#frameOpen").click();
    await p.locator('[data-frame="4"]').click();
    await p.locator("#atelierApply").click();
    assert.equal(
      await p
        .locator(".card .relic-frame-3d")
        .evaluateAll((els) => new Set(els.map((e) => e.dataset.model)).size),
      1,
    );
    await p.keyboard.press("Escape");
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      (n) => document.querySelectorAll(".card").length === n,
      count,
    );
    assert.equal(
      await p
        .locator(".card .relic-frame-3d")
        .first()
        .getAttribute("data-model"),
      "4",
    );
    await p.locator("#frameOpen").click();
    await p.locator("#atelierReset").click();
    assert.equal(
      await p
        .locator(".card .relic-frame-3d")
        .evaluateAll((els) => new Set(els.map((e) => e.dataset.model)).size),
      50,
    );
    for (const width of [320, 390, 768, 1024, 1440]) {
      await p.setViewportSize({ width, height: 844 });
      assert.ok(
        await dialog.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.left >= 0 &&
            r.right <= innerWidth &&
            r.top >= 0 &&
            r.bottom <= innerHeight + 1
          );
        }),
        "dialog fits viewport " + width,
      );
      assert.ok(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        "gallery has no horizontal overflow " + width,
      );
    }
    if (shots) {
      await p.setViewportSize({ width: 390, height: 844 });
      await dialog.evaluate((el) => (el.scrollTop = 0));
      await p.screenshot({
        path: path.join(root, "docs/images/atelier-mobile-v3.png"),
      });
    }
    await p.keyboard.press("Escape");
    await p.emulateMedia({ reducedMotion: "reduce" });
    // Media-query change events and the final CSS frame arrive asynchronously.
    await p.waitForFunction(
      () => document.body.classList.contains("motion-calm"),
      null,
      { timeout: 5000 },
    );
    await p.waitForFunction(
      () =>
        document
          .querySelector('.tier[data-tier="S"] .badge')
          .getAnimations({ subtree: true })
          .every((a) => a.playState !== "running"),
      null,
      { timeout: 5000 },
    );
    assert.equal(
      await badge.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running").length,
      ),
      0,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(await p.evaluate(() => window.cspProblems), []);
    console.log(
      "Atelier passed: 50 models, animated S/A/B/C in three modes, actual decoration motion, forced-off migration, persisted motion switch, live diagnostics, fixed tier panels, all pages, preview, individual/global selection persists, reset, original collection unchanged, five viewport sizes, Escape/focus restoration, CSP.",
    );
  } finally {
    await browser.close();
    if (!live) await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
