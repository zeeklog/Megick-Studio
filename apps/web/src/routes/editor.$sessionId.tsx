import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useAuthGate } from "@/hooks/useAuthGate";
import { Button } from "@/megickcut/components/ui/button";
import { displayChatTitle } from "@/lib/chat-title";
import { getInitialLocale, translate, useI18n, type TranslationKey } from "@/lib/i18n";
import { asSearchRecord, optionalString } from "@/lib/search-params";
import { noIndexHead } from "@/lib/seo";
import { getStudioSession } from "@/megickcut/integration/session-media";
import { MegickCutEditorShell, EditorLoading } from "@/megickcut/integration/editor-shell";

function editorSearchSchema(input: unknown): {
	sourceMessageId?: string;
	sourceResultId?: string;
} {
	const search = asSearchRecord(input);
	return {
		sourceMessageId: optionalString(search.sourceMessageId),
		sourceResultId: optionalString(search.sourceResultId),
	};
}

export const Route = createFileRoute("/editor/$sessionId")({
	head: () =>
		noIndexHead({
			title: translate(getInitialLocale(), "editor.meta.title"),
			description: translate(getInitialLocale(), "studio.meta.description"),
		}),
	validateSearch: editorSearchSchema,
	component: EditorRoute,
});

function EditorRoute() {
	const { sessionId } = Route.useParams();
	const { sourceMessageId, sourceResultId } = Route.useSearch();
	const navigate = useNavigate();
	const auth = useAuthGate();
	const { t } = useI18n();

	useEffect(() => {
		if (!auth.loading && !auth.user) {
			auth.requireAuth();
		}
	}, [auth.loading, auth.requireAuth, auth.user]);

	const sessionQuery = useQuery({
		queryKey: ["editor-session", sessionId],
		queryFn: () => getStudioSession({ sessionId }),
		enabled: Boolean(auth.user),
		retry: false,
	});

	if (auth.loading || (!auth.user && !sessionQuery.error)) {
		return <EditorLoading labelKey="editor.loading.auth" />;
	}

	if (!auth.user) {
		return <EditorLoading labelKey="editor.loading.signIn" />;
	}

	if (sessionQuery.isLoading) {
		return <EditorLoading labelKey="editor.loading.session" />;
	}

	if (sessionQuery.isError || !sessionQuery.data) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background px-4">
				<div className="max-w-md text-center">
					<p className="text-sm text-destructive">
						<EditorSessionErrorMessage />
					</p>
					<Button
						className="mt-4"
						onClick={() =>
							navigate({
								to: "/dashboard/studio/video",
								search: { sessionId },
							})
						}
					>
						<EditorBackToStudioLabel />
					</Button>
				</div>
			</div>
		);
	}

	return (
		<MegickCutEditorShell
			sessionId={sessionId}
			sessionTitle={displayChatTitle(sessionQuery.data.title, t)}
			sourceMessageId={sourceMessageId}
			sourceResultId={sourceResultId}
			returnTo={() => {
				void navigate({
					to: "/dashboard/studio/video",
					search: { sessionId },
				});
			}}
		/>
	);
}

function EditorSessionErrorMessage() {
	const { t } = useI18n();
	return <>{t("editor.error.openSession")}</>;
}

function EditorBackToStudioLabel() {
	const { t } = useI18n();
	return <>{t("editor.action.backToStudio")}</>;
}
