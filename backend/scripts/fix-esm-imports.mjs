import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../dist");

async function walk(dir) {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const entryStat = await stat(fullPath);
    if (entryStat.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!fullPath.endsWith(".js")) continue;

    const source = await readFile(fullPath, "utf8");
    const withStaticImports = source.replace(
      /(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,
      (match, prefix, specifier, suffix) => {
        if (path.extname(specifier)) return match;
        return `${prefix}${specifier}.js${suffix}`;
      },
    );

    const updated = withStaticImports.replace(
      /(import\s*\(\s*['"])(\.\.?\/[^'"]+)(['"]\s*\))/g,
      (match, prefix, specifier, suffix) => {
        if (path.extname(specifier)) return match;
        return `${prefix}${specifier}.js${suffix}`;
      },
    );

    if (updated !== source) {
      await writeFile(fullPath, updated, "utf8");
    }
  }
}

await walk(distDir);
