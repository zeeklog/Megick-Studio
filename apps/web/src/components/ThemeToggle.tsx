import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAppTheme } from "@/lib/theme";

type ThemeToggleProps = {
  variant?: "ghost" | "outline" | "header";
  className?: string;
};

export function ThemeToggle({ variant = "ghost", className }: ThemeToggleProps) {
  const { t } = useI18n();
  const { effectiveTheme, toggleTheme } = useAppTheme();
  const [hasInteracted, setHasInteracted] = useState(false);
  const buttonVariant = variant === "header" ? "ghost" : variant;
  const celestialLabel = effectiveTheme === "light" ? t("theme.sunset") : t("theme.sunrise");

  const handleToggle = () => {
    setHasInteracted(true);
    toggleTheme();
  };

  return (
    <Button
      type="button"
      variant={buttonVariant}
      size="icon"
      className={cn(
        "group relative isolate overflow-hidden rounded-full border border-white/20 p-[1px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),0_1px_3px_rgba(0,0,0,0.18)] transition-opacity hover:opacity-90",
        variant === "header" && "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]",
        className,
      )}
      style={
        variant === "header"
          ? { backgroundColor: "var(--theme-cta)", color: "var(--theme-cta-foreground)" }
          : undefined
      }
      onClick={handleToggle}
      aria-label={t("home.glaze.themeToggle")}
      title={t("home.glaze.themeToggle")}
    >
      <span className="sr-only">{celestialLabel}</span>
      <span
        aria-hidden="true"
        className={cn(
          "theme-sky relative block h-full w-full min-h-[calc(2rem-2px)] min-w-[calc(2rem-2px)] overflow-hidden rounded-full",
          effectiveTheme === "light" ? "theme-sky-light" : "theme-sky-dark",
          hasInteracted && "theme-sky-live",
        )}
      >
        <span className="theme-sky-layer theme-sky-day absolute inset-0" />
        <span className="theme-sky-layer theme-sky-dusk absolute inset-0" />
        <span className="theme-sky-layer theme-sky-night absolute inset-0" />
        <span className="theme-sky-stars absolute inset-0" />
        <span className="theme-sky-horizon absolute inset-x-[12%] bottom-[22%] h-px" />
        <span className="theme-sky-hill theme-sky-hill-back absolute -bottom-[18%] left-[2%] h-[42%] w-[64%] rounded-[999px_999px_0_0]" />
        <span className="theme-sky-hill theme-sky-hill-front absolute -bottom-[22%] right-[-12%] h-[50%] w-[76%] rounded-[999px_999px_0_0]" />
        <span className="theme-sky-sun absolute left-1/2 top-1/2 h-[42%] w-[42%] rounded-full" />
        <span className="theme-sky-moon absolute left-1/2 top-1/2 h-[38%] w-[38%] rounded-full" />
      </span>
      <style>{`
        .theme-sky {
          background: #87d4ff;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18), inset 0 -8px 16px rgba(0, 0, 0, 0.1);
          transform: translateZ(0);
        }

        .theme-sky-live .theme-sky-layer,
        .theme-sky-live .theme-sky-stars,
        .theme-sky-live .theme-sky-horizon,
        .theme-sky-live .theme-sky-hill,
        .theme-sky-live .theme-sky-sun,
        .theme-sky-live .theme-sky-moon {
          transition-duration: 1180ms;
        }

        .theme-sky-layer,
        .theme-sky-stars,
        .theme-sky-horizon,
        .theme-sky-hill,
        .theme-sky-sun,
        .theme-sky-moon {
          transition-property: opacity, transform, filter, box-shadow;
          transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
          transition-duration: 0ms;
          will-change: opacity, transform, filter;
        }

        .theme-sky-day {
          background:
            radial-gradient(circle at 50% 18%, rgba(255, 245, 195, 0.72), transparent 32%),
            linear-gradient(180deg, #87d4ff 0%, #ffd98d 52%, #ff9c5a 100%);
        }

        .theme-sky-dusk {
          background:
            radial-gradient(circle at 50% 54%, rgba(255, 150, 76, 0.6), transparent 36%),
            linear-gradient(180deg, #314163 0%, #9a5471 48%, #f38a57 100%);
        }

        .theme-sky-night {
          background:
            radial-gradient(circle at 48% 24%, rgba(92, 104, 166, 0.42), transparent 34%),
            linear-gradient(180deg, #111833 0%, #17213c 58%, #241d3d 100%);
        }

        .theme-sky-light .theme-sky-day { opacity: 1; }
        .theme-sky-light .theme-sky-dusk { opacity: 0; }
        .theme-sky-light .theme-sky-night { opacity: 0; }
        .theme-sky-dark .theme-sky-day { opacity: 0; }
        .theme-sky-dark .theme-sky-dusk { opacity: 0.22; }
        .theme-sky-dark .theme-sky-night { opacity: 1; }

        .theme-sky-stars {
          opacity: 0;
          background-image:
            radial-gradient(circle, rgba(255,255,255,0.82) 0 0.7px, transparent 1px),
            radial-gradient(circle, rgba(255,236,184,0.78) 0 0.7px, transparent 1px),
            radial-gradient(circle, rgba(255,255,255,0.62) 0 0.6px, transparent 0.9px);
          background-position: 30% 28%, 68% 20%, 76% 50%;
          background-size: 13px 13px, 17px 17px, 11px 11px;
          transform: translate3d(0, 3px, 0) scale(0.94);
        }

        .theme-sky-dark .theme-sky-stars {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }

        .theme-sky-horizon {
          opacity: 0.76;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.78), transparent);
          box-shadow: 0 0 10px rgba(255, 206, 123, 0.7);
          transform: scaleX(0.94);
        }

        .theme-sky-dark .theme-sky-horizon {
          opacity: 0.28;
          transform: scaleX(0.74);
        }

        .theme-sky-hill {
          background: linear-gradient(180deg, rgba(19, 62, 71, 0.64), rgba(9, 30, 42, 0.95));
          filter: brightness(1.15) saturate(1.1);
          transform: translate3d(0, 2%, 0);
          transform-origin: bottom center;
        }

        .theme-sky-hill-front {
          background: linear-gradient(180deg, rgba(34, 93, 78, 0.78), rgba(7, 25, 36, 0.98));
        }

        .theme-sky-dark .theme-sky-hill {
          filter: brightness(0.7) saturate(0.8);
          transform: translate3d(0, 0, 0);
        }

        .theme-sky-sun {
          opacity: 1;
          background: radial-gradient(circle at 35% 32%, #fff8c8 0 20%, #ffd86d 48%, #ff9d3d 100%);
          box-shadow: 0 0 12px rgba(255, 199, 86, 0.72), 0 0 24px rgba(255, 153, 74, 0.42);
          transform: translate3d(-50%, -76%, 0) scale(1);
        }

        .theme-sky-sun::before {
          content: "";
          position: absolute;
          inset: -45%;
          border-radius: inherit;
          opacity: 0.42;
          background: radial-gradient(circle, rgba(255, 225, 124, 0.38), transparent 62%);
          transform: scale(0.86);
          transition: opacity 1180ms cubic-bezier(0.16, 1, 0.3, 1), transform 1180ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .theme-sky-dark .theme-sky-sun {
          opacity: 0;
          box-shadow: 0 0 4px rgba(255, 153, 74, 0.08), 0 0 10px rgba(255, 153, 74, 0.06);
          transform: translate3d(-50%, 72%, 0) scale(0.92);
        }

        .theme-sky-dark .theme-sky-sun::before {
          opacity: 0;
          transform: scale(0.58);
        }

        .theme-sky-moon {
          opacity: 0;
          background:
            radial-gradient(circle at 65% 36%, rgba(119, 133, 176, 0.72) 0 12%, transparent 13%),
            radial-gradient(circle at 38% 66%, rgba(119, 133, 176, 0.52) 0 10%, transparent 11%),
            radial-gradient(circle at 44% 38%, rgba(119, 133, 176, 0.46) 0 7%, transparent 8%),
            linear-gradient(135deg, #f8fbff, #b7c4df 72%);
          box-shadow: 0 0 12px rgba(208, 219, 255, 0.45);
          transform: translate3d(-8%, -70%, 0) scale(0.78);
        }

        .theme-sky-dark .theme-sky-moon {
          opacity: 1;
          transform: translate3d(-50%, -48%, 0) scale(1);
        }
      `}</style>
    </Button>
  );
}
