import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AuthFormContent } from "@/components/auth/AuthFormContent";

export const Route = createFileRoute("/desktop-login")({
  head: () => ({
    meta: [
      { title: "Megick Studio — Sign In" },
      { name: "description", content: "Sign in to Megick Studio Desktop" },
    ],
  }),
  component: DesktopLoginPage,
});

function DesktopLoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const isDesktop =
    typeof window !== "undefined" && window.megickDesktop?.isElectron === true;

  // Guard 1: Not running inside Electron → redirect to home
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.megickDesktop?.isElectron) {
      navigate({ to: "/", replace: true });
    }
  }, [navigate]);

  // Guard 2: Already authenticated (valid session) → skip login, go directly to studio
  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/dashboard/studio/image", replace: true });
    }
  }, [loading, user, navigate]);

  // Loading spinner while checking auth state
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Not in Electron — render nothing (redirect happens in useEffect above)
  if (!isDesktop) return null;

  const handleSuccess = () => {
    navigate({ to: "/dashboard/studio/image", replace: true });
  };

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-[#110f0a] px-4">
      {/* Desktop-only cinematic boot artwork */}
      <div
        className="absolute inset-0 scale-[1.02] bg-[linear-gradient(90deg,rgba(17,15,10,0.94)_0%,rgba(17,15,10,0.58)_46%,rgba(17,15,10,0.18)_100%),linear-gradient(180deg,rgba(17,15,10,0.1)_0%,rgba(17,15,10,0.78)_100%),url('/desktop-login-bg.png')] bg-cover bg-center"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_48%,rgba(247,200,115,0.18),transparent_28%),radial-gradient(circle_at_76%_28%,rgba(215,123,70,0.12),transparent_30%),linear-gradient(180deg,transparent_0%,rgba(17,15,10,0.9)_100%)] opacity-85 mix-blend-screen"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.42)_1px,transparent_0)] [background-size:3px_3px] [mask-image:linear-gradient(90deg,black_0%,transparent_78%)]"
        aria-hidden="true"
      />

      {/* Glass-morphism card — refined for the Electron boot artwork */}
      <div className="relative w-full max-w-[27rem] overflow-hidden rounded-[2rem] border border-[#f7c873]/20 bg-[#110f0a]/72 shadow-[0_24px_90px_rgba(0,0,0,0.58),0_0_54px_rgba(247,200,115,0.11)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),transparent_30%,transparent_72%,rgba(247,200,115,0.1))]" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#f7c873]/60 to-transparent" />
        <div className="relative px-6 pb-6 pt-7 sm:px-7 sm:pb-7 sm:pt-8">
          <AuthFormContent
            mode="signin"
            redirectTo="/dashboard/studio/image"
            onSuccess={handleSuccess}
          />
        </div>
      </div>

      {/* Brand watermark */}
      <p className="absolute bottom-8 text-xs font-medium tracking-[0.28em] text-[#f7c873]/35">
        MEGICK STUDIO DESKTOP
      </p>
    </div>
  );
}
