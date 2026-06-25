import { createFileRoute } from "@tanstack/react-router";
import { OfficialHomePageRich } from "@/components/OfficialHomePageRich";
import { getInitialLocale, translate } from "@/lib/i18n";
import { seoHead } from "@/lib/seo";
import { getRequestLocale } from "@/lib/request-locale";
import type { AppLocale } from "@/lib/i18n";

interface HomeLoaderData {
  locale: AppLocale;
}

export const Route = createFileRoute("/")({
  loader: async (): Promise<HomeLoaderData> => {
    const locale = await getRequestLocale();
    return { locale };
  },
  head: ({ loaderData }) => {
    const locale = loaderData?.locale ?? getInitialLocale();
    const head = seoHead({
      title: translate(locale, "home.meta.title"),
      description: translate(locale, "home.meta.description"),
      path: "/",
      locale,
      imagePath: "/index-preview.webp",
      imageAlt: "Megick Studio desktop app preview",
    });
    return {
      ...head,
      links: [
        ...(head.links ?? []),
        {
          rel: "preload",
          as: "image",
          href: "/index-preview.webp",
          type: "image/webp",
          imageSrcSet: "/index-preview.webp 884w, /index-preview@2x.webp 1768w",
          imageSizes: "(min-width: 1024px) 48vw, 100vw",
          fetchPriority: "high",
        },
      ],
    };
  },
  component: HomePage,
});

function HomePage() {
  Route.useLoaderData();
  return <OfficialHomePageRich />;
}
