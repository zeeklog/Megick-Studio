"use client";

import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { useLocalStorage } from "@/megickcut/services/storage/use-local-storage";
import { Button } from "@/megickcut/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "@/megickcut/components/ui/dialog";
import { useI18n } from "@/lib/i18n";

export function Onboarding() {
	const { t } = useI18n();
	const [step, setStep] = useState(0);
	const [hasSeenOnboarding, setHasSeenOnboarding] = useLocalStorage({
		key: "megick-editor-has-seen-onboarding",
		defaultValue: false,
	});

	if (hasSeenOnboarding) return null;

	const close = () => setHasSeenOnboarding({ value: true });

	return (
		<Dialog open={!hasSeenOnboarding} onOpenChange={close}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogTitle>
					<span className="sr-only">{t("editor.onboarding.srTitle")}</span>
				</DialogTitle>
				<DialogBody>
					{step === 0 ? (
						<div className="space-y-5">
							<div className="space-y-3">
								<h2 className="text-lg font-bold md:text-xl">
									{t("editor.onboarding.welcomeTitle")}
								</h2>
								<p className="text-muted-foreground">
									{t("editor.onboarding.welcomeDescription")}
								</p>
							</div>
							<Button onClick={() => setStep(1)} className="w-full">
								{t("common.next")}
								<ArrowRightIcon className="size-4" />
							</Button>
						</div>
					) : (
						<div className="space-y-5">
							<div className="space-y-3">
								<h2 className="text-lg font-bold md:text-xl">
									{t("editor.onboarding.betaTitle")}
								</h2>
								<p className="text-muted-foreground">
									{t("editor.onboarding.betaDescription")}
								</p>
							</div>
							<Button onClick={close} className="w-full">
								{t("editor.onboarding.startEditing")}
							</Button>
						</div>
					)}
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
