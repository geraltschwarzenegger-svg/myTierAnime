import { build } from "vite";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const result = await build({
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  build: {
    write: false,
    target: "es2022",
    sourcemap: false,
    minify: true,
    lib: {
      entry: resolve("src/main.ts"),
      name: "AstravaOffline",
      formats: ["iife"],
    },
  },
});
const output = (Array.isArray(result) ? result[0] : result).output;
const js = output.find((a) => a.type === "chunk").code;
const css = output
  .filter((a) => a.type === "asset" && a.fileName.endsWith(".css"))
  .map((a) => String(a.source))
  .join("\n");
const datauri = (path, type) =>
  "data:" + type + ";base64," + readFileSync(path).toString("base64");
const assets = {
  "observatory.webp": datauri("public/observatory.webp", "image/webp"),
  "mark.svg": datauri("public/mark.svg", "image/svg+xml"),
};
const covers = JSON.parse(readFileSync("public/covers.json", "utf8"));
for (const c of covers.items) {
  const name = c.file.split("/").at(-1);
  assets["covers/" + name] = datauri("public/covers/" + name, "image/webp");
}
for (const t of ["S", "A", "B", "C"])
  assets["models/" + t + ".svg"] = datauri(
    "public/models/" + t + ".svg",
    "image/svg+xml",
  );
let fontcss = readFileSync("public/vendor/fonts.css", "utf8").replace(
  /url\("([^\"]+)"\)/g,
  (_, path) => 'url("' + datauri("public/vendor/" + path, "font/woff2") + '")',
);
let html = readFileSync("index.html", "utf8")
  .replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, "")
  .replace(
    /<link\s+rel="stylesheet"\s+href="\.\/vendor\/fonts\.css"\s*\/?>/,
    () => "<style>" + fontcss + "\n" + css + "</style>",
  );
for (const key of ["mark.svg", "observatory.webp", "models/S.svg"])
  html = html.replaceAll('"./' + key + '"', '"' + assets[key] + '"');
html = html
  .replaceAll('href="./classic/"', 'href="./ASTRAVA-V5-test.html"')
  .replaceAll('href="./about.html"', 'href="./README.txt"');
const payload =
  "window.__ASTRAVA_ASSETS__=" +
  JSON.stringify(assets) +
  ";window.__ASTRAVA_JSON__=" +
  JSON.stringify({
    "collection.json": JSON.parse(
      readFileSync("public/collection.json", "utf8"),
    ),
    "covers.json": covers,
  }) +
  ";";
html = html.replace(
  '<script type="module" src="/src/main.ts"></script>',
  () =>
    "<script>" +
    payload.replaceAll("</", "<\\/") +
    "</script><script>" +
    js.replaceAll("</", "<\\/") +
    "</script>",
);
mkdirSync("downloads/offline", { recursive: true });
writeFileSync("downloads/offline/ASTRAVA-Lab.html", html);
writeFileSync(
  "downloads/offline/collection.json",
  readFileSync("public/collection.json"),
);
writeFileSync(
  "downloads/offline/README.txt",
  "ASTRAVA Lab · отдельный тест\n\n1. Распакуй архив целиком.\n2. Открой ASTRAVA-Lab.html в современном браузере Chrome / Edge / Firefox. Интернет для опубликованной коллекции и 3D-эмблем не нужен.\n3. Привычный вид открывает ASTRAVA-V5-test.html. Для списка из архива импортируй collection.json через «Хранилище».\n4. Все сохранения изолированы префиксами astrava-lab. Основной сайт V5 не обновлялся.\n5. Собственную GLB можно загрузить через кнопку в мастерской; она находится в памяти только до перезагрузки.\n\nTypeScript + Three.js + GLSL. Rust и WebGPU в этом эксперименте не используются.\n",
);
console.log(
  "Standalone laboratory HTML:",
  Buffer.byteLength(html),
  "bytes; 69 embedded covers.",
);
