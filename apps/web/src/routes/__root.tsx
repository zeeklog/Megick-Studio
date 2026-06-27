import { Outlet, Link, createRootRoute, HeadContent, Scripts, useLocation } from "@tanstack/react-router";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { DevtoolsDebuggerGuard } from "@/components/DevtoolsDebuggerGuard";
import { getQueryClient } from "@/lib/query-client";
import { LoginDialogProvider, useLoginDialog } from "@/components/auth/LoginDialogContext";
import { apiPatch } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";
import { THEME_COOKIE_KEY, ThemeProvider, type AppTheme } from "@/lib/theme";
import {
  DEFAULT_LOCALE,
  I18N_LOCALE_SOURCE_STORAGE_KEY,
  I18N_STORAGE_KEY,
  I18nProvider,
  clearPendingExplicitLocaleSync,
  getInitialLocale,
  getStoredLocalePreference,
  getStoredLocalePreferenceUpdatedAt,
  hasPendingExplicitLocaleSync,
  localeFromLanguagePreference,
  localeToOg,
  normalizeLocale,
  persistExplicitLocalePreference,
  translate,
  type AppLocale,
  useI18n,
} from "@/lib/i18n";
import type { MeResponse } from "@megick/api-types";
import { absoluteUrl } from "@/lib/seo";

import appCss from "../styles.css?url";

const LazyLoginDialog = lazy(async () => {
  const mod = await import("@/components/auth/LoginDialog");
  return { default: mod.LoginDialog };
});

const LazyGoogleOneTap = lazy(async () => {
  const mod = await import("@/components/auth/GoogleOneTap");
  return { default: mod.GoogleOneTap };
});

const LazyToaster = lazy(async () => {
  const mod = await import("@/components/ui/sonner");
  return { default: mod.Toaster };
});

const LazyDesktopTitleBar = lazy(async () => {
  const mod = await import("@/components/DesktopTitleBar");
  return { default: mod.DesktopTitleBar };
});

const getRootRequestData = createServerFn({ method: "GET" }).handler(async () => {
  const cookieLocale = getCookie(I18N_STORAGE_KEY);
  const hasExplicitCookieLocale =
    getCookie(I18N_LOCALE_SOURCE_STORAGE_KEY) === "explicit" ||
    getCookie(`${I18N_STORAGE_KEY}.explicit`) === "1";
  const cookieTheme = getCookie(THEME_COOKIE_KEY);
  const theme: AppTheme = cookieTheme === "light" || cookieTheme === "dark" ? cookieTheme : "dark";
  const requestLocale = localeFromLanguagePreference(getRequest().headers.get("accept-language"));

  return {
    locale: hasExplicitCookieLocale && cookieLocale ? normalizeLocale(cookieLocale) : requestLocale,
    theme,
  };
});

function NotFoundComponent() {
  const { t } = useI18n();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="grid-bg absolute inset-0 opacity-30" />
      <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 bg-gradient-radial-glow opacity-60" />
      <div className="relative max-w-md text-center">
        <h1 className="text-8xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">
          {t("common.notFound.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("common.notFound.description")}
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-glow transition-opacity hover:opacity-90"
          >
            {t("common.notFound.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  loader: () => getRootRequestData(),
  head: ({ loaderData }) => {
    const locale = loaderData?.locale ?? getInitialLocale();

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: translate(locale, "common.meta.title") },
        {
          name: "description",
          content: translate(locale, "common.meta.description"),
        },
        { name: "author", content: "Megick" },
        { name: "theme-color", content: "#110f0a" },
        { property: "og:type", content: "website" },
        { property: "og:title", content: translate(locale, "common.meta.title") },
        {
          property: "og:description",
          content: translate(locale, "common.meta.ogDescription"),
        },
        { property: "og:locale", content: localeToOg(locale) },
        { property: "og:image", content: absoluteUrl("/effects/preview.jpg") },
        { property: "og:image:alt", content: "Megick AI creative studio preview" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:site", content: "@Megick" },
        { name: "twitter:image", content: absoluteUrl("/effects/preview.jpg") },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
        { rel: "icon", href: "/favicon-48.png", type: "image/png", sizes: "48x48" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
        { rel: "manifest", href: "/site.webmanifest" },
        { rel: "preload", as: "font", href: "/fonts/inter-latin.woff2", type: "font/woff2", crossOrigin: "anonymous" },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const { locale, theme } = Route.useLoaderData();

  return (
    <html lang={locale} className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const queryClient = getQueryClient();
  const { locale, theme } = Route.useLoaderData();
  const location = useLocation();
  const [isDesktopShell, setIsDesktopShell] = useState(false);
  const forceDarkTheme = location.pathname.startsWith("/editor");

  useEffect(() => {
    setIsDesktopShell(window.megickDesktop?.isElectron === true);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider forceDark={forceDarkTheme} initialTheme={theme}>
        <I18nProvider initialLocale={locale}>
          <DevtoolsDebuggerGuard />
          <LocalePreferenceSync />
          <LoginDialogProvider>
            <div className="flex h-dvh flex-col overflow-hidden bg-background">
              {isDesktopShell ? (
                <Suspense fallback={null}>
                  <LazyDesktopTitleBar />
                </Suspense>
              ) : null}
              <div className={isDesktopShell ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-auto"}>
                <Outlet />
              </div>
            </div>
            <RootDeferredOverlays />
          </LoginDialogProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
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
        return;
      }
      timeoutId = globalThis.setTimeout(run, Math.min(timeout, 3000));
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

function shouldMountOneTap(pathname: string) {
  return (
    !pathname.startsWith("/dashboard") &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/desktop-login") &&
    !pathname.startsWith("/editor") &&
    !pathname.startsWith("/api")
  );
}

function RootDeferredOverlays() {
  const location = useLocation();
  const idleReady = useAfterLoadIdle();
  const { open } = useLoginDialog();

  return (
    <>
      {open ? (
        <Suspense fallback={null}>
          <LazyLoginDialog />
        </Suspense>
      ) : null}
      {idleReady && shouldMountOneTap(location.pathname) ? (
        <Suspense fallback={null}>
          <LazyGoogleOneTap />
        </Suspense>
      ) : null}
      {idleReady ? (
        <Suspense fallback={null}>
          <LazyToaster />
        </Suspense>
      ) : null}
    </>
  );
}

function parsePreferenceTime(value?: string | null) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function LocalePreferenceSync() {
  const { user } = useAuth();
  const { hasExplicitPreference, locale, setLocale } = useI18n();
  const queryClient = useQueryClient();
  const pendingLocaleRef = useRef<AppLocale | null>(null);

  useEffect(() => {
    if (!user?.id || !user.locale) {
      pendingLocaleRef.current = null;
      return;
    }

    if (user.localeSource !== "explicit") return;

    const profileLocale = normalizeLocale(user.locale);
    const storedLocale = getStoredLocalePreference();
    const storedLocaleUpdatedAt = parsePreferenceTime(getStoredLocalePreferenceUpdatedAt());
    const profileLocaleUpdatedAt = parsePreferenceTime(user.localeUpdatedAt);
    const currentLocalePendingSync = hasPendingExplicitLocaleSync(locale);
    const localPreferenceIsNewer =
      currentLocalePendingSync ||
      (storedLocale !== null &&
        storedLocaleUpdatedAt !== null &&
        (profileLocaleUpdatedAt === null || storedLocaleUpdatedAt > profileLocaleUpdatedAt));

    if (!localPreferenceIsNewer && locale !== profileLocale) {
      setLocale(profileLocale, { explicit: true, markPendingSync: false });
      if (user.localeUpdatedAt) persistExplicitLocalePreference(profileLocale, user.localeUpdatedAt);
    }
  }, [locale, setLocale, user?.id, user?.locale, user?.localeSource, user?.localeUpdatedAt]);

  useEffect(() => {
    if (!user?.id || !user.locale) return;
    if (!hasExplicitPreference) return;

    const profileLocale = normalizeLocale(user.locale);
    if (profileLocale === locale) {
      pendingLocaleRef.current = null;
      return;
    }

    const storedLocaleUpdatedAt = parsePreferenceTime(getStoredLocalePreferenceUpdatedAt());
    const profileLocaleUpdatedAt = parsePreferenceTime(user.localeUpdatedAt);
    const currentLocalePendingSync = hasPendingExplicitLocaleSync(locale);
    const profilePreferenceIsNewer =
      !currentLocalePendingSync &&
      user.localeSource === "explicit" &&
      (storedLocaleUpdatedAt === null ||
        (profileLocaleUpdatedAt !== null && profileLocaleUpdatedAt >= storedLocaleUpdatedAt));
    if (profilePreferenceIsNewer) return;

    if (pendingLocaleRef.current === locale) {
      return;
    }

    pendingLocaleRef.current = locale;

    void apiPatch("/api/users/me", { locale })
      .then((updatedProfile) => {
        const localeUpdatedAt =
          updatedProfile &&
          typeof updatedProfile === "object" &&
          "localeUpdatedAt" in updatedProfile
            ? (updatedProfile as { localeUpdatedAt?: string | null }).localeUpdatedAt
            : new Date().toISOString();
        if (localeUpdatedAt) persistExplicitLocalePreference(locale, localeUpdatedAt);
        queryClient.setQueryData<MeResponse>(["auth", "me"], (current) => {
          if (!current?.user) return current;
          return {
            ...current,
            user: {
              ...current.user,
              locale,
              localeSource: "explicit",
              localeUpdatedAt,
            },
          };
        });
        clearPendingExplicitLocaleSync(locale);
        pendingLocaleRef.current = null;
      })
      .catch(() => {
        pendingLocaleRef.current = null;
      });
  }, [hasExplicitPreference, locale, queryClient, user?.id, user?.locale, user?.localeSource, user?.localeUpdatedAt]);

  return null;
}
