"use client";

import {
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/megickcut/components/ui/context-menu";
import { usePreviewViewport } from "@/megickcut/preview/components/preview-viewport";
import { useEditor } from "@/megickcut/editor/use-editor";
import type { PreviewOverlayControl } from "@/megickcut/preview/overlays";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export function PreviewContextMenu({
	onToggleFullscreen,
	container,
	overlayControls,
	onOverlayVisibilityChange,
}: {
	onToggleFullscreen: () => void;
	container: HTMLElement | null;
	overlayControls: PreviewOverlayControl[];
	onOverlayVisibilityChange: (params: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
}) {
	const { t } = useI18n();
	const editor = useEditor();
	const viewport = usePreviewViewport();

	const handleCopySnapshot = async () => {
		const result = await editor.renderer.copySnapshot();

		if (!result.success) {
			toast.error(t("editor.snapshot.copyFailed"), {
				description: result.error ?? t("editor.project.tryAgain"),
			});
			return;
		}
	};

	const handleSaveSnapshot = async () => {
		const result = await editor.renderer.saveSnapshot();

		if (!result.success) {
			toast.error(t("editor.snapshot.saveFailed"), {
				description: result.error ?? t("editor.project.tryAgain"),
			});
			return;
		}
	};

	return (
		<ContextMenuContent className="w-56" container={container}>
			<ContextMenuItem onClick={viewport.fitToScreen} inset>
				{t("editor.snapshot.fitToScreen")}
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={onToggleFullscreen} inset>
				{t("editor.snapshot.fullScreen")}
			</ContextMenuItem>
			<ContextMenuItem onClick={handleSaveSnapshot} inset>
				{t("editor.snapshot.save")}
			</ContextMenuItem>
			<ContextMenuItem onClick={handleCopySnapshot} inset>
				{t("editor.snapshot.copy")}
			</ContextMenuItem>
			{overlayControls.length > 0 ? <ContextMenuSeparator /> : null}
			{overlayControls.map((overlayControl) => (
				<ContextMenuCheckboxItem
					key={overlayControl.id}
					checked={overlayControl.isVisible}
					onCheckedChange={(checked) =>
						onOverlayVisibilityChange({
							overlayId: overlayControl.id,
							isVisible: !!checked,
						})
					}
				>
					{overlayControl.label}
				</ContextMenuCheckboxItem>
			))}
		</ContextMenuContent>
	);
}
