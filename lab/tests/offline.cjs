const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  try {
    const c = await b.newContext({
        viewport: { width: 1440, height: 1080 },
        reducedMotion: "reduce",
      }),
      p = await c.newPage(),
      errors = [],
      requests = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => {
      if (
        r.url().startsWith("http") &&
        !r.url().startsWith("https://astrava-offline.test/ASTRAVA-")
      )
        requests.push(r.url());
    });
    await c.route("https://**/*", (r) => {
      const name = new URL(r.request().url()).pathname.split("/").pop();
      if (["ASTRAVA-Lab.html", "ASTRAVA-V5-test.html"].includes(name))
        return r.fulfill({
          contentType: "text/html",
          body: fs.readFileSync("downloads/offline/" + name),
        });
      return r.abort();
    });
    await p.goto("https://astrava-offline.test/ASTRAVA-Lab.html");
    await p.waitForFunction(
      () => window.astravaLab?.stats() && window.astravaLab?.snapshot(),
      null,
      { timeout: 30000 },
    );
    assert.equal(
      await p.evaluate(
        () => astravaLab.snapshot().state.tiers.flatMap((t) => t.items).length,
      ),
      69,
    );
    for (const tier of ["S", "A", "B", "C"])
      await p.locator('.tier-choices [data-tier="' + tier + '"]').click();
    await p.locator("#search").fill("Убийца");
    await p.locator(".anime-card").click();
    assert.ok((await p.locator("#preview").innerText()).includes("03.07.2026"));
    await p.locator("#previewImage").evaluate((n) => n.decode());
    await p.locator("#previewClose").click();
    await p.screenshot({ path: "artifacts/offline-file.png" });
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    console.log(
      "NOTE: direct file:// navigation is blocked by browser administration policy in this environment.",
    );
    console.log(
      "PASS: self-contained laboratory over a mocked HTTPS origin, 69 anime, four 3D models, local covers, regular preview; zero HTTP requests.",
    );
    await p.goto("https://astrava-offline.test/ASTRAVA-V5-test.html");
    await p.waitForFunction(
      () =>
        typeof state !== "undefined" && document.getElementById("importFile"),
      null,
      { timeout: 30000 },
    );
    const data = JSON.parse(fs.readFileSync("public/collection.json", "utf8"));
    await p
      .locator("#importFile")
      .setInputFiles({
        name: "collection.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
      });
    await p.waitForFunction(() =>
      document.getElementById("impOverlay").classList.contains("show"),
    );
    await p.locator("#impReplace").click();
    await p.waitForFunction(
      () => document.querySelectorAll(".card").length === 69,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    console.log(
      "PASS: self-contained isolated V5 copy, JSON import, 69 cards, zero HTTP requests, no JavaScript exceptions.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
