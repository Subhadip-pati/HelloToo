import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const workspaceRoot = path.resolve(".");
const buildWatchRoots = [
  path.join(workspaceRoot, "src"),
  path.join(workspaceRoot, "index.html"),
];

const getLatestModifiedTime = (targetPath) => {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return stat.mtimeMs;

  return fs.readdirSync(targetPath).reduce((latest, entry) => {
    const entryPath = path.join(targetPath, entry);
    return Math.max(latest, getLatestModifiedTime(entryPath));
  }, stat.mtimeMs);
};

const getBuildId = () => {
  const latestMs = buildWatchRoots.reduce((latest, targetPath) => {
    return Math.max(latest, getLatestModifiedTime(targetPath));
  }, 0);

  if (!latestMs) return new Date().toISOString();
  return new Date(latestMs).toISOString();
};

const getBuildMeta = () => {
  const buildId = getBuildId();
  return JSON.stringify({
    app: "HelloToo",
    buildId,
    generatedAt: buildId,
  }, null, 2);
};

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(getBuildId()),
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
          res.end(getBuildMeta());
        });
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "build-meta.json",
          source: getBuildMeta(),
        });
      },
    },
  ],
});
