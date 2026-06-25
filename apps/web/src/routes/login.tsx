import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLoginDialog } from "@/components/auth/LoginDialogContext";
import { getInitialLocale, translate } from "@/lib/i18n";
import { noIndexHead } from "@/lib/seo";

export const Route = createFileRoute("/login")({
  head: () => noIndexHead({ title: translate(getInitialLocale(), "common.pageTitle.login") }),
  component: LoginRedirect,
});

function LoginRedirect() {
  const navigate = useNavigate();
  const { openLogin } = useLoginDialog();

  useEffect(() => {
    openLogin({ mode: "signin", redirectTo: "/" });
    navigate({ to: "/", replace: true });
  }, [openLogin, navigate]);

  return null;
}
