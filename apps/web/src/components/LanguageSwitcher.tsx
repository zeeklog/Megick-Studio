import { Check, ChevronDown, Globe2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  localeLabels,
  localeShortLabels,
  localeToIntl,
  supportedLocales,
  useI18n,
  type AppLocale,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  variant?: "ghost" | "outline" | "header";
  showLabel?: boolean;
  className?: string;
};

const menuLocales: AppLocale[] = ["zh-CN", "zh-TW", "en", "ja", "fr", "de"];
const languageDisplayCodes: Record<AppLocale, string> = {
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
  en: "en",
  ja: "ja",
  fr: "fr",
  de: "de",
};

function localizedLanguageName(locale: AppLocale, target: AppLocale) {
  try {
    return new Intl.DisplayNames([localeToIntl(locale)], { type: "language" }).of(
      languageDisplayCodes[target],
    );
  } catch {
    return undefined;
  }
}

export function LanguageSwitcher({
  variant = "ghost",
  showLabel = false,
  className,
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ariaLabel = `${t("common.language")}: ${localeLabels[locale]}`;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn(
          "group/language inline-flex items-center justify-center rounded-full border text-xs font-semibold shadow-sm transition-[background-color,border-color,color,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          showLabel ? "gap-2" : "gap-1.5",
          variant === "header"
            ? "border-[color-mix(in_oklab,var(--theme-text)_14%,transparent)] bg-[color-mix(in_oklab,var(--theme-surface)_82%,transparent)] text-[color:var(--theme-text)] shadow-[0_10px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl hover:bg-[color-mix(in_oklab,var(--theme-surface)_94%,var(--theme-primary)_6%)]"
            : variant === "outline"
              ? "border-border bg-background/90 hover:bg-accent"
              : "border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground",
          "h-9 px-2.5",
          className,
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        <Globe2 className="h-4 w-4 shrink-0 opacity-80 transition-opacity group-hover/language:opacity-100" />
        {showLabel ? (
          <>
            <span className="hidden max-w-24 truncate lg:inline">{localeLabels[locale]}</span>
            <span className="tabular-nums lg:hidden">{localeShortLabels[locale]}</span>
          </>
        ) : (
          <span className="tabular-nums">{localeShortLabels[locale]}</span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-55 transition-transform duration-200",
            open ? "rotate-180" : "",
          )}
        />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-[90] mt-2 min-w-[15rem] rounded-2xl border p-2 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
          style={{
            borderColor: "var(--glass-border)",
            backgroundColor: "var(--theme-surface)",
            color: "var(--theme-text)",
          }}
          role="menu"
        >
          <div className="px-3 pb-2 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("common.language")}
          </div>
          <div className="mx-1 mb-1 h-px bg-[color-mix(in_oklab,var(--theme-text)_10%,transparent)]" />
          {menuLocales
            .filter((item) => supportedLocales.includes(item))
            .map((item) => {
              const languageName = localizedLanguageName(locale, item);
              const showLocalizedName = languageName && languageName !== localeLabels[item];

              return (
                <button
                  key={item}
                  type="button"
                  lang={localeToIntl(item)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-[color-mix(in_oklab,var(--theme-primary)_10%,transparent)] focus:bg-[color-mix(in_oklab,var(--theme-primary)_10%,transparent)]"
                  onClick={() => {
                    setLocale(item, { explicit: true });
                    setOpen(false);
                  }}
                  role="menuitemradio"
                  aria-checked={item === locale}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-7 min-w-9 items-center justify-center rounded-lg border px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground"
                      aria-hidden="true"
                    >
                      {localeShortLabels[item]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{localeLabels[item]}</span>
                      {showLocalizedName ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {languageName}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {item === locale ? (
                    <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
        </div>
      ) : null}
    </div>
  );
}
