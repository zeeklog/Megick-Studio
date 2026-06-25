import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLoginDialog } from "@/components/auth/LoginDialogContext";

function currentLocationHref() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function useAuthGate() {
  const auth = useAuth();
  const { openLogin } = useLoginDialog();

  const requireAuth = useCallback(
    (redirectTo = currentLocationHref()) => {
      if (auth.loading) return false;
      if (auth.user) return true;
      openLogin({ mode: "signin", redirectTo });
      return false;
    },
    [auth.loading, auth.user, openLogin],
  );

  return {
    ...auth,
    requireAuth,
  };
}
