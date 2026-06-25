import { DraggableItem } from "@/megickcut/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/megickcut/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/megickcut/editor/use-editor";
import { DEFAULTS } from "@/megickcut/timeline/defaults";
import { buildTextElement } from "@/megickcut/timeline/element-utils";
import type { MediaTime } from "@/megickcut/wasm";
import { useI18n } from "@/lib/i18n";

export function TextView() {
	const editor = useEditor();
	const { t } = useI18n();
	const defaultText = t("editor.text.default");

	const handleAddToTimeline = ({ currentTime }: { currentTime: MediaTime }) => {
		const activeScene = editor.scenes.getActiveScene();
		if (!activeScene) return;

		const element = buildTextElement({
			raw: DEFAULTS.text.element,
			startTime: currentTime,
		});

		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<PanelView title={t("editor.text.title")}>
			<DraggableItem
				name={defaultText}
				preview={
					<div className="bg-accent flex size-full items-center justify-center rounded">
						<span className="text-xs select-none">{defaultText}</span>
					</div>
				}
				dragData={{
					id: "temp-text-id",
					type: DEFAULTS.text.element.type,
					name: DEFAULTS.text.element.name,
					content: defaultText,
				}}
				aspectRatio={1}
				onAddToTimeline={handleAddToTimeline}
				shouldShowLabel={false}
			/>
		</PanelView>
	);
}
