import { localeToOg, type AppLocale } from "./i18n";

export const SITE_NAME = "Megick";
export const DEFAULT_SEO_IMAGE_PATH = "/effects/preview.jpg";
export const INDEX_ROBOTS = "index, follow";
export const NOINDEX_ROBOTS = "noindex, nofollow";

type ChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

type SeoRouteMatch = {
  fullPath?: string;
  routeId?: string;
  pathname?: string;
};

export const PUBLIC_SITEMAP_ENTRIES: Array<{
  path: string;
  priority: number;
  changefreq: ChangeFrequency;
}> = [
  { path: "/", priority: 1, changefreq: "daily" },
  { path: "/official", priority: 0.9, changefreq: "daily" },
  { path: "/templates", priority: 0.8, changefreq: "daily" },
  { path: "/about", priority: 0.6, changefreq: "monthly" },
  { path: "/privacy", priority: 0.3, changefreq: "yearly" },
  { path: "/terms", priority: 0.3, changefreq: "yearly" },
  { path: DEFAULT_SEO_IMAGE_PATH, priority: 0.4, changefreq: "monthly" },
];

export function publicSiteUrl() {
  return (__PUBLIC_SITE_URL__ || "https://megick.com").replace(/\/+$/, "");
}

export function absoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return new URL(path, `${publicSiteUrl()}/`).toString();
}

export function isLeafRouteMatch(matches: readonly SeoRouteMatch[] | undefined, fullPath: string) {
  const leafMatch = matches?.at(-1);
  return leafMatch?.fullPath === fullPath || leafMatch?.routeId === fullPath;
}

function normalizeDescription(description: string) {
  return description.replace(/\s+/g, " ").trim();
}

export function seoHead({
  title,
  description,
  path,
  imagePath = DEFAULT_SEO_IMAGE_PATH,
  imageAlt,
  locale,
  robots = INDEX_ROBOTS,
  ogType = "website",
  keywords,
}: {
  title: string;
  description: string;
  path: string;
  imagePath?: string;
  imageAlt?: string;
  locale?: AppLocale;
  robots?: string;
  ogType?: "website" | "article";
  keywords?: string[];
}) {
  const canonical = absoluteUrl(path);
  const image = absoluteUrl(imagePath);
  const cleanDescription = normalizeDescription(description);

  return {
    meta: [
      { title },
      { name: "description", content: cleanDescription },
      { name: "robots", content: robots },
      ...(keywords?.length ? [{ name: "keywords", content: keywords.join(", ") }] : []),
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:type", content: ogType },
      { property: "og:title", content: title },
      { property: "og:description", content: cleanDescription },
      { property: "og:url", content: canonical },
      { property: "og:image", content: image },
      { property: "og:image:alt", content: imageAlt ?? `${SITE_NAME} AI creative studio preview` },
      ...(locale ? [{ property: "og:locale", content: localeToOg(locale) }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: cleanDescription },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: canonical }],
  };
}

export function noIndexHead({ title, description }: { title: string; description?: string }) {
  return {
    meta: [
      { title },
      ...(description ? [{ name: "description", content: normalizeDescription(description) }] : []),
      { name: "robots", content: INDEX_ROBOTS },
    ],
  };
}
