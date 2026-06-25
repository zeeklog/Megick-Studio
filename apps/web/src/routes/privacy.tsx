import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/SiteLayout";
import { useI18n, getInitialLocale, translate, type TranslationKey } from "@/lib/i18n";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => {
    const locale = getInitialLocale();

    return seoHead({
      title: `${translate(locale, "privacy.title")} - Megick`,
      description: translate(locale, "privacy.intro"),
      path: "/privacy",
      locale,
    });
  },
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useI18n();

  const sections = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <SiteLayout>
      <div className="relative overflow-hidden pb-14 pt-16 sm:pb-16 sm:pt-24">
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            {t("privacy.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("privacy.lastUpdated")}</p>

          <div className="mt-10 space-y-10 sm:mt-12 sm:space-y-12">
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{t("privacy.intro")}</p>

            {sections.map((num) => {
              const titleKey = `privacy.section${num}.title` as TranslationKey;
              const contentKey = `privacy.section${num}.content` as TranslationKey;
              const itemsKey = `privacy.section${num}.items` as TranslationKey;

              const items = t(itemsKey)
                .split(/[;；]/)
                .filter((i) => i && i !== itemsKey);

              return (
                <section key={num} className="space-y-4">
                  <h2 className="text-xl font-semibold text-foreground sm:text-2xl">{t(titleKey)}</h2>
                  <p className="text-muted-foreground leading-relaxed">{t(contentKey)}</p>
                  {items.length > 0 && (
                    <ul className="grid gap-3 list-disc list-inside text-muted-foreground ml-2">
                      {items.map((item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {item.trim()}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
