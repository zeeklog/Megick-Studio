"use client";

import {
	useCallback,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import { CommandIcon, Logout05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/megickcut/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/megickcut/components/ui/dropdown-menu";
import { ShortcutsDialog } from "@/megickcut/actions/components/shortcuts-dialog";
import { ExportButton } from "@/megickcut/components/editor/export-button";
import { useEditor } from "@/megickcut/editor/use-editor";
import { useMegickEditorContext } from "@/megickcut/integration/editor-context";
import { cn } from "@/megickcut/utils/ui";
import { useI18n } from "@/lib/i18n";

export function EditorHeader() {
	const exitControls = useExitToStudio();

	return (
		<header className="bg-background flex h-[3.4rem] items-center justify-between px-3 pt-0.5">
			<div className="flex min-w-0 items-center gap-2">
				{exitControls.hasReturnToSession ? (<ReturnToSessionButton {...exitControls} />) : null}
				<ProjectDropdown {...exitControls} />
				<EditableProjectName />
			</div>
			<nav className="flex items-center gap-2">
				<ExportButton />
			</nav>
		</header>
	);
}

function useExitToStudio() {
	const [isExiting, setIsExiting] = useState(false);
	const editor = useEditor();
	const { returnToStudio } = useMegickEditorContext();

	const exitToStudio = useCallback(async () => {
		if (isExiting) return;
		setIsExiting(true);

		try {
			await editor.project.prepareExit();
		} catch (error) {
			console.error("Failed to prepare project exit:", error);
		} finally {
			editor.project.closeProject();
			returnToStudio?.();
		}
	}, [editor, isExiting, returnToStudio]);

	return { exitToStudio, isExiting, hasReturnToSession: !!returnToStudio };
}

function ReturnToSessionButton({
	exitToStudio,
	isExiting,
}: ReturnType<typeof useExitToStudio>) {
	const { t } = useI18n();
	const label = t("editor.action.backToSession");

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={() => void exitToStudio()}
			disabled={isExiting}
			className="h-8 shrink-0 items-center justify-center gap-1.5 rounded-sm px-2.5"
			title={label}
			aria-label={label}
		>
			<ArrowLeft className="size-3.5" />
			<span className="text-xs font-medium">{label}</span>
		</Button>
	);
}

function ProjectDropdown({
	exitToStudio,
	isExiting,
}: ReturnType<typeof useExitToStudio>) {
	const { t } = useI18n();
	const [openDialog, setOpenDialog] = useState<"shortcuts" | null>(null);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-auto rounded-sm px-2 py-1 text-[10px] font-black tracking-tight"
						aria-label="Megick"
					>
						<span aria-hidden="true">Megick</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="z-100 w-44">
					<DropdownMenuItem
						onClick={() => void exitToStudio()}
						disabled={isExiting}
						icon={<HugeiconsIcon icon={Logout05Icon} />}
					>
						{t("editor.action.backToSession")}
					</DropdownMenuItem>

					<DropdownMenuItem
						onClick={() => setOpenDialog("shortcuts")}
						icon={<HugeiconsIcon icon={CommandIcon} />}
					>
						{t("editor.action.shortcuts")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ShortcutsDialog
				isOpen={openDialog === "shortcuts"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "shortcuts" : null)}
			/>
		</>
	);
}

function EditableProjectName() {
	const editor = useEditor();
	const { t } = useI18n();
	const activeProject = useEditor((e) => e.project.getActive());
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const originalNameRef = useRef("");

	const projectName =
		activeProject?.metadata.name || t("editor.project.defaultName");

	const startEditing = () => {
		if (isEditing) return;
		originalNameRef.current = projectName;
		setIsEditing(true);

		requestAnimationFrame(() => {
			inputRef.current?.select();
		});
	};

	const saveEdit = async () => {
		if (!inputRef.current || !activeProject) return;
		const newName = inputRef.current.value.trim();
		setIsEditing(false);

		if (!newName) {
			inputRef.current.value = originalNameRef.current;
			return;
		}

		if (newName !== originalNameRef.current) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName,
				});
			} catch (error) {
				toast.error(t("editor.header.renameFailed"), {
					description:
						error instanceof Error
							? error.message
							: t("editor.header.renameRetry"),
				});
			}
		}
	};

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			inputRef.current?.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			if (inputRef.current) {
				inputRef.current.value = originalNameRef.current;
				inputRef.current.setSelectionRange(0, 0);
			}
			setIsEditing(false);
			inputRef.current?.blur();
		}
	};

	return (
		<input
			ref={inputRef}
			type="text"
			defaultValue={projectName}
			readOnly={!isEditing}
			onClick={startEditing}
			onBlur={saveEdit}
			onKeyDown={handleKeyDown}
			style={{ fieldSizing: "content" } as CSSProperties}
			className={cn(
				"h-8 max-w-[52vw] cursor-pointer rounded-sm bg-transparent px-2 py-1 text-[0.9rem] outline-none hover:bg-accent hover:text-accent-foreground",
				isEditing && "cursor-text ring-1 ring-ring hover:bg-transparent",
			)}
		/>
	);
}
