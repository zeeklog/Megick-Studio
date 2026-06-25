import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getInitialLocale, translate } from "@/lib/i18n";
import { videoStudioSearchSchema } from "./-studio-search";

const StudioPage = lazy(async () => {
  const mod = await import("./-studio-panel");
  return { default: mod.StudioPage };
});

export const Route = createFileRoute("/dashboard/studio/video")({
  head: () => ({
    meta: [
      { title: translate(getInitialLocale(), "studio.meta.title") },
      { name: "description", content: translate(getInitialLocale(), "studio.meta.description") },
    ],
  }),
  validateSearch: videoStudioSearchSchema,
  component: VideoStudioRoute,
});

function VideoStudioRoute() {
  return (
    <Suspense fallback={null}>
      <StudioPage mode="video" search={Route.useSearch()} />
    </Suspense>
  );
}
