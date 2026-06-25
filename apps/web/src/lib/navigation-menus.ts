import type { TranslationKey } from "./i18n";

export type NavigationMenuArea = "HEADER" | "DASHBOARD_SIDEBAR";
export type NavigationMenuMetadata = Record<string, string | number | boolean | null>;

export interface NavigationMenuItem {
  id: string;
  area: NavigationMenuArea;
  code: string;
  label: string;
  labelEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  href: string;
  icon?: string | null;
  requiresAuth: boolean;
  isActive: boolean;
  sortOrder: number;
  metadata?: NavigationMenuMetadata | null;
}

const defaultNavigationLabelKeys: Record<string, TranslationKey> = {
  about: "nav.about",
  studio: "nav.aiStudio",
  templates: "nav.templates",
};

export const DEFAULT_HEADER_MENU_ITEMS: NavigationMenuItem[] = [
  {
    id: "default-header-templates",
    area: "HEADER",
    code: "templates",
    label: "Templates",
    labelEn: "Templates",
    href: "/templates",
    requiresAuth: false,
    isActive: true,
    sortOrder: 10,
  },
  {
    id: "default-header-studio",
    area: "HEADER",
    code: "studio",
    label: "AI Studio",
    labelEn: "AI Studio",
    href: "/dashboard/studio/image",
    requiresAuth: true,
    isActive: true,
    sortOrder: 30,
    metadata: { dashboardDefault: true },
  },
  {
    id: "default-header-about",
    area: "HEADER",
    code: "about",
    label: "About",
    labelEn: "About",
    href: "/about",
    requiresAuth: false,
    isActive: true,
    sortOrder: 60,
  },
];

function shouldUseChineseMenuText(locale: string) {
  const normalized = locale.toLowerCase();
  return normalized === "zh-cn" || normalized === "zh-tw" || normalized.startsWith("zh-");
}

export function localizedMenuLabel(
  item: Pick<NavigationMenuItem, "code" | "label" | "labelEn">,
  locale: string,
  translate?: (key: TranslationKey) => string,
) {
  const defaultLabelKey = defaultNavigationLabelKeys[item.code];
  if (translate && defaultLabelKey) return translate(defaultLabelKey);
  return !shouldUseChineseMenuText(locale) && item.labelEn ? item.labelEn : item.label;
}

export function localizedMenuDescription(
  item: Pick<NavigationMenuItem, "description" | "descriptionEn">,
  locale: string,
) {
  return !shouldUseChineseMenuText(locale) && item.descriptionEn
    ? item.descriptionEn
    : (item.description ?? "");
}
