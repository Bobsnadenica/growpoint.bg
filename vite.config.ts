import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    root: path.join(projectDir, "src"),
    envDir: projectDir,
    publicDir: path.join(projectDir, "public"),
    plugins: [react()],
    base: env.VITE_BASE_PATH || "/dev/career/",
    build: {
      outDir: path.join(projectDir, "dist"),
      emptyOutDir: true
    }
  };
});
