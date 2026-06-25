"use client";

import { Button } from "@/megickcut/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/megickcut/components/ui/dialog";
import { useStoragePersistence } from "@/megickcut/services/storage/use-storage-persistence";
import { useI18n } from "@/lib/i18n";

export function StoragePersistenceDialog() {
	const { t } = useI18n();
	const { showDialog, onConfirm, onDismiss } = useStoragePersistence();

	return (
		<Dialog open={showDialog} onOpenChange={(open) => !open && onDismiss()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("editor.storage.title")}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<p className="text-base text-muted-foreground">
						{t("editor.storage.description1")}
					</p>
					<p className="text-base text-muted-foreground">
						{t("editor.storage.description2")}
					</p>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={onDismiss}>
						{t("editor.storage.notNow")}
					</Button>
					<Button onClick={onConfirm}>{t("editor.storage.allow")}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
