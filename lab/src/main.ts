import "./style.css";
import { asset, loadJson } from "./assets";
import { mountIcons } from "./icons";
import {
  allAnime,
  collectionMinutes,
  coverUrl,
  download,
  durationMinutes,
  itemMinutes,
  minutesLabel,
  parseCollection,
  readLab,
  safeDate,
  storeLab,
  TIER_META,
  TIER_ORDER,
  validateCollection,
  type Anime,
  type Collection,
  type CoverEntry,
  type TierId,
  type Watch,
} from "./data";
import type { AtelierScene, Settings, SceneStats, Atmosphere } from "./scene";
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const DEFAULT_SETTINGS: Settings = {
  quality: "auto",
  motion: true,
  rotate: false,
  followTier: true,
  atmosphere: "dawn",
  exposure: 1.25,
};
const worlds: Record<Atmosphere, string> = {
  astral: "Звёздный зал",
  dawn: "Тёплый рассвет",
  garden: "Нефритовый сад",
  moon: "Лунная ночь",
};
let settings: Settings = { ...DEFAULT_SETTINGS },
  scene: AtelierScene | null = null,
  activeTier: TierId = "S",
  filter = "all",
  limit = 18,
  current: Anime | null = null,
  collection: Collection,
  published: Collection,
  covers: CoverEntry[] = [],
  month = new Date(2026, 9, 1),
  selectedDay = "",
  toastTimer = 0,
  editOriginal: Watch[] = [];
let booting = false,
  sceneError = "";
function toast(message: string) {
  clearTimeout(toastTimer);
  el("toast").textContent = message;
  el("toast").classList.add("visible");
  toastTimer = window.setTimeout(
    () => el("toast").classList.remove("visible"),
    5000,
  );
}
function readSettings() {
  const raw = readLab<Partial<Settings>>("settings");
  if (!raw) return;
  if (["auto", "low", "high"].includes(raw.quality ?? ""))
    settings.quality = raw.quality!;
  for (const k of ["motion", "rotate", "followTier"] as const)
    if (typeof raw[k] === "boolean") settings[k] = raw[k]!;
  if (raw.atmosphere && raw.atmosphere in worlds)
    settings.atmosphere = raw.atmosphere;
  if (typeof raw.exposure === "number" && Number.isFinite(raw.exposure))
    settings.exposure = Math.min(2, Math.max(0.6, raw.exposure));
}
function persistSettings() {
  if (!storeLab("settings", settings))
    toast(
      "Настройки действуют в этой вкладке. Браузер не разрешил сохранение.",
    );
}
function syncSettings() {
  for (const k of ["motion", "rotate", "followTier"])
    input(k).checked = settings[k as "motion" | "rotate" | "followTier"];
  (el("quality") as HTMLSelectElement).value = settings.quality;
  input("exposure").value = String(settings.exposure);
  el("exposureValue").textContent = Math.round(settings.exposure * 100) + "%";
  document
    .querySelectorAll<HTMLButtonElement>(".world-options [data-world]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.world === settings.atmosphere),
      ),
    );
  el("worldLabel").textContent = worlds[settings.atmosphere];
  el("qualityNote").textContent =
    settings.quality === "high"
      ? "Мягкое свечение на широком экране, повышенное разрешение."
      : settings.quality === "low"
        ? "Меньше разрешение, без частиц и постобработки."
        : "Оптимальное разрешение без тяжёлых эффектов.";
  el("motionNotice").textContent = matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches
    ? "Движение остановлено по системной настройке."
    : !settings.motion
      ? "Вся анимация на паузе. Можно вращать объект вручную."
      : settings.rotate
        ? "Медленное вращение включено. Его можно остановить."
        : "Эмблема остаётся неподвижной, пока ты её не повернёшь.";
}
function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  scene?.apply(settings);
  syncSettings();
  persistSettings();
}
function setWorld(world: Atmosphere) {
  settings.atmosphere = world;
  el("worldLabel").textContent = worlds[world];
  document.querySelector(".stage-card")?.setAttribute("data-world", world);
  syncSettings();
}
function sceneMetrics(stats: SceneStats) {
  el("sceneState").textContent = stats.paused
    ? "Сцена на паузе"
    : "Сцена готова";
  el("metricMode").textContent = stats.quality;
  el("metricFps").textContent = stats.paused
    ? "Пауза"
    : stats.fps
      ? stats.fps + " FPS"
      : "Измеряем";
  el("metricCalls").textContent = String(stats.calls);
  el("metricTriangles").textContent = stats.triangles.toLocaleString("ru-RU");
  el("metricPause").textContent = stats.reason;
  el("metricSummary").textContent = stats.paused
    ? "Пауза"
    : stats.fps
      ? stats.fps + " FPS"
      : stats.quality;
}
function disable3D(value: boolean) {
  for (const id of [
    "captureFrame",
    "exportGlb",
    "importGlb",
    "zoomIn",
    "zoomOut",
    "resetCamera",
  ])
    (el(id) as HTMLButtonElement).disabled = value;
}
async function startScene() {
  if (booting) return;
  booting = true;
  disable3D(true);
  el("sceneFallback").hidden = true;
  el("sceneLoading").hidden = false;
  try {
    scene?.dispose();
    const module = await import("./scene");
    scene = new module.AtelierScene(
      el("sceneHost"),
      settings,
      sceneMetrics,
      setWorld,
    );
    scene.setTier(activeTier);
    el("sceneLoading").hidden = true;
    disable3D(false);
    sceneError = "";
  } catch (error) {
    scene?.dispose();
    scene = null;
    sceneError = error instanceof Error ? error.message : String(error);
    el("sceneLoading").hidden = true;
    el("sceneFallback").hidden = false;
    el("sceneState").textContent = "Режим без 3D";
    el("metricSummary").textContent = "3D недоступно";
  } finally {
    booting = false;
  }
}
function chooseTier(tier: TierId) {
  activeTier = tier;
  document
    .querySelectorAll<HTMLButtonElement>(".tier-choices [data-tier]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.tier === tier)),
    );
  const meta = TIER_META[tier];
  el("modelTitle").textContent = meta.title;
  el("modelDescription").textContent = meta.description;
  el("stageRank").textContent = tier;
  el("objectNumber").textContent = String(
    TIER_ORDER.indexOf(tier) + 1,
  ).padStart(2, "0");
  el("stageCaption").textContent = {
    S: "Золото хранит лучшие истории.",
    A: "Истории, которые хочется беречь.",
    B: "В каждом кристалле — свой мир.",
    C: "Тихий свет знакомых историй.",
  }[tier];
  const fallback = el<HTMLImageElement>("sceneFallback").querySelector("img")!;
  fallback.src = asset("models/" + tier + ".svg");
  fallback.alt = meta.title;
  scene?.setTier(tier);
  if (!scene && settings.followTier)
    setWorld(
      { S: "dawn", A: "garden", B: "moon", C: "astral" }[tier] as Atmosphere,
    );
  persistSettings();
}
function saveCollection() {
  collection.savedAt = new Date().toISOString();
  const saved = storeLab("collection", collection);
  el("saveState").textContent = saved
    ? "Личная тестовая копия · сохранено"
    : "Только в этой вкладке · скачай JSON";
  if (!saved)
    toast(
      "Не удалось сохранить в браузере. Скачай JSON, чтобы не потерять изменения.",
    );
  renderCollection();
}
function matches(a: Anime, tier: TierId) {
  const q = input("search").value.trim().toLocaleLowerCase("ru-RU");
  return (
    (filter === "all" || (filter === "fav" && a.fav) || filter === tier) &&
    (!q || a.name.toLocaleLowerCase("ru-RU").includes(q))
  );
}
function renderCollection() {
  const entries = collection.state.tiers.flatMap((t) =>
      t.items.map((a) => ({ a, tier: t.id })),
    ),
    filtered = entries.filter((e) => matches(e.a, e.tier));
  el("animeCount").textContent = String(entries.length);
  el("watchHours").textContent = minutesLabel(collectionMinutes(collection));
  document.querySelector('[data-filter="all"] span')!.textContent = String(
    entries.length,
  );
  for (const t of collection.state.tiers) {
    const count = document.querySelector('[data-tier-count="' + t.id + '"]');
    if (count) count.textContent = String(t.items.length);
  }
  el("animeGrid").innerHTML = filtered
    .slice(0, limit)
    .map(
      ({ a, tier }) =>
        '<button class="anime-card" data-uid="' +
        a.uid +
        '" data-tier="' +
        tier +
        '" aria-label="' +
        escape(a.name) +
        ' — открыть подробности"><div class="poster"><img src="' +
        escape(coverUrl(a, covers)) +
        '" alt="' +
        escape(a.name) +
        '" loading="lazy" decoding="async" width="225" height="320"><span class="poster-badge">' +
        tier +
        "</span>" +
        (a.fav
          ? '<span class="poster-heart" aria-label="Избранное">♥</span>'
          : "") +
        '</div><span class="anime-title">' +
        escape(a.name) +
        '</span><span class="anime-date"><span>' +
        (a.watched.length
          ? escape(a.watched[a.watched.length - 1].date)
          : "Без даты") +
        "</span><span>" +
        minutesLabel(itemMinutes(a)) +
        "</span></span></button>",
    )
    .join("");
  el("emptyState").hidden = filtered.length > 0;
  el("loadMore").hidden = filtered.length <= limit;
  el("resultCount").textContent =
    Math.min(limit, filtered.length) + " из " + filtered.length + " историй";
  document
    .querySelectorAll<HTMLButtonElement>("#animeGrid [data-uid]")
    .forEach((b) =>
      b.addEventListener("click", () => openPreview(Number(b.dataset.uid))),
    );
  el("animeGrid")
    .querySelectorAll("img")
    .forEach((img) =>
      img.addEventListener(
        "error",
        () => {
          img.hidden = true;
        },
        { once: true },
      ),
    );
}
function getItem(uid: number) {
  for (const t of collection.state.tiers) {
    const a = t.items.find((a) => a.uid === uid);
    if (a) return { a, tier: t.id };
  }
  return null;
}
const preview = el<HTMLDialogElement>("preview"),
  journal = el<HTMLDialogElement>("journal");
function overlayChanged() {
  scene?.setOverlay(preview.open || journal.open);
}
function openPreview(uid: number) {
  const found = getItem(uid);
  if (!found) return;
  current = found.a;
  input("watchError").textContent = "";
  el("watchForm").hidden = true;
  el("watchList").hidden = false;
  el("editWatches").hidden = false;
  el("previewTitle").textContent = current.name;
  el("previewTier").textContent = found.tier;
  el("previewTierName").textContent =
    found.tier + " / " + TIER_META[found.tier].name;
  const img = el<HTMLImageElement>("previewImage");
  img.src = coverUrl(current, covers);
  img.alt = current.name;
  el("previewTotal").textContent =
    "Всего · " + minutesLabel(itemMinutes(current));
  el("toggleFav").textContent = current.fav
    ? "♥ В избранном"
    : "♡ В избранное";
  el("toggleFav").setAttribute("aria-pressed", String(current.fav));
  el("watchList").innerHTML =
    current.watched
      .map(
        (w) =>
          '<div class="watch-entry"><b>' +
          escape(w.label || "Просмотр") +
          "</b><span>" +
          escape(w.date) +
          "</span><small>" +
          minutesLabel(durationMinutes(w.duration)) +
          "</small></div>",
      )
      .join("") || '<p class="control-note">Пока нет дат просмотра.</p>';
  if (!preview.open) preview.showModal();
  overlayChanged();
}
function addEditorRow(w: Watch, index: number) {
  const row = document.createElement("div");
  row.className = "watch-row";
  row.dataset.original = String(index);
  const [d, m, y] = w.date.split(".");
  row.innerHTML =
    '<label>Сезон / подпись<input class="watch-label" maxlength="500" value="' +
    escape(w.label) +
    '" placeholder="Например, 2 сезон · 12 серий"></label><label>Дата просмотра<input class="watch-date" type="date" required min="1900-01-01" max="2200-12-31" value="' +
    y +
    "-" +
    m +
    "-" +
    d +
    '"></label><label>Время, минут<input class="watch-minutes" type="number" min="0" max="600000" step="1" value="' +
    (durationMinutes(w.duration) ?? "") +
    '" placeholder="Не указано"></label><span class="original-time">' +
    (w.duration
      ? "Каталожное время сохраняется, если число не менять."
      : "Пустое поле — время не указано.") +
    '</span><button type="button" class="remove-watch">Убрать дату</button>';
  row
    .querySelector(".remove-watch")!
    .addEventListener("click", () => row.remove());
  el("watchEditor").append(row);
}
function editWatches() {
  if (!current) return;
  editOriginal = structuredClone(current.watched);
  el("watchList").hidden = true;
  el("watchForm").hidden = false;
  el("editWatches").hidden = true;
  el("watchEditor").replaceChildren();
  editOriginal.forEach(addEditorRow);
  if (!editOriginal.length) addNewWatch();
  if (current.watchTotal) {
    const label = document.createElement("label");
    label.className = "switch-row";
    label.innerHTML =
      '<span>Пересчитать общий итог по датам</span><input type="checkbox" id="clearWatchTotal">';
    el("watchEditor").append(label);
  }
}
function addNewWatch() {
  const d = new Date(),
    date = [d.getDate(), d.getMonth() + 1, d.getFullYear()]
      .map((n, i) => (i < 2 ? String(n).padStart(2, "0") : String(n)))
      .join(".");
  addEditorRow({ label: "", date }, -1);
}
function closePreview() {
  preview.close();
  overlayChanged();
}
function dateIso(ru: string) {
  return ru.split(".").reverse().join("-");
}
function dateRu(iso: string) {
  return iso.split("-").reverse().join(".");
}
function latestDate() {
  return (
    allAnime(collection)
      .flatMap((a) => a.watched.map((w) => dateIso(w.date)))
      .sort()
      .at(-1) || new Date().toISOString().slice(0, 10)
  );
}
function renderMonth() {
  const y = month.getFullYear(),
    m = month.getMonth();
  el("monthTitle").textContent = month.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
  const offset = (new Date(y, m, 1).getDay() + 6) % 7,
    days = new Date(y, m + 1, 0).getDate(),
    events = allAnime(collection).flatMap((a) =>
      a.watched.map((w) => ({ a, w, iso: dateIso(w.date) })),
    );
  const parts = Array.from({ length: offset }, () => "<span></span>");
  for (let d = 1; d <= days; d++) {
    const iso =
        y +
        "-" +
        String(m + 1).padStart(2, "0") +
        "-" +
        String(d).padStart(2, "0"),
      n = events.filter((e) => e.iso === iso).length;
    parts.push(
      '<button data-day="' +
        iso +
        '" class="' +
        (n ? "has-watches" : "") +
        '" aria-pressed="' +
        (selectedDay === iso) +
        '" aria-label="' +
        d +
        " " +
        escape(
          month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
        ) +
        ", просмотров: " +
        n +
        '">' +
        d +
        (n
          ? "<small>" + n + " " + (n === 1 ? "история" : "историй") + "</small>"
          : "") +
        "</button>",
    );
  }
  el("monthGrid").innerHTML = parts.join("");
  const displayed = selectedDay
    ? events.filter((e) => e.iso === selectedDay)
    : events.filter((e) =>
        e.iso.startsWith(y + "-" + String(m + 1).padStart(2, "0")),
      );
  displayed.sort((a, b) => b.iso.localeCompare(a.iso));
  el("dayEntries").innerHTML =
    displayed
      .map(
        (e) =>
          '<button class="day-entry" data-uid="' +
          e.a.uid +
          '"><span>' +
          escape(e.a.name) +
          (e.w.label ? " · " + escape(e.w.label) : "") +
          "</span><small>" +
          e.w.date +
          "</small></button>",
      )
      .join("") ||
    '<p class="control-note">На ' +
      (selectedDay ? "этот день" : "этот месяц") +
      " просмотров пока нет.</p>";
  document
    .querySelectorAll<HTMLButtonElement>("#monthGrid [data-day]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        selectedDay = selectedDay === b.dataset.day ? "" : b.dataset.day!;
        renderMonth();
      }),
    );
  document
    .querySelectorAll<HTMLButtonElement>("#dayEntries [data-uid]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        journal.close();
        openPreview(Number(b.dataset.uid));
      }),
    );
}
function showLatestMonth() {
  const iso = latestDate(),
    [y, m] = iso.split("-").map(Number);
  month = new Date(y, m - 1, 1);
  selectedDay = "";
  renderMonth();
}
function setup() {
  mountIcons();
  document
    .querySelectorAll<HTMLButtonElement>(".tier-choices [data-tier]")
    .forEach((b) =>
      b.addEventListener("click", () => chooseTier(b.dataset.tier as TierId)),
    );
  document
    .querySelectorAll<HTMLButtonElement>(".world-options [data-world]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        updateSettings({
          atmosphere: b.dataset.world as Atmosphere,
          followTier: false,
        }),
      ),
    );
  for (const k of ["motion", "rotate", "followTier"] as const)
    input(k).addEventListener("change", () => {
      updateSettings({ [k]: input(k).checked });
      if (k === "followTier" && settings.followTier) chooseTier(activeTier);
    });
  el("quality").addEventListener("change", () =>
    updateSettings({
      quality: (el("quality") as HTMLSelectElement)
        .value as Settings["quality"],
    }),
  );
  input("exposure").addEventListener("input", () =>
    updateSettings({ exposure: Number(input("exposure").value) }),
  );
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    syncSettings,
  );
  el("resetCamera").addEventListener("click", () => scene?.reset());
  el("zoomIn").addEventListener("click", () => scene?.zoom(0.88));
  el("zoomOut").addEventListener("click", () => scene?.zoom(1.12));
  el("retryScene").addEventListener("click", () => void startScene());
  el("captureFrame").addEventListener("click", async () => {
    try {
      if (scene)
        download(
          await scene.screenshot(),
          "ASTRAVA-Lab-" + activeTier + ".png",
        );
    } catch (e) {
      toast(String(e));
    }
  });
  el("exportGlb").addEventListener("click", async () => {
    const button = el<HTMLButtonElement>("exportGlb");
    button.disabled = true;
    try {
      if (scene) {
        const buffer = await scene.exportGlb();
        download(
          new Blob([buffer], { type: "model/gltf-binary" }),
          "ASTRAVA-" + activeTier + ".glb",
        );
        toast("Объёмная модель сохранена.");
      }
    } catch (e) {
      toast(String(e));
    } finally {
      button.disabled = !scene;
    }
  });
  el("importGlb").addEventListener("click", () => input("glbFile").click());
  input("glbFile").addEventListener("change", async () => {
    const file = input("glbFile").files?.[0];
    input("glbFile").value = "";
    if (!file || !scene) return;
    try {
      if (await scene.importGlb(file)) {
        el("modelTitle").textContent = file.name;
        el("modelDescription").textContent =
          "Твоя локальная модель. Файл не отправляется на сервер и хранится только до перезагрузки.";
        toast("Модель открыта в мастерской.");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  });
  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.filter!;
      limit = 18;
      document
        .querySelectorAll("[data-filter]")
        .forEach((e) => e.setAttribute("aria-pressed", String(e === b)));
      renderCollection();
    }),
  );
  input("search").addEventListener("input", () => {
    limit = 18;
    renderCollection();
  });
  el("loadMore").addEventListener("click", () => {
    limit += 18;
    renderCollection();
  });
  el("previewClose").addEventListener("click", closePreview);
  preview.addEventListener("close", () => {
    overlayChanged();
    if (current)
      document
        .querySelector<HTMLButtonElement>(
          '.anime-card[data-uid="' + current.uid + '"]',
        )
        ?.focus({ preventScroll: true });
  });
  preview.addEventListener("click", (event) => {
    if (event.target === preview) {
      const r = preview.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        closePreview();
    }
  });
  el("toggleFav").addEventListener("click", () => {
    if (current) {
      current.fav = !current.fav;
      saveCollection();
      openPreview(current.uid);
    }
  });
  el("editWatches").addEventListener("click", editWatches);
  el("cancelWatches").addEventListener(
    "click",
    () => current && openPreview(current.uid),
  );
  el("addWatch").addEventListener("click", addNewWatch);
  el("watchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!current) return;
    try {
      const watched: Watch[] = [];
      for (const row of document.querySelectorAll<HTMLElement>(".watch-row")) {
        const date = dateRu(
          row.querySelector<HTMLInputElement>(".watch-date")!.value,
        );
        if (!safeDate(date)) throw new Error("Проверь дату просмотра.");
        const index = Number(row.dataset.original),
          old = editOriginal[index],
          raw = row.querySelector<HTMLInputElement>(".watch-minutes")!.value;
        const next = {
          ...(old ?? {}),
          label: row
            .querySelector<HTMLInputElement>(".watch-label")!
            .value.trim(),
          date,
        } as Watch;
        if (raw === "") delete next.duration;
        else {
          const minutes = Number(raw);
          if (!Number.isInteger(minutes) || minutes < 0 || minutes > 600000)
            throw new Error("Укажи целое число минут от 0 до 600 000.");
          if (durationMinutes(old?.duration) !== minutes)
            next.duration = { mode: "total", basis: "manual", minutes };
        }
        watched.push(next);
      }
      const candidate = structuredClone(collection),
        target = allAnime(candidate).find((a) => a.uid === current!.uid)!;
      target.watched = watched;
      if (input("clearWatchTotal")?.checked) delete target.watchTotal;
      validateCollection(candidate);
      collection = candidate;
      saveCollection();
      openPreview(current.uid);
      toast("Даты сохранены только в тестовой коллекции.");
    } catch (e) {
      el("watchError").textContent = e instanceof Error ? e.message : String(e);
    }
  });
  el("importCollection").addEventListener("click", () =>
    input("jsonFile").click(),
  );
  input("jsonFile").addEventListener("change", async () => {
    const file = input("jsonFile").files?.[0];
    input("jsonFile").value = "";
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("JSON больше 2 МБ.");
      const next = parseCollection(await file.text());
      collection = next;
      saveCollection();
      toast("Коллекция импортирована только в Lab.");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  });
  el("exportCollection").addEventListener("click", () =>
    download(
      new Blob([JSON.stringify(collection, null, 2) + "\n"], {
        type: "application/json",
      }),
      "ASTRAVA-Lab-collection.json",
    ),
  );
  el("resetCollection").addEventListener("click", () => {
    if (
      confirm(
        "Вернуть опубликованную копию в Lab? Тестовые изменения заменятся. Основной сайт не затрагивается.",
      )
    ) {
      collection = structuredClone(published);
      saveCollection();
      toast("Опубликованная копия восстановлена в Lab.");
    }
  });
  el("journalOpen").addEventListener("click", () => {
    showLatestMonth();
    journal.showModal();
    overlayChanged();
  });
  el("journalClose").addEventListener("click", () => {
    journal.close();
    overlayChanged();
  });
  journal.addEventListener("close", overlayChanged);
  for (const [id, offset] of [
    ["prevMonth", -1],
    ["nextMonth", 1],
  ] as const)
    el(id).addEventListener("click", () => {
      month = new Date(month.getFullYear(), month.getMonth() + offset, 1);
      selectedDay = "";
      renderMonth();
    });
  el("latestMonth").addEventListener("click", showLatestMonth);
  window.addEventListener("storage", (event) => {
    if (event.key === "astrava-lab:v1:settings") {
      readSettings();
      syncSettings();
      scene?.apply(settings);
    }
    if (event.key === "astrava-lab:v1:collection")
      toast(
        "Тестовая коллекция изменена в другой вкладке. Обнови страницу, чтобы загрузить её.",
      );
  });
}
async function boot() {
  readSettings();
  syncSettings();
  setup();
  disable3D(true);
  try {
    const [a, b] = await Promise.all([
      loadJson("collection.json"),
      loadJson("covers.json"),
    ]);
    published = validateCollection(a);
    covers = (b as { items: CoverEntry[] }).items;
    collection = structuredClone(published);
    const saved = readLab<unknown>("collection");
    if (saved) {
      try {
        collection = validateCollection(saved);
        el("saveState").textContent = "Личная тестовая копия · восстановлено";
      } catch {
        toast(
          "Тестовое сохранение повреждено. Загружена опубликованная копия.",
        );
      }
    }
    renderCollection();
  } catch (e) {
    el("emptyState").hidden = false;
    el("emptyState").textContent =
      "Не удалось загрузить коллекцию. Обнови страницу или проверь подключение.";
    toast(String(e));
  }
  void startScene();
}
// Read-only diagnostic endpoint, no production state or credentials exposed.
Object.defineProperty(window, "astravaLab", {
  value: {
    stats: () => scene?.stats() ?? null,
    error: () => sceneError,
    settings: () => ({ ...settings }),
    snapshot: () => (collection ? structuredClone(collection) : null),
    context: () => scene?.renderer.getContext() ?? null,
  },
  writable: false,
});
void boot();
