/* Integration checks for click/tap preview. Requires Playwright + Chromium.
   Local: node tools/test/preview.browser.cjs
   Published: NODE_USE_ENV_PROXY=1 node tools/test/preview.browser.cjs --live */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../..");
const snapshot = JSON.parse(
  fs.readFileSync(path.join(root, "data.json"), "utf8"),
);
const count = snapshot.state.tiers.reduce((n, t) => n + t.items.length, 0);
const poster = fs.readFileSync(
  path.join(root, "assets/covers/class-de-2-banme.jpg"),
);
const live = process.argv.includes("--live");
const offlineName = "NEWAnime tier list11-08-2026.html";
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
      name === offlineName ||
      name.startsWith("assets/vendor/") ||
      name.startsWith("assets/covers/")
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
    "content-type": types[path.extname(name)] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  if (!live)
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = live
    ? "https://geraltschwarzenegger-svg.github.io/myTierAnime/"
    : `http://127.0.0.1:${server.address().port}/`;
  const launch = { headless: true, args: ["--no-sandbox"] };
  if (process.env.CHROMIUM_EXECUTABLE)
    launch.executablePath = process.env.CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(launch);
  const errors = [];
  try {
    async function context(extra = {}) {
      const c = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        reducedMotion: "reduce",
        locale: "ru-RU",
        ...extra,
      });
      await c.route("https://**/*", async (route) => {
        const url = route.request().url();
        if (
          new URL(url).hostname !== "geraltschwarzenegger-svg.github.io" ||
          !live
        )
          return route.fulfill({ contentType: "image/jpeg", body: poster });
        // Use the environment's verified TLS transport; never ignore certificate errors.
        const response = await fetch(url);
        const headers = Object.fromEntries(response.headers);
        delete headers["content-length"];
        delete headers["content-encoding"];
        return route.fulfill({
          status: response.status,
          headers,
          body: Buffer.from(await response.arrayBuffer()),
        });
      });
      return c;
    }
    async function page(c) {
      const p = await c.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      await p.addInitScript(() => {
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
      return p;
    }
    const c = await context();
    const p = await page(c),
      panel = p.locator("#preview"),
      card = p.locator('.card[data-uid="61"]');
    assert.equal(await p.locator(".card .relic-frame-3d").count(), count);
    const reliefExport = await p.evaluate(() => {
      const body = document.body,
        frames = [...document.querySelectorAll(".relic-frame-3d")];
      const original = frames.reduce(
        (n, f) => n + f.querySelectorAll("svg").length,
        0,
      );
      body.classList.add("exporting");
      let restore = () => {};
      try {
        restore = flattenRelicFramesForExport(body);
        const remaining = frames.reduce(
          (n, f) => n + f.querySelectorAll("svg").length,
          0,
        );
        restore();
        restore = () => {};
        const restored = frames.reduce(
          (n, f) => n + f.querySelectorAll("svg").length,
          0,
        );
        body.classList.remove("fx-relic");
        restore = flattenRelicFramesForExport(body);
        const hiddenRemaining = frames.reduce(
          (n, f) => n + f.querySelectorAll("svg").length,
          0,
        );
        return { original, remaining, restored, hiddenRemaining };
      } finally {
        restore();
        body.classList.remove("exporting");
        body.classList.add("fx-relic");
      }
    });
    assert.ok(reliefExport.original > 0);
    assert.equal(
      reliefExport.remaining,
      0,
      "export clones no heavy relief SVG trees",
    );
    assert.equal(
      reliefExport.restored,
      reliefExport.original,
      "live ornaments are restored",
    );
    assert.equal(
      reliefExport.hiddenRemaining,
      0,
      "disabled relief does not bloat the export clone",
    );
    await card.hover();
    assert.equal(
      await panel.isVisible(),
      false,
      "hover must not open the panel",
    );
    await card.focus();
    assert.equal(
      await panel.isVisible(),
      false,
      "focus must not open the panel",
    );
    await p.keyboard.press("Enter");
    assert.equal(await panel.isVisible(), true);
    assert.equal(
      await panel.locator(".relic-frame-3d").getAttribute("data-model"),
      await card.locator(".relic-frame-3d").getAttribute("data-model"),
      "the preview retains the selected poster's frame",
    );
    assert.equal(await card.getAttribute("aria-expanded"), "true");
    assert.equal(
      await p
        .locator("#previewClose")
        .evaluate((el) => el === document.activeElement),
      true,
      "opening focuses the close button",
    );
    const original = snapshot.state.tiers
      .flatMap((t) => t.items)
      .find((i) => i.uid === 61);
    assert.equal(
      await panel.locator(".wrow-p").count(),
      original.watched.length,
    );
    await p.mouse.move(1, 1);
    assert.equal(
      await panel.isVisible(),
      true,
      "pointer exit must not close it",
    );
    await p.keyboard.press("Escape");
    assert.equal(await panel.isVisible(), false);
    assert.equal(
      await card.evaluate((el) => el === document.activeElement),
      true,
    );
    await p.keyboard.press("Space");
    assert.equal(await panel.isVisible(), true);
    await p.locator("#previewClose").click();
    assert.equal(await panel.isVisible(), false);
    await card.click();
    await card.click();
    assert.equal(await panel.isVisible(), false, "same card toggles the panel");
    await card.click();
    await p.locator('.card[data-uid="1"]').click();
    assert.equal(
      await p.locator("#previewTitle").textContent(),
      "Violet Evergarden",
    );
    assert.equal(await card.getAttribute("aria-expanded"), "false");
    await p.mouse.click(1, Math.floor((await p.viewportSize()).height / 2));
    assert.equal(await panel.isVisible(), false);
    await card.click();
    await p.locator(".preview .wlist").focus();
    await p.keyboard.press("Tab");
    assert.equal(
      await panel.isVisible(),
      false,
      "tab out dismisses a nonmodal panel",
    );
    // Stress the real renderer with 80 seasons without changing the user's files.
    const fixture = structuredClone(snapshot);
    const target = fixture.state.tiers
      .flatMap((t) => t.items)
      .find((i) => i.uid === 61);
    target.watched = Array.from({ length: 80 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, i + 1));
      return {
        label: `Сезон ${i + 1} / 12 — длинное название истории и дополнительных серий`,
        date:
          [d.getUTCDate(), d.getUTCMonth() + 1]
            .map((n) => String(n).padStart(2, "0"))
            .join(".") + ".2026",
      };
    });
    await c.route("**/data.json*", (r) => r.fulfill({ json: fixture }));
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      (n) => document.querySelectorAll(".card").length === n,
      count,
    );
    await card.click();
    assert.equal(await panel.locator(".wrow-p").count(), 80);
    assert.equal(
      await p.locator("#previewDatesCount").textContent(),
      "Просмотры · 80",
    );
    const list = panel.locator(".wlist");
    await list.hover();
    await p.mouse.wheel(0, 500);
    await p.waitForFunction(
      () => document.querySelector("#preview .wlist").scrollTop > 0,
    );
    assert.equal(await panel.isVisible(), true);
    await list.evaluate((el) => (el.scrollTop = 0));
    await list.focus();
    await p.keyboard.press("PageDown");
    await p.waitForFunction(
      () => document.querySelector("#preview .wlist").scrollTop > 0,
    );
    await p.keyboard.press("Control+End");
    await p.waitForFunction(() => {
      const el = document.querySelector("#preview .wlist");
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    });
    assert.ok(
      await list.evaluate(
        (el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
      ),
    );
    assert.ok(
      (await list.locator(".wrow-p").last().innerText()).includes("Сезон 80"),
    );
    for (const size of [
      { width: 1440, height: 1000 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
      { width: 568, height: 320 },
    ]) {
      await p.setViewportSize(size);
      // Resizing and late font layout are reconciled by ResizeObserver.
      await p.waitForFunction(
        ({ width, height }) => {
          const r = document.getElementById("preview").getBoundingClientRect();
          return (
            r.x >= 11 &&
            r.y >= 11 &&
            r.right <= width - 11 &&
            r.bottom <= height - 11
          );
        },
        size,
        { timeout: 2000 },
      );
      const box = await panel.boundingBox();
      assert.ok(
        box.x >= 11 &&
          box.y >= 11 &&
          box.x + box.width <= size.width - 11 &&
          box.y + box.height <= size.height - 11,
        JSON.stringify({ size, box }),
      );
      assert.ok(
        await list.evaluate(
          (el) => el.clientHeight >= 35 && el.scrollHeight > el.clientHeight,
        ),
      );
      assert.ok(
        await p.locator("#previewClose").evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
        "close button must remain clickable",
      );
      await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
      assert.ok(
        await list.evaluate(
          (el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
        ),
      );
    }
    await p.keyboard.press("Escape");
    assert.equal(await panel.isVisible(), false);
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.locator('[data-view="chips"]').click();
    const chip = p.locator('.chip[data-uid="61"]');
    await chip.click();
    assert.equal(await panel.isVisible(), true);
    assert.equal(await panel.locator(".wrow-p").count(), 80);
    assert.equal(await list.evaluate((el) => el.scrollTop), 0);
    await p.keyboard.press("Escape");
    assert.deepEqual(await p.evaluate(() => window.cspProblems), []);
    await c.close();
    const touch = await context({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await touch.route("**/data.json*", (r) => r.fulfill({ json: fixture }));
    const tp = await page(touch);
    await tp.evaluate(() => {
      window.previewTouchTrace = [];
      for (const type of ["pointerdown", "focusin", "scroll"])
        document.addEventListener(
          type,
          (e) => {
            const p = document.getElementById("preview"),
              r = p.getBoundingClientRect();
            window.previewTouchTrace.push({
              type,
              id: e.target.id,
              tag: e.target.tagName,
              cls:
                typeof e.target.className === "string"
                  ? e.target.className.slice(0, 70)
                  : "svg",
              show: p.classList.contains("show"),
              x: r.x,
              y: r.y,
              w: r.width,
              h: r.height,
            });
            if (window.previewTouchTrace.length > 25)
              window.previewTouchTrace.shift();
          },
          true,
        );
    });
    await tp.locator('.card[data-uid="61"]').tap();
    assert.equal(await tp.locator("#preview").isVisible(), true);
    const bb = await tp.locator("#preview .wlist").boundingBox();
    const client = await touch.newCDPSession(tp);
    const tx = Math.floor(bb.x + bb.width / 2),
      ty = Math.floor(bb.y + bb.height - 12);
    assert.equal(
      await tp.evaluate(
        ({ x, y }) =>
          !!document.elementFromPoint(x, y)?.closest("#preview .wlist"),
        { x: tx, y: ty },
      ),
      true,
      "storage indicator must not intercept touch scrolling",
    );
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: tx, y: ty }],
    });
    for (let i = 1; i <= 12; i++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: tx, y: ty - (i * Math.min(120, bb.height - 24)) / 12 },
        ],
      });
      await tp.waitForTimeout(16);
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.ok(
      await tp.locator("#preview .wlist").evaluate((el) => el.scrollTop > 0),
      JSON.stringify({
        bb,
        trace: await tp.evaluate(() => window.previewTouchTrace),
        state: await tp.locator("#preview .wlist").evaluate((el) => ({
          top: el.scrollTop,
          height: el.clientHeight,
          total: el.scrollHeight,
          touch: getComputedStyle(el).touchAction,
          hit: document
            .elementFromPoint(
              el.getBoundingClientRect().x + 20,
              el.getBoundingClientRect().y + 20,
            )
            ?.outerHTML.slice(0, 200),
        })),
      }),
    );
    assert.equal(await tp.locator("#preview").isVisible(), true);
    await tp.locator("#previewClose").tap();
    assert.equal(await tp.locator("#preview").isVisible(), false);
    await touch.close();
    if (!live) {
      const offline = await context();
      await offline.route("**/data.json*", (r) =>
        r.fulfill({ status: 404, body: "" }),
      );
      // Start with an existing personal collection; seed only the first visit
      // so reloading exercises persistence rather than resetting the fixture.
      await offline.addInitScript((saved) => {
        if (!localStorage.getItem("anime-tierlist-v2")) {
          localStorage.setItem("anime-tierlist-v2", JSON.stringify(saved));
        }
      }, snapshot);
      const op = await offline.newPage();
      op.on("pageerror", (e) => errors.push(e.message));
      await op.goto(base + encodeURIComponent(offlineName), {
        waitUntil: "domcontentloaded",
      });
      await op.waitForFunction(
        () => document.querySelectorAll(".card").length > 0,
      );
      const oc = op.locator('.card[data-uid="61"]');
      await oc.click();
      assert.equal(await op.locator("#preview").isVisible(), true);
      await op.keyboard.press("Escape");
      await op.locator("#editBtn").click();
      await oc.click();
      assert.equal(
        await op
          .locator("#overlay")
          .evaluate((el) => el.classList.contains("show")),
        true,
      );
      assert.equal(await op.locator("#preview").isVisible(), false);
      const old = await op.locator("#fWatchedList .wrow").count();
      await op.locator("#fWatchedAdd").click();
      const row = op.locator("#fWatchedList .wrow").last();
      await row.locator(".wlabel").fill("Дополнительный сезон / 12");
      await row.locator(".wdate").fill("10.10.2026");
      await op.locator("#mSave").click();
      await op.locator("#editBtn").click();
      await oc.click();
      assert.equal(await op.locator("#preview .wrow-p").count(), old + 1);
      assert.ok(
        (await op.locator("#preview .wrow-p").last().innerText()).includes(
          "Дополнительный сезон / 12",
        ),
      );
      await op.keyboard.press("Escape");
      await op.reload({ waitUntil: "domcontentloaded" });
      await op.waitForFunction(
        () => document.querySelectorAll(".card").length > 0,
      );
      await oc.click();
      assert.equal(await op.locator("#preview .wrow-p").count(), old + 1);
      await offline.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      "Click preview passed: hover/focus off, click/toggle/switch/close/Esc/outside/keyboard, 80 scrollable records, six viewport sizes, chips, real touch scroll, CSP" +
        (live
          ? " on published site."
          : ", offline bundle editor adds and saves a season through reload."),
    );
  } finally {
    await browser.close();
    if (!live) await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
