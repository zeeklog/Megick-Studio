import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  History,
  Image as ImageIcon,
  Images,
  LayoutTemplate,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Scissors,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Crown,
  Video,
  User as UserIcon,
  Wand2,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { GenerationJobPublic } from "@megick/api-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthGate } from "@/hooks/useAuthGate";
import { apiGet } from "@/lib/api-client";
import { useVideoGenerationEnabled } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { OnboardingTourProvider } from "@/components/onboarding-tour/OnboardingTourProvider";
import { useOnboardingTour } from "@/components/onboarding-tour/onboarding-tour.context";
import {
  type ChatSession,
  type DashboardOverview,
  type StudioMode,
  readLastStudioSessionId,
  rememberLastStudioSessionId,
  modeForChatSession,
  studioPathForJob,
  studioSearchForJob,
} from "./-dashboard-types";
import { TemplateDetailSkeleton } from "./-dashboard-components";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import {
  localizedMenuDescription,
  localizedMenuLabel,
  type NavigationMenuItem,
} from "@/lib/navigation-menus";

type DashboardNavPath =
  | "/dashboard/template"
  | "/dashboard/studio/image"
  | "/dashboard/studio/video"
  | "/dashboard/video-editor"
  | "/dashboard/media-center"
  | "/dashboard/history"
  | "/dashboard/chats"
  | "/dashboard/profile";

type DashboardNavItem = {
  to: DashboardNavPath;
  studioMode?: "image" | "video";
  requiresAuth: boolean;
  value: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: typeof Wand2;
  menuItem?: NavigationMenuItem;
};

const navItems: DashboardNavItem[] = [
  {
    to: "/dashboard/studio/image",
    studioMode: "image",
    requiresAuth: true,
    value: "image-studio",
    labelKey: "dashboard.nav.imageStudio.label",
    descriptionKey: "dashboard.nav.imageStudio.description",
    icon: ImageIcon,
  },
  {
    to: "/dashboard/studio/video",
    studioMode: "video",
    requiresAuth: true,
    value: "video-studio",
    labelKey: "dashboard.nav.videoStudio.label",
    descriptionKey: "dashboard.nav.videoStudio.description",
    icon: Video,
  },
  {
    to: "/dashboard/video-editor",
    requiresAuth: true,
    value: "video-editor",
    labelKey: "dashboard.nav.videoEditor.label",
    descriptionKey: "dashboard.nav.videoEditor.description",
    icon: Scissors,
  },
  {
    to: "/dashboard/template",
    requiresAuth: true,
    value: "templates",
    labelKey: "dashboard.nav.templates.label",
    descriptionKey: "dashboard.nav.templates.description",
    icon: LayoutTemplate,
  },
  {
    to: "/dashboard/media-center",
    requiresAuth: true,
    value: "media-center",
    labelKey: "dashboard.nav.mediaCenter.label",
    descriptionKey: "dashboard.nav.mediaCenter.description",
    icon: Images,
  },
  {
    to: "/dashboard/history",
    requiresAuth: true,
    value: "history",
    labelKey: "dashboard.nav.history.label",
    descriptionKey: "dashboard.nav.history.description",
    icon: History,
  },
  {
    to: "/dashboard/chats",
    requiresAuth: true,
    value: "chats",
    labelKey: "dashboard.nav.chats.label",
    descriptionKey: "dashboard.nav.chats.description",
    icon: MessageSquare,
  },
  {
    to: "/dashboard/profile",
    requiresAuth: true,
    value: "profile",
    labelKey: "dashboard.nav.profile.label",
    descriptionKey: "dashboard.nav.profile.description",
    icon: UserIcon,
  },
];

const dashboardIconMap = {
  image: ImageIcon,
  video: Video,
  scissors: Scissors,
  "layout-template": LayoutTemplate,
  images: Images,
  history: History,
  "message-square": MessageSquare,
  user: UserIcon,
  sparkles: Sparkles,
  settings: Settings,
} satisfies Record<string, typeof Wand2>;

const onboardingNavTargets: Partial<Record<string, string>> = {
  "image-studio": "nav-image-studio",
  "video-studio": "nav-video-studio",
  history: "nav-history",
};

const DESKTOP_SIDEBAR_BREAKPOINT = 1024;
const EXPANDED_SIDEBAR_WIDTH = 210;
const AUTO_COLLAPSE_CONTENT_MIN = 820;
const AUTO_EXPAND_CONTENT_MIN = 980;

function isDashboardNavPath(value: string): value is DashboardNavPath {
  return navItems.some((item) => item.to === value);
}

function dashboardNavItemFromMenu(item: NavigationMenuItem): DashboardNavItem | null {
  if (!item.isActive || !isDashboardNavPath(item.href)) return null;
  const fallback = navItems.find((navItem) => navItem.to === item.href);
  const studioMode =
    item.metadata?.studioMode === "video" || item.href.endsWith("/video")
      ? "video"
      : item.metadata?.studioMode === "image" || item.href.endsWith("/image")
        ? "image"
        : fallback?.studioMode;
  return {
    to: item.href,
    studioMode,
    requiresAuth: item.requiresAuth,
    value: item.code || fallback?.value || item.href,
    labelKey: "dashboard.nav.custom.label",
    descriptionKey: "dashboard.nav.custom.description",
    icon:
      item.icon && item.icon in dashboardIconMap
        ? dashboardIconMap[item.icon as keyof typeof dashboardIconMap]
        : (fallback?.icon ?? Wand2),
    menuItem: item,
  };
}

function isTemplateDetailPath(pathname: string) {
  const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return (
    normalized.startsWith("/dashboard/template/") || normalized.startsWith("/dashboard/templates/")
  );
}

function currentLocationHref() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { t, formatNumber, locale } = useI18n();
  const { user, loading, signOut, requireAuth } = useAuthGate();
  const navigate = useNavigate();
  const location = useLocation();
  const { videoGenerationEnabled, isLoading: videoFlagLoading } = useVideoGenerationEnabled();
  const routeRequiresAuth = true;
  const shouldLoadPrivateChrome = !!user;
  const userId = user?.id;
  const authRedirectPathRef = useRef<string | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarAutoCollapsed, setSidebarAutoCollapsed] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [storedStudioSessionIds, setStoredStudioSessionIds] = useState<
    Partial<Record<StudioMode, string>>
  >({});


  const overviewQ = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => apiGet<DashboardOverview>("/api/users/me/overview"),
    enabled: shouldLoadPrivateChrome,
  });
  const chatsQ = useQuery({
    queryKey: ["dashboard", "chats"],
    queryFn: () => apiGet<ChatSession[]>("/api/chats"),
    enabled: shouldLoadPrivateChrome,
    staleTime: 30000,
  });

  const notificationsQ = useQuery({
    queryKey: ["dashboard", "notifications"],
    queryFn: () => apiGet<GenerationJobPublic[]>("/api/generation/jobs", { query: { limit: 12 } }),
    enabled: shouldLoadPrivateChrome,
    refetchInterval: 15000,
  });
  const dashboardMenusQ = useQuery({
    queryKey: ["navigation-menus", "dashboard-sidebar"],
    queryFn: () =>
      apiGet<NavigationMenuItem[]>("/api/navigation-menus", {
        query: { area: "DASHBOARD_SIDEBAR" },
      }),
    enabled: shouldLoadPrivateChrome,
    staleTime: 300000,
  });
  useEffect(() => {
    if (loading || user) {
      authRedirectPathRef.current = null;
      return;
    }
    const redirectTo = currentLocationHref();
    if (authRedirectPathRef.current === redirectTo) return;
    authRedirectPathRef.current = redirectTo;
    requireAuth(redirectTo);
    navigate({ to: "/", replace: true });
  }, [loading, navigate, requireAuth, user]);

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = window.localStorage.getItem(`megick-read-notifications:${userId}`);
      setReadNotificationIds(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setReadNotificationIds([]);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setStoredStudioSessionIds({});
      return;
    }
    setStoredStudioSessionIds({
      image: readLastStudioSessionId(userId, "image") ?? undefined,
      video: readLastStudioSessionId(userId, "video") ?? undefined,
    });
  }, [userId]);

  const overview = overviewQ.data;
  const credits = user?.credits ?? overview?.credits ?? 0;
  const profileName = user ? user.displayName || user.email.split("@")[0] : t("common.creator");
  const hasAdvancedAccess = Boolean(user?.hasAdvancedAccess ?? overview?.hasAdvancedAccess);
  const initial = profileName.charAt(0).toUpperCase();
  const notificationJobs = (notificationsQ.data ?? [])
    .filter((job) => job.status === "succeeded")
    .slice(0, 8);
  const unreadNotificationCount = notificationJobs.filter(
    (job) => !readNotificationIds.includes(job.id),
  ).length;
  const persistReadNotifications = (ids: string[]) => {
    setReadNotificationIds(ids);
    if (!user) return;
    try {
      window.localStorage.setItem(`megick-read-notifications:${user.id}`, JSON.stringify(ids));
    } catch {
      // localStorage may be unavailable in private browsing.
    }
  };
  const markNotificationRead = (id: string) => {
    if (readNotificationIds.includes(id)) return;
    persistReadNotifications([...readNotificationIds, id]);
  };
  const markAllNotificationsRead = () => {
    persistReadNotifications([
      ...new Set([...readNotificationIds, ...notificationJobs.map((job) => job.id)]),
    ]);
  };
  const notificationTime = (job: GenerationJobPublic) =>
    new Date(job.finishedAt ?? job.createdAt).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const effectiveSidebarCollapsed = sidebarCollapsed || sidebarAutoCollapsed;
  const handleOnboardingTourStart = useCallback(() => {
    const shouldRestoreCollapsed = effectiveSidebarCollapsed;
    setSidebarCollapsed(false);
    setSidebarAutoCollapsed(false);
    return () => {
      if (shouldRestoreCollapsed) setSidebarCollapsed(true);
    };
  }, [effectiveSidebarCollapsed]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return;

    const updateAutoCollapse = () => {
      const shellWidth = shell.getBoundingClientRect().width;
      if (shellWidth < DESKTOP_SIDEBAR_BREAKPOINT) {
        setSidebarAutoCollapsed(false);
        return;
      }

      const expandedContentWidth = shellWidth - EXPANDED_SIDEBAR_WIDTH;
      setSidebarAutoCollapsed((current) => {
        if (expandedContentWidth < AUTO_COLLAPSE_CONTENT_MIN) return true;
        if (expandedContentWidth >= AUTO_EXPAND_CONTENT_MIN) return false;
        return current;
      });
    };

    updateAutoCollapse();
    const observer = new ResizeObserver(updateAutoCollapse);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const currentSearch = location.search as {
    mode?: string;
    sessionId?: string;
    onboardingDemo?: boolean | string;
  };
  const currentIsOnboardingDemo =
    currentSearch.onboardingDemo === true ||
    currentSearch.onboardingDemo === "true" ||
    currentSearch.onboardingDemo === "1";
  const currentStudioSessionId =
    location.pathname.startsWith("/dashboard/studio") && !currentIsOnboardingDemo
      ? currentSearch.sessionId
      : undefined;
  const currentStudioMode = location.pathname.startsWith("/dashboard/studio/video")
    ? "video"
    : currentSearch.mode === "video"
      ? "video"
      : "image";
  useEffect(() => {
    if (!userId || !currentStudioSessionId || currentIsOnboardingDemo) return;
    rememberLastStudioSessionId(currentStudioSessionId, userId, currentStudioMode);
    setStoredStudioSessionIds((prev) => ({
      ...prev,
      [currentStudioMode]: currentStudioSessionId,
    }));
  }, [currentIsOnboardingDemo, currentStudioMode, currentStudioSessionId, userId]);

  const storedSessionForMode = (mode: StudioMode) => {
    const stored = storedStudioSessionIds[mode];
    if (!stored) return undefined;
    if (chatsQ.data) {
      const storedChat = chatsQ.data.find((chat) => chat.id === stored);
      if (!storedChat || modeForChatSession(storedChat) !== mode) return undefined;
    }
    return stored;
  };
  const studioNavSearchFor = (mode: StudioMode) => {
    const sessionId =
      currentStudioMode === mode ? currentStudioSessionId : storedSessionForMode(mode);
    return sessionId ? { sessionId } : undefined;
  };
  const isNavActive = (item: (typeof navItems)[number]) => {
    if (item.studioMode) {
      return (
        (location.pathname.startsWith(item.to) ||
          location.pathname.startsWith("/dashboard/studio")) &&
        currentStudioMode === item.studioMode
      );
    }
    return location.pathname.startsWith(item.to);
  };
  const configuredNavItems = useMemo(() => {
    const rows = dashboardMenusQ.data ?? [];
    const mapped = rows
      .map(dashboardNavItemFromMenu)
      .filter((item): item is DashboardNavItem => Boolean(item));
    return mapped.length ? mapped : navItems;
  }, [dashboardMenusQ.data]);
  const visibleNavItems = useMemo(
    () =>
      configuredNavItems.filter(
        (item) => videoGenerationEnabled || item.studioMode !== "video",
      ),
    [configuredNavItems, videoGenerationEnabled],
  );
  const activeNav = visibleNavItems.find(isNavActive) ?? visibleNavItems[0] ?? navItems[0];
  const navLabel = (item: DashboardNavItem) =>
    item.menuItem && item.labelKey === "dashboard.nav.custom.label"
      ? localizedMenuLabel(item.menuItem, locale, t)
      : t(item.labelKey);
  const navDescription = (item: DashboardNavItem) =>
    item.menuItem && item.descriptionKey === "dashboard.nav.custom.description"
      ? localizedMenuDescription(item.menuItem, locale)
      : t(item.descriptionKey);
  const isStudioWorkspace =
    location.pathname.startsWith("/dashboard/studio") ||
    location.pathname.startsWith("/dashboard/video-editor");

  if (routeRequiresAuth && (loading || !user)) {
    if (isTemplateDetailPath(location.pathname)) {
      return (
        <div className="min-h-screen bg-background">
          <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <TemplateDetailSkeleton />
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Sparkles className="h-6 w-6 animate-pulse text-primary" />
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  // Handle standalone route like /dashboard/jobs/$jobId gracefully by rendering only the Outlet
  if (location.pathname.includes("/dashboard/jobs/")) {
    return <>{children}</>;
  }

  if (!user) return null;
  const currentUser = user;

  return (
    <OnboardingTourProvider
      userId={currentUser.id}
      videoGenerationEnabled={videoGenerationEnabled}
      ready={!videoFlagLoading}
      openSidebar={() => setSidebarOpen(true)}
      closeSidebar={() => setSidebarOpen(false)}
      onTourStart={handleOnboardingTourStart}
    >
      <div
        className="h-full overflow-hidden bg-background text-foreground"
        data-onboarding-target="dashboard-shell"
      >
        <div ref={shellRef} className="flex h-full min-h-0">
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-40 flex w-[210px] shrink-0 flex-col border-r border-border bg-sidebar transition-all duration-200 lg:relative lg:inset-auto lg:translate-x-0",
              effectiveSidebarCollapsed ? "lg:w-20" : "lg:w-[210px]",
              sidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div
              className={cn(
                "flex h-16 shrink-0 items-center border-b border-border px-4",
                effectiveSidebarCollapsed ? "lg:justify-center lg:px-3" : "justify-between",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {effectiveSidebarCollapsed ? (
                  <Link
                    to="/"
                    className="hidden whitespace-nowrap text-sm font-bold tracking-tight text-gradient lg:inline-flex"
                    aria-label="Megick"
                  >
                    Megick
                  </Link>
                ) : (
                  <Logo />
                )}
                {/* {!effectiveSidebarCollapsed ? (
                <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                  <Link to="/official">{t("nav.official")}</Link>
                </Button>
              ) : null} */}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
                aria-label={t("dashboard.closeNavigation")}
              >
                <X />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-4">
              <nav className="flex flex-col gap-1">
                <TooltipProvider delayDuration={150}>
                  {visibleNavItems.map((item) => {
                    const isActive = isNavActive(item);
                    const content = (
                      <>
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className={cn("min-w-0", effectiveSidebarCollapsed && "lg:hidden")}>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="block max-w-[7rem] truncate whitespace-nowrap text-sm font-medium">
                              {navLabel(item)}
                            </span>
                            {item.studioMode === "video" ? (
                              <Badge className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
                                <Crown className="h-3 w-3" />
                                {t("dashboard.advancedAccess")}
                              </Badge>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "block max-w-[8rem] truncate whitespace-nowrap text-xs",
                              isActive ? "text-primary-foreground/80" : "text-[#999999]",
                            )}
                          >
                            {navDescription(item)}
                          </span>
                        </span>
                      </>
                    );

                    if (item.requiresAuth && !user) {
                      const trigger = (
                        <button
                          key={item.value}
                          type="button"
                          data-onboarding-target={onboardingNavTargets[item.value]}
                          onClick={() => {
                            setSidebarOpen(false);
                            requireAuth(item.to);
                          }}
                          className={cn(
                            "flex min-h-14 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                            effectiveSidebarCollapsed && "lg:justify-center lg:px-0",
                            isActive
                              ? "bg-gradient-primary text-primary-foreground shadow-glow"
                              : "text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                          )}
                        >
                          {content}
                        </button>
                      );

                      return effectiveSidebarCollapsed ? (
                        <Tooltip key={item.value}>
                          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                          <TooltipContent side="right">{navLabel(item)}</TooltipContent>
                        </Tooltip>
                      ) : (
                        trigger
                      );
                    }

                    const trigger = (
                      <Link
                        key={item.value}
                        to={item.to}
                        search={item.studioMode ? studioNavSearchFor(item.studioMode) : undefined}
                        data-onboarding-target={onboardingNavTargets[item.value]}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          "flex min-h-14 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                          effectiveSidebarCollapsed && "lg:justify-center lg:px-0",
                          isActive
                            ? "bg-gradient-primary text-primary-foreground shadow-glow"
                            : "text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        )}
                      >
                        {content}
                      </Link>
                    );

                    return effectiveSidebarCollapsed ? (
                      <Tooltip key={item.value}>
                        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                        <TooltipContent side="right">{navLabel(item)}</TooltipContent>
                      </Tooltip>
                    ) : (
                      trigger
                    );
                  })}
                </TooltipProvider>
              </nav>
            </div>

            <div className="shrink-0 border-t border-sidebar-border p-3">
              {user ? (
                <Button
                  asChild
                  className={cn(
                    "w-full bg-gradient-primary text-primary-foreground",
                    effectiveSidebarCollapsed && "lg:px-0",
                  )}
                >
                  <Link to="/dashboard/studio/image" search={{ newSession: true }}>
                    <Wand2 className="h-4 w-4" />
                    <span className={cn(effectiveSidebarCollapsed && "lg:hidden")}>
                      {t("dashboard.newGeneration")}
                    </span>
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  className={cn(
                    "w-full bg-gradient-primary text-primary-foreground",
                    effectiveSidebarCollapsed && "lg:px-0",
                  )}
                  onClick={() => requireAuth("/dashboard/studio/image?newSession=true")}
                >
                  <Wand2 className="h-4 w-4" />
                  <span className={cn(effectiveSidebarCollapsed && "lg:hidden")}>
                    {t("dashboard.newGeneration")}
                  </span>
                </Button>
              )}
            </div>
          </aside>

          {sidebarOpen ? (
            <button
              type="button"
              className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label={t("dashboard.closeOverlay")}
            />
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="z-20 flex min-h-16 shrink-0 items-center justify-between gap-1.5 border-b border-border bg-background/95 px-2 py-2 backdrop-blur-xl sm:gap-2 sm:px-6">
              <div className="flex min-w-0 items-center gap-1 sm:gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                  aria-label={t("dashboard.openNavigation")}
                >
                  <Menu />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="hidden lg:inline-flex"
                  onClick={() => setSidebarCollapsed((value) => !value)}
                  aria-expanded={!effectiveSidebarCollapsed}
                  aria-label={
                    effectiveSidebarCollapsed
                      ? t("dashboard.expandNavigation")
                      : t("dashboard.collapseNavigation")
                  }
                >
                  {effectiveSidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                </Button>
                <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <div className="hidden min-w-0 sm:block">
                    <p className="truncate text-sm font-semibold">{navLabel(activeNav)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {navDescription(activeNav)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2">
                {user ? <OnboardingTourEntryButton label={t("onboarding.entry")} /> : null}
                {user ? (
                  <form
                    className="hidden h-9 min-w-0 max-w-[14rem] flex-1 items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 text-xs text-muted-foreground transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-ring md:flex xl:max-w-[16rem]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const search = fd.get("search");
                      if (search)
                        navigate({
                          to: "/dashboard/history",
                          search: { prompt: search as string },
                        });
                    }}
                  >
                    <Search className="h-3.5 w-3.5 shrink-0" />
                    <input
                      name="search"
                      placeholder={t("dashboard.searchRecords")}
                      className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </form>
                ) : null}
                <LanguageSwitcher variant="outline" />
                <ThemeToggle variant="outline" />
                {user ? (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="relative"
                          aria-label={t("dashboard.notifications")}
                        >
                          <Bell className="h-4 w-4" />
                          {unreadNotificationCount > 0 ? (
                            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                              {Math.min(unreadNotificationCount, 9)}
                            </span>
                          ) : null}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80 p-0">
                        <div className="flex items-center justify-between border-b border-border p-4">
                          <p className="font-semibold text-sm">{t("dashboard.notifications")}</p>
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline disabled:text-muted-foreground"
                            disabled={!notificationJobs.length}
                            onClick={markAllNotificationsRead}
                          >
                            {t("dashboard.markRead")}
                          </button>
                        </div>
                        <div className="flex max-h-80 flex-col overflow-y-auto py-2">
                          {notificationJobs.length ? (
                            notificationJobs.map((job) => (
                              <Link
                                key={job.id}
                                to={
                                  job.chatSessionId
                                    ? studioPathForJob(job)
                                    : "/dashboard/jobs/$jobId"
                                }
                                params={job.chatSessionId ? undefined : { jobId: job.id }}
                                search={studioSearchForJob(job)}
                                onClick={() => markNotificationRead(job.id)}
                                className="px-4 py-3 text-sm transition hover:bg-muted/50"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-medium">
                                    {job.type === "IMAGE2VIDEO"
                                      ? t("dashboard.notification.videoReady")
                                      : t("dashboard.notification.imageReady")}
                                  </p>
                                  {!readNotificationIds.includes(job.id) ? (
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                  ) : null}
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {job.prompt}
                                </p>
                                <p className="mt-2 text-[10px] text-muted-foreground">
                                  {notificationTime(job)}
                                </p>
                              </Link>
                            ))
                          ) : (
                            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                              {notificationsQ.isLoading
                                ? t("dashboard.notificationsLoading")
                                : t("dashboard.notificationsEmpty")}
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <div className="hidden h-9 items-center gap-1 rounded-md border border-border bg-secondary/30 px-2 min-[380px]:flex">
                      <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="hidden text-muted-foreground xl:inline">
                          {t("profile.credits")}
                        </span>
                        <span className="tabular-nums">{formatNumber(credits)}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-2 rounded-full outline-none"
                          aria-label={t("auth.userMenu.open")}
                        >
                          <Avatar className="h-9 w-9 border border-border">
                            <AvatarImage src={user.avatarUrl ?? undefined} alt={profileName} />
                            <AvatarFallback className="bg-gradient-primary text-xs font-bold text-primary-foreground">
                              {initial}
                            </AvatarFallback>
                          </Avatar>
                          <div className="hidden text-left sm:block">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold leading-none">{profileName}</p>
                              {hasAdvancedAccess ? (
                                <Badge className="h-5 gap-1 px-1.5 text-[10px]">
                                  <Crown className="h-3 w-3" />
                                  {t("dashboard.advancedAccess")}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                  {t("dashboard.freeUser")}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] leading-none text-muted-foreground">
                              {user.email}
                            </p>
                          </div>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel className="font-normal">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium leading-none">{profileName}</p>
                              {hasAdvancedAccess ? (
                                <Badge className="h-5 gap-1 px-1.5 text-[10px]">
                                  <Crown className="h-3 w-3" />
                                  {t("dashboard.advancedAccess")}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                  {t("dashboard.freeUser")}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs leading-none text-muted-foreground">
                              {user.email}
                            </p>
                          </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link to="/dashboard/profile">
                            <Settings className="mr-2 h-4 w-4" />
                            {t("dashboard.menu.profile")}
                          </Link>
                        </DropdownMenuItem>
                        {user.isSuperAdmin ? (
                          <DropdownMenuItem asChild>
                            <Link to="/admin" className="cursor-pointer">
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              {t("dashboard.menu.admin")}
                            </Link>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => void signOut()}
                          className="cursor-pointer text-destructive focus:text-destructive"
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          {t("dashboard.menu.signOut")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => requireAuth()}>
                      {t("nav.signIn")}
                    </Button>
                    <Button
                      size="sm"
                      className="bg-gradient-primary shadow-glow hover:opacity-90"
                      onClick={() => requireAuth("/dashboard/studio/image?newSession=true")}
                    >
                      {t("nav.getStarted")}
                    </Button>
                  </>
                )}
              </div>
            </header>

            <main
              className={cn(
                "min-h-0 flex-1",
                isStudioWorkspace
                  ? "overflow-y-auto px-2 py-2 sm:px-3 sm:py-3 lg:overflow-hidden lg:px-5 lg:py-4"
                  : "overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-5",
              )}
            >
              <div
                className={cn(
                  "flex w-full flex-1 flex-col",
                  isStudioWorkspace ? "min-h-full lg:h-full lg:min-h-0" : "min-h-full gap-4",
                )}
              >
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </OnboardingTourProvider>
  );
}

function OnboardingTourEntryButton({ label }: { label: string }) {
  const { startTour } = useOnboardingTour();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="hidden h-9 shrink-0 gap-1.5 px-2.5 text-xs sm:inline-flex"
      onClick={startTour}
      aria-label={label}
      title={label}
    >
      <BookOpen className="h-3.5 w-3.5" />
      <span className="hidden lg:inline">{label}</span>
    </Button>
  );
}
