const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const base = process.env.LAB_URL || "http://127.0.0.1:4173/",
  out = path.resolve("artifacts");
fs.mkdirSync(out, { recursive: true });
const snapshot = JSON.parse(fs.readFileSync("public/collection.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const executablePath = process.env.CHROMIUM_EXECUTABLE || "/usr/bin/chromium";
  const browser = await chromium.launch({
    ...(fs.existsSync(executablePath) ? { executablePath } : {}),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const results = [],
    errors = [],
    csp = [],
    requests = [];
  try {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
      locale: "ru-RU",
      acceptDownloads: true,
    });
    await c.addInitScript(() => {
      window.cspProblems = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        cspProblems.push(e.violatedDirective),
      );
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => requests.push(r.url()));
    await p.goto(base);
    await p.waitForFunction(
      () => window.astravaLab?.stats() && window.astravaLab?.snapshot(),
      null,
      { timeout: 30000 },
    );
    async function check(name, fn) {
      const start = Date.now();
      await fn();
      results.push({ name, passed: true, ms: Date.now() - start });
      console.log("PASS", name);
    }
    await check(
      "69 original anime, 41167 minutes, local assets, real WebGL and 18 initial cards",
      async () => {
        assert.deepEqual(
          await p.evaluate(() => astravaLab.snapshot()),
          snapshot,
        );
        assert.equal(await p.locator(".anime-card").count(), 18);
        assert.equal(await p.locator("#watchHours").innerText(), "686 ч 7 мин");
        assert.ok(await p.evaluate(() => astravaLab.stats().calls > 0));
        assert.equal(await p.evaluate(() => astravaLab.error()), "");
      },
    );
    await p.evaluate(async () => {
      localStorage.setItem(
        "anime-tierlist-v2",
        "PRODUCTION-COLLECTION-SENTINEL",
      );
      localStorage.setItem(
        "anime-tierlist-astral-appearance-v1",
        "PRODUCTION-APPEARANCE-SENTINEL",
      );
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("anime-tierlist", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise((resolve, reject) => {
        const t = db.transaction("kv", "readwrite");
        t.objectStore("kv").put("PRODUCTION-IDB-SENTINEL", "state");
        t.oncomplete = resolve;
        t.onerror = reject;
      });
      db.close();
    });
    await p.locator("#motion").uncheck();
    await p.waitForFunction(() => astravaLab.stats()?.paused);
    await sleep(200);
    await check(
      "four distinct real sculptures, stable paused frames and clean tier changes",
      async () => {
        for (const [tier, name] of [
          ["S", "Солнечный венец"],
          ["A", "Нефритовый феникс"],
          ["B", "Аметистовый архив"],
          ["C", "Лунный гербарий"],
        ]) {
          await p.locator('.tier-choices [data-tier="' + tier + '"]').click();
          await p.waitForFunction(
            (name) => astravaLab.stats()?.model === name,
            name,
          );
          await sleep(120);
          const stats = await p.evaluate(() => astravaLab.stats());
          assert.ok(stats.calls <= 6);
          await p
            .locator(".stage-card")
            .screenshot({ path: path.join(out, "model-" + tier + ".png") });
        }
        const before = await p.evaluate(() => astravaLab.stats().frames);
        await sleep(350);
        assert.equal(await p.evaluate(() => astravaLab.stats().frames), before);
      },
    );
    await check(
      "manual atmosphere survives quality/exposure changes and reload",
      async () => {
        await p.locator('[data-world="garden"]').click();
        assert.equal(await p.locator("#followTier").isChecked(), false);
        await p.locator("#quality").selectOption("low");
        await p.locator("#exposure").fill("1.5");
        assert.equal(
          await p.evaluate(() => astravaLab.settings().atmosphere),
          "garden",
        );
        await p.reload();
        await p.waitForFunction(() => astravaLab.stats());
        assert.equal(
          await p.evaluate(() => astravaLab.settings().atmosphere),
          "garden",
        );
        assert.equal(await p.locator("#quality").inputValue(), "low");
        assert.equal(await p.locator("#motion").isChecked(), false);
      },
    );
    await check(
      "camera keyboard, PNG export and real GLB export/import",
      async () => {
        const downloadPromise = p.waitForEvent("download");
        await p.locator("#exportGlb").click();
        const download = await downloadPromise;
        const file = await download.path();
        const bytes = fs.readFileSync(file);
        assert.equal(bytes.subarray(0, 4).toString(), "glTF");
        fs.copyFileSync(file, path.join(out, "exported-model.glb"));
        await p
          .locator("#glbFile")
          .setInputFiles({
            name: "My-emblem.glb",
            mimeType: "model/gltf-binary",
            buffer: bytes,
          });
        await p.waitForFunction(
          () => astravaLab.stats()?.model === "My-emblem.glb",
        );
        assert.equal(
          await p.locator("#modelTitle").innerText(),
          "My-emblem.glb",
        );
        const canvas = p.locator("#sceneHost canvas");
        await canvas.focus();
        await p.keyboard.press("ArrowRight");
        const pngPromise = p.waitForEvent("download");
        await p.locator("#captureFrame").click();
        const png = fs.readFileSync(await (await pngPromise).path());
        assert.equal(png.subarray(1, 4).toString(), "PNG");
        assert.ok(png.length > 10000);
        fs.writeFileSync(path.join(out, "exported-scene.png"), png);
        await p
          .locator("#glbFile")
          .setInputFiles({
            name: "broken.glb",
            mimeType: "model/gltf-binary",
            buffer: Buffer.from("not a glb"),
          });
        await p.waitForFunction(() =>
          document.getElementById("toast").textContent.includes("GLB"),
        );
        assert.equal(
          await p.evaluate(() => astravaLab.stats().model),
          "My-emblem.glb",
        );
      },
    );
    await check(
      "tier filter, search, latest Goblin Slayer date and several season dates in preview",
      async () => {
        await p.locator('[data-filter="C"]').click();
        await p.locator("#search").fill("Убийца");
        assert.equal(await p.locator(".anime-card").count(), 1);
        await p.locator(".anime-card").click();
        assert.ok(
          (await p.locator("#preview").innerText()).includes("03.07.2026"),
        );
        await p.locator("#previewClose").click();
        await p.locator('[data-filter="all"]').click();
        await p.locator("#search").fill("Класс превосходства");
        await p.locator(".anime-card").click();
        assert.equal(await p.locator(".watch-entry").count(), 5);
        assert.ok(
          await p
            .locator("#preview")
            .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
        );
        await p.locator("#previewClose").click();
      },
    );
    await check(
      "local date editor, manual minutes, favourite save and reload/export roundtrip",
      async () => {
        await p.locator("#search").fill("Убийца");
        await p.locator(".anime-card").click();
        await p.locator("#toggleFav").click();
        await p.locator("#editWatches").click();
        await p.locator(".watch-date").fill("2026-07-02");
        await p.locator(".watch-minutes").fill("600");
        await p.locator('#watchForm button[type="submit"]').click();
        assert.ok(
          (await p.locator("#preview").innerText()).includes("02.07.2026"),
        );
        assert.ok((await p.locator("#preview").innerText()).includes("10 ч"));
        await p.locator("#previewClose").click();
        await p.reload();
        await p.waitForFunction(() => astravaLab.snapshot());
        const record = await p.evaluate(() =>
          astravaLab
            .snapshot()
            .state.tiers.flatMap((t) => t.items)
            .find((a) => a.uid === 71),
        );
        assert.equal(record.fav, true);
        assert.equal(record.watched[0].date, "02.07.2026");
        assert.equal(record.watched[0].duration.minutes, 600);
        const dl = p.waitForEvent("download");
        await p.locator("#exportCollection").click();
        const exported = JSON.parse(
          fs.readFileSync(await (await dl).path(), "utf8"),
        );
        assert.equal(
          exported.state.tiers.at(-1).items.at(-1).watched[0].date,
          "02.07.2026",
        );
        const before = await p.evaluate(() =>
          JSON.stringify(astravaLab.snapshot()),
        );
        await p
          .locator("#jsonFile")
          .setInputFiles({
            name: "broken.json",
            mimeType: "application/json",
            buffer: Buffer.from("{"),
          });
        await sleep(100);
        assert.equal(
          await p.evaluate(() => JSON.stringify(astravaLab.snapshot())),
          before,
        );
        await p
          .locator("#jsonFile")
          .setInputFiles({
            name: "original.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(snapshot)),
          });
        await p.waitForFunction(
          () =>
            astravaLab.snapshot().state.tiers.at(-1).items.at(-1).watched[0]
              .date === "03.07.2026",
        );
      },
    );
    await check(
      "calendar months, July date markers and return to the selected anime",
      async () => {
        await p.locator("#journalOpen").click();
        assert.ok(
          (await p.locator("#monthTitle").textContent()).includes(
            "октябрь 2026",
          ),
        );
        for (let i = 0; i < 3; i++) await p.locator("#prevMonth").click();
        assert.ok(
          (await p.locator("#monthTitle").textContent()).includes("июль 2026"),
        );
        await p.locator('[data-day="2026-07-03"]').click();
        assert.equal(await p.locator(".day-entry").count(), 1);
        assert.ok(
          (await p.locator(".day-entry").innerText()).includes(
            "Убийца гоблинов",
          ),
        );
        await p.locator(".day-entry").click();
        assert.ok(await p.locator("#preview").evaluate((n) => n.open));
        await p.locator("#previewClose").click();
      },
    );
    await check(
      "responsive layouts at 1440 / 768 / 390 / 320 and a mobile preview",
      async () => {
        await p.locator('.tier-choices [data-tier="A"]').click();
        for (const width of [1440, 768, 390, 320]) {
          await p.setViewportSize({ width, height: 900 });
          await p.evaluate(() => window.scrollTo(0, 0));
          await p.waitForFunction(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          );
          assert.ok(await p.locator("#sceneHost").isVisible());
          await p.screenshot({
            path: path.join(out, "viewport-" + width + ".png"),
          });
        }
        await p.locator('[data-filter="all"]').click();
        await p.locator("#search").fill("Класс превосходства");
        await p.locator(".anime-card").click();
        assert.ok(
          await p
            .locator("#preview")
            .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
        );
        await p.screenshot({ path: path.join(out, "mobile-preview.png") });
        await p.locator("#previewClose").click();
        await p.setViewportSize({ width: 1440, height: 1080 });
      },
    );
    await check(
      "reduced-motion changes stop all animation and offscreen scenes stop rendering",
      async () => {
        await p.evaluate(() => scrollTo(0, 0));
        await p.locator("#motion").check();
        await p.emulateMedia({ reducedMotion: "reduce" });
        await p.waitForFunction(() => astravaLab.stats().paused);
        await sleep(200);
        const n = await p.evaluate(() => astravaLab.stats().frames);
        await sleep(300);
        assert.equal(await p.evaluate(() => astravaLab.stats().frames), n);
        await p.emulateMedia({ reducedMotion: "no-preference" });
        await p.locator("#collection").scrollIntoViewIfNeeded();
        await p.waitForFunction(
          () => astravaLab.stats().reason === "Сцена вне экрана",
        );
        await sleep(200);
        const off = await p.evaluate(() => astravaLab.stats().frames);
        await sleep(300);
        assert.equal(await p.evaluate(() => astravaLab.stats().frames), off);
        await p.evaluate(() => scrollTo(0, 0));
        await p.locator("#motion").uncheck();
      },
    );
    await check(
      "visibility handler pauses hidden tabs and repeated model swaps release GPU resources",
      async () => {
        await p.locator("#quality").selectOption("low");
        await p.locator("#motion").check();
        await p.evaluate(() => {
          Object.defineProperty(document, "hidden", {
            value: true,
            configurable: true,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        assert.equal(
          await p.evaluate(() => astravaLab.stats().reason),
          "Вкладка скрыта",
        );
        const n = await p.evaluate(() => astravaLab.stats().frames);
        await sleep(300);
        assert.equal(await p.evaluate(() => astravaLab.stats().frames), n);
        await p.evaluate(() => {
          delete document.hidden;
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await p.locator("#motion").uncheck();
        const samples = [];
        for (let i = 0; i < 12; i++) {
          await p
            .locator(
              '.tier-choices [data-tier="' + ["S", "A", "B", "C"][i % 4] + '"]',
            )
            .click();
          await sleep(100);
          samples.push(await p.evaluate(() => astravaLab.stats()));
        }
        assert.ok(samples.every((s) => s.geometries <= 6));
        assert.ok(samples.every((s) => s.textures <= 4));
      },
    );
    await check(
      "WebGL context loss and restoration keep the selected atmosphere",
      async () => {
        const canLose = await p.evaluate(() => {
          const ext = astravaLab.context().getExtension("WEBGL_lose_context");
          window.testLose = ext;
          return Boolean(ext);
        });
        assert.ok(canLose);
        const world = await p.evaluate(() => astravaLab.settings().atmosphere);
        await p.evaluate(() => testLose.loseContext());
        await p.waitForFunction(
          () => astravaLab.stats().reason === "Контекст восстанавливается",
        );
        await sleep(200);
        await p.evaluate(() => testLose.restoreContext());
        await p.waitForFunction(
          () => !document.getElementById("sceneHost").dataset.context,
        );
        assert.equal(
          await p.evaluate(() => astravaLab.settings().atmosphere),
          world,
        );
        await p.locator('.tier-choices [data-tier="B"]').click();
      },
    );
    await check(
      "no access to original collection or appearance keys",
      async () => {
        assert.equal(
          await p.evaluate(() => localStorage.getItem("anime-tierlist-v2")),
          "PRODUCTION-COLLECTION-SENTINEL",
        );
        assert.equal(
          await p.evaluate(() =>
            localStorage.getItem("anime-tierlist-astral-appearance-v1"),
          ),
          "PRODUCTION-APPEARANCE-SENTINEL",
        );
      },
    );
    await check("all 69 self-hosted covers decode successfully", async () => {
      await p.locator('[data-filter="all"]').click();
      await p.locator("#search").fill("");
      while (await p.locator("#loadMore").isVisible())
        await p.locator("#loadMore").click();
      await p.evaluate(async () => {
        document
          .querySelectorAll(".poster>img")
          .forEach((n) => (n.loading = "eager"));
        await Promise.all(
          [...document.querySelectorAll(".poster>img")].map((n) => n.decode()),
        );
      });
      assert.equal(await p.locator(".poster>img").count(), 69);
    });
    csp.push(...(await p.evaluate(() => cspProblems)));
    await check(
      "classic V5 compatibility reads and writes only its own storage and IndexedDB",
      async () => {
        await p.goto(base + "classic/");
        await p.waitForFunction(
          () => document.querySelectorAll(".card").length === 69,
          null,
          { timeout: 30000 },
        );
        const key = await p.evaluate(() => {
          localStorage.setItem("anime-tierlist-v2", "LAB-CLASSIC-SENTINEL");
          return localStorage.getItem("anime-tierlist-v2");
        });
        assert.equal(key, "LAB-CLASSIC-SENTINEL");
        await p.evaluate(async () => {
          await idb.set("state", "LAB-CLASSIC-IDB");
        });
        csp.push(...(await p.evaluate(() => cspProblems)));
        await p.goto(base);
        await p.waitForFunction(() => astravaLab.snapshot());
        assert.equal(
          await p.evaluate(() => localStorage.getItem("anime-tierlist-v2")),
          "PRODUCTION-COLLECTION-SENTINEL",
        );
        assert.equal(
          await p.evaluate(() =>
            localStorage.getItem("astrava-lab:classic:anime-tierlist-v2"),
          ),
          "LAB-CLASSIC-SENTINEL",
        );
        const value = await p.evaluate(async () => {
          const db = await new Promise((resolve) => {
            const r = indexedDB.open("anime-tierlist", 1);
            r.onsuccess = () => resolve(r.result);
          });
          const v = await new Promise((resolve) => {
            const r = db.transaction("kv").objectStore("kv").get("state");
            r.onsuccess = () => resolve(r.result);
          });
          db.close();
          return v;
        });
        assert.equal(value, "PRODUCTION-IDB-SENTINEL");
      },
    );
    await check(
      "WebGL-disabled fallback leaves collection, filters and previews usable",
      async () => {
        const fallback = await browser.newContext({
          viewport: { width: 390, height: 844 },
          reducedMotion: "reduce",
        });
        await fallback.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (String(type).startsWith("webgl")) return null;
            return original.call(this, type, ...args);
          };
        });
        const q = await fallback.newPage();
        await q.goto(base);
        await q.waitForFunction(() => window.astravaLab?.error());
        assert.ok(await q.locator("#sceneFallback").isVisible());
        assert.equal(await q.locator(".anime-card").count(), 18);
        await q.locator(".anime-card").first().click();
        assert.ok(await q.locator("#preview").evaluate((n) => n.open));
        await fallback.close();
      },
    );
    assert.deepEqual(errors, [], "no JavaScript exceptions");
    assert.deepEqual(csp, [], "no CSP violations");
    assert.ok(
      requests.every(
        (url) =>
          new URL(url).origin === new URL(base).origin ||
          url.startsWith("data:") ||
          url.startsWith("blob:"),
      ),
      "all assets are local",
    );
    fs.writeFileSync(
      path.join(out, "browser-results.json"),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          browser: browser.version(),
          webgl:
            "Chromium SwiftShader software renderer; not a hardware performance guarantee",
          results,
          errors,
          csp,
        },
        null,
        2,
      ),
    );
    console.log("RESULT", results.length, "browser groups passed");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
