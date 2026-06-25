import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLoginDialog } from "@/components/auth/LoginDialogContext";
import { MEGICK_GITHUB_URL } from "@/lib/brand";
import { useI18n } from "@/lib/i18n";

export function PublicTemplateShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { openLogin } = useLoginDialog();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo to="/official" />
            <nav className="hidden items-center gap-5 md:flex">
              <Link
                to="/official"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("nav.home")}
              </Link>
              <a
                href={MEGICK_GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("footer.openSource")}
              </a>
              <Link
                to="/generate"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("nav.generate")}
              </Link>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher variant="outline" />
            <ThemeToggle variant="outline" />
            <Button variant="ghost" size="sm" onClick={() => openLogin({ mode: "signin" })}>
              {t("nav.signIn")}
            </Button>
            <Button asChild size="sm" className="bg-gradient-primary shadow-glow hover:opacity-90">
              <a href="/dashboard/studio/image?newSession=true">
                <Sparkles className="h-4 w-4" />
                {t("nav.startGenerating")}
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <section className="rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                {t("dashboard.nav.templates.label")}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {t("dashboard.nav.templates.label")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("dashboard.nav.templates.description")}
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link to="/official">
                {t("nav.home")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        {children}
      </main>

      <Footer />
    </div>
  );
}
