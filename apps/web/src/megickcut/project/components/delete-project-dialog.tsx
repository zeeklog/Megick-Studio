import { Button } from "@/megickcut/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/megickcut/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/megickcut/components/ui/alert";
import { Label } from "@/megickcut/components/ui/label";
import { Input } from "@/megickcut/components/ui/input";
import { useI18n } from "@/lib/i18n";

export function DeleteProjectDialog({
	isOpen,
	onOpenChange,
	onConfirm,
	projectNames,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	projectNames: string[];
}) {
	const { t } = useI18n();
	const count = projectNames.length;
	const isSingle = count === 1;
	const singleName = isSingle ? projectNames[0] : null;
	const deleteTarget = singleName
		? t("editor.project.deleteSingleTarget", { name: singleName })
		: t("editor.project.deleteManyTarget", { count });

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						{singleName
							? t("editor.project.deleteTitle", { name: singleName })
							: t("editor.project.deleteManyTitle", { count })}
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Alert variant="destructive">
						<AlertTitle>{t("editor.project.warning")}</AlertTitle>
						<AlertDescription>
							{t("editor.project.deleteDescription", { target: deleteTarget })}
						</AlertDescription>
					</Alert>
					<div className="flex flex-col gap-3">
						<Label className="text-xs font-semibold text-slate-500">
							{t("editor.project.typeDelete")}
						</Label>
						<Input
							type="text"
							placeholder="DELETE"
							size="lg"
							variant="destructive"
						/>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{t("common.cancel")}
					</Button>
					<Button variant="destructive" onClick={onConfirm}>
						{t("editor.project.deleteProject")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
