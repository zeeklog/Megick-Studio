import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import type { AuthConfigResponse, MeResponse } from "@megick/api-types";
import { apiGet, apiPost } from "@/lib/api-client";
import { AUTH_CONFIG_QUERY_KEY, DEFAULT_AUTH_CONFIG } from "@/lib/auth-config";
import { invalidateMe, ME_QUERY_KEY, useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useLoginDialog } from "./LoginDialogContext";

const GOOGLE_GSI_SCRIPT_ID = "google-identity-services-script";
const GOOGLE_GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type GoogleCredentialResponse = {
  credential?: string;
  select_by?: string;
};

type GooglePromptMomentNotification = {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
};

type GoogleAccountsId = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: (momentListener?: (notification: GooglePromptMomentNotification) => void) => void;
  cancel: () => void;
  disableAutoSelect: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

let googleGsiScriptPromise: Promise<void> | null = null;

function ensureGoogleGsiScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleGsiScriptPromise) return googleGsiScriptPromise;

  googleGsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_GSI_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    script.id = GOOGLE_GSI_SCRIPT_ID;
    script.src = GOOGLE_GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;

    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        googleGsiScriptPromise = null;
        reject(new Error("Failed to load Google Identity Services"));
      },
      { once: true },
    );

    if (!existing) {
      document.head.appendChild(script);
    }
  });

  return googleGsiScriptPromise;
}

function currentRedirectPath(pathname: string) {
  if (typeof window === "undefined") return pathname || "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}` || "/";
}

function shouldSkipOneTap(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/desktop-login") ||
    pathname.startsWith("/editor") ||
    pathname.startsWith("/api")
  );
}

export function GoogleOneTap() {
  const { hasExplicitPreference, locale, t } = useI18n();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { user, loading } = useAuth();
  const { open: loginDialogOpen } = useLoginDialog();
  const [isDesktopShell, setIsDesktopShell] = useState(false);
  const promptAttemptKeyRef = useRef("");
  const submittingRef = useRef(false);

  const authConfigQ = useQuery({
    queryKey: AUTH_CONFIG_QUERY_KEY,
    queryFn: () => apiGet<AuthConfigResponse>("/api/auth/config"),
    enabled: !user && !loginDialogOpen && !shouldSkipOneTap(location.pathname),
    staleTime: 60_000,
  });

  const authConfig = authConfigQ.data ?? DEFAULT_AUTH_CONFIG;
  const googleClientId = authConfig.oauthProviderClientIds.google ?? "";
  const redirectTo = useMemo(() => currentRedirectPath(location.pathname), [location.pathname]);

  useEffect(() => {
    setIsDesktopShell(window.megickDesktop?.isElectron === true);
  }, []);

  useEffect(() => {
    if (loading || user || loginDialogOpen || isDesktopShell || shouldSkipOneTap(location.pathname)) return;
    if (!authConfig.oauthProviders.includes("google") || !googleClientId) return;

    const promptAttemptKey = `${googleClientId}:${redirectTo}`;
    if (promptAttemptKeyRef.current === promptAttemptKey) return;
    promptAttemptKeyRef.current = promptAttemptKey;

    let cancelled = false;
    ensureGoogleGsiScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
          callback: async ({ credential }) => {
            if (!credential || submittingRef.current) return;
            submittingRef.current = true;
            try {
              const signedInUser = await apiPost<NonNullable<MeResponse["user"]>>(
                "/api/auth/google/onetap",
                {
                  credential,
                  redirect: redirectTo,
                  localeSource: hasExplicitPreference ? "explicit" : "device",
                  locale: hasExplicitPreference ? locale : undefined,
                },
              );
              queryClient.setQueryData<MeResponse>(ME_QUERY_KEY, { user: signedInUser });
              await invalidateMe(queryClient);
            } catch (err) {
              window.google?.accounts?.id?.disableAutoSelect();
              toast.error(err instanceof Error ? err.message : t("auth.signInFailed"));
            } finally {
              submittingRef.current = false;
            }
          },
        });
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            promptAttemptKeyRef.current = "";
          }
        });
      })
      .catch(() => {
        promptAttemptKeyRef.current = "";
      });

    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel();
    };
  }, [
    authConfig.oauthProviders,
    googleClientId,
    hasExplicitPreference,
    isDesktopShell,
    loading,
    loginDialogOpen,
    locale,
    location.pathname,
    queryClient,
    redirectTo,
    t,
    user,
  ]);

  return null;
}
