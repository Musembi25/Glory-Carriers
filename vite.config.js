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
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-maskable-512.png"
      ],
      injectManifest: {
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,woff2,woff}",
          "community/backgrounds/*.jpeg",
          "community/fellowship.webp"
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      },
      manifest: {
        id: basePath,
        name: "The City on A Hill",
        short_name: "The City on A Hill",
        description:
          "The City on A Hill helps its community plan, serve, and grow together.",
        theme_color: "#35165c",
        background_color: "#ffffff",
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
        // Keep the manifest and service worker available on localhost too, so the
        // browser can offer installation while the app is being developed.
        enabled: true,
        type: "module"
      }
    })
  ],
  server: {
    host: true,
    port: 5173
  }
});
