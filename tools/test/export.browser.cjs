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
    await p.emulateMedia({reducedMotion:'reduce'});
    const result=p.waitForEvent('download',{timeout:180000});await p.locator('#exportBtn').evaluate(el=>el.click());const download=await result;
    const dir='/workspace/artifacts/myTierAnime/bloom';fs.mkdirSync(dir,{recursive:true});await download.saveAs(dir+'/collection.png');
    const png=fs.readFileSync(dir+'/collection.png');assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.readUInt32BE(16)>2000&&png.readUInt32BE(20)>5000);
    await p.waitForFunction(()=>!document.body.classList.contains('exporting'));
    assert.equal(await p.locator('.card .relic-frame-3d svg').count(),67);assert.equal(await p.locator('[data-relic-export]').count(),0);
    assert.ok(await p.locator('.card img').evaluateAll(images=>images.every(img=>img.getAttribute('loading')==='lazy')));
    assert.deepEqual(errors,[]);assert.deepEqual(await p.evaluate(()=>window.cspProblems),[]);
    console.log('Collection PNG PASS:',png.readUInt32BE(16)+'x'+png.readUInt32BE(20),png.length,'bytes; 67 frames and lazy loading restored.');
  } finally {
    await browser.close();
    if (!live) await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
