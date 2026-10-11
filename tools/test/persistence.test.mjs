import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped functions, with controlled storage and encryption timing.
const source = readFileSync(new URL('../../src/app.html', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function save(keepAt)'), source.indexOf('/* ════════════════════ ЗАЩИТА:'));
function harness(overrides = {}) {
  const writes = [], statuses = [];
  const context = vm.createContext({
    readOnly: false, locked: false, cryptoKey: null, mirrorT: null, idleT: null,
    pendingJson: null, saveRevision: 0, pendingRevision: 0, pendingLocalOk: false,
    pendingEncryption: null, mirrorQueue: Promise.resolve(), mirrorInFlight: 0,
    lastSaveFailure: '', fileHandle: null, filePerm: 'unsupported', publishing: false,
    value: 'initial', lastSavedAt: null,
    envelope() { return { savedAt: new Date().toISOString(), state: { value: context.value } }; },
    writeLocal(payload) { writes.push(['local', payload]); return true; },
    idb: { async set(key, payload) { writes.push(['idb', payload]); } },
    async writeToFile(payload) { writes.push(['file', payload]); return false; },
    async encryptText(payload) { return JSON.stringify({ enc: 1, data: payload }); },
    looksEncrypted(payload) { return JSON.parse(payload).enc === 1; },
    saveStatus(kind, text) { statuses.push({ kind, text }); },
    setTimeout() { return 0; }, clearTimeout() {},
    idleStatus() {}, toast() {}, pubStatus() {}, hasUnpublished() { return true; }, renderIoRows() {},
    ...overrides
  });
  vm.runInContext(functions, context);
  return { context, writes, statuses };
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));

test('ordinary save is synchronous locally; mirrors preserve the same snapshot', async () => {
  const { context: c, writes } = harness(); c.value = 'latest'; assert.equal(c.save(), true);
  assert.equal(JSON.parse(writes[0][1]).state.value, 'latest');
  await c.flushMirrors(); assert.deepEqual(writes.map(w => w[0]), ['local', 'idb', 'file']);
  assert.equal(JSON.parse(writes[1][1]).state.value, JSON.parse(writes[2][1]).state.value);
});

test('late older encryption cannot overwrite the latest edit', async () => {
  const older = deferred(), latest = deferred();
  const { context: c, writes } = harness({ cryptoKey: {}, encryptText(text) { return JSON.parse(text).state.value === 'older' ? older.promise : latest.promise; } });
  c.value = 'older'; c.save(); c.value = 'latest'; c.save();
  latest.resolve('{"enc":1,"data":"latest"}'); await tick();
  older.resolve('{"enc":1,"data":"older"}'); await tick(); await c.flushMirrors();
  assert.deepEqual(writes.filter(w => w[0] === 'local').map(w => JSON.parse(w[1]).data), ['latest']);
  assert.equal(JSON.parse(writes.find(w => w[0] === 'file')[1]).data, 'latest');
});

test('flush waits for encryption and never sends plaintext to mirrors', async () => {
  const encryption = deferred();
  const { context: c, writes } = harness({ cryptoKey: {}, encryptText() { return encryption.promise; } });
  c.save(); const flushing = c.flushMirrors(); await tick(); assert.equal(writes.length, 0);
  encryption.resolve('{"enc":1,"data":"ciphertext"}'); await flushing;
  assert.ok(writes.length === 3 && writes.every(w => JSON.parse(w[1]).enc === 1));
});

test('disabling encryption invalidates an outstanding encrypted save', async () => {
  const encryption = deferred();
  const { context: c, writes } = harness({ cryptoKey: {}, encryptText() { return encryption.promise; } });
  c.save(); c.cryptoKey = null; c.value = 'unlocked latest'; c.save();
  encryption.resolve('{"enc":1,"data":"stale ciphertext"}'); await tick(); await c.flushMirrors();
  assert.ok(writes.every(w => JSON.parse(w[1]).state.value === 'unlocked latest'));
});

test('slow mirror writes are serialized and the file finishes with the newest edit', async () => {
  const first = deferred(), fileValues = []; let concurrent = 0, maxConcurrent = 0;
  const { context: c } = harness({ fileHandle: {}, filePerm: 'granted', async writeToFile(payload) {
    concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
    const value = JSON.parse(payload).state.value;
    if (value === 'older') await first.promise;
    fileValues.push(value); concurrent--; return true;
  } });
  c.value = 'older'; c.save(); const oldFlush = c.flushMirrors(); await tick();
  c.value = 'latest'; c.save(); const newFlush = c.flushMirrors(); await tick();
  assert.equal(maxConcurrent, 1); first.resolve(); await Promise.all([oldFlush, newFlush]);
  assert.deepEqual(fileValues, ['older', 'latest']); assert.equal(maxConcurrent, 1);
});

test('complete storage failure remains a warning and can be retried', async () => {
  const { context: c, statuses } = harness({ writeLocal() { return false; }, idb: { async set() { throw Error('unavailable'); } } });
  c.save(); await c.flushMirrors(); assert.equal(statuses.at(-1).kind, 'warn'); assert.match(statuses.at(-1).text, /Не удалось сохранить/);
  assert.ok(c.pendingJson); c.idb.set = async () => {}; await c.flushMirrors();
  assert.equal(statuses.at(-1).kind, 'saved'); assert.match(statuses.at(-1).text, /IndexedDB/);
});

test('file failure is reported while successful browser storage is retained', async () => {
  const { context: c, statuses } = harness({ fileHandle: {}, filePerm: 'granted' });
  c.save(); await c.flushMirrors(); assert.equal(statuses.at(-1).kind, 'warn'); assert.match(statuses.at(-1).text, /Файл не обновлён/);
});

test('read-only and locked lists never write', async () => {
  for (const flag of ['readOnly', 'locked']) { const { context: c, writes } = harness({ [flag]: true }); assert.equal(c.save(), false); await c.flushMirrors(); assert.equal(writes.length, 0); }
});

for (const name of ['data.json', 'anime-tierlist-2026-10-11.json']) {
  test(`${name}: schema, IDs, nextUid, reactions and real calendar dates`, () => {
    const env = JSON.parse(readFileSync(new URL('../../' + name, import.meta.url), 'utf8')), state = env.state;
    assert.equal(state.schema, 4); assert.ok(Number.isFinite(Date.parse(env.savedAt)));
    const tierIds = new Set(), ids = new Set();
    for (const tier of state.tiers) {
      assert.ok(tier.id && !tierIds.has(tier.id)); tierIds.add(tier.id);
      for (const item of tier.items) {
        assert.ok(Number.isInteger(item.uid) && item.uid > 0 && !ids.has(item.uid)); ids.add(item.uid);
        assert.ok(typeof item.name === 'string' && item.name.trim());
        assert.ok(item.reaction == null || ['heart','goldheart','bolt','fire','star'].includes(item.reaction));
        const records = typeof item.watched === 'string' ? (item.watched ? [{ date: item.watched }] : []) : item.watched || [];
        for (const entry of records) {
          const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(entry.date); assert.ok(match, item.name);
          const [day, month, year] = match.slice(1).map(Number), date = new Date(year, month - 1, day);
          assert.equal(date.getFullYear(), year); assert.equal(date.getMonth(), month - 1); assert.equal(date.getDate(), day);
        }
      }
    }
    assert.ok(state.nextUid > Math.max(...ids));
  });
}

test('password transitions cannot copy an unconverted previous state into the backup', () => {
  const localFunction = source.slice(source.indexOf('function writeLocal(payload)'), source.indexOf('function save(keepAt)'));
  const store = new Map([['main', '{"state":"plain previous"}'], ['backup', '{"enc":1,"data":"protected backup"}']]);
  const context = vm.createContext({ LS_KEY:'main', LS_BAK:'backup', localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}, looksEncrypted:s=>JSON.parse(s).enc===1 });
  vm.runInContext(localFunction,context);
  context.writeLocal('{"enc":1,"data":"protected current"}');
  assert.equal(JSON.parse(store.get('backup')).enc,1);
  store.set('backup','{"state":"decrypted backup"}');
  context.writeLocal('{"state":"plain current"}');
  assert.equal(JSON.parse(store.get('backup')).state,'decrypted backup');
  context.writeLocal('{"state":"next plain"}');
  assert.equal(JSON.parse(store.get('backup')).state,'plain current');
});
