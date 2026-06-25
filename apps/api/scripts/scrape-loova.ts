/**
 * One-shot scraper for the public marketing site at https://loova.ai/
 *
 *   pnpm --filter @megick/api scrape:loova
 *
 * Pulls a handful of homepage gallery items, downloads the asset, uploads it
 * to OSS, and creates a `ShowcaseItem` row. Use this only once to bootstrap
 * the showcase content; admins can manage entries afterwards in /admin/showcase.
 *
 * Note: the scrape selectors are best-effort. If loova.ai changes their HTML
 * the script will simply skip what it cannot find.
 */
import "reflect-metadata";
import axios from "axios";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { OssService } from "../src/modules/oss/oss.service";
import { ShowcaseService } from "../src/modules/showcase/showcase.service";

const SOURCE_URL = "https://loova.ai/";
const TEXT_TO_IMAGE_URL = "https://loova.ai/text-to-image";

interface RawItem {
  title: string;
  prompt: string;
  type: "TEXT2IMAGE" | "IMAGE2VIDEO";
  url: string;
  durationMs?: number;
}

const curatedItems: RawItem[] = [
  {
    title: "Pick an image model",
    prompt: "Choose an AI image model and prepare a text-to-image generation.",
    type: "TEXT2IMAGE",
    url: "https://static.loova.ai/upload/www/pick_image_model_a17d5cc285.webm",
    durationMs: 5000,
  },
  {
    title: "Prompt to image",
    prompt: "Write a visual prompt and generate a finished AI image.",
    type: "TEXT2IMAGE",
    url: "https://static.loova.ai/upload/www/input_image_model_8d10bcd3a7.webm",
    durationMs: 5000,
  },
  {
    title: "Creative playground",
    prompt: "AI image and video generation in one creative workspace.",
    type: "TEXT2IMAGE",
    url: "https://static.loova.ai/upload/www/Your_All_In_One_Creative_Playground_2_926b4086bf.png",
  },
  {
    title: "Create image",
    prompt: "Turn a written idea into image output with Loova.",
    type: "TEXT2IMAGE",
    url: "https://static.loova.ai/upload/www/Create_Image_fb303969d8.mp4",
    durationMs: 5000,
  },
  {
    title: "Seedance motion",
    prompt: "Image-to-video style motion showcase powered by Loova models.",
    type: "IMAGE2VIDEO",
    url: "https://static.loova.ai/upload/www/seedance_hero_52e63f1aff.mp4",
    durationMs: 5000,
  },
  {
    title: "Live portrait",
    prompt: "Animate a still concept into a vivid short video.",
    type: "IMAGE2VIDEO",
    url: "https://res.loova.ai/template/20260425/happy-horse-live.webm",
    durationMs: 5000,
  },
  {
    title: "Friendship scene",
    prompt: "Create expressive character motion from a visual idea.",
    type: "IMAGE2VIDEO",
    url: "https://static.loova.ai/upload/www/Friendship_c4d2e70257.webm",
    durationMs: 5000,
  },
  {
    title: "Kling showcase",
    prompt: "High quality AI video generation with detailed movement.",
    type: "IMAGE2VIDEO",
    url: "https://static.loova.ai/upload/www/kling_3_0_com_790bf38863.mp4",
    durationMs: 5000,
  },
];

async function fetchPage(url: string): Promise<string> {
  const res = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Megick-Scraper/1.0; +https://megick.example.com)",
    },
    timeout: 30_000,
  });
  return res.data as string;
}

function extractItems(html: string, type: RawItem["type"]): RawItem[] {
  const items: RawItem[] = [];
  const mediaRe = /https:\/\/[^"' )]+?\.(?:png|jpe?g|webp|gif|mp4|webm)(?:\?[^"' )]*)?/gi;
  const seen = new Set<string>();
  for (const [url] of html.matchAll(mediaRe)) {
    if (seen.has(url) || url.includes("/logo.")) continue;
    seen.add(url);
    const filename = decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "Loova showcase");
    const title = filename
      .replace(/\.(png|jpe?g|webp|gif|mp4|webm)$/i, "")
      .replace(/[_-]+[a-f0-9]{8,}$/i, "")
      .replace(/[_-]+/g, " ")
      .trim();
    items.push({
      title: title.slice(0, 80) || "Loova showcase",
      prompt: `Showcase imported from loova.ai: ${title || filename}`,
      type,
      url,
      durationMs: url.match(/\.(mp4|webm)(?:\?|$)/i) ? 5000 : undefined,
    });
  }
  return items;
}

async function downloadBuffer(url: string): Promise<{ buf: Buffer; contentType: string }> {
  const res = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer", timeout: 60_000 });
  const ct = res.headers["content-type"];
  return {
    buf: Buffer.from(res.data),
    contentType: typeof ct === "string" ? ct : "application/octet-stream",
  };
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });
  const oss = app.get(OssService);
  const showcase = app.get(ShowcaseService);

  console.log(`Fetching ${SOURCE_URL} and ${TEXT_TO_IMAGE_URL}...`);
  const [homeHtml, textToImageHtml] = await Promise.all([fetchPage(SOURCE_URL), fetchPage(TEXT_TO_IMAGE_URL)]);
  const discovered = [
    ...extractItems(textToImageHtml, "TEXT2IMAGE").filter((item) => item.url.includes("upload/www")),
    ...extractItems(homeHtml, "IMAGE2VIDEO").filter((item) => item.url.match(/\.(mp4|webm)(?:\?|$)/i)),
  ];
  const items = uniqueByUrl([...curatedItems, ...discovered]).slice(0, curatedItems.length);
  console.log(`Found ${items.length} candidate items.`);

  const sortOrderByType: Record<RawItem["type"], number> = { TEXT2IMAGE: 0, IMAGE2VIDEO: 0 };
  for (const item of items) {
    try {
      const { buf, contentType } = await downloadBuffer(item.url);
      const { key, url } = await oss.putBuffer("showcase/loova", buf, contentType, { visibility: "PUBLIC" });
      if (!url) throw new Error("OSS upload did not return a public URL");
      const existing = await showcase.findBySource(item.url);
      const sortOrder = sortOrderByType[item.type];
      await showcase.upsert({
        id: existing?.id,
        type: item.type,
        title: item.title || `Loova item #${sortOrder + 1}`,
        prompt: item.prompt,
        afterAssetKey: key,
        durationMs: item.durationMs,
        source: item.url,
        sortOrder,
        isActive: true,
      });
      console.log(`  ✓ ${item.title} (${item.type})`);
      sortOrderByType[item.type] += 1;
    } catch (err) {
      console.warn(`  ✗ Skip ${item.url}: ${(err as Error).message}`);
    }
  }

  console.log(
    `\nDone. Imported ${sortOrderByType.TEXT2IMAGE + sortOrderByType.IMAGE2VIDEO} showcase item(s). Manage them at /admin/showcase.`,
  );
  await app.close();
}

function uniqueByUrl(items: RawItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
