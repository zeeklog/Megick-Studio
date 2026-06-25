import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getInitialLocale, translate } from "@/lib/i18n";
import { imageStudioSearchSchema } from "./-studio-search";

const StudioPage = lazy(async () => {
  const mod = await import("./-studio-panel");
  return { default: mod.StudioPage };
});

export const Route = createFileRoute("/dashboard/studio/image")({
  head: () => ({
    meta: [
      { title: translate(getInitialLocale(), "studio.meta.title") },
      { name: "description", content: translate(getInitialLocale(), "studio.meta.description") },
    ],
  }),
  validateSearch: imageStudioSearchSchema,
  component: ImageStudioRoute,
});

function ImageStudioRoute() {
  return (
    <Suspense fallback={null}>
      <StudioPage mode="image" search={Route.useSearch()} />
    </Suspense>
  );
}
