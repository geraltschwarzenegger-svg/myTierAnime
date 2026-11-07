import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
mkdirSync("public/docs", { recursive: true });
for (const name of [
  "PLAN.md",
  "QA.md",
  "baseline.json",
  "models.json",
  "browser-results.json",
  "benchmark.json",
])
  if (existsSync("docs/" + name))
    copyFileSync("docs/" + name, "public/docs/" + name);
const esc = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const text = readFileSync("docs/PLAN.md", "utf8");
writeFileSync(
  "public/about.html",
  '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>ASTRAVA Lab — план и технологии</title><style>body{font:16px/1.8 system-ui,sans-serif;background:#f2f1eb;color:#202b30;max-width:950px;margin:45px auto;padding:0 22px}a{color:#335e45}pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}</style><a href="./">← Вернуться в лабораторию</a> · <a href="./docs/QA.md">Отчёт проверок</a><pre>' +
    esc(text) +
    "</pre></html>",
);
