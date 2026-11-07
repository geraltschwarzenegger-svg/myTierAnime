import { asset } from "./assets";
export type TierId = "S" | "A" | "B" | "C";
export type Duration =
  | { mode: "total"; basis: "manual" | "catalog"; minutes: number }
  | {
      mode: "episodes";
      basis: "manual" | "catalog";
      episodes: number;
      episodeMinutes: number;
    };
export interface Watch {
  label: string;
  date: string;
  duration?: Duration;
}
export interface Anime {
  uid: number;
  name: string;
  cover: string;
  fav: boolean;
  watched: Watch[];
  watchTotal?: Duration;
  sticker?: string;
  reaction?: string | null;
  [key: string]: unknown;
}
export interface Tier {
  id: TierId;
  label: string;
  items: Anime[];
  [key: string]: unknown;
}
export interface Collection {
  app: string;
  v: number;
  schema: number;
  savedAt: string;
  state: {
    schema: number;
    tiers: Tier[];
    nextUid: number;
    [key: string]: unknown;
  };
}
export interface CoverEntry {
  uid: number;
  file: string;
  originalUrl: string;
}
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export const TIER_ORDER: TierId[] = ["S", "A", "B", "C"];
export const TIER_META: Record<
  TierId,
  { name: string; title: string; color: string; description: string }
> = {
  S: {
    name: "Шедевры",
    title: "Солнечный венец",
    color: "#edce92",
    description: "Чеканное золото, гранёные рубины и лучи, собранные в корону.",
  },
  A: {
    name: "Близко к идеалу",
    title: "Нефритовый феникс",
    color: "#9ce3c7",
    description: "Изогнутые перья, нефритовый камень и свет морской волны.",
  },
  B: {
    name: "Крепкая основа",
    title: "Аметистовый архив",
    color: "#c7b0ef",
    description: "Огранённый аметист внутри раскрытой архитектуры серебра.",
  },
  C: {
    name: "Достойные",
    title: "Лунный гербарий",
    color: "#e8b5ca",
    description: "Серебряные ветви, фарфоровые лепестки и жемчужный свет.",
  },
};
export function safeDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}\.\d{2}\.\d{4}$/.test(value))
    return false;
  const [d, m, y] = value.split(".").map(Number),
    test = new Date(Date.UTC(y, m - 1, d));
  return (
    y >= 1900 &&
    y <= 2200 &&
    test.getUTCFullYear() === y &&
    test.getUTCMonth() === m - 1 &&
    test.getUTCDate() === d
  );
}
export function durationMinutes(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  if (
    d.mode === "total" &&
    typeof d.minutes === "number" &&
    Number.isInteger(d.minutes) &&
    d.minutes >= 0 &&
    d.minutes <= 600000
  )
    return d.minutes;
  if (
    d.mode === "episodes" &&
    typeof d.episodes === "number" &&
    typeof d.episodeMinutes === "number" &&
    Number.isInteger(d.episodes) &&
    d.episodes >= 0 &&
    d.episodes <= 10000 &&
    d.episodeMinutes > 0 &&
    d.episodeMinutes <= 600
  ) {
    const n = d.episodes * d.episodeMinutes;
    return Number.isFinite(n) && n <= 600000 ? n : null;
  }
  return null;
}
export function itemMinutes(item: Anime): number | null {
  const total = durationMinutes(item.watchTotal);
  if (total !== null) return total;
  let n = 0,
    known = false;
  for (const w of item.watched) {
    const m = durationMinutes(w.duration);
    if (m !== null) {
      known = true;
      n += m;
    }
  }
  return known ? n : null;
}
export function minutesLabel(n: number | null): string {
  if (n === null) return "Время не указано";
  const h = Math.floor(n / 60),
    m = Math.round(n % 60);
  return (h ? h + " ч " : "") + (m || !h ? m + " мин" : "");
}
export function allAnime(data: Collection): Anime[] {
  return data.state.tiers.flatMap((t) => t.items);
}
export function collectionMinutes(data: Collection): number {
  return allAnime(data).reduce((n, a) => n + (itemMinutes(a) ?? 0), 0);
}
export function validateCollection(value: unknown): Collection {
  if (!value || typeof value !== "object")
    throw new Error("В JSON должен быть объект коллекции.");
  const d = value as Collection;
  if (
    d.app !== "anime-tierlist" ||
    !d.state ||
    !Array.isArray(d.state.tiers) ||
    d.state.tiers.length !== 4
  )
    throw new Error(
      "Нужен экспорт коллекции ASTRAVA с четырьмя тирами S/A/B/C.",
    );
  const ids = new Set<number>(),
    tiers = new Set<string>();
  let count = 0;
  for (const t of d.state.tiers) {
    if (
      !TIER_ORDER.includes(t.id) ||
      tiers.has(t.id) ||
      !Array.isArray(t.items) ||
      t.items.length > 2000
    )
      throw new Error("Неправильные или повторяющиеся тиры.");
    tiers.add(t.id);
    for (const a of t.items) {
      if (!Number.isSafeInteger(a.uid) || a.uid < 1 || ids.has(a.uid))
        throw new Error(
          "ID аниме должны быть уникальными положительными числами.",
        );
      ids.add(a.uid);
      count++;
      if (
        typeof a.name !== "string" ||
        !a.name.trim() ||
        a.name.length > 500 ||
        typeof a.fav !== "boolean"
      )
        throw new Error("Проверь название и отметку избранного.");
      if (
        typeof a.cover !== "string" ||
        a.cover.length > 3000000 ||
        (a.cover &&
          !/^https:\/\/[^\s]+$/.test(a.cover) &&
          !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.cover))
      )
        throw new Error(
          "Разрешены только HTTPS-обложки или встроенные изображения.",
        );
      if (!Array.isArray(a.watched) || a.watched.length > 200)
        throw new Error("Неправильный список дат.");
      for (const w of a.watched) {
        if (
          !w ||
          typeof w.label !== "string" ||
          w.label.length > 500 ||
          !safeDate(w.date)
        )
          throw new Error("Проверь даты: нужен формат ДД.ММ.ГГГГ.");
        if (w.duration !== undefined && durationMinutes(w.duration) === null)
          throw new Error("Неправильная длительность просмотра.");
      }
      if (a.watchTotal !== undefined && durationMinutes(a.watchTotal) === null)
        throw new Error("Неправильный общий хронометраж.");
    }
  }
  if (
    count > 3000 ||
    !Number.isSafeInteger(d.state.nextUid) ||
    d.state.nextUid <= Math.max(0, ...ids)
  )
    throw new Error("Неправильный nextUid или слишком большая коллекция.");
  return structuredClone(d);
}
export function parseCollection(text: string): Collection {
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES)
    throw new Error("Файл JSON больше 2 МБ.");
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error("Не удалось прочитать JSON. Файл не изменён.");
  }
  return validateCollection(d);
}
export const LAB_PREFIX = "astrava-lab:v1:";
export function storeLab(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(LAB_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function readLab<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(LAB_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function coverUrl(item: Anime, covers: CoverEntry[]): string {
  const entry = covers.find(
    (c) => c.uid === item.uid && c.originalUrl === item.cover,
  );
  if (entry) return asset("covers/" + entry.file.split("/").pop());
  if (item.cover.startsWith("https://") || item.cover.startsWith("data:image/"))
    return item.cover;
  return "";
}
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
