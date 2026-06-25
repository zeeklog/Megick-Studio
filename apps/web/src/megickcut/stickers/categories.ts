import { translate, getInitialLocale } from "@/lib/i18n";

export const STICKER_CATEGORIES = {
	all: translate(getInitialLocale(), "editor.stickers.category.all"),
	// v0.4.0
	// logos: "Logos",
	flags: translate(getInitialLocale(), "editor.stickers.category.flags"),
	shapes: translate(getInitialLocale(), "editor.stickers.category.shapes"),
};
