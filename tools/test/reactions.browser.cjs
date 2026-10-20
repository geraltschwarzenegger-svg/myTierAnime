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
      window.cspProblems = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        window.cspProblems.push(e.effectiveDirective),
      );
    });
    await p.goto(base, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      () =>
        document.querySelectorAll(".card").length === 67 &&
        document.body.classList.contains("read-only"),
    );
    await p.evaluate(() => document.fonts.ready);
    const original = await p.evaluate(() => JSON.stringify(state));
    assert.equal(await p.locator("#impressionRail [data-mood]").count(), 14);
    const card = p.locator('.card[data-uid="68"]');
    await card.click();
    await p.locator("#previewReaction").click();
    await p.waitForFunction(
      () => document.getElementById("reactionDialog").open,
    );
    assert.equal(await p.locator("#nekoOptions [data-rx]").count(), 12);
    assert.equal(await p.locator("#nekoPack option").count(),19);
    const packIds=await p.locator("#nekoPack option").evaluateAll(options=>options.map(o=>o.value).filter(v=>v!=="cats"));
    const distinct=new Set();
    for(const pack of packIds){
      await p.locator("#nekoPack").selectOption(pack);
      const total=["call-night","dress-up","angel","jujutsu"].includes(pack)?12:6;
      assert.equal(await p.locator("#nekoOptions [data-rx]").count(),total,pack);
      for(const key of await p.locator("#nekoOptions [data-rx]").evaluateAll(bs=>bs.map(b=>b.dataset.rx)))distinct.add(key);
      assert.equal(await p.locator("#nekoOptions .cat-sticker").first().evaluate(el=>getComputedStyle(el).backgroundSize),total===12?"400% 300%":"600% 500%");
      await p.locator("#nekoMood").selectOption("cry");
      assert.equal(await p.locator("#nekoOptions [data-rx]").count(),1);
      await p.locator("#nekoMood").selectOption("cozy");
      assert.equal(await p.locator("#nekoOptions [data-rx]").count(),total===12?1:0);
      if(total===6)assert.ok(await p.locator("#nekoOptions .sticker-empty").isVisible());
      await p.locator("#nekoMood").selectOption("all");
    }
    assert.equal(distinct.size,138);
    if(shots){
      for(const [pack,mood,name] of [["s-oshi","cry","bloom-oshi"],["s-mushoku","heart","bloom-mushoku"],["s-franxx","heart","bloom-franxx"]]){
        await p.locator("#nekoPack").selectOption(pack);
        await p.locator(`#nekoOptions [data-rx="${pack}-${mood}"]`).click();
        await p.locator("#reactionDialog").screenshot({ animations:"disabled",path:path.join(root,`docs/images/${name}.png`)});
      }
    }
    await p.locator("#nekoPack").selectOption("dress-up");
    await p.locator('#nekoOptions [data-rx="dress-up-cozy"]').click();

    await p.locator('#nekoOptions [data-rx="dress-up-cry"]').click();
    await p.locator("#nekoSave").click();
    await p.waitForFunction(
      () =>
        !document.getElementById("reactionDialog").open &&
        document.getElementById("preview").classList.contains("show"),
    );
    assert.equal(
      await card.locator(".neko-mark").getAttribute("data-reaction"),
      "dress-up-cry",
    );
    assert.equal(await card.locator(".fav-mark").count(), 0);
    assert.equal(
      await p.evaluate(() => JSON.stringify(state)),
      original,
      "public personal reactions do not mutate author state",
    );
    assert.equal(
      await p.locator("#previewReactionLabel").textContent(),
      "До слёз · Марин",
    );
    if (shots)
      await p
        .locator("#preview")
        .screenshot({ animations:"disabled", path: path.join(root, "docs/images/bloom-reaction-preview.png") });
    await p.locator("#previewReaction").click();
    await p.locator('#nekoOptions [data-rx="dress-up-angry"]').click();
    await p.locator("#nekoCancel").click();
    await p.waitForFunction(
      () => !document.getElementById("reactionDialog").open,
    );
    assert.equal(
      await card.locator(".neko-mark").getAttribute("data-reaction"),
      "dress-up-cry",
      "cancel keeps current reaction",
    );
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      () =>
        document.querySelectorAll(".card").length === 67 &&
        document.body.classList.contains("read-only"),
    );
    assert.equal(
      await card.locator(".neko-mark").getAttribute("data-reaction"),
      "dress-up-cry",
      "personal sticker persists",
    );
    await p.locator('#impressionRail [data-mood="cry"]').click();
    assert.equal(await p.locator("#board .card:visible").count(), 1);
    await p.locator("#searchInput").fill("точно нет такого названия");
    await p.locator("#memoryPick").click();
    assert.equal(await p.locator("#preview").isVisible(), false);
    await p.locator("#searchInput").fill("");
    await p.locator("#memoryPick").click();
    assert.ok(
      (await p.locator("#previewTitle").textContent()).includes("Я влюбился"),
    );
    await p.keyboard.press("Escape");
    await p.locator("#impressionClear").click();
    if (shots) {
      await p.locator(".impressions").scrollIntoViewIfNeeded();
      await p
        .locator(".impressions")
        .screenshot({ animations:"disabled",
          path: path.join(root, "docs/images/bloom-impressions.png"),
        });
    }
    for (const width of [320, 390, 768, 1440]) {
      await p.setViewportSize({ width, height: 844 });
      await card.scrollIntoViewIfNeeded();
      await p.waitForFunction(() => {
        const c = document.querySelector('.card[data-uid="68"]'),
          r = c.querySelector(".neko-mark").getBoundingClientRect(),
          n = c.querySelector(".nm").getBoundingClientRect();
        return r.bottom <= n.top - 4;
      });
      const bounds = await card.evaluate((el) => {
        const r = el.querySelector(".neko-mark").getBoundingClientRect(),
          c = el.getBoundingClientRect();
        return {
          left: r.left - c.left,
          right: r.right - c.right,
          top: r.top - c.top,
        };
      });
      assert.ok(
        bounds.left >= 0 && bounds.right <= 0 && bounds.top >= 24,
        "sticker clear of caption/rank at " + width,
      );
      await card.locator(".neko-mark").click();
      await p.locator("#previewReaction").click();
      assert.ok(
        await p
          .locator("#reactionDialog")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        "no dialog overflow " + width,
      );
      await p.locator("#nekoPack").selectOption("s-oshi");
      await p.locator('#nekoOptions [data-rx="s-oshi-cry"]').click();
      assert.ok(await p.locator("#reactionDialog").evaluate(el=>el.scrollWidth<=el.clientWidth+1),"anime pack fits "+width);
      if (shots && width === 390)
        await p.screenshot({ animations:"disabled",
          path: path.join(root, "docs/images/bloom-mobile-stickers.png"),
        });
      await p.keyboard.press("Escape");
      await p.waitForFunction(
        () =>
          !document.getElementById("reactionDialog").open &&
          document.getElementById("preview").classList.contains("show"),
      );
      await p.keyboard.press("Escape");
    }
    await p.locator('#viewSeg [data-view="chips"]').click();
    assert.equal(
      await p
        .locator('.chip[data-uid="68"] .neko-mark')
        .getAttribute("data-reaction"),
      "dress-up-cry",
    );
    await p.locator('.chip[data-uid="68"] .neko-mark').click();
    await p.locator("#previewReaction").click();
    await p.locator("#nekoPack").selectOption("s-mushoku");
    await p.locator('#nekoOptions [data-rx="s-mushoku-fire"]').click();
    await p.locator("#nekoSave").click();
    await p.waitForFunction(()=>!document.getElementById("reactionDialog").open&&document.getElementById("preview").classList.contains("show"));
    assert.equal(await p.locator('.chip[data-uid="68"] .neko-mark').getAttribute("data-reaction"),"s-mushoku-fire");
    await p.keyboard.press("Escape");
    await p.waitForFunction(()=>!document.getElementById("preview").classList.contains("show"));
    await p.locator(".impressions").evaluate(el=>el.scrollIntoView({block:"center",behavior:"instant"}));
    await p.locator('#impressionRail [data-mood="fire"]').click();
    assert.ok(await p.locator('.chip[data-uid="68"]').isVisible(),"anime characters share the emotion filter with cats");
    await p.reload({waitUntil:"domcontentloaded"});
    await p.waitForFunction(()=>document.querySelectorAll(".chip").length===67);
    assert.equal(await p.locator('.chip[data-uid="68"] .neko-mark').getAttribute("data-reaction"),"s-mushoku-fire");
    await p.locator('.chip[data-uid="68"]').click();
    await p.locator("#previewReaction").click();
    assert.equal(await p.locator("#nekoPack").inputValue(),"s-mushoku");
    await p.locator("#nekoResetPersonal").click();
    await p.waitForFunction(
      () => !document.getElementById("reactionDialog").open,
    );
    assert.equal(await p.locator('.chip[data-uid="68"] .neko-mark').getAttribute("data-sticker-kind"),"decoration");
    assert.deepEqual(errors, []);
    assert.deepEqual(await p.evaluate(() => window.cspProblems), []);
    console.log(
      "Public reactions PASS: 138 stickers in 19 anime packs, 67 decorative poster stickers, emotion filtering and anime roundtrip, private save/cancel/remove/reset, unchanged author JSON, reload, mood/search filters, random memory, four sizes, chip view, caption placement, CSP.",
    );
    if (!live) {
      const own = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        reducedMotion: "reduce",
      });
      await own.route("https://**/*", (r) =>
        r.fulfill({ contentType: "image/jpeg", body: fallback }),
      );
      await own.route("**/data.json*", (r) =>
        r.fulfill({ status: 404, body: "" }),
      );
      await own.addInitScript((data) => {
        if (!localStorage.getItem("anime-tierlist-v2"))
          localStorage.setItem("anime-tierlist-v2", JSON.stringify(data));
      }, snapshot);
      const op = await own.newPage();
      op.on("pageerror", (e) => errors.push(e.message));
      await op.goto(base, { waitUntil: "domcontentloaded" });
      await op.waitForFunction(
        () =>
          document.querySelectorAll(".card").length === 67 &&
          !document.body.classList.contains("read-only"),
      );
      await op.locator('.card[data-uid="68"]').click();
      await op.locator("#previewReaction").click();
      await op.locator("#nekoPack").selectOption("s-mushoku");
      await op.locator('#nekoOptions [data-rx="s-mushoku-heart"]').click();
      await op.locator("#nekoFavourite").check();
      await op.locator("#nekoSave").click();
      await op.waitForFunction(
        () => !document.getElementById("reactionDialog").open,
      );
      assert.equal(await op.evaluate(() => findItem(68).item.reaction), "s-mushoku-heart");
      assert.equal(await op.evaluate(() => findItem(68).item.fav), true);
      await op.reload({ waitUntil: "domcontentloaded" });
      await op.waitForFunction(
        () => document.querySelectorAll(".card").length === 67,
      );
      assert.equal(await op.evaluate(() => findItem(68).item.reaction), "s-mushoku-heart");
      const download = op.waitForEvent("download");
      await op.locator("#ioExport").evaluate((el) => el.click());
      const d = await download;
      const exported = JSON.parse(fs.readFileSync(await d.path(), "utf8"));
      const item = exported.state.tiers
        .flatMap((t) => t.items)
        .find((i) => i.uid === 68);
      assert.equal(item.reaction, "s-mushoku-heart");
      assert.equal(item.fav, true);
      assert.equal(
        await op.evaluate(
          (env) =>
            normalizeState(env)
              .tiers.flatMap((t) => t.items)
              .find((i) => i.uid === 68).reaction,
          exported,
        ),
        "s-mushoku-heart",
      );
      await op.locator('.card[data-uid="68"]').click();
      await op.locator("#previewReaction").click();
      await op.locator("#nekoPack").selectOption("dress-up");
      await op.locator('#nekoOptions [data-rx="dress-up-cry"]').click();
      await op.locator("#nekoFavourite").uncheck();
      await op.locator("#nekoSave").click();
      await op.waitForFunction(
        () => !document.getElementById("reactionDialog").open,
      );
      await op.keyboard.press("Escape");
      await op.locator("#favBtn").click();
      assert.equal(
        await op.locator('.card[data-uid="68"]').isVisible(),
        false,
        "crying sticker is independent of favourites",
      );
      await op.locator("#favBtn").click();
      await op.evaluate(() => {
        findItem(68).item.watched = [];
        render();
      });
      await op.locator('.card[data-uid="68"]').click();
      assert.equal(
        await op.locator("#previewReaction").isDisabled(),
        true,
        "unwatched anime cannot receive a reaction",
      );
      await op.keyboard.press("Escape");
      await op.locator("#editBtn").click();
      await op.locator('.card[data-uid="68"]').click();
      await op.locator("#mSave").click();
      assert.equal(
        await op
          .locator("#overlay")
          .evaluate((el) => el.classList.contains("show")),
        true,
        "editor requires a date before accepting a reaction",
      );
      await op.locator("#fReactionPack").selectOption("s-oshi");
      await op.locator('#fReaction [data-rx="s-oshi-cry"]').click();
      await op.locator("#fReactionMood").selectOption("cry");
      assert.equal(await op.locator("#fReaction [data-rx]").count(),1);
      await op.locator("#fReactionPack").selectOption("s-franxx");
      assert.ok((await op.locator("#fReactionSelected").textContent()).includes("Аканэ"),"browsing packs preserves the pending selection");
      await op.locator("#fReactionClear").click();
      await op.locator("#mSave").click();
      assert.deepEqual(errors, []);
      console.log(
        "Own collection PASS: reaction/favourite save independently, reload, portable JSON export and normalised import.",
      );
    }
  } finally {
    await browser.close();
    if (!live) await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
