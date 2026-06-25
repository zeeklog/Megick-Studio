import type { StudioResult } from "@/routes/-dashboard-types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FallbackImage } from "./preview-panels";

export function ZoomPreviewDialog({
  open,
  onOpenChange,
  result,
  title,
  imageAlt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: StudioResult | null;
  title: string;
  imageAlt: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[90vw] border-none bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {result ? (
          result.kind === "video" ? (
            <video controls src={result.src} className="max-h-[88vh] w-full rounded-2xl" />
          ) : (
            <FallbackImage
              src={result.src}
              fallbackSrc={result.fallbackSrc}
              alt={imageAlt}
              className="max-h-[88vh] w-full rounded-2xl object-contain"
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
