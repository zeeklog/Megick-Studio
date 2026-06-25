import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  Minus,
  RefreshCw,
  RotateCcw,
  Settings,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";

/** CSS px height. Electron/Chromium maps this through deviceScaleFactor for HiDPI displays. */
export const DESKTOP_TITLE_BAR_HEIGHT = 40;

const MEGICK_SITE_URL = "https://megick.com";
const FEEDBACK_EMAIL = "report@megick.com";

type DesktopApi = NonNullable<Window["megickDesktop"]>;

function useDesktop(): DesktopApi | null {
  const [desktop, setDesktop] = useState<DesktopApi | null>(null);

  useEffect(() => {
    setDesktop(window.megickDesktop ?? null);
  }, []);

  return desktop;
}

export function DesktopTitleBar() {
  const { t } = useI18n();
  const desktop = useDesktop();
  const isMac = desktop?.platform === "darwin";
  const [maximized, setMaximized] = useState(false);
  const [navigation, setNavigation] = useState({ canGoBack: false, canGoForward: false });
  const [aboutOpen, setAboutOpen] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!desktop) return;

    void desktop.isMaximized().then(setMaximized);
    const cleanup = desktop.onMaximizeChange(setMaximized);
    return cleanup;
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;

    void desktop.getNavigationState().then(setNavigation);
    const cleanup = desktop.onNavigationStateChange(setNavigation);
    return cleanup;
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;

    void desktop.getVersion().then(setVersion);
  }, [desktop]);

  const controls = useMemo(() => {
    if (!desktop) return null;
    return (
      <WindowControls
        isMac={isMac}
        maximized={maximized}
        labels={{
          close: t("desktop.window.close"),
          minimize: t("desktop.window.minimize"),
          maximize: t("desktop.window.maximize"),
          restore: t("desktop.window.restore"),
        }}
        onMinimize={() => desktop.minimize()}
        onMaximize={() => desktop.maximize()}
        onClose={() => desktop.close()}
      />
    );
  }, [desktop, isMac, maximized]);

  if (!desktop) return null;

  return (
    <>
      <div
        className={cn(
          "relative z-50 flex shrink-0 select-none items-center border-b border-white/7 bg-[#100e0b]/95 text-white/60 shadow-[0_1px_0_rgba(255,255,255,0.035)_inset] backdrop-blur-xl",
          isMac ? "px-3" : "pl-3 pr-0",
        )}
        style={{ height: DESKTOP_TITLE_BAR_HEIGHT, WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {isMac ? controls : null}

        <NavigationControls
          isMac={isMac}
          canGoBack={navigation.canGoBack}
          canGoForward={navigation.canGoForward}
          onBack={() => desktop.navigateBack()}
          onForward={() => desktop.navigateForward()}
          onRefresh={() => desktop.refresh()}
        />

        <SettingsMenu
          labels={{
            settings: t("desktop.settings"),
            about: t("desktop.about.menu"),
            restart: t("desktop.restart"),
          }}
          onAbout={() => setAboutOpen(true)}
          onRestart={() => desktop.restartApp()}
        />

        <div className="min-w-0 flex-1" />

        <div className="pointer-events-none hidden items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-white/22 sm:flex">
          <span className="h-1 w-1 rounded-full bg-white/18" />
          MEGICK STUDIO
          <span className="h-1 w-1 rounded-full bg-white/18" />
        </div>

        <div className="min-w-0 flex-1" />

        {!isMac ? controls : null}
      </div>

      <AboutMegickDialog
        open={aboutOpen}
        version={version}
        labels={{
          title: t("desktop.about.title"),
          description: t("desktop.about.description"),
          website: t("desktop.about.website"),
          feedback: t("desktop.about.feedback"),
          version: t("desktop.about.version"),
          unknown: t("desktop.about.unknown"),
        }}
        onOpenChange={setAboutOpen}
        onOpenSite={() => desktop.openExternal(MEGICK_SITE_URL)}
      />
    </>
  );
}

function NavigationControls({
  isMac,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onRefresh,
}: {
  isMac: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn("flex items-center gap-1", isMac ? "ml-5" : "ml-0")}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <TitleBarButton onClick={onBack} disabled={!canGoBack} aria-label={t("desktop.nav.back")} variant="nav">
        <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.4} />
      </TitleBarButton>
      <TitleBarButton
        onClick={onForward}
        disabled={!canGoForward}
        aria-label={t("desktop.nav.forward")}
        variant="nav"
      >
        <ChevronRight className="h-[15px] w-[15px]" strokeWidth={2.4} />
      </TitleBarButton>
      <TitleBarButton onClick={onRefresh} aria-label={t("desktop.nav.refresh")} variant="nav">
        <RefreshCw className="h-[14px] w-[14px]" strokeWidth={2.2} />
      </TitleBarButton>
    </div>
  );
}

function SettingsMenu({
  labels,
  onAbout,
  onRestart,
}: {
  labels: { settings: string; about: string; restart: string };
  onAbout: () => void;
  onRestart: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TitleBarButton aria-label={labels.settings} variant="nav" className="ml-1">
          <Settings className="h-[15px] w-[15px]" strokeWidth={2.2} />
        </TitleBarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="z-[70] min-w-44 border-white/10 bg-[#17130f] text-white/78 shadow-2xl"
      >
        <DropdownMenuItem onSelect={onAbout} className="focus:bg-white/10 focus:text-white">
          <Info className="h-4 w-4" />
          {labels.about}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem onSelect={onRestart} className="focus:bg-white/10 focus:text-white">
          <RotateCcw className="h-4 w-4" />
          {labels.restart}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AboutMegickDialog({
  open,
  version,
  labels,
  onOpenChange,
  onOpenSite,
}: {
  open: boolean;
  version: string;
  labels: {
    title: string;
    description: string;
    website: string;
    feedback: string;
    version: string;
    unknown: string;
  };
  onOpenChange: (open: boolean) => void;
  onOpenSite: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#15110d] text-white shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription className="text-white/52">{labels.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-white/34">{labels.website}</div>
            <button
              type="button"
              onClick={onOpenSite}
              className="mt-2 inline-flex items-center gap-2 text-[#f7c873] transition hover:text-[#ffe0a0]"
            >
              {MEGICK_SITE_URL}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-white/34">{labels.feedback}</div>
              <div className="mt-1 text-white/82">{FEEDBACK_EMAIL}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-white/34">{labels.version}</div>
              <div className="mt-1 text-white/82">{version || labels.unknown}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WindowControls({
  isMac,
  maximized,
  labels,
  onMinimize,
  onMaximize,
  onClose,
}: {
  isMac: boolean;
  maximized: boolean;
  labels: { close: string; minimize: string; maximize: string; restore: string };
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}) {
  if (isMac) {
    return (
      <div
        className="group flex items-center gap-2"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <MacTrafficButton color="close" label={labels.close} onClick={onClose}>
          <X className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-70" strokeWidth={3} />
        </MacTrafficButton>
        <MacTrafficButton color="minimize" label={labels.minimize} onClick={onMinimize}>
          <Minus className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-70" strokeWidth={3} />
        </MacTrafficButton>
        <MacTrafficButton color="maximize" label={maximized ? labels.restore : labels.maximize} onClick={onMaximize}>
          <Square className="h-[7px] w-[7px] opacity-0 transition-opacity group-hover:opacity-70" strokeWidth={3} />
        </MacTrafficButton>
      </div>
    );
  }

  return (
    <div className="flex h-full items-stretch" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <TitleBarButton onClick={onMinimize} aria-label={labels.minimize} variant="win">
        <Minus className="h-3.5 w-3.5" strokeWidth={2.1} />
      </TitleBarButton>
      <TitleBarButton onClick={onMaximize} aria-label={maximized ? labels.restore : labels.maximize} variant="win">
        {maximized ? <RestoreIcon /> : <Square className="h-3 w-3" strokeWidth={1.9} />}
      </TitleBarButton>
      <TitleBarButton onClick={onClose} aria-label={labels.close} variant="winClose">
        <X className="h-4 w-4" strokeWidth={2} />
      </TitleBarButton>
    </div>
  );
}

function MacTrafficButton({
  color,
  label,
  onClick,
  children,
}: {
  color: "close" | "minimize" | "maximize";
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const colorClass = {
    close: "border-[#e0453e] bg-[#ff5f57] text-[#7a1714] shadow-[0_0_0_1px_rgba(0,0,0,0.18)_inset]",
    minimize: "border-[#d29b25] bg-[#ffbd2e] text-[#7a4d00] shadow-[0_0_0_1px_rgba(0,0,0,0.16)_inset]",
    maximize: "border-[#18a840] bg-[#28c840] text-[#07531a] shadow-[0_0_0_1px_rgba(0,0,0,0.16)_inset]",
  }[color];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-3.5 w-3.5 items-center justify-center rounded-full border transition hover:brightness-105 active:brightness-90",
        colorClass,
      )}
    >
      {children}
    </button>
  );
}

type TitleBarButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: "nav" | "win" | "winClose";
};

const TitleBarButton = React.forwardRef<HTMLButtonElement, TitleBarButtonProps>(
  ({ disabled, variant, children, className, style, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-28",
        variant === "nav" &&
          "h-7 w-8 rounded-lg text-white/48 hover:bg-white/9 hover:text-white/82 active:bg-white/13",
        variant === "win" && "h-full w-11 text-white/48 hover:bg-white/10 hover:text-white/85 active:bg-white/14",
        variant === "winClose" && "h-full w-12 text-white/55 hover:bg-[#e81123] hover:text-white active:bg-[#c50f1f]",
        className,
      )}
      style={{ WebkitAppRegion: "no-drag", ...style } as React.CSSProperties}
      {...rest}
    >
      {children}
    </button>
  ),
);
TitleBarButton.displayName = "TitleBarButton";

function RestoreIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5 5.5V3.5H12.5V11H10.5" stroke="currentColor" strokeWidth="1.35" />
      <path d="M3.5 5.5H10.5V12.5H3.5V5.5Z" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}
