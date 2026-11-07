import { writeFileSync, mkdirSync } from "node:fs";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { makeSculpture } from "../src/models";
import { TIER_ORDER, TIER_META } from "../src/data";
class Reader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((result) => {
      this.result =
        "data:" +
        blob.type +
        ";base64," +
        Buffer.from(result).toString("base64");
      this.onloadend?.();
    });
  }
}
Object.assign(globalThis, { FileReader: Reader });
mkdirSync("public/models", { recursive: true });
const stats = [];
for (const tier of TIER_ORDER) {
  const model = makeSculpture(tier);
  const result = await new GLTFExporter().parseAsync(model.root, {
    binary: true,
  });
  if (!(result instanceof ArrayBuffer)) throw new Error("GLB export failed");
  writeFileSync("public/models/" + tier + ".glb", Buffer.from(result));
  stats.push({ tier, bytes: result.byteLength, ...model.stats });
  const color = TIER_META[tier].color;
  writeFileSync(
    "public/models/" + tier + ".svg",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><radialGradient id="g"><stop stop-color="' +
      color +
      '" stop-opacity=".25"/><stop offset="1" stop-color="' +
      color +
      '" stop-opacity="0"/></radialGradient></defs><circle cx="200" cy="200" r="180" fill="url(#g)"/><path d="M200 40 335 130 305 295 200 360 95 295 65 130Z" fill="none" stroke="' +
      color +
      '" stroke-width="2"/><path d="M200 65 312 140 285 280 200 335 115 280 88 140Z" fill="none" stroke="' +
      color +
      '" opacity=".35"/><text x="200" y="245" text-anchor="middle" fill="' +
      color +
      '" font-family="Georgia,serif" font-size="150">' +
      tier +
      "</text></svg>",
  );
  model.dispose();
}
writeFileSync("docs/models.json", JSON.stringify(stats, null, 2) + "\n");
console.log(stats);
