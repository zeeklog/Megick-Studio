import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ImageIcon, VideoIcon } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import type { ShowcaseItemPublic } from "@megick/api-types";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useLoginDialog } from "@/components/auth/LoginDialogContext";

interface Props {
  items?: ShowcaseItemPublic[];
  type: "TEXT2IMAGE" | "IMAGE2VIDEO";
}

type ShowcaseStudioSearch = {
  newSession: true;
  prompt: string;
  templateId?: string;
  sourceImage?: string;
  sourceImageName?: string;
};

function showcaseStudioPath(item: ShowcaseItemPublic) {
  return item.type === "IMAGE2VIDEO" ? "/dashboard/studio/video" : "/dashboard/studio/image";
}

function showcaseStudioSearch(item: ShowcaseItemPublic): ShowcaseStudioSearch {
  const sourceImage = item.beforeUrl?.trim() || undefined;
  return {
    newSession: true,
    prompt: item.prompt,
    templateId: item.templateId ?? undefined,
    sourceImage,
    sourceImageName: sourceImage ? item.title : undefined,
  };
}

function showcaseStudioUrl(item: ShowcaseItemPublic) {
  const params = new URLSearchParams();
  const search = showcaseStudioSearch(item);
  params.set("newSession", "true");
  params.set("prompt", search.prompt);
  if (search.templateId) params.set("templateId", search.templateId);
  if (search.sourceImage) params.set("sourceImage", search.sourceImage);
  if (search.sourceImageName) params.set("sourceImageName", search.sourceImageName);
  return `${showcaseStudioPath(item)}?${params.toString()}`;
}

export function ShowcaseGallery({ items = [], type }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, loading, refetch } = useAuth();
  const { openLogin } = useLoginDialog();
  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["showcase", type],
    queryFn: () => apiGet<ShowcaseItemPublic[]>("/api/showcase", { query: { type } }),
    initialData: items.length > 0 ? items : undefined,
    staleTime: 5 * 60 * 1000,
  });
  const resolvedItems = data ?? items;

  const handleUseShowcase = async (item: ShowcaseItemPublic) => {
    const openStudio = () =>
      navigate({
        to: showcaseStudioPath(item),
        search: showcaseStudioSearch(item),
      });

    if (user) {
      await openStudio();
      return;
    }

    if (loading) {
      const latest = await refetch();
      if (latest.data?.user) {
        await openStudio();
        return;
      }
    }

    openLogin({ mode: "signin", redirectTo: showcaseStudioUrl(item) });
  };

  if (resolvedItems.length === 0 && (isLoading || isFetching)) {
    return (
      <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse rounded-2xl border border-border bg-secondary/40"
          />
        ))}
      </div>
    );
  }

  if (resolvedItems.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-border bg-background/40 p-12 text-center text-sm text-muted-foreground">
        {t("showcase.empty", {
          type: t(type === "TEXT2IMAGE" ? "showcase.type.image" : "showcase.type.video"),
        })}{" "}
        <code>/admin/showcase</code>.
      </div>
    );
  }

  return (
    <div className="mt-10 grid auto-rows-[240px] grid-cols-1 gap-3 min-[520px]:auto-rows-[190px] min-[520px]:grid-cols-2 sm:auto-rows-[220px] md:auto-rows-[260px] md:grid-cols-3 md:gap-4">
      {resolvedItems.map((item, idx) => (
        <ShowcaseCard
          key={item.id}
          item={item}
          feature={idx === 0 || idx === 4}
          onUse={() => handleUseShowcase(item)}
        />
      ))}
    </div>
  );
}

function ShowcaseCard({
  item,
  feature,
  onUse,
}: {
  item: ShowcaseItemPublic;
  feature?: boolean;
  onUse: () => Promise<void>;
}) {
  const isVideo =
    item.type === "IMAGE2VIDEO" ||
    (!!item.durationMs && item.durationMs > 0) ||
    /\.(mp4|mov|webm)(?:[?#].*)?$/i.test(item.afterUrl);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => void onUse()}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        void onUse();
      }}
      className={`group relative h-full min-h-0 cursor-pointer overflow-hidden rounded-2xl border border-border bg-secondary/30 outline-none transition hover:border-primary/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50 ${feature ? "md:row-span-2" : ""}`}
    >
      {isVideo ? (
        <video
          src={item.afterUrl}
          poster={item.beforeUrl ?? undefined}
          muted
          autoPlay
          loop
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <img
          src={item.afterUrl}
          alt={item.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/15 to-transparent opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="flex items-center gap-1.5 text-xs">
            {isVideo ? (
              <VideoIcon className="h-3 w-3 text-[var(--neon-cyan)]" />
            ) : (
              <ImageIcon className="h-3 w-3 text-[var(--neon-pink)]" />
            )}
            <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-foreground">
              {item.title}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{item.prompt}</p>
        </div>
      </div>
    </div>
  );
}
