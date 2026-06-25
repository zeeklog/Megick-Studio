import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useVideoGenerationEnabled } from "@/lib/feature-flags";
import { legacyStudioSearchSchema } from "./-studio-search";
import { studioPathForMode } from "./-dashboard-types";

export const Route = createFileRoute("/dashboard/studio")({
  validateSearch: legacyStudioSearchSchema,
  component: StudioShellRoute,
});

function StudioShellRoute() {
  const search = Route.useSearch();
  const location = useLocation();
  const navigate = useNavigate();
  const { videoGenerationEnabled, isLoading } = useVideoGenerationEnabled();

  useEffect(() => {
    if (location.pathname.replace(/\/+$/, "") !== "/dashboard/studio") return;
    if (search.mode === "video" && isLoading) return;
    const mode = search.mode === "video" && videoGenerationEnabled ? "video" : "image";
    const nextSearch =
      mode === "video"
        ? {
            prompt: search.prompt,
            style: search.style,
            ratio: search.ratio,
            templateId: search.templateId,
            handoffId: search.handoffId,
            sourceImage: search.sourceImage,
            sourceImageName: search.sourceImageName,
            sessionId: search.sessionId,
            newSession: search.newSession,
            onboardingDemo: search.onboardingDemo,
            autoSubmit: search.autoSubmit,
          }
        : {
            prompt: search.prompt,
            style: search.style,
            ratio: search.ratio,
            templateId: search.templateId,
            sourceImage: search.sourceImage,
            sourceImageName: search.sourceImageName,
            sessionId: search.sessionId,
            newSession: search.newSession,
            onboardingDemo: search.onboardingDemo,
            autoSubmit: search.autoSubmit,
          };
    navigate({
      to: studioPathForMode(mode),
      search: nextSearch,
      replace: true,
    });
  }, [isLoading, location.pathname, navigate, search, videoGenerationEnabled]);

  return <Outlet />;
}
