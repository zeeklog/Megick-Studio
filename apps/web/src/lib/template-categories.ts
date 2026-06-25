import type { AppLocale } from "@/lib/i18n";

type TemplateCategoryLabels = {
  en: string;
  zhCN: string;
  zhTW: string;
};

const templateCategoryAliases: Array<{
  aliases: string[];
  labels: TemplateCategoryLabels;
}> = [
  {
    aliases: ["穿搭配色（个人色彩测试）", "穿搭配色(个人色彩测试)", "outfit & color analysis", "outfit and color analysis"],
    labels: {
      en: "Outfit & Color Analysis",
      zhCN: "穿搭配色（个人色彩测试）",
      zhTW: "穿搭配色（個人色彩測試）",
    },
  },
  {
    aliases: ["品牌设计", "品牌設計", "brand design", "branding"],
    labels: { en: "Brand Design", zhCN: "品牌设计", zhTW: "品牌設計" },
  },
  {
    aliases: ["海报与广告", "海報與廣告", "poster & ads", "posters & ads", "poster and ads", "marketing"],
    labels: { en: "Posters & Ads", zhCN: "海报与广告", zhTW: "海報與廣告" },
  },
  {
    aliases: ["插画", "插畫", "illustration", "illustrations"],
    labels: { en: "Illustration", zhCN: "插画", zhTW: "插畫" },
  },
  {
    aliases: ["UI设计", "UI設計", "ui design", "ui"],
    labels: { en: "UI Design", zhCN: "UI设计", zhTW: "UI設計" },
  },
  {
    aliases: ["角色设计", "角色設計", "character design", "characters"],
    labels: { en: "Character Design", zhCN: "角色设计", zhTW: "角色設計" },
  },
  {
    aliases: ["影片与分镜", "影片與分鏡", "video & storyboarding", "video and storyboarding", "storyboard", "storyboarding"],
    labels: { en: "Video & Storyboarding", zhCN: "影片与分镜", zhTW: "影片與分鏡" },
  },
  {
    aliases: ["产品设计", "產品設計", "product design", "product"],
    labels: { en: "Product Design", zhCN: "产品设计", zhTW: "產品設計" },
  },
  {
    aliases: ["建筑设计", "建築設計", "architecture design", "architecture", "architectural design"],
    labels: { en: "Architecture Design", zhCN: "建筑设计", zhTW: "建築設計" },
  },
  {
    aliases: ["园艺设计", "園藝設計", "garden design", "landscape design", "gardening"],
    labels: { en: "Garden Design", zhCN: "园艺设计", zhTW: "園藝設計" },
  },
  {
    aliases: ["3D设计", "3D設計", "3d design", "3d"],
    labels: { en: "3D Design", zhCN: "3D设计", zhTW: "3D設計" },
  },
  {
    aliases: ["活动视觉", "活動視覺", "campaign", "campaign visuals", "marketing campaign"],
    labels: { en: "Campaign Visuals", zhCN: "活动视觉", zhTW: "活動視覺" },
  },
  {
    aliases: ["摄影", "攝影", "photography", "photo"],
    labels: { en: "Photography", zhCN: "摄影", zhTW: "攝影" },
  },
  {
    aliases: ["人像", "portrait", "portraits"],
    labels: { en: "Portrait", zhCN: "人像", zhTW: "人像" },
  },
  {
    aliases: ["时尚", "時尚", "fashion"],
    labels: { en: "Fashion", zhCN: "时尚", zhTW: "時尚" },
  },
  {
    aliases: ["室内设计", "室內設計", "interior design", "interior"],
    labels: { en: "Interior Design", zhCN: "室内设计", zhTW: "室內設計" },
  },
];

const templateCategoryLabelMap = new Map<string, TemplateCategoryLabels>();

for (const item of templateCategoryAliases) {
  for (const alias of item.aliases) {
    templateCategoryLabelMap.set(normalizeTemplateCategoryName(alias), item.labels);
  }
}

function normalizeTemplateCategoryName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function templateCategoryLabel(category: string | null | undefined, locale: AppLocale) {
  const raw = category?.trim();
  if (!raw) return "";
  const labels = templateCategoryLabelMap.get(normalizeTemplateCategoryName(raw));
  if (!labels) return raw;
  if (locale === "zh-CN") return labels.zhCN;
  if (locale === "zh-TW") return labels.zhTW;
  return labels.en;
}
