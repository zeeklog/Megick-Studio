import { toast } from "sonner";
import { getInitialLocale, translate } from "@/lib/i18n";

export interface MediaUploadToastResult {
	uploadedCount: number;
	assetNames?: string[];
}

function getAssetLabel({ count }: { count: number }): string {
	const locale = getInitialLocale();
	return count === 1
		? translate(locale, "editor.assets.uploadLabel.one")
		: translate(locale, "editor.assets.uploadLabel.many");
}

function waitForNextPaint(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve());
		});
	});
}

export async function showMediaUploadToast<T extends MediaUploadToastResult>({
	filesCount,
	promise,
}: {
	filesCount: number;
	promise: Promise<T> | (() => Promise<T>);
}) {
	const run = typeof promise === "function" ? promise : () => promise;
	const locale = getInitialLocale();
	const label = getAssetLabel({ count: filesCount });
	const toastPromise = toast.promise(async () => {
		await waitForNextPaint();
		return run();
	}, {
		loading: translate(locale, "editor.assets.uploading", { label }),
		success: ({ uploadedCount, assetNames }) => {
			if (uploadedCount === 1) {
				const assetName = assetNames?.[0];
				return assetName
					? translate(locale, "editor.assets.uploadedOne", {
							name: assetName,
						})
					: translate(locale, "editor.assets.uploadedOneFallback");
			}

			if (uploadedCount > 1) {
				return translate(locale, "editor.assets.uploadedMany", {
					count: uploadedCount,
				});
			}

			return translate(locale, "editor.assets.uploadedNone");
		},
		error: translate(locale, "editor.assets.uploadFailed", { label }),
	});

	return toastPromise.unwrap();
}
