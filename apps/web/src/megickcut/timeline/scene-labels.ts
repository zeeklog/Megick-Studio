import type { TScene } from "@/megickcut/timeline";
import type { TranslationKey } from "@/lib/i18n";

export const DEFAULT_MAIN_SCENE_NAME = "Main scene";

export function getSceneDisplayName({
	scene,
	t,
}: {
	scene: Pick<TScene, "isMain" | "name"> | null | undefined;
	t: (key: TranslationKey) => string;
}) {
	if (!scene) return t("editor.scenes.none");
	if (scene.isMain && scene.name === DEFAULT_MAIN_SCENE_NAME) {
		return t("editor.scenes.main");
	}
	return scene.name;
}
