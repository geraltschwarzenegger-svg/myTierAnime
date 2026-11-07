const fs = require("node:fs"),
  { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 1080 } });
    await p.goto(process.env.LAB_URL || "http://127.0.0.1:4173/");
    await p.waitForFunction(() => window.astravaLab?.stats());
    await p.locator("#motion").check();
    const records = [];
    for (const mode of ["auto", "low", "high"]) {
      await p.locator("#quality").selectOption(mode);
      await new Promise((r) => setTimeout(r, 1200));
      const a = await p.evaluate(() => ({
        frames: astravaLab.stats().frames,
        time: performance.now(),
      }));
      await new Promise((r) => setTimeout(r, 4000));
      const z = await p.evaluate(() => ({
        stats: astravaLab.stats(),
        time: performance.now(),
      }));
      records.push({
        mode,
        measuredFps:
          Math.round(
            ((z.stats.frames - a.frames) / (z.time - a.time)) * 10000,
          ) / 10,
        stats: z.stats,
      });
    }
    await p.locator("#motion").uncheck();
    await new Promise((r) => setTimeout(r, 300));
    const before = await p.evaluate(() => astravaLab.stats().frames);
    await new Promise((r) => setTimeout(r, 1500));
    const after = await p.evaluate(() => astravaLab.stats().frames);
    const report = {
      date: new Date().toISOString(),
      browser: b.version(),
      device:
        "1440×1080, headless Chromium, SwiftShader software GPU in cloud environment",
      method:
        "After 1.2 s warmup, count completed scene frames over ~4 s. Not a hardware GPU prediction.",
      records,
      pausedExtraFrames: after - before,
    };
    fs.writeFileSync(
      "artifacts/benchmark.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
