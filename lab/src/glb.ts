export const MAX_GLB_BYTES = 20 * 1024 * 1024;
export function inspectGlb(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 20 || buffer.byteLength > MAX_GLB_BYTES)
    throw new Error("Нужен GLB размером до 20 МБ.");
  const d = new DataView(buffer);
  if (
    d.getUint32(0, true) !== 0x46546c67 ||
    d.getUint32(4, true) !== 2 ||
    d.getUint32(8, true) !== buffer.byteLength
  )
    throw new Error("Файл не является корректным GLB 2.0.");
  const n = d.getUint32(12, true);
  if (
    n % 4 !== 0 ||
    n < 2 ||
    n + 20 > buffer.byteLength ||
    d.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error("Повреждён заголовок GLB.");
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, n)));
  } catch {
    throw new Error("Повреждена структура модели GLB.");
  }
  let nodes = 0;
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    nodes++;
    if (nodes > 150000) throw new Error("Слишком сложная структура GLB.");
    for (const [k, child] of Object.entries(v)) {
      if (k === "uri")
        throw new Error(
          "Модель должна быть самодостаточной: внешние файлы и URI запрещены.",
        );
      if (
        k === "extensionsRequired" &&
        Array.isArray(child) &&
        child.some(
          (x) => String(x).includes("draco") || String(x).includes("basisu"),
        )
      )
        throw new Error("Сначала экспортируй модель без сжатия Draco/KTX2.");
      walk(child);
    }
  };
  walk(json);
  const accessors = json.accessors;
  if (
    Array.isArray(accessors) &&
    accessors.some((a) => Number(a.count) > 1500000)
  )
    throw new Error("В модели слишком много вершин.");
}
