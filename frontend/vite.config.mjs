import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildId = new Date().toISOString();
const buildMeta = JSON.stringify({
  app: "HelloToo",
  buildId,
  generatedAt: buildId,
}, null, 2);

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 5173,
    },
  },
  plugins: [
    react(),
    {
      name: "helloto-build-meta",
      configureServer(server) {
        server.middlewares.use("/build-meta.json", (_req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(buildMeta);
        });
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "build-meta.json",
          source: buildMeta,
        });
      },
    },
  ],
});
