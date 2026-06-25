import { getGuideById, type GuideId } from "@/megickcut/guides";
import {
	EMPTY_PREVIEW_OVERLAY_SOURCE_RESULT,
	type PreviewOverlaySourceResult,
} from "@/megickcut/preview/overlays";

export function getGuidePreviewOverlaySource({
	guideId,
}: {
	guideId: GuideId | null;
}): PreviewOverlaySourceResult {
	const guide = getGuideById(guideId);
	if (!guide) {
		return EMPTY_PREVIEW_OVERLAY_SOURCE_RESULT;
	}

	return {
		definitions: [],
		instances: [
			{
				id: `guide-${guide.id}`,
				mount: { kind: "scene" },
				plane: "under-interaction",
				pointerEvents: "none",
				render: ({ sceneHeight, sceneWidth }) =>
					guide.renderOverlay({
						width: sceneWidth,
						height: sceneHeight,
					}),
			},
		],
	};
}
