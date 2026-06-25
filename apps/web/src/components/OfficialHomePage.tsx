import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { DesktopLatestReleaseResponse, DesktopPlatform } from "@megick/api-types";
import { useAuth } from "@/hooks/useAuth";
import { useLoginDialog } from "@/components/auth/LoginDialogContext";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { apiGet } from "@/lib/api-client";
import { Header } from "@/components/Header";
import { GlazeBackdrop } from "@/components/GlazeBackdrop";

const EASE = "cubic-bezier(0.25,0.1,0.25,1)";

const StarburstIcon = ({ className, style }: { className?: string; style?: CSSProperties }) => (
  <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
    <path
      fill="currentColor"
      d="M50 0 L55 38 L88 18 L62 45 L100 50 L62 55 L88 82 L55 62 L50 100 L45 62 L12 82 L38 55 L0 50 L38 45 L12 18 L45 38 Z"
    />
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
    <path
      fill="currentColor"
      d="M16.365 1.43c0 1.14-.462 2.18-1.204 2.93-.79.8-2.071 1.42-3.111 1.33-.13-1.1.382-2.28 1.104-3.02.8-.82 2.191-1.43 3.211-1.24Zm3.392 16.18c-.602 1.37-.892 1.98-1.674 3.19-1.083 1.67-2.608 3.75-4.493 3.77-1.674.02-2.106-1.09-4.383-1.08-2.277.01-2.759 1.11-4.433 1.09-1.885-.02-3.319-1.9-4.402-3.57-3.01-4.65-3.322-10.1-1.464-12.99 1.324-2.06 3.41-3.26 5.366-3.26 1.996 0 3.25 1.1 4.904 1.1 1.604 0 2.578-1.1 4.884-1.1 1.745 0 3.59.95 4.904 2.59-4.312 2.36-3.61 8.52.795 10.26Z"
    />
  </svg>
);

function ScrollText({ text }: { text: string }) {
  return (
    <span className="h-[20px] overflow-hidden">
      <span
        className="flex flex-col transition-transform duration-500 group-hover:-translate-y-1/2"
        style={{ transitionTimingFunction: EASE }}
      >
        <span className="flex h-[20px] items-center">{text}</span>
        <span className="flex h-[20px] items-center">{text}</span>
      </span>
    </span>
  );
}

function StudioAction({
  children,
  variant = "primary",
  className = "",
  iconClassName = "h-7 w-7",
  iconColor = "primary",
  onClick,
}: {
  children: ReactNode;
  variant?: "primary" | "cta";
  className?: string;
  iconClassName?: string;
  iconColor?: "primary" | "text";
  onClick: () => void;
}) {
  const backgroundVar = variant === "primary" ? "var(--theme-primary)" : "var(--theme-cta)";
  const hoverVar = variant === "primary" ? "var(--theme-primary-hover)" : "var(--theme-cta-hover)";
  const foregroundVar =
    variant === "primary" ? "var(--theme-primary-foreground)" : "var(--theme-cta-foreground)";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-2 rounded-full font-medium shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all duration-500 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      style={{
        backgroundColor: backgroundVar,
        color: foregroundVar,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = hoverVar;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = backgroundVar;
      }}
    >
      {children}
      <span
        className={`flex items-center justify-center rounded-full ${iconClassName}`}
        style={{ backgroundColor: "var(--theme-surface)" }}
      >
        <ArrowRight
          size={14}
          className="transition-transform duration-500 group-hover:-rotate-45"
          style={{
            transitionTimingFunction: EASE,
            color: iconColor === "primary" ? "var(--theme-primary)" : "var(--theme-text)",
          }}
        />
      </span>
    </button>
  );
}

type DesktopDownloadButtonProps = {
  platform: DesktopPlatform;
  release?: DesktopLatestReleaseResponse;
  loading: boolean;
};

function DesktopDownloadButton({ platform, release, loading }: DesktopDownloadButtonProps) {
  const { t } = useI18n();
  const Icon = platform === "MAC" ? AppleLogo : WindowsLogo;
  const label = platform === "MAC" ? "Mac" : "Windows";
  const disabled = loading || !release?.downloadUrl;
  const platformKey =
    platform === "MAC" ? "home.glaze.download.mac" : "home.glaze.download.windows";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (release?.downloadUrl) window.location.href = release.downloadUrl;
      }}
      className="group relative flex min-w-[220px] flex-1 items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 text-left text-[13px] font-medium shadow-[0_16px_50px_rgba(0,0,0,0.10)] backdrop-blur-2xl transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(0,0,0,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:min-w-[250px] sm:text-[14px] lg:min-w-0"
      style={{
        borderColor: "var(--glass-border)",
        background: "color-mix(in oklab, var(--theme-surface) 76%, transparent)",
        color: "var(--theme-text)",
        transitionTimingFunction: EASE,
      }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-70" />
      <span
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
        style={{ backgroundColor: "var(--theme-bg)", borderColor: "var(--glass-border)" }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate">{t(platformKey as TranslationKey)}</span>
        <span className="text-[11px] font-normal opacity-65">
          {loading
            ? t("home.glaze.download.loading")
            : release
              ? `${label} v${release.version}`
              : t("home.glaze.download.unavailable", { platform: label })}
        </span>
      </span>
      <span
        className="relative rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] opacity-70"
        style={{ borderColor: "var(--glass-border)" }}
      >
        {platform}
      </span>
    </button>
  );
}

function DesktopPreview({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative mx-auto w-full max-w-[884px] cursor-pointer overflow-hidden bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:ml-auto"
      aria-label="Megick Studio desktop app preview"
    >
      <picture>
        <source
          type="image/webp"
          srcSet="/index-preview.webp 1024w, /index-preview@2x.webp 2048w"
          sizes="(max-width: 884px) 100vw, 884px"
        />
        <img
          src="/index-preview.webp"
          srcSet="/index-preview.webp 884w, /index-preview@2x.webp 1768w"
          sizes="(min-width: 1024px) 48vw, 100vw"
          alt="Megick Studio desktop app screenshot"
          className="block w-full select-none rounded-[1.6rem] sm:rounded-[2rem]"
          draggable={false}
          fetchPriority="high"
          width={1024}
          height={623}
        />
      </picture>
    </button>
  );
}

export function OfficialHomePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { openLogin } = useLoginDialog();
  const navigate = useNavigate();
  const macReleaseQ = useQuery({
    queryKey: ["desktop-updates", "latest", "MAC"],
    queryFn: () =>
      apiGet<DesktopLatestReleaseResponse>("/api/desktop-updates/latest", {
        query: { platform: "MAC" },
      }),
    retry: false,
  });
  const winReleaseQ = useQuery({
    queryKey: ["desktop-updates", "latest", "WIN"],
    queryFn: () =>
      apiGet<DesktopLatestReleaseResponse>("/api/desktop-updates/latest", {
        query: { platform: "WIN" },
      }),
    retry: false,
  });

  const showDesktopDownloads = macReleaseQ.isLoading || winReleaseQ.isLoading || Boolean(macReleaseQ.data || winReleaseQ.data);

  const startCreating = () => {
    if (user) {
      void navigate({ to: "/dashboard/studio/image" });
      return;
    }

    openLogin({ mode: "signin", redirectTo: "/dashboard/studio/image" });
  };

  return (
    <main
      className="relative flex h-dvh flex-col overflow-hidden transition-colors duration-500"
      style={{ backgroundColor: "var(--theme-bg)", color: "var(--theme-text)" }}
    >
      <GlazeBackdrop className="pointer-events-none absolute inset-0 z-10" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_18%_35%,color-mix(in_oklab,var(--theme-primary)_22%,transparent),transparent_30%),linear-gradient(115deg,transparent_0%,transparent_44%,color-mix(in_oklab,var(--theme-primary)_10%,transparent)_44.2%,transparent_70%)]" />
      <Header />

      <section className="relative z-20 mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 gap-6 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pb-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.78fr)] lg:items-center lg:gap-10 lg:overflow-visible lg:px-12 lg:pb-12 lg:pt-0">
        <div className="home-reveal min-w-0">
          <div
            className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] sm:mb-7"
            style={{
              borderColor: "var(--glass-border)",
              backgroundColor: "var(--glass-bg)",
              color: "var(--theme-text)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--theme-primary)" }}
            />
            {t("home.glaze.kicker")}
          </div>

          <h1 className="max-w-[900px] text-[clamp(3rem,10vw,8.6rem)] font-medium leading-[0.88] tracking-[-0.075em] sm:text-[clamp(4rem,8vw,9rem)]">
            <span className="block text-gradient">{t("home.glaze.headline.line1")}</span>
            <span className="block text-[clamp(2.0rem,5.0vw,5.0rem)] leading-[0.98] tracking-[-0.055em]">
              {t("home.glaze.headline.line2")}
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 opacity-70 sm:mt-6 sm:text-base">
            {t("home.glaze.subheadline")}
          </p>

          <div className="mt-8 flex flex-col items-start gap-4 sm:mt-10 sm:flex-row sm:items-center sm:gap-5">
            <StudioAction
              iconClassName="h-8 w-8"
              className="py-2.5 pl-6 pr-2 text-[14px]"
              onClick={startCreating}
            >
              <ScrollText text={t("home.glaze.primaryCta")} />
            </StudioAction>

            <div
              className="flex items-center gap-2.5 rounded-full border px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-shadow duration-500 hover:shadow-[0_18px_50px_rgba(0,0,0,0.14)]"
              style={{
                transitionTimingFunction: EASE,
                borderColor: "var(--glass-border)",
                backgroundColor: "var(--glass-bg)",
              }}
            >
              <StarburstIcon
                className="h-5 w-5 sm:h-6 sm:w-6"
                style={{ color: "var(--theme-starburst)" }}
              />
              <span className="text-[13px] font-medium sm:text-[14px]">
                {t("home.glaze.partner")}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] sm:text-[11px]"
                style={{ backgroundColor: "var(--theme-badge-bg)", color: "var(--theme-badge-fg)" }}
              >
                {t("home.glaze.badge")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:items-end">
          <DesktopPreview onClick={startCreating} />

          {showDesktopDownloads ? (
            <div
              className="home-reveal w-full max-w-[884px] rounded-[1.75rem] border p-3 backdrop-blur-2xl"
              style={{ borderColor: "var(--glass-border)", backgroundColor: "var(--glass-bg)" }}
            >
              <div className="mb-3 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">{t("home.glaze.downloads.title")}</p>
                  <p className="text-xs opacity-60">{t("home.glaze.downloads.subtitle")}</p>
                </div>
                <span className="text-[10px] uppercase tracking-[0.2em] opacity-50">
                  Mac / Windows
                </span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <DesktopDownloadButton
                  platform="MAC"
                  release={macReleaseQ.data}
                  loading={macReleaseQ.isLoading}
                />
                <DesktopDownloadButton
                  platform="WIN"
                  release={winReleaseQ.data}
                  loading={winReleaseQ.isLoading}
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
