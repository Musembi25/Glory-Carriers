import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const isGitHubPages =
  process.env.GITHUB_PAGES === "true" || process.env.GITHUB_ACTIONS === "true";
const basePath = isGitHubPages ? "/Glory-Carriers/" : "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "favicon.png",
        "apple-touch-icon.png",
        "logo.svg",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-maskable-512.png"
      ],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      },
      manifest: {
        id: basePath,
        name: "Glory Carriers",
        short_name: "Glory Carriers",
        description:
          "Glory Carriers helps cell groups plan events, coordinate tasks, discipleship, and collaborate in real time.",
        theme_color: "#111111",
        background_color: "#f7f8fa",
        display: "standalone",
        display_override: ["standalone", "minimal-ui", "browser"],
        orientation: "any",
        scope: basePath,
        start_url: `${basePath}?source=pwa`,
        lang: "en",
        dir: "ltr",
        prefer_related_applications: false,
        categories: ["productivity", "education", "social"],
        icons: [
          {
            src: `${basePath}icons/icon-192.png`,
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: `${basePath}icons/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: `${basePath}icons/icon-maskable-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: `${basePath}apple-touch-icon.png`,
            sizes: "180x180",
            type: "image/png",
            purpose: "any"
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    host: true,
    port: 5173
  }
});
