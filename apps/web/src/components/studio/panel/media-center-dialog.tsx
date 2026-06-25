import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { StudioResult } from "@/routes/-dashboard-types";
import { SessionVideoMediaCenter, exportMergedVideo } from "./video-media-center";

export function MediaCenterDialog({
  open,
  onOpenChange,
  title,
  description,
  videos,
  fetchMediaBlob,
  objectUrlFromBlob,
  appendMergedVideoToSession,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  videos: StudioResult[];
  fetchMediaBlob: (item: StudioResult) => Promise<Blob>;
  objectUrlFromBlob: (blob: Blob) => string;
  appendMergedVideoToSession: (blob: Blob, videos: StudioResult[]) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-5xl overflow-y-auto">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <SessionVideoMediaCenter
          videos={videos}
          onClose={() => onOpenChange(false)}
          onMerge={async (selectedVideos) => {
            const blob = await exportMergedVideo(selectedVideos, fetchMediaBlob, objectUrlFromBlob);
            await appendMergedVideoToSession(blob, selectedVideos);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
