import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { REACTION_KEYS } from "../../site/src/reactions.mjs";
import { validateState } from "../../site/src/security.mjs";
const source = readFileSync(
  new URL("../../src/app.html", import.meta.url),
  "utf8",
);
function harness() {
  const c = vm.createContext({
    localStorage: { getItem: () => null },
    readOnly: false,
    serverMode: false,
    viewSlug: null,
    location: { pathname: "/myTierAnime/" },
    esc: (s) => String(s).replaceAll('"', "&quot;"),
  });
  vm.runInContext(
    source.slice(
      source.indexOf("/* Original Neko sticker reactions."),
      source.indexOf("/* animate a number"),
    ),
    c,
  );
  return c;
}
test("138 anime stickers and twelve compatible aliases retain five legacy keys and match server/client validation", () => {
  const c = harness(),
    order = JSON.parse(vm.runInContext("JSON.stringify(RX_ORDER)", c));
  assert.deepEqual(order, REACTION_KEYS);
  const client = JSON.parse(source.match(/const RX_KEYS = (\[[^;]+\]);/)[1]);
  assert.deepEqual(client, REACTION_KEYS);
  const indices = vm.runInContext(
    "STICKER_ORDER.map(k=>{const r=REACTIONS[k];return r.sheet+':'+r.row+':'+r.col})",
    c,
  );
  assert.equal(new Set(indices).size, 138);
  assert.equal(vm.runInContext("STICKER_PACKS.length", c),19);
  for (const pack of JSON.parse(vm.runInContext("JSON.stringify(STICKER_PACKS)", c))) {
    assert.equal(vm.runInContext(`STICKER_ORDER.filter(k=>REACTIONS[k].pack===${JSON.stringify(pack.id)}).length`, c),pack.moods?12:6);
    assert.equal(c.reactionMood(pack.id+"-cry"), "cry");
  }
  for (const key of REACTION_KEYS) {
    assert.equal(c.reactionKey({ reaction: key, fav: false }), key);
    assert.ok(
      c.reactionHtml({ reaction: key, fav: false }).includes("cat-sticker"),
    );
  }
});
test("explicit favourites and reactions stay independent, including cleared reactions", () => {
  const c = harness();
  assert.equal(c.reactionKey({ reaction: "cry", fav: false }), "cry");
  assert.equal(c.reactionKey({ reaction: null, fav: true }), null);
  assert.equal(c.reactionKey({ fav: true }), "heart");
  assert.equal(c.reactionKey({ fav: false }), null);
});
test("prototype names and invalid reaction values never become HTML or sticker keys", () => {
  const c = harness();
  for (const value of [
    "constructor",
    "__proto__",
    "toString",
    "<img src=x onerror=alert(1)>",
    42,
    {},
    null,
  ]) {
    assert.equal(c.validReaction(value), false);
    assert.equal(c.reactionHtml({ reaction: value, fav: false }), "");
  }
});
test("personal reactions override only a read-only list and never change author data", () => {
  const c = harness(),
    item = { uid: 68, name: "История", reaction: null, fav: false };
  c.fixture = item;
  vm.runInContext(
    'readOnly=true;personalReactions[personalReactionKey(fixture)]="cozy"',
    c,
  );
  assert.equal(c.displayReactionKey(item), "cozy");
  assert.equal(item.reaction, null);
  assert.equal(item.fav, false);
  vm.runInContext("readOnly=false", c);
  assert.equal(c.displayReactionKey(item), null);
  vm.runInContext('readOnly=true;location.pathname="/another/"', c);
  assert.equal(c.displayReactionKey(item), null);
});
test("explicit personal removal hides an author mark; deleting override restores it", () => {
  const c = harness(),
    item = { uid: 1, name: "История", reaction: "heart", fav: true };
  c.fixture = item;
  vm.runInContext(
    "readOnly=true;personalReactions[personalReactionKey(fixture)]=null",
    c,
  );
  assert.equal(c.displayReactionKey(item), null);
  vm.runInContext("delete personalReactions[personalReactionKey(fixture)]", c);
  assert.equal(c.displayReactionKey(item), "heart");
});
test("server accepts all sticker reactions with either favourite state and rejects unknown values", () => {
  const state = {
    tiers: [
      {
        id: "A",
        label: "Хорошо",
        items: [
          {
            uid: 1,
            name: "История",
            cover: "",
            reaction: null,
            fav: false,
            watched: [{ date: "14.10.2026", label: "" }],
          },
        ],
      },
    ],
    nextUid: 2,
  };
  for (const reaction of REACTION_KEYS)
    for (const fav of [false, true]) {
      Object.assign(state.tiers[0].items[0], { reaction, fav });
      assert.equal(validateState(state), null, reaction);
    }
  state.tiers[0].items[0].reaction = "fake";
  assert.equal(validateState(state), "Неизвестная реакция");
  state.tiers[0].items[0].reaction = "cozy";
  state.tiers[0].items[0].fav = "yes";
  assert.equal(validateState(state), "Неправильная отметка избранного");
});

test("all 67 anime receive distinct decorative stickers without replacing saved impressions",()=>{
 const data=JSON.parse(readFileSync(new URL("../../data.json",import.meta.url),"utf8"));
 const items=data.state.tiers.flatMap(t=>t.items);assert.equal(items.length,67);
 assert.equal(new Set(items.map(i=>i.sticker)).size,67);
 for(const i of items)assert.ok(REACTION_KEYS.includes(i.sticker));
 const copy=structuredClone(data.state);copy.tiers[0].items[0].sticker="constructor";
 assert.equal(validateState(copy),"Неизвестный стикер");
});
