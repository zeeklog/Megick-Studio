import type { StickerProvider } from "@/megickcut/stickers/types";
import { DefinitionRegistry } from "@/megickcut/params/registry";

export class StickersRegistry extends DefinitionRegistry<string, StickerProvider> {
	constructor() {
		super("sticker provider");
	}
}

export const stickersRegistry = new StickersRegistry();
