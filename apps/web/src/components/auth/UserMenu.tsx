import { Link } from "@tanstack/react-router";
import { Crown, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import type { MeResponse } from "@megick/api-types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type UserMenuProps = {
  user: NonNullable<MeResponse["user"]>;
  signOut: () => Promise<unknown>;
  align?: "start" | "center" | "end";
  showLabel?: boolean;
  labelVisibleOnMobile?: boolean;
  showBadge?: boolean;
  className?: string;
  onAction?: () => void;
};

export function UserMenu({
  user,
  signOut,
  align = "end",
  showLabel = true,
  labelVisibleOnMobile = false,
  showBadge = true,
  className,
  onAction,
}: UserMenuProps) {
  const { t } = useI18n();
  const name = user.displayName || user.email.split("@")[0] || "Creator";
  const initial = name.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn("flex min-w-0 items-center gap-2 rounded-full outline-none", className)}
          aria-label={t("auth.userMenu.open")}
        >
          <Avatar className="h-9 w-9 border border-border/70 shadow-glow">
            <AvatarImage src={user.avatarUrl ?? undefined} alt={name} />
            <AvatarFallback className="bg-gradient-primary text-xs font-bold text-primary-foreground">
              {initial}
            </AvatarFallback>
          </Avatar>
          {showLabel ? (
            <div
              className={cn(
                "min-w-0 text-left",
                labelVisibleOnMobile ? "block" : "hidden sm:block",
              )}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="max-w-32 truncate text-sm font-semibold leading-none">{name}</p>
                {showBadge ? (
                  user.hasAdvancedAccess ? (
                    <Badge className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
                      <Crown className="h-3 w-3" />
                      {t("dashboard.advancedAccess")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                      {t("dashboard.freeUser")}
                    </Badge>
                  )
                ) : null}
              </div>
            </div>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium leading-none">{name}</p>
              {user.hasAdvancedAccess ? (
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
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/dashboard" className="cursor-pointer" onClick={onAction}>
            <LayoutDashboard className="h-4 w-4" />
            {t("nav.dashboard")}
          </Link>
        </DropdownMenuItem>
        {user.isSuperAdmin ? (
          <DropdownMenuItem asChild>
            <Link to="/admin" className="cursor-pointer" onClick={onAction}>
              <ShieldCheck className="h-4 w-4" />
              {t("auth.userMenu.admin")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            onAction?.();
            void signOut();
          }}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {t("auth.userMenu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
