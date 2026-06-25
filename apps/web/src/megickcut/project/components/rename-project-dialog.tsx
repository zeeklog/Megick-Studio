import { Button } from "@/megickcut/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/megickcut/components/ui/dialog";
import { Input } from "@/megickcut/components/ui/input";
import { useState } from "react";
import { Label } from "@/megickcut/components/ui/label";
import { useI18n } from "@/lib/i18n";

export function RenameProjectDialog({
	isOpen,
	onOpenChange,
	onConfirm,
	projectName,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (newName: string) => void;
	projectName: string;
}) {
	const { t } = useI18n();
	const [name, setName] = useState(projectName);

	const handleOpenChange = (open: boolean) => {
		if (open) {
			setName(projectName);
		}
		onOpenChange(open);
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("editor.project.renameTitle")}</DialogTitle>
				</DialogHeader>

				<DialogBody className="gap-3">
					<Label>{t("editor.project.newName")}</Label>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								onConfirm(name);
							}
						}}
						placeholder={t("editor.project.newNamePlaceholder")}
					/>
				</DialogBody>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onOpenChange(false);
						}}
					>
						{t("common.cancel")}
					</Button>
					<Button onClick={() => onConfirm(name)}>{t("editor.project.rename")}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
