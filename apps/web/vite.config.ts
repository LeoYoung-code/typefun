import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@typefun/typing-core": fileURLToPath(
        new URL("../../packages/typing-core/src/index.ts", import.meta.url)
      )
    }
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  }
});
