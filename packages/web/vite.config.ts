import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          const normalizedId = id.replace(/\\/g, "/");
          const packageMatch = normalizedId.match(
            /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/,
          );
          const packageId = packageMatch?.[1];
          if (!packageId) {
            return;
          }

          const packageName = packageId.replace("@", "").replace("/", "-");

          if (packageId === "react" || packageId === "react-dom" || packageId === "scheduler" || packageId === "use-sync-external-store") {
            return "vendor-react";
          }

          return `vendor-${packageName}`;
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