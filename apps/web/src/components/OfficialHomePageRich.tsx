import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { ArrowRight, Sparkles, LayoutTemplate, Star } from "lucide-react";
import type { DesktopLatestReleaseResponse, DesktopPlatform } from "@megick/api-types";
import { useAuth } from "@/hooks/useAuth";
import { useLoginDialog } from "@/components/auth/LoginDialogContext";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { apiGet } from "@/lib/api-client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import type { NavigationMenuItem } from "@/lib/navigation-menus";
import { DEFAULT_HEADER_MENU_ITEMS } from "@/lib/navigation-menus";

const EASE = "cubic-bezier(0.25,0.1,0.25,1)";

// ── Existing Hero Icons (kept from original) ──────────────────────────

const StarburstIcon = ({ className, style }: { className?: string; style?: CSSProperties }) => (
  <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
    <path fill="currentColor" d="M50 0 L55 38 L88 18 L62 45 L100 50 L62 55 L88 82 L55 62 L50 100 L45 62 L12 82 L38 55 L0 50 L38 45 L12 18 L45 38 Z" />
  </svg>
);

const WindowsLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 88 88" className={className} aria-hidden="true">
    <path fill="#00A4EF" d="M0 12.4 36.1 7.5v34.9H0V12.4Z" />
    <path fill="#00A4EF" d="M40.1 6.9 88 0v42.4H40.1V6.9Z" />
    <path fill="#00A4EF" d="M0 46.4h36.1v34.9L0 76.4v-30Z" />
    <path fill="#00A4EF" d="M40.1 46.4H88V88l-47.9-6.8V46.4Z" />
  </svg>
);

const AppleLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="currentColor" d="M16.365 1.43c0 1.14-.462 2.18-1.204 2.93-.79.8-2.071 1.42-3.111 1.33-.13-1.1.382-2.28 1.104-3.02.8-.82 2.191-1.43 3.211-1.24Zm3.392 16.18c-.602 1.37-.892 1.98-1.674 3.19-1.083 1.67-2.608 3.75-4.493 3.77-1.674.02-2.106-1.09-4.383-1.08-2.277.01-2.759 1.11-4.433 1.09-1.885-.02-3.319-1.9-4.402-3.57-3.01-4.65-3.322-10.1-1.464-12.99 1.324-2.06 3.41-3.26 5.366-3.26 1.996 0 3.25 1.1 4.904 1.1 1.604 0 2.578-1.1 4.884-1.1 1.745 0 3.59.95 4.904 2.59-4.312 2.36-3.61 8.52.795 10.26Z" />
  </svg>
);

// ── Small Components ──────────────────────────────────────────────────

function ScrollText({ text }: { text: string }) {
  return (
    <span className="h-[20px] overflow-hidden">
      <span className="flex flex-col transition-transform duration-500 group-hover:-translate-y-1/2" style={{ transitionTimingFunction: EASE }}>
        <span className="flex h-[20px] items-center">{text}</span>
        <span className="flex h-[20px] items-center">{text}</span>
      </span>
    </span>
  );
}

function StudioAction({ children, variant = "primary", className = "", iconClassName = "h-7 w-7", iconColor = "primary", onClick }: {
  children: ReactNode; variant?: "primary" | "cta"; className?: string; iconClassName?: string; iconColor?: "primary" | "text"; onClick: () => void;
}) {
  const backgroundVar = variant === "primary" ? "var(--theme-primary)" : "var(--theme-cta)";
  const hoverVar = variant === "primary" ? "var(--theme-primary-hover)" : "var(--theme-cta-hover)";
  const foregroundVar = variant === "primary" ? "var(--theme-primary-foreground)" : "var(--theme-cta-foreground)";
  return (
    <button type="button" onClick={onClick}
      className={`group flex items-center gap-2 rounded-full font-medium shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-500 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      style={{ backgroundColor: backgroundVar, color: foregroundVar }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = hoverVar; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = backgroundVar; }}
    >
      {children}
      <span className={`flex items-center justify-center rounded-full ${iconClassName}`} style={{ backgroundColor: "var(--theme-surface)" }}>
        <ArrowRight size={14} className="transition-transform duration-500 group-hover:-rotate-45" style={{ transitionTimingFunction: EASE, color: iconColor === "primary" ? "var(--theme-primary)" : "var(--theme-text)" }} />
      </span>
    </button>
  );
}

function DesktopDownloadButton({ platform, release, loading }: { platform: DesktopPlatform; release?: DesktopLatestReleaseResponse; loading: boolean }) {
  const { t } = useI18n();
  const Icon = platform === "MAC" ? AppleLogo : WindowsLogo;
  const label = platform === "MAC" ? "Mac" : "Windows";
  const disabled = loading || !release?.downloadUrl;
  const platformKey = platform === "MAC" ? "home.glaze.download.mac" : "home.glaze.download.windows";
  return (
    <button type="button" disabled={disabled} onClick={() => { if (release?.downloadUrl) window.location.href = release.downloadUrl; }}
      className="group relative flex min-w-[220px] flex-1 items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 text-left text-[13px] font-medium shadow-[0_16px_50px_rgba(0,0,0,0.10)] backdrop-blur-2xl transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(0,0,0,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:min-w-[250px] sm:text-[14px] lg:min-w-0"
      style={{ borderColor: "var(--glass-border)", background: "color-mix(in oklab, var(--theme-surface) 76%, transparent)", color: "var(--theme-text)", transitionTimingFunction: EASE }}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-70" />
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border" style={{ backgroundColor: "var(--theme-bg)", borderColor: "var(--glass-border)" }}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate">{t(platformKey as TranslationKey)}</span>
        <span className="text-[11px] font-normal opacity-65">
          {loading ? t("home.glaze.download.loading") : release ? `${label} v${release.version}` : t("home.glaze.download.unavailable", { platform: label })}
        </span>
      </span>
      <span className="relative rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] opacity-70" style={{ borderColor: "var(--glass-border)" }}>{platform}</span>
    </button>
  );
}

function DesktopPreview({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="relative mx-auto w-full max-w-[884px] cursor-pointer overflow-hidden bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:ml-auto"
      aria-label="Megick Studio desktop app preview">
      <img
        src="/index-preview.webp"
        srcSet="/index-preview.webp 884w, /index-preview@2x.webp 1768w"
        sizes="(min-width: 1024px) 48vw, 100vw"
        fetchPriority="high"
        decoding="async"
        alt="Megick Studio desktop app screenshot"
        className="block w-full select-none rounded-[1.6rem] sm:rounded-[2rem]"
        draggable={false}
      />
    </button>
  );
}

function HomeHeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,color-mix(in_oklab,var(--theme-primary)_22%,transparent),transparent_33%),radial-gradient(circle_at_78%_8%,color-mix(in_oklab,var(--theme-starburst)_16%,transparent),transparent_30%),linear-gradient(135deg,color-mix(in_oklab,var(--theme-surface)_80%,transparent),var(--theme-bg)_62%)]" />
      <div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.10)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[var(--theme-bg)] to-transparent" />
    </div>
  );
}

function useAfterLoadIdle(timeout = 5000) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
    let idleId: number | undefined;

    const run = () => {
      if (!cancelled) setReady(true);
    };
    const schedule = () => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(run, { timeout });
      } else {
        timeoutId = globalThis.setTimeout(run, Math.min(timeout, 3000));
      }
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (typeof idleId === "number" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) globalThis.clearTimeout(timeoutId);
    };
  }, [ready, timeout]);

  return ready;
}

// ── New Sections ──────────────────────────────────────────────────────

function SectionHeading({ kicker, title, description }: { kicker?: string; title: string; description?: string }) {
  return (
    <div className="mb-12 text-center">
      {kicker && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--theme-primary)" }}>{kicker}</p>}
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: "var(--theme-text)" }}>{title}</h2>
      {description && <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: "var(--theme-text-muted)" }}>{description}</p>}
    </div>
  );
}


// ── Template Center Entry Card ────────────────────────────────────────

function TemplateEntryCard({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <div className="relative overflow-hidden rounded-2xl border transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_80px_rgba(0,0,0,0.15)]" style={{ borderColor: "var(--glass-border)", background: "linear-gradient(135deg, color-mix(in oklab, var(--theme-primary) 15%, var(--theme-surface)), var(--glass-bg))" }}>
      <div className="flex flex-col items-center gap-6 p-8 sm:flex-row sm:p-10">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: "color-mix(in oklab, var(--theme-primary) 25%, transparent)" }}>
          <LayoutTemplate className="h-8 w-8" style={{ color: "var(--theme-primary)" }} />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h3 className="text-xl font-bold" style={{ color: "var(--theme-text)" }}>{t("home.templates.entry.title")}</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--theme-text-muted)" }}>{t("home.templates.entry.description")}</p>
        </div>
        <button type="button" onClick={onClick}
          className="group flex shrink-0 items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-300 hover:scale-105"
          style={{ backgroundColor: "var(--theme-primary)", color: "var(--theme-primary-foreground)" }}>
          {t("home.templates.entry.cta")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

// ── Success Case Section ───────────────────────────────────────────────

function SuccessCasesSection() {
  const { t } = useI18n();
  const cases = [1, 2, 3] as const;
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading kicker={t("home.cases.kicker")} title={t("home.cases.title")} description={t("home.cases.description")} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((n) => (
            <div key={n} className="rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1" style={{ borderColor: "var(--glass-border)", backgroundColor: "var(--glass-bg)" }}>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: "color-mix(in oklab, var(--theme-primary) 15%, transparent)" }}>
                <Star className="h-5 w-5" style={{ color: "var(--theme-primary)" }} />
              </div>
              <p className="text-lg font-semibold" style={{ color: "var(--theme-text)" }}>{t(`home.cases.case${n}.title` as TranslationKey)}</p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--theme-text-muted)" }}>{t(`home.cases.case${n}.description` as TranslationKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Features Summary ───────────────────────────────────────────────────

function FeaturesSummarySection() {
  const { t } = useI18n();
  const features = ["image", "video", "fast", "styles", "license", "api"] as const;
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading kicker={t("home.features.titleBefore")} title={t("home.features.titleHighlight")} description={t("home.features.description")} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f} className="rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1" style={{ borderColor: "var(--glass-border)", backgroundColor: "var(--glass-bg)" }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: "color-mix(in oklab, var(--theme-primary) 15%, transparent)" }}>
                <Sparkles className="h-5 w-5" style={{ color: "var(--theme-primary)" }} />
              </div>
              <h3 className="mt-4 text-lg font-semibold" style={{ color: "var(--theme-text)" }}>{t(`home.feature.${f}.title` as TranslationKey)}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--theme-text-muted)" }}>{t(`home.feature.${f}.desc` as TranslationKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA Section ────────────────────────────────────────────────────────

function HomeCTASection({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border p-10 sm:p-14" style={{ borderColor: "var(--glass-border)", background: "linear-gradient(135deg, color-mix(in oklab, var(--theme-primary) 18%, var(--theme-surface)), var(--glass-bg))" }}>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: "var(--theme-text)" }}>{t("home.cta.titleBefore")} <span style={{ color: "var(--theme-primary)" }}>{t("home.cta.titleHighlight")}</span></h2>
          <p className="mx-auto mt-4 max-w-lg text-lg" style={{ color: "var(--theme-text-muted)" }}>{t("home.cta.description")}</p>
          <div className="mt-8">
            <button type="button" onClick={onClick}
              className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-semibold shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-500 hover:-translate-y-1"
              style={{ backgroundColor: "var(--theme-primary)", color: "var(--theme-primary-foreground)" }}>
              {t("home.cta.button")}
              <ArrowRight className="h-5 w-5 transition-transform duration-500 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function OfficialHomePageRich({
  headerMenuItems,
}: {
  headerMenuItems?: NavigationMenuItem[];
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { openLogin } = useLoginDialog();
  const navigate = useNavigate();
  const idleReady = useAfterLoadIdle();
  const [clientHeaderMenuItems, setClientHeaderMenuItems] = useState<NavigationMenuItem[]>(
    headerMenuItems ?? DEFAULT_HEADER_MENU_ITEMS,
  );
  const macReleaseQ = useQuery({
    queryKey: ["desktop-updates", "latest", "MAC"],
    queryFn: () => apiGet<DesktopLatestReleaseResponse>("/api/desktop-updates/latest", { query: { platform: "MAC" } }),
    enabled: idleReady,
    retry: false,
  });
  const winReleaseQ = useQuery({
    queryKey: ["desktop-updates", "latest", "WIN"],
    queryFn: () => apiGet<DesktopLatestReleaseResponse>("/api/desktop-updates/latest", { query: { platform: "WIN" } }),
    enabled: idleReady,
    retry: false,
  });

  useEffect(() => {
    if (!idleReady) return;
    let cancelled = false;

    void apiGet<NavigationMenuItem[]>("/api/navigation-menus", {
      query: { area: "HEADER" },
    })
      .then((items) => {
        if (!cancelled) setClientHeaderMenuItems(items);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [idleReady]);

  const showDesktopDownloads = macReleaseQ.isLoading || winReleaseQ.isLoading || Boolean(macReleaseQ.data || winReleaseQ.data);

  const startCreating = () => {
    if (user) { void navigate({ to: "/dashboard/studio/image" }); return; }
    openLogin({ mode: "signin", redirectTo: "/dashboard/studio/image" });
  };

  return (
    <div className="relative flex flex-col overflow-x-hidden transition-colors duration-500" style={{ backgroundColor: "var(--theme-bg)", color: "var(--theme-text)" }}>
      {/* ── Hero ── */}
      <main className="relative flex h-dvh flex-col overflow-hidden">
        <HomeHeroBackdrop />
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_18%_35%,color-mix(in_oklab,var(--theme-primary)_22%,transparent),transparent_30%),linear-gradient(115deg,transparent_0%,transparent_44%,color-mix(in_oklab,var(--theme-primary)_10%,transparent)_44.2%,transparent_70%)]" />
        <Header menuItems={clientHeaderMenuItems} />
        <section className="relative z-20 mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 gap-6 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pb-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.78fr)] lg:items-center lg:gap-10 lg:overflow-visible lg:px-12 lg:pb-12 lg:pt-0">
          <div className="home-reveal min-w-0">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] sm:mb-7" style={{ borderColor: "var(--glass-border)", backgroundColor: "var(--glass-bg)", color: "var(--theme-text)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--theme-primary)" }} />
              {t("home.glaze.kicker")}
            </div>
            <h1 className="max-w-[900px] text-[clamp(3rem,10vw,8.6rem)] font-medium leading-[0.88] tracking-[-0.075em] sm:text-[clamp(4rem,8vw,9rem)]">
              <span className="block text-gradient">{t("home.glaze.headline.line1")}</span>
              <span className="block text-[clamp(2.0rem,5.0vw,5.0rem)] leading-[0.98] tracking-[-0.055em]">{t("home.glaze.headline.line2")}</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 opacity-70 sm:mt-6 sm:text-base">{t("home.glaze.subheadline")}</p>
            <div className="mt-8 flex flex-col items-start gap-4 sm:mt-10 sm:flex-row sm:items-center sm:gap-5">
              <StudioAction iconClassName="h-8 w-8" className="py-2.5 pl-6 pr-2 text-[14px]" onClick={startCreating}>
                <ScrollText text={t("home.glaze.primaryCta")} />
              </StudioAction>
              <div className="flex items-center gap-2.5 rounded-full border px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-shadow duration-500 hover:shadow-[0_18px_50px_rgba(0,0,0,0.14)]" style={{ borderColor: "var(--glass-border)", backgroundColor: "var(--glass-bg)", transitionTimingFunction: EASE }}>
                <StarburstIcon className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: "var(--theme-starburst)" }} />
                <span className="text-[13px] font-medium sm:text-[14px]">{t("home.glaze.partner")}</span>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] sm:text-[11px]" style={{ backgroundColor: "var(--theme-badge-bg)", color: "var(--theme-badge-fg)" }}>{t("home.glaze.badge")}</span>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-5 lg:items-end">
            <DesktopPreview onClick={startCreating} />
            {showDesktopDownloads ? (
              <div className="home-reveal w-full max-w-[884px] rounded-[1.75rem] border p-3 backdrop-blur-2xl" style={{ borderColor: "var(--glass-border)", backgroundColor: "var(--glass-bg)" }}>
                <div className="mb-3 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">{t("home.glaze.downloads.title")}</p>
                    <p className="text-xs opacity-60">{t("home.glaze.downloads.subtitle")}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] opacity-50">Mac / Windows</span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <DesktopDownloadButton platform="MAC" release={macReleaseQ.data} loading={macReleaseQ.isLoading} />
                  <DesktopDownloadButton platform="WIN" release={winReleaseQ.data} loading={winReleaseQ.isLoading} />
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </main>

      {/* ── Below-the-fold sections (SEO-rich content) ──── */}
      <div style={{ backgroundColor: "var(--theme-bg)" }}>
        <div className="relative z-10">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
            <TemplateEntryCard onClick={() => navigate({ to: "/templates" })} />
          </div>

          <FeaturesSummarySection />
          <SuccessCasesSection />
          <HomeCTASection onClick={startCreating} />
          <Footer />
        </div>
      </div>
    </div>
  );
}
