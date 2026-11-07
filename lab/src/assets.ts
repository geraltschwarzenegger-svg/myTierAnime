declare global {
  interface Window {
    __ASTRAVA_ASSETS__?: Record<string, string>;
    __ASTRAVA_JSON__?: Record<string, unknown>;
  }
}
export function asset(path: string): string {
  const key = path.replace(/^\.\//, "");
  return (
    window.__ASTRAVA_ASSETS__?.[key] ??
    new URL("./" + key, document.baseURI).href
  );
}
export async function loadJson(path: string): Promise<unknown> {
  if (window.__ASTRAVA_JSON__ && Object.hasOwn(window.__ASTRAVA_JSON__, path))
    return structuredClone(window.__ASTRAVA_JSON__[path]);
  const response = await fetch(asset(path));
  if (!response.ok) throw new Error("Не удалось загрузить " + path);
  return response.json();
}
