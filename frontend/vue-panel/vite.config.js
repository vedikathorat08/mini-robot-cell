import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  define: { "process.env.NODE_ENV": '"production"' },
  build: {
    lib: { entry: "src/main.js", name: "VuePanel", formats: ["iife"], fileName: () => "panel.js" },
    rollupOptions: { output: { assetFileNames: "panel[extname]" } },
  },
});