"use client";

import { Separator } from "@/megickcut/components/ui/separator";
import { type Tab, useAssetsPanelStore } from "@/megickcut/components/editor/panels/assets/assets-panel-store";
import { TabBar } from "./tabbar";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { StickersView } from "@/megickcut/stickers/components/assets-view";
import { TextView } from "@/megickcut/text/components/assets-view";
import { EffectsView } from "@/megickcut/effects/components/assets-view";

export function AssetsPanel({
	onImportFromSession,
	onOpenAiStudio,
}: {
	onImportFromSession: () => void;
	onOpenAiStudio: () => void;
}) {
	const { activeTab } = useAssetsPanelStore();

	const viewMap: Record<Tab, React.ReactNode> = {
		media: (
			<MediaView
				onImportFromSession={onImportFromSession}
				onOpenAiStudio={onOpenAiStudio}
			/>
		),
		text: <TextView />,
		stickers: <StickersView />,
		effects: <EffectsView />,
		settings: <SettingsView />,
	};

	return (
		<div className="panel bg-background flex h-full rounded-sm border overflow-hidden">
			<TabBar />
			<Separator orientation="vertical" />
			<div className="flex-1 overflow-hidden">{viewMap[activeTab]}</div>
		</div>
	);
}
