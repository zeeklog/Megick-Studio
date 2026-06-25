import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/SiteLayout";
import { useI18n, getInitialLocale, translate } from "@/lib/i18n";
import { seoHead, absoluteUrl } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () => {
    const locale = getInitialLocale();
    return seoHead({
      title: `${translate(locale, "about.title")} - Megick`,
      description: translate(locale, "about.description"),
      path: "/about",
      locale,
    });
  },
  component: AboutPage,
});

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Megick",
  alternateName: "Megick AI Creative Studio",
  url: "https://megick.com",
  logo: absoluteUrl("/effects/preview.jpg"),
  description: "Next-generation AI creative tool for image and video generation. Turn ideas into stunning reality in 30 seconds.",
  foundingDate: "2024",
  founder: {
    "@type": "Person",
    name: "Megick Team",
  },
  address: {
    "@type": "PostalAddress",
    addressCountry: "US",
    addressRegion: "Wyoming",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "Sales",
      email: "sales@megick.com",
      availableLanguage: ["English", "Chinese"],
    },
    {
      "@type": "ContactPoint",
      contactType: "Customer Support",
      email: "support@megick.com",
      availableLanguage: ["English", "Chinese"],
    },
    {
      "@type": "ContactPoint",
      contactType: "Feedback",
      email: "001@megick.com",
      availableLanguage: ["English", "Chinese"],
    },
  ],
  sameAs: [],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Megick",
  url: "https://megick.com",
  description: "Next-generation AI creative tool for image and video generation.",
  inLanguage: ["en", "zh-CN"],
};

function AboutPage() {
  const { t } = useI18n();
  const contacts = [
    { labelKey: "about.contact.business", email: "sales@megick.com" },
    { labelKey: "about.contact.support", email: "support@megick.com" },
    { labelKey: "about.contact.feedback", email: "001@megick.com" },
  ] as const;

  return (
    <SiteLayout>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />

      <div className="relative overflow-hidden pb-14 pt-12 sm:pb-16 sm:pt-20">
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl" style={{ color: "var(--theme-text)" }}>
            {t("about.title")}
          </h1>
          <p className="mt-5 text-lg sm:mt-6 sm:text-xl" style={{ color: "var(--theme-text-muted)" }}>
            {t("about.description")}
          </p>

          <div className="mt-10 space-y-12 sm:mt-16 sm:space-y-14">
            {/* Story */}
            <section>
              <h2 className="text-2xl font-semibold" style={{ color: "var(--theme-text)" }}>{t("about.story.title")}</h2>
              <p className="mt-4 leading-relaxed" style={{ color: "var(--theme-text-muted)" }}>{t("about.story.content")}</p>
            </section>

            {/* Company */}
            <section>
              <div className="rounded-3xl border p-6 shadow-[0_24px_80px_rgba(0,0,0,0.08)] sm:p-8" style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--theme-surface) 92%, var(--theme-primary) 8%), var(--glass-bg))", borderColor: "var(--glass-border)" }}>
                <p className="text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: "var(--theme-primary)" }}>Company</p>
                <h2 className="mt-3 text-2xl font-semibold" style={{ color: "var(--theme-text)" }}>{t("about.company.title")}</h2>
                <p className="mt-4 leading-relaxed" style={{ color: "var(--theme-text-muted)" }}>{t("about.company.content")}</p>
              </div>
            </section>

            {/* Mission */}
            <section>
              <h2 className="text-2xl font-semibold" style={{ color: "var(--theme-text)" }}>{t("about.mission.title")}</h2>
              <p className="mt-4 leading-relaxed" style={{ color: "var(--theme-text-muted)" }}>{t("about.mission.content")}</p>
            </section>

            {/* Extended: Why Megick */}
            <section>
              <h2 className="text-2xl font-semibold" style={{ color: "var(--theme-text)" }}>{t("about.why.title")}</h2>
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="rounded-xl border p-5" style={{ borderColor: "var(--glass-border)", backgroundColor: "var(--glass-bg)" }}>
                    <h3 className="font-semibold" style={{ color: "var(--theme-text)" }}>{t(`about.why.item${n}.title` as any)}</h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--theme-text-muted)" }}>{t(`about.why.item${n}.desc` as any)}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Extended: Team */}
            <section>
              <h2 className="text-2xl font-semibold" style={{ color: "var(--theme-text)" }}>{t("about.team.title")}</h2>
              <p className="mt-4 leading-relaxed" style={{ color: "var(--theme-text-muted)" }}>{t("about.team.content")}</p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-2xl font-semibold" style={{ color: "var(--theme-text)" }}>{t("about.contact.title")}</h2>
              <dl className="mt-4 grid gap-3">
                {contacts.map((contact) => (
                  <div key={contact.email} className="flex flex-col gap-1 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: "var(--glass-bg)", borderColor: "var(--glass-border)", color: "var(--theme-text)" }}>
                    <dt className="font-medium">{t(contact.labelKey)}</dt>
                    <dd>
                      <a href={`mailto:${contact.email}`} className="transition-opacity hover:opacity-75" style={{ color: "var(--theme-primary)" }}>{contact.email}</a>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
