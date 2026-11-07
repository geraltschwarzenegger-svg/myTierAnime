import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  parseCollection,
  validateCollection,
  safeDate,
  durationMinutes,
  itemMinutes,
  collectionMinutes,
  minutesLabel,
  allAnime,
  LAB_PREFIX,
} from "../src/data";
import { inspectGlb } from "../src/glb";
import { makeSculpture } from "../src/models";
import { TIER_ORDER } from "../src/data";
const read = (p: string) =>
  readFileSync(new URL("../" + p, import.meta.url), "utf8");
const baseline = JSON.parse(read("docs/baseline.json"));
const data = parseCollection(read("public/collection.json"));
test("published baseline has 69 anime, all exact original records and a valid nextUid", () => {
  assert.equal(
    createHash("sha256").update(read("public/collection.json")).digest("hex"),
    baseline.dataSha256,
  );
  assert.equal(allAnime(data).length, 69);
  assert.equal(collectionMinutes(data), 41167);
  assert.deepEqual(
    data.state.tiers.map((t) => [t.id, t.items.length]),
    [
      ["S", 15],
      ["A", 23],
      ["B", 16],
      ["C", 15],
    ],
  );
  const g = allAnime(data).find((a) => a.uid === 71)!;
  assert.equal(g.name, "Убийца гоблинов");
  assert.equal(g.watched[0].date, "03.07.2026");
});
test("validation returns an independent clone instead of modifying the published object", () => {
  const copy = validateCollection(data);
  copy.state.tiers[0].items[0].name = "Изменено";
  assert.notEqual(
    copy.state.tiers[0].items[0].name,
    data.state.tiers[0].items[0].name,
  );
});
test("invalid JSON, duplicate anime and tiers, bad dates and dangerous image URLs are rejected", () => {
  assert.throws(() => parseCollection("{"));
  assert.throws(() => parseCollection(" ".repeat(2 * 1024 * 1024 + 1)));
  for (const edit of [
    (d: typeof data) => {
      d.state.tiers[1].id = "S";
    },
    (d: typeof data) => {
      d.state.tiers[0].items[0].uid = d.state.tiers[0].items[1].uid;
    },
    (d: typeof data) => {
      d.state.nextUid = 1;
    },
    (d: typeof data) => {
      d.state.tiers[0].items[0].watched[0].date = "31.02.2026";
    },
    (d: typeof data) => {
      d.state.tiers[0].items[0].cover = "javascript:alert(1)";
    },
  ]) {
    const d = structuredClone(data);
    edit(d);
    assert.throws(() => validateCollection(d));
  }
});
test("real calendar days and leap years are validated", () => {
  assert.ok(safeDate("29.02.2024"));
  for (const d of [
    "29.02.2026",
    "31.04.2026",
    "00.01.2026",
    "01.13.2026",
    "1.07.2026",
    "01.01.1800",
  ])
    assert.equal(safeDate(d), false);
});
test("unknown, explicit zero and invalid watch durations remain different", () => {
  assert.equal(durationMinutes(undefined), null);
  assert.equal(durationMinutes({ mode: "total", minutes: 0 }), 0);
  assert.equal(durationMinutes({ mode: "total", minutes: -1 }), null);
  assert.equal(
    durationMinutes({ mode: "episodes", episodes: 12, episodeMinutes: 23 }),
    276,
  );
  assert.equal(
    durationMinutes({ mode: "episodes", episodes: 1e9, episodeMinutes: 23 }),
    null,
  );
});
test("overall override replaces season sums and manual hours format correctly", () => {
  const item = structuredClone(data.state.tiers[0].items[0]);
  item.watched = [
    {
      label: "1",
      date: "01.01.2026",
      duration: { mode: "total", basis: "manual", minutes: 100 },
    },
    {
      label: "2",
      date: "02.01.2026",
      duration: { mode: "total", basis: "manual", minutes: 200 },
    },
  ];
  item.watchTotal = { mode: "total", basis: "manual", minutes: 500 };
  assert.equal(itemMinutes(item), 500);
  delete item.watchTotal;
  assert.equal(itemMinutes(item), 300);
  assert.equal(minutesLabel(263), "4 ч 23 мин");
  assert.equal(minutesLabel(null), "Время не указано");
});
test("local covers match all saved URLs and have real WebP headers", () => {
  const manifest = JSON.parse(read("public/covers.json")).items;
  for (const a of allAnime(data)) {
    const c = manifest.find((c: { uid: number }) => c.uid === a.uid);
    assert.equal(c.originalUrl, a.cover);
    const buf = readFileSync(
      new URL("../public/covers/" + c.file.split("/").pop(), import.meta.url),
    );
    assert.equal(buf.subarray(0, 4).toString(), "RIFF");
    assert.equal(buf.subarray(8, 12).toString(), "WEBP");
  }
});
test("every tier has an exportable GLB with only a few merged draw objects", () => {
  for (const tier of TIER_ORDER) {
    const model = makeSculpture(tier);
    assert.ok(model.stats.meshes <= 3);
    assert.ok(model.stats.triangles > 2000 && model.stats.triangles < 20000);
    assert.ok(model.root.children.length);
    model.dispose();
    const bytes = readFileSync(
      new URL("../public/models/" + tier + ".glb", import.meta.url),
    );
    inspectGlb(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
  }
});
function glb(json: object) {
  const raw = new TextEncoder().encode(JSON.stringify(json)),
    n = Math.ceil(raw.length / 4) * 4,
    b = new ArrayBuffer(20 + n),
    v = new DataView(b);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, b.byteLength, true);
  v.setUint32(12, n, true);
  v.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(b, 20, n).fill(32);
  new Uint8Array(b, 20, raw.length).set(raw);
  return b;
}
test("GLB import blocks malformed files, external resources and oversized accessors", () => {
  assert.throws(() => inspectGlb(new ArrayBuffer(5)));
  assert.throws(() =>
    inspectGlb(glb({ buffers: [{ uri: "https://example.org/secret" }] })),
  );
  assert.throws(() =>
    inspectGlb(glb({ images: [{ uri: "data:image/svg+xml,evil" }] })),
  );
  assert.throws(() => inspectGlb(glb({ accessors: [{ count: 2000000 }] })));
  assert.throws(() =>
    inspectGlb(glb({ extensionsRequired: ["KHR_draco_mesh_compression"] })),
  );
});
test("new UI and compatibility copy use independent storage namespaces", () => {
  assert.equal(LAB_PREFIX, "astrava-lab:v1:");
  const legacy = read("public/classic/index.html");
  assert.ok(legacy.includes("astrava-lab:classic:"));
  assert.ok(
    legacy.indexOf("Storage.prototype") < legacy.indexOf("const LS_KEY"),
  );
  assert.ok(legacy.includes("indexedDB.open=function"));
  assert.ok(legacy.includes("Content-Security-Policy"));
});
