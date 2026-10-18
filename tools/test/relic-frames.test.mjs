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
const frame = (tier, rank, uid, mode = "card", design = null) =>
  context.buildRelicFrame(tier, rank, uid, mode, design);
const designs = vm.runInContext("RELIC_DESIGNS", context);
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
test("50 named frame models have individual palettes, unique botanical silhouettes and one lightweight SVG", () => {
  assert.equal(designs.length, 50);
  assert.equal(new Set(designs.map((d) => d.name)).size, 50);
  assert.equal(new Set(designs.map((d) => d.mid + d.gem + d.light)).size, 50);
  const silhouettes = new Set();
  for (const d of designs) {
    const f = frame(d.theme, d.variant, 100 + d.id, "gallery", d.id);
    validateReferences(f);
    assert.equal((f.match(/<svg /g)||[]).length,1,"one SVG per frame");
    for(const region of ["bf-crest","bf-left","bf-right","bf-foot","bf-stone","bf-metal"])assert.ok(f.includes(region),d.name+" "+region);
    for (const colour of [d.light, d.mid, d.dark, d.gem])
      assert.match(colour, /^#[a-f0-9]{6}$/i);
    const crest = vm.runInContext(
      `botanicalGeometry(RELIC_DESIGNS[${d.id}], .5)`,
      context,
    );
    silhouettes.add(crest);
    assert.ok(f.includes(`data-model="${d.id}"`));
  }
  assert.equal(
    silhouettes.size,
    50,
    "each design has different crest geometry, beyond recolouring",
  );
});
test("automatic frames expose all 50 models in the current collection", () => {
  const { state } = JSON.parse(
    readFileSync(new URL("../../data.json", import.meta.url), "utf8"),
  );
  const used = new Set(
    state.tiers.flatMap((t) =>
      t.items.map(
        (item, rank) =>
          frame(t.id, rank, item.uid).match(/data-model="(\d+)"/)[1],
      ),
    ),
  );
  assert.equal(used.size, 50);
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

test("explicit choice, individual choice and collection choice have stable precedence; invalid choices fall back", () => {
  try {
    vm.runInContext(
      'framePreferences = { all: 49, items: { "61": 4, "27": "<img onerror=x>" } }',
      context,
    );
    assert.ok(frame("S", 14, 61).includes('data-model="4"'));
    assert.ok(frame("S", 14, 61, "preview").includes('data-model="4"'));
    assert.ok(frame("S", 14, 61, "gallery", 20).includes('data-model="20"'));
    assert.ok(frame("B", 0, 27).includes('data-model="49"'));
    vm.runInContext("framePreferences.all = 50", context);
    assert.ok(frame("B", 0, 27).includes('data-model="26"'));
    validateReferences(frame("S", Infinity, Infinity));
  } finally {
    vm.runInContext(
      "framePreferences = {all:null, items:Object.create(null)}",
      context,
    );
  }
});
