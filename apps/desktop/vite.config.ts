import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath, URL } from "node:url";

function configuredAllowedHosts(): string[] {
  return [
    "roller-rumble.birdsnest.family",
    ...(process.env.ROLLER_RUMBLE_VITE_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean)
  ];
}

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "./src/renderer/routes",
      generatedRouteTree: "./src/renderer/routeTree.gen.ts"
    }),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"]
      }
    })
  ],
  resolve: {
    alias: {
      "@renderer": fileURLToPath(new URL("./src/renderer", import.meta.url)),
      "@backend": fileURLToPath(new URL("./src/backend", import.meta.url))
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: configuredAllowedHosts()
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  }
});
