import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "mock-stream",
      resolveId(id) {
        if (id === "stream") return "\0stream";
      },
      load(id) {
        if (id === "\0stream") return "export default {};";
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    modulePreload: false,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@fortune-sheet/")) return "fortune-sheet";
          if (id.includes("node_modules/@tiptap/") || id.includes("node_modules/prosemirror-")) {
            return "tiptap";
          }
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4000",
    },
  },
});
