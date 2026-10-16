import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(
  new URL("../../src/app.html", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
vm.runInContext(
  source.slice(
    source.indexOf("const RELIC_THEMES ="),
    source.indexOf("function accentVars(tier)"),
  ),
  context,
);
const frame = (tier, rank, uid, mode = "card") =>
  context.buildRelicFrame(tier, rank, uid, mode);
function validateReferences(markup) {
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "SVG definition IDs are unique");
  for (const m of markup.matchAll(/url\(#([^\)]+)\)/g))
    assert.ok(ids.includes(m[1]), "gradient exists: " + m[1]);
  assert.ok(
    !markup.includes("@metal") && !markup.includes("@gem"),
    "all material tokens resolved",
  );
}
test("16 distinct frame archetypes include crest, both rails, lower clasp and three relief layers", () => {
  const designs = new Set();
  let uid = 100;
  for (const tier of ["S", "A", "B", "C"])
    for (let rank = 0; rank < 4; rank++) {
      const f = frame(tier, rank, uid++);
      validateReferences(f);
      for (const region of [
        "rf-crest",
        "rf-left",
        "rf-right",
        "rf-foot",
        "rf-main-stone",
        "rf-aura",
        "rf-metal",
        "rf-gems",
      ])
        assert.ok(f.includes(region), tier + " " + rank + " " + region);
      designs.add(f.replace(/rf-\d+-card/g, "rf-ID-card"));
    }
  assert.equal(designs.size, 16);
});
test("frame geometry and energy phase remain deterministic across rerenders", () => {
  assert.equal(frame("B", 3, 61), frame("B", 3, 61));
  const a = frame("B", 2, 27).replaceAll("rf-27-", "rf-ID-");
  const b = frame("B", 2, 28).replaceAll("rf-28-", "rf-ID-");
  assert.notEqual(a, b, "another item has its own ornament");
});
test("preview shows the same ornament as the selected poster with separate SVG identifiers", () => {
  const a = frame("S", 0, 1),
    b = frame("S", 0, 1, "preview");
  assert.equal(
    a
      .replaceAll("rf-1-card", "rf-1-MODE")
      .replace('data-mode="card"', 'data-mode="MODE"'),
    b
      .replaceAll("rf-1-preview", "rf-1-MODE")
      .replace('data-mode="preview"', 'data-mode="MODE"'),
  );
  validateReferences(a + b);
});
test("all current collection posters and one open preview have collision-free gradient references", () => {
  const { state } = JSON.parse(
    readFileSync(new URL("../../data.json", import.meta.url), "utf8"),
  );
  const posters = state.tiers
    .flatMap((t) => t.items.map((item, rank) => frame(t.id, rank, item.uid)))
    .join("");
  validateReferences(
    posters + frame("S", 0, state.tiers[0].items[0].uid, "preview"),
  );
});
test("custom tier names and invalid legacy IDs cannot inject SVG or HTML", () => {
  const f = frame(
    "<img src=x onerror=alert(1)>",
    0,
    '\"><script>alert(1)</script>',
  );
  assert.ok(
    !f.includes("<script") && !f.includes("onerror") && !f.includes("<img"),
  );
  validateReferences(f);
});
