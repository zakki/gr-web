import { defineConfig } from "vite";

export default defineConfig({
  // Keep built asset paths relative to index.html (GitHub Pages friendly).
  base: "./",
  publicDir: "docs",
});
