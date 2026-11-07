import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
        },
      },
    },
  },
  server: { host: "0.0.0.0", port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
