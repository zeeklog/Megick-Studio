import { Edit3 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StudioCanvas } from "@/components/studio/StudioCanvas";
import type { StudioEditTarget } from "./types";

export function StudioEditorDialog({
  open,
  onOpenChange,
  title,
  target,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  target: StudioEditTarget | null;
  saving: boolean;
  onSave: (blob: Blob) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!h-[92vh] !max-w-[96vw] overflow-hidden p-4">
        <DialogTitle className="flex items-center gap-2 text-base">
          <Edit3 className="h-4 w-4 text-[var(--neon-cyan)]" />
          {title}
        </DialogTitle>
        {target ? (
          <div className="h-[calc(92vh-3.5rem)]">
            <StudioCanvas
              key={target.result.id}
              src={target.result.src}
              fallbackSrc={target.result.fallbackSrc}
              onSave={onSave}
              onClose={() => onOpenChange(false)}
              saving={saving}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
