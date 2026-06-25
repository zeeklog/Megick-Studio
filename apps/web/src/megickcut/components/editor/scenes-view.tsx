"use client";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/megickcut/components/ui/sheet";
import { Button } from "@/megickcut/components/ui/button";
import { Check, ListCheck, Trash2 } from "lucide-react";
import { cn } from "@/megickcut/utils/ui";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogTrigger,
} from "@/megickcut/components/ui/dialog";
import { canDeleteScene, getMainScene } from "@/megickcut/timeline/scenes";
import { toast } from "sonner";
import { useEditor } from "@/megickcut/editor/use-editor";
import { useI18n } from "@/lib/i18n";
import { getSceneDisplayName } from "@/megickcut/timeline/scene-labels";

export function ScenesView({ children }: { children: React.ReactNode }) {
	const editor = useEditor();
	const { t } = useI18n();
	const scenes = editor.scenes.getScenes();
	const currentScene = editor.scenes.getActiveScene();
	const [isSelectMode, setIsSelectMode] = useState(false);
	const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());

	const handleSceneSwitch = async (sceneId: string) => {
		if (isSelectMode) {
			toggleSceneSelection({ sceneId });
			return;
		}

		try {
			await editor.scenes.switchToScene({ sceneId });
		} catch (error) {
			console.error("Failed to switch scene:", error);
		}
	};

	const toggleSceneSelection = ({ sceneId }: { sceneId: string }) => {
		setSelectedScenes((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(sceneId)) {
				newSet.delete(sceneId);
			} else {
				newSet.add(sceneId);
			}
			return newSet;
		});
	};

	const handleSelectMode = () => {
		setIsSelectMode(!isSelectMode);
		setSelectedScenes(new Set());
	};

	const handleDeleteSelected = async () => {
		for (const sceneId of selectedScenes) {
			const scene = scenes.find((scene) => scene.id === sceneId);
			if (!scene) {
				continue;
			}

			const { canDelete, reason } = canDeleteScene({ scene });
			if (!canDelete) {
				toast.error(
					reason === "Cannot delete main scene"
						? t("editor.scenes.cannotDeleteMain")
						: t("editor.scenes.deleteFailed"),
				);
				continue;
			}

			try {
				await editor.scenes.deleteScene({ sceneId });
			} catch (error) {
				console.error("Failed to delete scene:", error);
			}
		}
		setSelectedScenes(new Set());
		setIsSelectMode(false);
	};

	const isMainSceneSelected = (() => {
		const mainScene = getMainScene({ scenes });
		return Boolean(mainScene?.id && selectedScenes.has(mainScene.id));
	})();

	return (
		<Sheet>
			<SheetTrigger asChild>{children}</SheetTrigger>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>
						{isSelectMode
							? t("editor.scenes.selectTitle", { count: selectedScenes.size })
							: t("editor.scenes.title")}
					</SheetTitle>
					<SheetDescription>
						{isSelectMode
							? t("editor.scenes.selectDescription")
							: t("editor.scenes.description")}
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-4 py-4">
					<div className="flex items-center gap-2">
						<Button
							className="rounded-md"
							variant={isSelectMode ? "default" : "outline"}
							size="sm"
							onClick={handleSelectMode}
						>
							<ListCheck />
							{isSelectMode
								? t("editor.scenes.cancel")
								: t("editor.scenes.select")}
						</Button>
						{isSelectMode && (
							<DeleteDialog
								count={selectedScenes.size}
								onDelete={handleDeleteSelected}
								disabled={isMainSceneSelected}
								trigger={
									<Button
										className="rounded-md"
										variant="destructive"
										disabled={isMainSceneSelected}
										size="sm"
									>
										<Trash2 />
										{t("editor.scenes.deleteWithCount", {
											count: selectedScenes.size,
										})}
									</Button>
								}
							/>
						)}
					</div>
					{scenes.length === 0 ? (
						<div className="text-muted-foreground text-sm">
							{t("editor.scenes.empty")}
						</div>
					) : (
						<div className="space-y-2">
							{scenes.map((scene) => (
								<Button
									key={scene.id}
									variant="outline"
									className={cn(
										"w-full justify-between font-normal",
										currentScene?.id === scene.id &&
											!isSelectMode &&
											"border-primary !text-primary",
										isSelectMode &&
											selectedScenes.has(scene.id) &&
											"bg-accent border-foreground/30",
									)}
									onClick={() => handleSceneSwitch(scene.id)}
								>
									<span>{getSceneDisplayName({ scene, t })}</span>
									<div className="flex items-center gap-2">
										{((isSelectMode && selectedScenes.has(scene.id)) ||
											(!isSelectMode && currentScene?.id === scene.id)) && (
											<Check className="size-4" />
										)}
									</div>
								</Button>
							))}
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function DeleteDialog({
	count,
	onDelete,
	disabled,
	trigger,
}: {
	count: number;
	onDelete: () => void;
	disabled?: boolean;
	trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const { t } = useI18n();

	const handleDelete = () => {
		onDelete();
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("editor.scenes.deleteDialog.title")}</DialogTitle>
					<DialogDescription>
						{t("editor.scenes.deleteDialog.description", { count })}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)}>
						{t("editor.scenes.cancel")}
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						disabled={disabled}
					>
						{t("editor.scenes.delete")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
