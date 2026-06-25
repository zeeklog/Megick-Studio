import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppTheme = "light" | "dark";

const THEME_STORAGE_KEY = "theme";
export const THEME_COOKIE_KEY = "megick.theme";
const DEFAULT_THEME: AppTheme = "dark";

type ThemeContextValue = {
  theme: AppTheme;
  effectiveTheme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isAppTheme(value: string | null): value is AppTheme {
  return value === "light" || value === "dark";
}

function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage?.getItem(THEME_STORAGE_KEY) ?? null;
    if (isAppTheme(stored)) return stored;
  } catch {
    // Fall through to cookie storage.
  }

  const cookieTheme = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${THEME_COOKIE_KEY}=`))
    ?.split("=")[1];

  const normalizedCookieTheme = cookieTheme ?? null;
  if (isAppTheme(normalizedCookieTheme)) return normalizedCookieTheme;
  return DEFAULT_THEME;
}

function persistTheme(theme: AppTheme) {
  try {
    window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Cookie persistence below is enough for reloads and SSR.
  }

  document.cookie = `${THEME_COOKIE_KEY}=${theme}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function applyDocumentTheme(theme: AppTheme) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  const themeColor = theme === "dark" ? "#110f0a" : "#f5f5f5";
  const metaThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.content = themeColor;
  }
}

export function ThemeProvider({
  children,
  forceDark = false,
  initialTheme = DEFAULT_THEME,
}: {
  children: ReactNode;
  forceDark?: boolean;
  initialTheme?: AppTheme;
}) {
  const [theme, setThemeState] = useState<AppTheme>(initialTheme);

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  const effectiveTheme = forceDark ? "dark" : theme;

  useEffect(() => {
    applyDocumentTheme(effectiveTheme);
  }, [effectiveTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isAppTheme(event.newValue)) return;
      setThemeState(event.newValue);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    persistTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [setTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, effectiveTheme, setTheme, toggleTheme }),
    [effectiveTheme, setTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useAppTheme must be used inside ThemeProvider");
  return context;
}
