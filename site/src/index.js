/**
 * Аниме тир-лист — серверная часть на Cloudflare Workers + D1.
 *
 * Что умеет:
 *   · вход по одноразовому коду на почту, без паролей;
 *   · у каждого пользователя свой список по адресу /<slug>;
 *   · публичное чтение чужих списков, запись — только своего;
 *   · форма обратной связи с письмом владельцу списка;
 *   · еженедельная сводка по расписанию.
 *
 * Сессия — подписанная кука, отдельной таблицы под неё нет: состояние в базе
 * не нужно, а значит нечего и чистить.
 */

const SESSION_COOKIE = "atl_s";
const SESSION_TTL_MS = 60 * 24 * 3600 * 1000;   /* 60 дней */
const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const MAX_LIST_BYTES = 512 * 1024;
const MAX_FEEDBACK_CHARS = 4000;

/* адреса, которые не должны стать чужими страницами */
const RESERVED_SLUGS = new Set([
  "api", "all", "assets", "static", "admin", "login", "logout", "index",
  "favicon", "robots", "sitemap", "data", "public", "www", "me", "new", "about"
]);

/* ────────────────────────────── мелкие утилиты ────────────────────────────── */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });

const fail = (status, error, extra = {}) => json({ error, ...extra }, status);

const now = () => Date.now();
const iso = (ms = Date.now()) => new Date(ms).toISOString();

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - s.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function hmac(secret, msg) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(msg));
  return b64url(sig);
}
/* сравнение за постоянное время: обычное === выдаёт длину общего префикса */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normEmail(v) {
  const e = String(v || "").trim().toLowerCase();
  /* намеренно нестрогая проверка: почтовые адреса бывают куда причудливее RFC-шаблонов,
     а настоящая проверка — это письмо с кодом, которое дойдёт или нет */
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

/* адрес страницы — латиницей, поэтому кириллицу переводим, а не выкидываем:
   «ведьмак» должен превращаться в vedmak, а не в пустоту */
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya"
};
function slugify(v) {
  return String(v || "").trim().toLowerCase()
    .replace(/[а-яё]/g, c => (c in TRANSLIT ? TRANSLIT[c] : "-"))
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/, "");
}
function slugFromEmail(email) {
  const base = slugify(email.split("@")[0]);
  return base && base.length >= 2 && !RESERVED_SLUGS.has(base) ? base : "user";
}
function normSlug(v) {
  const s = slugify(v);
  if (!s || s.length < 2 || RESERVED_SLUGS.has(s)) return null;
  return s;
}

function clientIp(req) {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "0.0.0.0";
}

/* ────────────────────────────── ограничение частоты ────────────────────────────── */

/** Скользящее окно на одну запись: дешевле, чем хранить каждое событие. */
async function rateLimit(env, key, limit, windowMs) {
  const t = now();
  const row = await env.DB.prepare("SELECT count, reset_at FROM rate_limit WHERE key = ?").bind(key).first();
  if (!row || row.reset_at <= t) {
    await env.DB.prepare(
      "INSERT INTO rate_limit (key, count, reset_at) VALUES (?, 1, ?) " +
      "ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at"
    ).bind(key, t + windowMs).run();
    return { ok: true, left: limit - 1, retryAfter: 0 };
  }
  if (row.count >= limit) {
    return { ok: false, left: 0, retryAfter: Math.ceil((row.reset_at - t) / 1000) };
  }
  await env.DB.prepare("UPDATE rate_limit SET count = count + 1 WHERE key = ?").bind(key).run();
  return { ok: true, left: limit - row.count - 1, retryAfter: 0 };
}

/* ────────────────────────────── сессия ────────────────────────────── */

async function makeSession(env, user) {
  const payload = b64url(enc.encode(JSON.stringify({ uid: user.id, exp: now() + SESSION_TTL_MS })));
  return payload + "." + (await hmac(env.SESSION_SECRET, payload));
}

async function readSession(env, req) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp("(?:^|;\\s*)" + SESSION_COOKIE + "=([^;]+)"));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmac(env.SESSION_SECRET, payload))) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(unb64url(payload))); } catch (e) { return null; }
  if (!data || !data.uid || !data.exp || data.exp < now()) return null;
  return await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(data.uid).first();
}

function sessionCookie(value, maxAgeSec) {
  const bits = [
    `${SESSION_COOKIE}=${value}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax",
    `Max-Age=${maxAgeSec}`
  ];
  return bits.join("; ");
}

/* ────────────────────────────── почта ────────────────────────────── */

/**
 * Отправка через Resend. Без ключа письмо не уходит — это нормальный режим для
 * локальной разработки, наружу такой ответ не отдаётся.
 */
async function sendMail(env, { to, subject, text, html }) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: "нет ключа почтового сервиса" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.MAIL_FROM || "Аниме тир-лист <onboarding@resend.dev>",
        to: [to], subject, text, html: html || undefined
      })
    });
    if (!r.ok) return { sent: false, reason: "сервис почты ответил " + r.status };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String((e && e.message) || e) };
  }
}

const mailShell = (title, body) => `<!doctype html><html><body style="margin:0;background:#0c0a1a;padding:28px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:460px;background:linear-gradient(165deg,#161026,#0d0a18);border:1px solid rgba(255,255,255,.1);border-radius:18px" cellpadding="0" cellspacing="0">
<tr><td style="padding:26px 26px 8px">
<div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#8f86ad">Аниме · Тир-лист</div>
<h1 style="margin:12px 0 0;font-family:Georgia,serif;font-weight:400;font-size:23px;color:#f6f4ff">${title}</h1>
</td></tr>
<tr><td style="padding:8px 26px 26px;color:#cfc8e6;font-size:14px;line-height:1.65">${body}</td></tr>
</table></td></tr></table></body></html>`;

/* ────────────────────────────── пользователи и списки ────────────────────────────── */

async function uniqueSlug(env, want) {
  let slug = want, n = 1;
  while (await env.DB.prepare("SELECT 1 FROM users WHERE slug = ?").bind(slug).first()) {
    n += 1;
    slug = `${want}-${n}`.slice(0, 28);
    if (n > 200) { slug = want + "-" + Math.random().toString(36).slice(2, 7); break; }
  }
  return slug;
}

async function ensureUser(env, email) {
  const found = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (found) {
    await env.DB.prepare("UPDATE users SET seen_at = ? WHERE id = ?").bind(iso(), found.id).run();
    return { user: found, created: false };
  }
  const slug = await uniqueSlug(env, slugFromEmail(email));
  await env.DB.prepare(
    "INSERT INTO users (email, slug, title, notify, created_at, seen_at) VALUES (?, ?, '', 1, ?, ?)"
  ).bind(email, slug, iso(), iso()).run();
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  return { user, created: true };
}

function publicUser(u) {
  return u ? { slug: u.slug, title: u.title || "", email: u.email, notify: !!u.notify } : null;
}

function countItems(state) {
  if (!state || !Array.isArray(state.tiers)) return 0;
  return state.tiers.reduce((n, t) => n + ((t && Array.isArray(t.items)) ? t.items.length : 0), 0);
}

/* ────────────────────────────── обработчики ────────────────────────────── */

async function handleConfig(env, req, me) {
  const owner = env.OWNER_EMAIL
    ? await env.DB.prepare("SELECT slug, title FROM users WHERE email = ?").bind(String(env.OWNER_EMAIL).toLowerCase()).first()
    : null;
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM lists").first();
  return json({
    mode: "server",
    owner: owner ? { slug: owner.slug, title: owner.title || "" } : null,
    me: publicUser(me),
    lists: (total && total.n) || 0,
    mailReady: !!env.RESEND_API_KEY
  });
}

async function handleAuthRequest(env, req) {
  const body = await req.json().catch(() => ({}));
  const email = normEmail(body.email);
  if (!email) return fail(400, "Проверь адрес почты");

  const byIp = await rateLimit(env, "login-ip:" + clientIp(req), 20, 3600e3);
  if (!byIp.ok) return fail(429, "Слишком много попыток входа, попробуй позже", { retryAfter: byIp.retryAfter });
  const byMail = await rateLimit(env, "login:" + email, 5, 3600e3);
  if (!byMail.ok) return fail(429, "На этот адрес уже уходило несколько кодов, подожди немного", { retryAfter: byMail.retryAfter });

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  const hash = await hmac(env.SESSION_SECRET, email + ":" + code);
  await env.DB.prepare(
    "INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?) " +
    "ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at"
  ).bind(email, hash, now() + CODE_TTL_MS, now()).run();

  const mail = await sendMail(env, {
    to: email,
    subject: code + " — код входа в тир-лист",
    text: `Код входа: ${code}\nДействует 15 минут.\n\nЕсли вход запрашивал не ты — просто не вводи код, ничего не произойдёт.`,
    html: mailShell("Код входа", `
      <p style="margin:0 0 14px">Введи этот код на странице входа:</p>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;letter-spacing:.22em;color:#ffd76a;background:rgba(255,215,106,.08);border:1px solid rgba(255,215,106,.25);border-radius:12px;padding:14px 18px;text-align:center">${code}</div>
      <p style="margin:16px 0 0;color:#8f86ad;font-size:12.5px">Код действует 15 минут. Если вход запрашивал не ты — просто не вводи его, ничего не произойдёт.</p>`)
  });

  /* Код в ответе — только когда явно включён режим разработки без почтового сервиса.
     В боевой среде DEV_ECHO_CODE не задан, и код уходит исключительно письмом. */
  const dev = env.DEV_ECHO_CODE === "1" && !env.RESEND_API_KEY;
  return json({ ok: true, sent: mail.sent, ...(dev ? { devCode: code } : {}), ...(mail.sent ? {} : { note: mail.reason }) });
}

async function handleAuthVerify(env, req) {
  const body = await req.json().catch(() => ({}));
  const email = normEmail(body.email);
  const code = String(body.code || "").replace(/\D/g, "");
  if (!email || code.length !== 6) return fail(400, "Нужны адрес почты и шестизначный код");

  const row = await env.DB.prepare("SELECT * FROM login_codes WHERE email = ?").bind(email).first();
  if (!row) return fail(400, "Код не запрашивался — начни сначала");
  if (row.expires_at < now()) {
    await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
    return fail(400, "Код просрочен, запроси новый");
  }
  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
    return fail(429, "Слишком много неверных попыток, запроси новый код");
  }
  const hash = await hmac(env.SESSION_SECRET, email + ":" + code);
  if (!safeEqual(hash, row.code_hash)) {
    await env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
    return fail(400, "Код не подошёл", { left: CODE_MAX_ATTEMPTS - row.attempts - 1 });
  }

  await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
  const { user, created } = await ensureUser(env, email);
  const cookie = await makeSession(env, user);
  return json({ ok: true, created, me: publicUser(user) }, 200, {
    "set-cookie": sessionCookie(cookie, SESSION_TTL_MS / 1000)
  });
}

async function handleListGet(env, slug) {
  const row = await env.DB.prepare(
    "SELECT u.slug, u.title, l.data, l.saved_at, l.updated_at FROM users u LEFT JOIN lists l ON l.user_id = u.id WHERE u.slug = ?"
  ).bind(slug).first();
  if (!row) return fail(404, "Такого списка нет");
  if (!row.data) return json({ slug: row.slug, title: row.title || "", savedAt: null, state: null });
  let state = null;
  try { state = JSON.parse(row.data); } catch (e) { return fail(500, "Список в базе повреждён"); }
  return json({ slug: row.slug, title: row.title || "", savedAt: row.saved_at, updatedAt: row.updated_at, state });
}

async function handleListPut(env, req, me) {
  if (!me) return fail(401, "Нужно войти");
  const raw = await req.text();
  if (raw.length > MAX_LIST_BYTES) return fail(413, "Список слишком большой");
  let body;
  try { body = JSON.parse(raw); } catch (e) { return fail(400, "Не удалось разобрать JSON"); }
  const state = body && body.state ? body.state : body;
  if (!state || !Array.isArray(state.tiers)) return fail(400, "В теле запроса нет списка тиров");

  const savedAt = typeof body.savedAt === "string" ? body.savedAt : iso();
  const items = countItems(state);
  const data = JSON.stringify(state);
  await env.DB.prepare(
    "INSERT INTO lists (user_id, data, items, saved_at, updated_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, items = excluded.items, saved_at = excluded.saved_at, updated_at = excluded.updated_at"
  ).bind(me.id, data, items, savedAt, iso()).run();
  return json({ ok: true, slug: me.slug, items, savedAt });
}

async function handleLists(env) {
  const rows = await env.DB.prepare(
    "SELECT u.slug, u.title, l.items, l.updated_at FROM users u JOIN lists l ON l.user_id = u.id " +
    "WHERE l.items > 0 ORDER BY l.updated_at DESC LIMIT 100"
  ).all();
  return json({ lists: (rows.results || []).map(r => ({ slug: r.slug, title: r.title || "", items: r.items, updatedAt: r.updated_at })) });
}

async function handleMePatch(env, req, me) {
  if (!me) return fail(401, "Нужно войти");
  const body = await req.json().catch(() => ({}));
  const sets = [], args = [];
  if (typeof body.title === "string") { sets.push("title = ?"); args.push(body.title.trim().slice(0, 80)); }
  if (typeof body.notify === "boolean") { sets.push("notify = ?"); args.push(body.notify ? 1 : 0); }
  if (typeof body.slug === "string") {
    const s = normSlug(body.slug);
    if (!s) return fail(400, "Адрес должен быть из латиницы и цифр, минимум две буквы, и не из служебных");
    if (s !== me.slug) {
      const busy = await env.DB.prepare("SELECT 1 FROM users WHERE slug = ? AND id <> ?").bind(s, me.id).first();
      if (busy) return fail(409, "Такой адрес уже занят");
      sets.push("slug = ?"); args.push(s);
    }
  }
  if (!sets.length) return json({ ok: true, me: publicUser(me) });
  args.push(me.id);
  await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args).run();
  const fresh = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(me.id).first();
  return json({ ok: true, me: publicUser(fresh) });
}

async function handleFeedback(env, req, me, ctx) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.body || "").trim();
  const slug = normSlug(body.slug || "");
  if (!slug) return fail(400, "Не указано, кому пишем");
  if (text.length < 2) return fail(400, "Сообщение пустое");
  if (text.length > MAX_FEEDBACK_CHARS) return fail(413, "Сообщение слишком длинное");

  const lim = await rateLimit(env, "fb:" + clientIp(req), 5, 3600e3);
  if (!lim.ok) return fail(429, "Пока хватит сообщений, попробуй позже", { retryAfter: lim.retryAfter });

  const owner = await env.DB.prepare("SELECT * FROM users WHERE slug = ?").bind(slug).first();
  if (!owner) return fail(404, "Такого списка нет");

  const from = me ? me.email : (normEmail(body.email) || "");
  await env.DB.prepare(
    "INSERT INTO feedback (owner_id, from_email, body, created_at, seen) VALUES (?, ?, ?, ?, 0)"
  ).bind(owner.id, from, text, iso()).run();

  if (owner.notify) {
    const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const send = sendMail(env, {
      to: owner.email,
      subject: "Новое сообщение в тир-листе",
      text: `Кто-то написал тебе через страницу /${slug}:\n\n${text}\n\n${from ? "Обратный адрес: " + from : "Обратный адрес не указан."}`,
      html: mailShell("Новое сообщение", `
        <p style="margin:0 0 12px;color:#8f86ad;font-size:12.5px">Через страницу /${esc(slug)}</p>
        <div style="white-space:pre-wrap;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px 16px">${esc(text)}</div>
        <p style="margin:16px 0 0;color:#8f86ad;font-size:12.5px">${from ? "Обратный адрес: " + esc(from) : "Обратный адрес не указан."}</p>`)
    });
    /* ответ не ждёт почты: письмо уходит уже после того, как отдали 200 */
    if (ctx && ctx.waitUntil) ctx.waitUntil(send); else await send;
  }
  return json({ ok: true });
}

async function handleFeedbackList(env, me) {
  if (!me) return fail(401, "Нужно войти");
  const rows = await env.DB.prepare(
    "SELECT id, from_email, body, created_at, seen FROM feedback WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100"
  ).bind(me.id).all();
  await env.DB.prepare("UPDATE feedback SET seen = 1 WHERE owner_id = ?").bind(me.id).run();
  return json({ feedback: rows.results || [] });
}

/* ────────────────────────────── маршрутизация ────────────────────────────── */

async function api(request, env, ctx, url) {
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const method = request.method.toUpperCase();
  const me = await readSession(env, request);

  if (path === "/config" && method === "GET") return handleConfig(env, request, me);
  if (path === "/me" && method === "GET") return json({ me: publicUser(me) });
  if (path === "/me" && method === "PATCH") return handleMePatch(env, request, me);
  if (path === "/auth/request" && method === "POST") return handleAuthRequest(env, request);
  if (path === "/auth/verify" && method === "POST") return handleAuthVerify(env, request);
  if (path === "/auth/logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }
  if (path === "/lists" && method === "GET") return handleLists(env);
  if (path === "/list" && method === "PUT") return handleListPut(env, request, me);
  if (path.startsWith("/list/") && method === "GET") {
    const slug = normSlug(decodeURIComponent(path.slice(6)));
    if (!slug) return fail(400, "Неправильный адрес списка");
    return handleListGet(env, slug);
  }
  if (path === "/feedback" && method === "POST") return handleFeedback(env, request, me, ctx);
  if (path === "/feedback" && method === "GET") return handleFeedbackList(env, me);

  return fail(404, "Нет такого метода");
}

/** Раз в неделю: сводка владельцам списков, у которых накопились непрочитанные сообщения. */
async function weeklyDigest(env) {
  const rows = await env.DB.prepare(
    "SELECT u.email, u.slug, u.notify, COUNT(f.id) AS n FROM users u " +
    "JOIN feedback f ON f.owner_id = u.id AND f.seen = 0 " +
    "WHERE u.notify = 1 GROUP BY u.id"
  ).all();
  let sent = 0;
  for (const r of rows.results || []) {
    const res = await sendMail(env, {
      to: r.email,
      subject: `${r.n} непрочитанных сообщений в тир-листе`,
      text: `За неделю тебе написали ${r.n} раз. Загляни на страницу /${r.slug} — сообщения ждут в разделе «Отзывы».`,
      html: mailShell("Сводка за неделю", `<p style="margin:0">За неделю тебе написали <b style="color:#f6f4ff">${r.n}</b> раз. Сообщения ждут в разделе «Отзывы» на странице <b style="color:#f6f4ff">/${r.slug}</b>.</p>`)
    });
    if (res.sent) sent++;
  }
  /* заодно подчищаем просроченные коды и счётчики */
  await env.DB.prepare("DELETE FROM login_codes WHERE expires_at < ?").bind(now()).run();
  await env.DB.prepare("DELETE FROM rate_limit WHERE reset_at < ?").bind(now()).run();
  return sent;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return await api(request, env, ctx, url);
      }
      /* всё остальное — статика; на неизвестный путь отдаём приложение,
         чтобы /geralt открывался как обычная страница */
      if (env.ASSETS) return await env.ASSETS.fetch(request);
      return new Response("Статика не подключена", { status: 500 });
    } catch (e) {
      return fail(500, "Внутренняя ошибка", { detail: String((e && e.message) || e) });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(weeklyDigest(env));
  }
};

/* экспорт для тестов — в рантайме Worker'а не используется */
export const __test = { normEmail, normSlug, slugFromEmail, rateLimit, weeklyDigest, safeEqual };
