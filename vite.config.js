import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { rollupOptions: { input: { main: resolve(__dirname, "index.html"), fa: resolve(__dirname, "fa.html"),
      pmo: resolve(__dirname, "pmo.html"), exec: resolve(__dirname, "exec.html"),
      setup: resolve(__dirname, "setup.html") } } },
});
