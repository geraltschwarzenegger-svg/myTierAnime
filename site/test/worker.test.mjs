/**
 * Тесты серверной части. Гоняют настоящий Worker: настоящая SQLite вместо D1,
 * перехваченный fetch вместо почтового сервиса. Сети не требуют.
 *
 *   node --test site/test/worker.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import worker from '../src/index.js';
import { makeD1 } from './d1.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(here, '..', 'schema.sql');

/* ─── стенд ─── */
function makeEnv(extra = {}) {
  return {
    DB: makeD1(SCHEMA),
    SESSION_SECRET: 'тестовый-секрет-не-для-боя',
    OWNER_EMAIL: 'geralt@example.com',
    DEV_ECHO_CODE: '1',
    ASSETS: { fetch: async () => new Response('<html>приложение</html>', { headers: { 'content-type': 'text/html' } }) },
    ...extra
  };
}

const ctx = { waitUntil: p => { if (p && p.catch) p.catch(() => {}); } };

function makeClient(env) {
  let cookie = '';
  return {
    env,
    async call(method, path, body, opts = {}) {
      const headers = { 'cf-connecting-ip': opts.ip || '203.0.113.7' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (cookie && !opts.noCookie) headers.cookie = cookie;
      const req = new Request('https://tier.example' + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body)
      });
      const res = await worker.fetch(req, env, ctx);
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { /* статика */ }
      return { status: res.status, body: json, text, res };
    },
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; }
  };
}

async function login(client, email, ip, mailbox) {
  const req = await client.call('POST', '/api/auth/request', { email }, { ip });
  assert.equal(req.status, 200, 'запрос кода');
  /* когда почтовый сервис подключён, код в ответе намеренно не возвращается —
     достаём его из перехваченного письма, заодно проверяя, что он туда попал */
  const code = req.body.devCode || (() => {
    const letter = (mailbox || []).filter(m => (m.to || [])[0] === String(email).toLowerCase()).pop();
    assert.ok(letter, 'письмо с кодом ушло на ' + email);
    const m = /\b(\d{6})\b/.exec(letter.text);
    assert.ok(m, 'в письме есть код');
    return m[1];
  })();
  assert.match(code, /^\d{6}$/, 'код из шести цифр');
  const ver = await client.call('POST', '/api/auth/verify', { email, code }, { ip });
  assert.equal(ver.status, 200, 'проверка кода: ' + ver.text);
  return ver.body;
}

const listBody = (names, savedAt) => ({
  savedAt,
  state: { schema: 3, nextUid: names.length + 1, applied: ['seed-2026-07'],
    tiers: [{ id: 'S', label: 'Шедевры', tagline: '', items: names.map((n, i) => ({ uid: i + 1, name: n, cover: '', fav: false, reaction: null, watched: [] })) },
            { id: 'A', label: 'A', tagline: '', items: [] },
            { id: 'B', label: 'B', tagline: '', items: [] },
            { id: 'C', label: 'C', tagline: '', items: [] }] }
});

/* ─────────────────────────────── вход ─────────────────────────────── */

test('вход по коду: неизвестная почта заводит пользователя и адрес страницы', async () => {
  const c = makeClient(makeEnv());
  const me = await login(c, 'Geralt@Example.com');
  assert.equal(me.created, true);
  assert.equal(me.me.email, 'geralt@example.com', 'почта приводится к нижнему регистру');
  assert.equal(me.me.slug, 'geralt', 'адрес берётся из части до собаки');

  const again = await c.call('GET', '/api/me');
  assert.equal(again.body.me.slug, 'geralt', 'сессия живёт в куке');
});

test('вход по коду: чужой код не подходит, попытки заканчиваются', async () => {
  const c = makeClient(makeEnv());
  await c.call('POST', '/api/auth/request', { email: 'a@example.com' });
  for (let i = 0; i < 5; i++) {
    const r = await c.call('POST', '/api/auth/verify', { email: 'a@example.com', code: '000001' });
    assert.equal(r.status, 400, 'неверный код отбивается');
  }
  const blocked = await c.call('POST', '/api/auth/verify', { email: 'a@example.com', code: '000001' });
  assert.equal(blocked.status, 429, 'после пяти попыток код сгорает');
});

test('вход по коду: просроченный код не принимается', async () => {
  const env = makeEnv();
  const c = makeClient(env);
  const req = await c.call('POST', '/api/auth/request', { email: 'b@example.com' });
  env.DB._raw.prepare('UPDATE login_codes SET expires_at = ?').run(Date.now() - 1000);
  const r = await c.call('POST', '/api/auth/verify', { email: 'b@example.com', code: req.body.devCode });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /просрочен/);
});

test('вход по коду: адрес почты проверяется, частота ограничена', async () => {
  const c = makeClient(makeEnv());
  const bad = await c.call('POST', '/api/auth/request', { email: 'не-почта' });
  assert.equal(bad.status, 400);

  for (let i = 0; i < 5; i++) {
    const r = await c.call('POST', '/api/auth/request', { email: 'c@example.com' });
    assert.equal(r.status, 200, 'попытка ' + (i + 1));
  }
  const sixth = await c.call('POST', '/api/auth/request', { email: 'c@example.com' });
  assert.equal(sixth.status, 429, 'шестой код на тот же адрес не уходит');
  assert.ok(sixth.body.retryAfter > 0, 'сказано, через сколько повторить');
});

test('подделанная кука не пускает', async () => {
  const c = makeClient(makeEnv());
  await login(c, 'geralt@example.com');
  const real = c.cookie;
  c.cookie = real.replace(/\.[^.]+$/, '.ZmFrZXNpZ25hdHVyZQ');
  const r = await c.call('GET', '/api/me');
  assert.equal(r.body.me, null, 'испорченная подпись — не сессия');

  /* и чужим секретом тоже не подписать */
  const other = makeClient(makeEnv({ SESSION_SECRET: 'другой-секрет' }));
  await login(other, 'geralt@example.com');
  c.cookie = other.cookie;
  const r2 = await c.call('GET', '/api/me');
  assert.equal(r2.body.me, null, 'кука с другим секретом не принимается');
});

/* ─────────────────────────────── списки ─────────────────────────────── */

test('список: пишет только владелец, читают все', async () => {
  const env = makeEnv();
  const owner = makeClient(env);
  await login(owner, 'geralt@example.com');

  const anon = makeClient(env);
  const denied = await anon.call('PUT', '/api/list', listBody(['Берсерк']));
  assert.equal(denied.status, 401, 'без входа писать нельзя');

  const put = await owner.call('PUT', '/api/list', listBody(['Берсерк', 'Фрирен'], '2026-07-26T10:00:00.000Z'));
  assert.equal(put.status, 200);
  assert.equal(put.body.items, 2, 'количество тайтлов посчитано');

  const read = await anon.call('GET', '/api/list/geralt');
  assert.equal(read.status, 200);
  assert.equal(read.body.state.tiers[0].items[1].name, 'Фрирен', 'кириллица цела');
  assert.equal(read.body.savedAt, '2026-07-26T10:00:00.000Z', 'метка времени сохранена как есть');
});

test('список: у каждого свой, чужой не перезаписывается', async () => {
  const env = makeEnv();
  const a = makeClient(env), b = makeClient(env);
  await login(a, 'geralt@example.com');
  await login(b, 'katya@example.com', '198.51.100.9');

  await a.call('PUT', '/api/list', listBody(['Атака Титанов']));
  await b.call('PUT', '/api/list', listBody(['Тетрадь смерти', 'Мадока']));

  const ga = await a.call('GET', '/api/list/geralt');
  const gb = await a.call('GET', '/api/list/katya');
  assert.equal(ga.body.state.tiers[0].items.length, 1);
  assert.equal(gb.body.state.tiers[0].items.length, 2);
  assert.equal(gb.body.state.tiers[0].items[1].name, 'Мадока');
});

test('список: каталог показывает непустые списки, свежие сверху', async () => {
  const env = makeEnv();
  const a = makeClient(env), b = makeClient(env);
  await login(a, 'geralt@example.com');
  await login(b, 'katya@example.com', '198.51.100.9');
  await a.call('PUT', '/api/list', listBody(['Один']));
  await new Promise(r => setTimeout(r, 5));
  await b.call('PUT', '/api/list', listBody(['Раз', 'Два']));

  const all = await a.call('GET', '/api/lists');
  assert.equal(all.body.lists.length, 2);
  assert.equal(all.body.lists[0].slug, 'katya', 'последняя правка первой');
  assert.equal(all.body.lists[0].items, 2);
});

test('список: несуществующий адрес и мусор в теле отбиваются', async () => {
  const env = makeEnv();
  const c = makeClient(env);
  await login(c, 'geralt@example.com');
  assert.equal((await c.call('GET', '/api/list/-')).status, 400, 'пустой после чистки адрес');
  assert.equal((await c.call('GET', '/api/list/api')).status, 400, 'служебный адрес');
  assert.equal((await c.call('GET', '/api/list/никого')).status, 404, 'nikogo — адрес валидный, просто ничей');
  assert.equal((await c.call('GET', '/api/list/nobody')).status, 404);
  assert.equal((await c.call('PUT', '/api/list', { state: { нет: 'тиров' } })).status, 400);
});

test('профиль: адрес страницы меняется, занятый не отдаётся, служебный запрещён', async () => {
  const env = makeEnv();
  const a = makeClient(env), b = makeClient(env);
  await login(a, 'geralt@example.com');
  await login(b, 'katya@example.com', '198.51.100.9');

  const ok = await a.call('PATCH', '/api/me', { slug: 'ведьмак-2026', title: 'Личный канон' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.me.slug, 'vedmak-2026', 'кириллица переводится в латиницу');
  assert.equal(ok.body.me.title, 'Личный канон');

  assert.equal((await a.call('PATCH', '/api/me', { slug: 'katya' })).status, 409, 'занятый адрес');
  assert.equal((await a.call('PATCH', '/api/me', { slug: 'api' })).status, 400, 'служебный адрес');
});

/* ─────────────────────────────── отзывы и почта ─────────────────────────────── */

test('отзыв: сохраняется, уходит письмом владельцу, виден только ему', async () => {
  const sent = [];
  const env = makeEnv({ RESEND_API_KEY: 'ключ-для-теста' });
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), ...JSON.parse(init.body) });
    return new Response('{"id":"1"}', { status: 200 });
  };

  const owner = makeClient(env);
  await login(owner, 'geralt@example.com', undefined, sent);
  await owner.call('PUT', '/api/list', listBody(['Берсерк']));

  const guest = makeClient(env);
  const r = await guest.call('POST', '/api/feedback', { slug: 'geralt', body: 'Где Стальной алхимик?', email: 'gость@example.com' }, { ip: '198.51.100.44' });
  assert.equal(r.status, 200, r.text);

  await new Promise(r => setImmediate(r));
  const mail = sent.filter(s => /Новое сообщение/.test(s.subject || '')).pop();
  assert.ok(mail, 'письмо об отзыве ушло');
  assert.ok(mail.url.includes('resend.com'), 'через почтовый сервис');
  assert.equal(mail.to[0], 'geralt@example.com', 'письмо владельцу списка');
  assert.match(mail.text, /Где Стальной алхимик\?/, 'текст сообщения в письме');

  const mine = await owner.call('GET', '/api/feedback');
  assert.equal(mine.body.feedback.length, 1);
  assert.equal(mine.body.feedback[0].body, 'Где Стальной алхимик?');

  const other = makeClient(env);
  await login(other, 'katya@example.com', '198.51.100.9', sent);
  const empty = await other.call('GET', '/api/feedback');
  assert.equal(empty.body.feedback.length, 0, 'чужие отзывы не видны');
});

test('отзыв: пустой не проходит, частота ограничена, выключенные уведомления молчат', async () => {
  const sent = [];
  const env = makeEnv({ RESEND_API_KEY: 'ключ' });
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };

  const owner = makeClient(env);
  await login(owner, 'geralt@example.com', undefined, sent);
  await owner.call('PATCH', '/api/me', { notify: false });

  const guest = makeClient(env);
  assert.equal((await guest.call('POST', '/api/feedback', { slug: 'geralt', body: ' ' })).status, 400);

  const before = sent.length;
  for (let i = 0; i < 5; i++) {
    const r = await guest.call('POST', '/api/feedback', { slug: 'geralt', body: 'сообщение ' + i }, { ip: '198.51.100.77' });
    assert.equal(r.status, 200, 'сообщение ' + i);
  }
  const sixth = await guest.call('POST', '/api/feedback', { slug: 'geralt', body: 'ещё' }, { ip: '198.51.100.77' });
  assert.equal(sixth.status, 429, 'шестое сообщение с того же адреса не проходит');

  await new Promise(r => setImmediate(r));
  assert.equal(sent.length, before, 'при выключенных уведомлениях письма не уходят');
});

test('еженедельная сводка: письмо только тем, у кого есть непрочитанное', async () => {
  const sent = [];
  const env = makeEnv({ RESEND_API_KEY: 'ключ' });
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };

  const a = makeClient(env), b = makeClient(env);
  await login(a, 'geralt@example.com', undefined, sent);
  await login(b, 'katya@example.com', '198.51.100.9', sent);
  await a.call('PUT', '/api/list', listBody(['Один']));

  const guest = makeClient(env);
  await guest.call('POST', '/api/feedback', { slug: 'geralt', body: 'привет' }, { ip: '198.51.100.88' });
  sent.length = 0;

  const { __test } = await import('../src/index.js');
  const n = await __test.weeklyDigest(env);
  assert.equal(n, 1, 'одно письмо');
  assert.equal(sent[0].to[0], 'geralt@example.com');
  assert.match(sent[0].subject, /непрочитанных/);
});

/* ─────────────────────────────── прочее ─────────────────────────────── */

test('config отдаёт владельца главной страницы и состояние входа', async () => {
  const env = makeEnv();
  const c = makeClient(env);
  const anon = await c.call('GET', '/api/config');
  assert.equal(anon.body.mode, 'server');
  assert.equal(anon.body.me, null);
  assert.equal(anon.body.owner, null, 'пока владелец не заходил, его нет');

  await login(c, 'geralt@example.com');
  await c.call('PUT', '/api/list', listBody(['Один']));
  const auth = await c.call('GET', '/api/config');
  assert.equal(auth.body.owner.slug, 'geralt', 'список владельца показывается на главной');
  assert.equal(auth.body.me.slug, 'geralt');
  assert.equal(auth.body.lists, 1);
});

test('выход стирает сессию', async () => {
  const c = makeClient(makeEnv());
  await login(c, 'geralt@example.com');
  const out = await c.call('POST', '/api/auth/logout');
  assert.match(out.res.headers.get('set-cookie'), /Max-Age=0/);
});

test('страницы отдаются приложением, неизвестный метод API — 404', async () => {
  const c = makeClient(makeEnv());
  const page = await c.call('GET', '/geralt');
  assert.equal(page.status, 200);
  assert.match(page.text, /приложение/);

  const nope = await c.call('GET', '/api/чего-нибудь');
  assert.equal(nope.status, 404);
  assert.equal(nope.body.error, 'Нет такого метода');
});

test('слишком большой список не принимается', async () => {
  const c = makeClient(makeEnv());
  await login(c, 'geralt@example.com');
  const huge = listBody(Array.from({ length: 12000 }, (_, i) => 'Очень длинное название тайтла номер ' + i));
  const r = await c.call('PUT', '/api/list', huge);
  assert.equal(r.status, 413);
});
