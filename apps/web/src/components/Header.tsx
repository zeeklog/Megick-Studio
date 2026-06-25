import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Menu, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { useLoginDialog } from "@/components/auth/LoginDialogContext";
import { UserMenu } from "@/components/auth/UserMenu";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_HEADER_MENU_ITEMS,
  localizedMenuLabel,
  type NavigationMenuItem,
} from "@/lib/navigation-menus";
import { MEGICK_GITHUB_URL } from "@/lib/brand";

const EASE = "cubic-bezier(0.25,0.1,0.25,1)";
const DASHBOARD_DEFAULT_PATH = "/dashboard/studio/image" as const;

function ScrollText({ text }: { text: string }) {
  return (
    <span className="h-[20px] overflow-hidden" aria-hidden="true">
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

function HeaderAction({
  children,
  className = "",
  label,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group flex items-center gap-2 rounded-full font-medium transition-colors ${className}`}
      style={{
        backgroundColor: "var(--theme-primary)",
        color: "var(--theme-primary-foreground)",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = "var(--theme-primary-hover)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = "var(--theme-primary)";
      }}
    >
      {children}
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--theme-surface)" }}
      >
        <ArrowRight
          size={14}
          className="transition-transform duration-500 group-hover:-rotate-45"
          style={{
            transitionTimingFunction: EASE,
            color: "var(--theme-primary)",
          }}
        />
      </span>
    </button>
  );
}

export function Header({
  menuItems = DEFAULT_HEADER_MENU_ITEMS,
}: {
  menuItems?: NavigationMenuItem[];
}) {
  const { t, locale } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { openLogin } = useLoginDialog();
  const navigate = useNavigate();
  const actionText = user ? t("nav.dashboard") : t("nav.signIn");

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const handleAccountAction = () => {
    setMobileOpen(false);
    if (user) {
      void navigate({ to: DASHBOARD_DEFAULT_PATH });
      return;
    }
    openLogin({ mode: "signin", redirectTo: DASHBOARD_DEFAULT_PATH });
  };

  return (
    <>
      <div
        className="sticky top-0 z-50 mx-auto w-full max-w-[1440px] shrink-0 px-2 py-2 sm:px-3 sm:py-3"
      >
        <nav
          className="flex items-center justify-between rounded-full border px-[5px] py-[5px] shadow-lg shadow-black/5 backdrop-blur-2xl transition-colors duration-500"
          style={{
            backgroundColor: "var(--glass-bg-strong)",
            borderColor: "var(--glass-border)",
          }}
        >
          <div className="flex items-center gap-6 pl-2">
            <Link
              to="/"
              className="inline-flex items-center whitespace-nowrap text-[18px] font-semibold tracking-tight sm:text-[20px]"
              aria-label={t("home.glaze.brand")}
              style={{ color: "var(--theme-logo)" }}
            >
              Megick Studio
            </Link>
            <div
              className="hidden items-center gap-6 md:flex"
              style={{ color: "var(--theme-text)" }}
            >
              {menuItems.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  className="text-[14px] opacity-100 transition-opacity duration-300 hover:opacity-60"
                >
                  {localizedMenuLabel(link, locale, t)}
                </a>
              ))}
              <a
                href={MEGICK_GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[14px] opacity-100 transition-opacity duration-300 hover:opacity-60"
              >
                GitHub
              </a>
            </div>
          </div>

          <div className="hidden items-center gap-5 pr-1 md:flex">
            <LanguageSwitcher variant="header" showLabel className="h-8" />
            <ThemeToggle variant="header" className="h-8 w-8" />
            {user ? (
              <>
                <HeaderAction
                  className="py-2 pl-5 pr-2 text-[13px]"
                  label={actionText}
                  onClick={handleAccountAction}
                >
                  <ScrollText text={actionText} />
                </HeaderAction>
                <UserMenu
                  user={user}
                  signOut={signOut}
                  showBadge={false}
                  className="max-w-48 px-2 py-1.5 transition-opacity hover:opacity-80"
                  align="end"
                />
              </>
            ) : (
              <HeaderAction
                className="py-2 pl-5 pr-2 text-[13px]"
                label={actionText}
                onClick={handleAccountAction}
              >
                <ScrollText text={actionText} />
              </HeaderAction>
            )}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <LanguageSwitcher variant="header" className="h-9" />
            <ThemeToggle variant="header" className="h-9 w-9" />
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t("nav.toggleMenu")}
              aria-expanded={mobileOpen}
              className="flex items-center gap-2 rounded-full py-2 pl-4 pr-3 text-[13px] font-medium sm:py-2.5"
              style={{
                backgroundColor: "var(--theme-cta)",
                color: "var(--theme-cta-foreground)",
              }}
            >
              {t("home.glaze.menu")}
              <Menu size={14} />
            </button>
          </div>
        </nav>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            className="absolute inset-0"
            style={{ backgroundColor: "color-mix(in oklab, var(--theme-bg) 78%, black)" }}
            aria-label={t("common.close")}
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-0 flex flex-col">
            <button
              type="button"
              className="flex-1"
              aria-label={t("common.close")}
              onClick={() => setMobileOpen(false)}
            />
            <div
              className="mx-3 mb-3 mt-auto max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl shadow-black/15 transition-transform duration-500 sm:px-6 sm:pb-[calc(2rem+env(safe-area-inset-bottom))] sm:pt-6"
              style={{
                transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)",
                backgroundColor: "var(--theme-surface)",
                borderColor: "var(--glass-border)",
                color: "var(--theme-text)",
              }}
            >
              <div className="mb-8 flex items-center justify-between">
                <span className="text-[13px] font-medium" style={{ color: "var(--theme-text)" }}>
                  Megick Studio
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-full py-2 pl-4 pr-3 text-[13px] font-medium"
                  style={{
                    backgroundColor: "var(--theme-cta)",
                    color: "var(--theme-cta-foreground)",
                  }}
                >
                  {t("common.close")}
                  <X size={14} />
                </button>
              </div>
              <nav className="mb-8 flex flex-col gap-5">
                {menuItems.map((link) => (
                  <a
                    key={link.id}
                    href={link.href}
                    className="text-2xl font-semibold tracking-tight sm:text-[32px]"
                    style={{ color: "var(--theme-text)" }}
                    onClick={() => setMobileOpen(false)}
                  >
                    {localizedMenuLabel(link, locale, t)}
                  </a>
                ))}
                <a
                  href={MEGICK_GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-2xl font-semibold tracking-tight sm:text-[32px]"
                  style={{ color: "var(--theme-text)" }}
                  onClick={() => setMobileOpen(false)}
                >
                  GitHub
                </a>
              </nav>
              {user ? (
                <div className="flex flex-col items-start gap-4">
                  <HeaderAction
                    className="inline-flex py-2.5 pl-5 pr-2 text-[14px]"
                    label={actionText}
                    onClick={handleAccountAction}
                  >
                    <ScrollText text={actionText} />
                  </HeaderAction>
                  <UserMenu
                    user={user}
                    signOut={signOut}
                    align="start"
                    labelVisibleOnMobile
                    showBadge={false}
                    onAction={() => setMobileOpen(false)}
                    className="w-full justify-start px-0 py-1"
                  />
                </div>
              ) : (
                <HeaderAction
                  className="inline-flex py-2.5 pl-5 pr-2 text-[14px]"
                  label={actionText}
                  onClick={handleAccountAction}
                >
                  <ScrollText text={actionText} />
                </HeaderAction>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
