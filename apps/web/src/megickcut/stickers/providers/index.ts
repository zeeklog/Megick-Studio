import { stickersRegistry } from "../registry";
import type { StickerProvider } from "@/megickcut/stickers/types";
import { flagsProvider } from "./flags";
import { shapesProvider } from "./shapes";

const defaultProviders: StickerProvider[] = [
	flagsProvider,
	shapesProvider,
];

export function registerDefaultStickerProviders({
	providersToRegister = defaultProviders,
}: {
	providersToRegister?: StickerProvider[];
} = {}): void {
	for (const provider of providersToRegister) {
		if (stickersRegistry.has(provider.id)) {
			continue;
		}
		stickersRegistry.register({ key: provider.id, definition: provider });
	}
}
