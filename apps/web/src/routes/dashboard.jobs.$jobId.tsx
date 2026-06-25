import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { SiteLayout } from "@/components/SiteLayout";
import { getInitialLocale, translate } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard/jobs/$jobId")({
  head: () => ({ meta: [{ title: translate(getInitialLocale(), "job.meta.title") }] }),
  component: JobDetailRedirect,
});

function JobDetailRedirect() {
  const { jobId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    navigate({
      to: "/dashboard/history",
      search: { jobId },
      replace: true,
    });
  }, [jobId, navigate]);

  return (
    <SiteLayout>
      <div className="flex min-h-[60vh] items-center justify-center">
        <Sparkles className="h-6 w-6 animate-pulse text-primary" />
      </div>
    </SiteLayout>
  );
}
