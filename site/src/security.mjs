import { WEB_CSP } from './security-policy.mjs';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validSecret(value) {
  return typeof value === 'string' && new TextEncoder().encode(value).length >= 32;
}

export function guardMutation(request) {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (request.headers.get('x-atl-request') !== '1' || (origin !== null && origin !== new URL(request.url).origin) || site === 'cross-site') {
    throw new HttpError(403, 'Запрос должен прийти с этого сайта');
  }
}

export async function readJsonBody(request, maxBytes) {
  if (!request.body) return {};
  if (Number(request.headers.get('content-length')) > maxBytes) throw new HttpError(413, 'Запрос слишком большой');
  const reader = request.body.getReader();
  // Workers can expose an empty stream for a bodyless POST, including logout.
  const first = await reader.read();
  if (first.done) return {};
  const type = request.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;|\s*$)/i.test(type)) { await reader.cancel(); throw new HttpError(415, 'Нужен JSON'); }
  const chunks = [];
  let length = 0;
  let next = first;
  while (true) {
    const { done, value } = next;
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) { await reader.cancel(); throw new HttpError(413, 'Запрос слишком большой'); }
    chunks.push(value);
    next = await reader.read();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new HttpError(400, 'Не удалось разобрать JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Нужен объект JSON');
  return body;
}

export function safeImageUrl(value) {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\u007f]/.test(value)) return '';
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function validDate(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!m) return false;
  const [d, mo, y] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1900 && date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function validateState(state) {
  if (!state || !Array.isArray(state.tiers) || state.tiers.length < 1 || state.tiers.length > 8) return 'Нужен список из 1–8 тиров';
  const ids = new Set(), uids = new Set();
  let max = 0, count = 0;
  for (const tier of state.tiers) {
    if (!tier || typeof tier.id !== 'string' || !tier.id.trim() || tier.id.length > 6 || /[\u0000-\u001f]/.test(tier.id) || ids.has(tier.id)) return 'Неправильные или повторяющиеся ID тиров';
    ids.add(tier.id);
    if (typeof tier.label !== 'string' || tier.label.length > 80 || (tier.tagline !== undefined && (typeof tier.tagline !== 'string' || tier.tagline.length > 500)) || !Array.isArray(tier.items)) return 'Неправильная структура тира';
    for (const item of tier.items) {
      if (++count > 2000) return 'В списке допускается до 2000 тайтлов';
      if (!item || !Number.isSafeInteger(item.uid) || item.uid < 1 || uids.has(item.uid)) return 'Неправильные или повторяющиеся ID аниме';
      uids.add(item.uid); max = Math.max(max, item.uid);
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 240) return 'Проверь название аниме';
      if (item.cover !== undefined && (typeof item.cover !== 'string' || (item.cover && !safeImageUrl(item.cover)))) return 'Обложка должна быть HTTPS-ссылкой или растровой картинкой';
      if (item.reaction != null && !['heart', 'goldheart', 'bolt', 'fire', 'star'].includes(item.reaction)) return 'Неизвестная реакция';
      if (item.watched !== undefined) {
        if (!Array.isArray(item.watched) || item.watched.length > 100 || item.watched.some(w => !w || (w.label !== undefined && (typeof w.label !== 'string' || w.label.length > 100)) || (w.date !== '' && !validDate(w.date)))) return 'Проверь даты просмотра';
      }
    }
  }
  if (!Number.isSafeInteger(state.nextUid) || state.nextUid <= max) return 'Неправильный nextUid';
  return null;
}

export function protectResponse(response, request) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', WEB_CSP + "; frame-ancestors 'none'");
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
