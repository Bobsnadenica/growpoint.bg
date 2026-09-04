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
    base: env.VITE_BASE_PATH || "/",
    build: {
      outDir: path.join(projectDir, "dist"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return "react-vendor";
            return "auth-vendor";
          }
        }
      }
    }
  };
});
