import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";
import {
  Check,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  Users,
  Sparkles,
  Image as ImageIcon,
  Video,
  MessageSquareText,
  Server,
  ListChecks,
  ShieldCheck,
  Settings as SettingsIcon,
  Activity,
  LogOut,
  Menu,
  Navigation,
  Tags,
  Plug,
  WandSparkles,
  BookOpen,
  Download,
  Cloud,
  HardDrive,
  Github,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useAdminI18n, type AdminTranslationKey } from "@/lib/admin-i18n";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { MeResponse } from "@megick/api-types";
import { noIndexHead } from "@/lib/seo";
import { MEGICK_GITHUB_URL, MEGICK_SITE_URL } from "@/lib/brand";

export const Route = createFileRoute("/admin")({
  head: () => noIndexHead({ title: "Megick Admin" }),
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/admin/login") return;

    const me = await apiGet<MeResponse>("/api/auth/me", {
      forwardServerCookies: true,
    }).catch(() => ({ user: null }) as MeResponse);
    if (!me.user) throw redirect({ to: "/admin/login" });
    if (!me.user.isSuperAdmin) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

const navSections: Array<{
  titleKey: AdminTranslationKey;
  items: Array<{
    to: string;
    labelKey: AdminTranslationKey;
    descriptionKey?: AdminTranslationKey;
    icon: ComponentType<{ className?: string }>;
  }>;
}> = [
  {
    titleKey: "nav.section.general",
    items: [
      {
        to: "/admin",
        labelKey: "nav.dashboard",
        descriptionKey: "page.dashboard.description",
        icon: LayoutDashboard,
      },
      {
        to: "/admin/users",
        labelKey: "nav.users",
        descriptionKey: "page.users.description",
        icon: Users,
      },
      {
        to: "/admin/roles",
        labelKey: "nav.roles",
        descriptionKey: "page.roles.description",
        icon: ShieldCheck,
      },
    ],
  },
  {
    titleKey: "nav.section.content",
    items: [
      {
        to: "/admin/model-providers",
        labelKey: "nav.modelProviders",
        descriptionKey: "page.modelProviders.description",
        icon: Plug,
      },
      {
        to: "/admin/ai-models",
        labelKey: "nav.aiModels",
        descriptionKey: "page.aiModels.description",
        icon: Sparkles,
      },
      {
        to: "/admin/ai-image-edit-modes",
        labelKey: "nav.aiImageEditModes",
        descriptionKey: "page.aiImageEditModes.description",
        icon: WandSparkles,
      },
      {
        to: "/admin/showcase",
        labelKey: "nav.showcase",
        descriptionKey: "page.showcase.description",
        icon: ImageIcon,
      },
      {
        to: "/admin/image-templates",
        labelKey: "nav.imageTemplates",
        descriptionKey: "page.templates.imageDescription",
        icon: ImageIcon,
      },
      {
        to: "/admin/video-templates",
        labelKey: "nav.videoTemplates",
        descriptionKey: "page.templates.videoDescription",
        icon: Video,
      },
      {
        to: "/admin/template-categories",
        labelKey: "nav.templateCategories",
        descriptionKey: "page.templateCategories.description",
        icon: Tags,
      },
      {
        to: "/admin/site-settings",
        labelKey: "nav.siteSettings",
        descriptionKey: "page.siteSettings.description",
        icon: SettingsIcon,
      },
      {
        to: "/admin/navigation-menus",
        labelKey: "nav.navigationMenus",
        descriptionKey: "page.navigationMenus.description",
        icon: Navigation,
      },
    ],
  },
  {
    titleKey: "nav.section.auth",
    items: [
      {
        to: "/admin/oauth-providers",
        labelKey: "nav.oauthProviders",
        descriptionKey: "page.oauth.description",
        icon: ShieldCheck,
      },
    ],
  },
  {
    titleKey: "nav.section.cloudResources",
    items: [
      {
        to: "/admin/cloud-resources/r2",
        labelKey: "nav.cfR2Config",
        descriptionKey: "page.cloudR2.description",
        icon: Cloud,
      },
      {
        to: "/admin/cloud-resources/oss",
        labelKey: "nav.ossConfig",
        descriptionKey: "page.cloudOss.description",
        icon: HardDrive,
      },
    ],
  },
  {
    titleKey: "nav.section.operations",
    items: [
      {
        to: "/admin/generation-jobs",
        labelKey: "nav.generationJobs",
        descriptionKey: "page.jobs.description",
        icon: ListChecks,
      },
      {
        to: "/admin/user-chats",
        labelKey: "nav.userChats",
        descriptionKey: "page.userChats.description",
        icon: MessageSquareText,
      },
      {
        to: "/admin/queues",
        labelKey: "nav.queues",
        descriptionKey: "page.queues.description",
        icon: Server,
      },
      {
        to: "/admin/desktop-updates",
        labelKey: "nav.desktopUpdates",
        descriptionKey: "page.desktopUpdates.description",
        icon: Download,
      },
      {
        to: "/admin/audit-log",
        labelKey: "nav.auditLog",
        descriptionKey: "page.audit.description",
        icon: Activity,
      },
    ],
  },
];

function AdminLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { t } = useAdminI18n();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeNav = useMemo(() => {
    for (const section of navSections) {
      const item = section.items.find(
        (entry) =>
          location.pathname === entry.to ||
          (entry.to !== "/admin" && location.pathname.startsWith(entry.to)),
      );
      if (item) return { section, item };
    }
    return { section: navSections[0], item: navSections[0].items[0] };
  }, [location.pathname]);

  if (location.pathname === "/admin/login") {
    return <Outlet />;
  }

  return (
    <div className="admin-shell fixed inset-0 flex overflow-hidden bg-background text-foreground">
      <aside className="hidden h-dvh w-72 shrink-0 border-r border-sidebar-border bg-sidebar/95 lg:flex lg:flex-col">
        <AdminSidebar pathname={location.pathname} onNavigate={() => undefined} />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="admin-shell flex w-[86vw] max-w-80 flex-col overflow-hidden border-sidebar-border bg-sidebar p-0"
        >
          <SheetTitle className="sr-only">{t("layout.openSidebar")}</SheetTitle>
          <SheetDescription className="sr-only">{t("layout.currentArea")}</SheetDescription>
          <AdminSidebar pathname={location.pathname} onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background/95 px-4 backdrop-blur-xl lg:h-[72px] lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t("layout.openSidebar")}
              title={t("layout.openSidebar")}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-muted-foreground">
                <span>{t("layout.currentArea")}</span>
                <span className="h-1 w-1 rounded-full bg-primary" />
                <span>{t(activeNav.section.titleKey)}</span>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <h1 className="truncate text-lg font-semibold tracking-tight lg:text-xl">
                  {t(activeNav.item.labelKey)}
                </h1>
                <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary lg:inline-flex">
                  {t("layout.systemOnline")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-card/60 px-3 py-2 xl:flex">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{user?.email}</div>
                <div className="text-[11px] text-muted-foreground">{t("layout.superAdmin")}</div>
              </div>
            </div>
            <AdminLanguageMenu />
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
              <Link to="/">
                <ExternalLink className="h-4 w-4" />
                {t("layout.backToSite")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t("layout.signOut")}</span>
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 lg:px-8 lg:py-7">
          <div className="mx-auto w-full max-w-[1440px] pb-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function AdminSidebar({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  const { t } = useAdminI18n();

  return (
    <>
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{t("layout.brand")}</div>
          <div className="truncate text-xs text-muted-foreground">{t("layout.workspace")}</div>
        </div>
      </div>
      <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-4 text-sm">
        {navSections.map((section) => (
          <div key={section.titleKey}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase text-muted-foreground">
              {t(section.titleKey)}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.to || (item.to !== "/admin" && pathname.startsWith(item.to));
                return (
                  <Link
                    key={item.to}
                    to={item.to as "/admin"}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-primary",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                    {active ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-sidebar-border p-4 space-y-3">
        <a
          href={MEGICK_GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs font-medium transition hover:bg-sidebar-accent/70"
        >
          <Github className="h-4 w-4 text-primary" />
          <span className="truncate">megick.com · Open Source</span>
        </a>
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t("layout.secure")}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {t("layout.signedInAs")} {t("layout.superAdmin")}
          </p>
        </div>
      </div>
    </>
  );
}

function AdminLanguageMenu() {
  const { locale, setLocale, supportedLocales: locales, localeLabels, t } = useAdminI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("common.language")}
          title={t("common.language")}
        >
          <Globe2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        {locales.map((item) => (
          <DropdownMenuItem
            key={item}
            onClick={() => setLocale(item, { explicit: true })}
            className="flex cursor-pointer items-center justify-between"
          >
            <span>{localeLabels[item]}</span>
            {item === locale ? <Check className="h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
