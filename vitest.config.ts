import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@renderer": fileURLToPath(new URL("./src/renderer", import.meta.url)),
      "@backend": fileURLToPath(new URL("./src/backend", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "tools/photo-booth-agent/**"],
    globals: true,
    setupFiles: ["./src/renderer/test/setup.ts"]
  }
});
