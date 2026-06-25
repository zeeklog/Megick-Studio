import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import wasm from "vite-plugin-wasm";

type ChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

type SitemapEntry = {
  path: string;
  priority: number;
  changefreq: ChangeFrequency;
};

const DEFAULT_SEO_IMAGE_PATH = "/effects/preview.jpg";

const STATIC_PUBLIC_SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/", priority: 1, changefreq: "daily" },
  { path: "/official", priority: 0.9, changefreq: "daily" },
  { path: "/templates", priority: 0.8, changefreq: "daily" },
  { path: "/about", priority: 0.6, changefreq: "monthly" },
  { path: "/privacy", priority: 0.3, changefreq: "yearly" },
  { path: "/terms", priority: 0.3, changefreq: "yearly" },
  { path: DEFAULT_SEO_IMAGE_PATH, priority: 0.4, changefreq: "monthly" },
];

export default defineConfig(({ mode }) => {
  const webEnv = loadEnv(mode, process.cwd(), "");
  const sharedEnv = loadEnv(mode, resolve(process.cwd(), "../api"), "");
  const localDevDefaults =
    mode === "development"
      ? {
          API_BASE_URL: "http://127.0.0.1:3001",
          PUBLIC_BASE_URL: "http://localhost:8080",
          WEB_BASE_URL: "http://localhost:8080",
        }
      : {};
  const env = { ...sharedEnv, ...localDevDefaults, ...webEnv };
  const webPort = webEnv.PORT ?? "8080";

  for (const key of ["API_BASE_URL", "PUBLIC_BASE_URL", "WEB_BASE_URL"] as const) {
    const value = env[key];
    if (value && !process.env[key]) {
      process.env[key] = value;
    }
  }
  process.env.PORT = process.env.PORT ?? webPort;

  const apiTarget = env.API_BASE_URL ?? "http://127.0.0.1:3001";
  const publicSiteUrl = (env.PUBLIC_BASE_URL ?? env.WEB_BASE_URL ?? "http://localhost:8080").replace(
    /\/+$/,
    "",
  );
  const sitemapPages = STATIC_PUBLIC_SITEMAP_ENTRIES.map((entry) => ({
    path: entry.path,
    sitemap: {
      priority: entry.priority,
      changefreq: entry.changefreq,
    },
  }));

  return {
    define: {
      __PUBLIC_SITE_URL__: JSON.stringify(publicSiteUrl),
    },
    server: {
      host: "0.0.0.0",
      port: Number(webPort),
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: false,
          ws: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: false,
        },
      },
    },
    plugins: [
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart({
        router: {
          codeSplittingOptions: {
            defaultBehavior: [["component"], ["pendingComponent"], ["errorComponent"], ["notFoundComponent"]],
          },
        },
        pages: sitemapPages,
        sitemap: {
          enabled: Boolean(publicSiteUrl),
          host: publicSiteUrl,
          outputPath: "sitemap.xml",
        },
      }),
      wasm(),
      viteReact(),
    ],
    resolve: {
      dedupe: ["react", "react-dom", "@tanstack/react-router"],
    },
  };
});
