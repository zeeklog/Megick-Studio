import { createFileRoute } from "@tanstack/react-router";
import { OfficialHomePage } from "@/components/OfficialHomePage";
import { getInitialLocale, translate } from "@/lib/i18n";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/official")({
  head: () => {
    const locale = getInitialLocale();

    return seoHead({
      title: translate(locale, "home.meta.title"),
      description: translate(locale, "home.meta.description"),
      path: "/official",
      locale,
    });
  },
  component: OfficialHomePage,
});
