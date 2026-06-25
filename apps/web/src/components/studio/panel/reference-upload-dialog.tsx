import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StudioMediaReference } from "./types";
import { mediaKindFromUrl } from "./utils";

export function ReferenceUploadDialog({
  open,
  onOpenChange,
  title,
  refs,
  referenceFileInputRef,
  referenceUploading,
  referenceUrlInput,
  setReferenceUrlInput,
  addReferenceFiles,
  addReferenceUrl,
  removeReference,
  referenceLimit,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  refs: StudioMediaReference[];
  referenceFileInputRef: { current: HTMLInputElement | null };
  referenceUploading: boolean;
  referenceUrlInput: string;
  setReferenceUrlInput: (value: string) => void;
  addReferenceFiles: (files: FileList | File[] | null | undefined) => Promise<void>;
  addReferenceUrl: (value?: string) => boolean;
  removeReference: (id: string) => void;
  referenceLimit: number;
  labels: {
    dropzone: string;
    limit: string;
    placeholder: string;
    cancel: string;
    confirm: string;
    remove: string;
  };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <div className="space-y-3">
          <input
            ref={referenceFileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void addReferenceFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            disabled={referenceUploading}
            onClick={() => referenceFileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              event.preventDefault();
              void addReferenceFiles(event.dataTransfer.files);
            }}
            className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-secondary/25 p-5 text-center text-sm text-muted-foreground transition hover:border-primary/70 hover:text-foreground disabled:cursor-wait disabled:opacity-70"
          >
            {referenceUploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <Upload className="h-6 w-6 text-primary" />
            )}
            <span className="font-medium text-foreground">{labels.dropzone}</span>
            <span className="text-xs">{labels.limit}</span>
          </button>
          <Input
            value={referenceUrlInput}
            onChange={(event) => setReferenceUrlInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addReferenceUrl();
              }
            }}
            placeholder={labels.placeholder}
            className="bg-background/60"
          />
          {refs.length ? (
            <div className="grid grid-cols-5 gap-2">
              {refs.map((ref) => (
                <div
                  key={ref.id}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border/70 bg-black"
                  title={ref.name}
                >
                  {(ref.kind ?? mediaKindFromUrl(ref.src)) === "video" ? (
                    <video
                      src={ref.src}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <img src={ref.src} alt={ref.name} className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeReference(ref.id)}
                    className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-0 backdrop-blur transition group-hover:opacity-100 hover:text-foreground"
                    aria-label={labels.remove}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <DialogFooter className="gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReferenceUrlInput("");
                onOpenChange(false);
              }}
            >
              {labels.cancel}
            </Button>
            <Button
              type="button"
              disabled={referenceUploading}
              onClick={() => {
                if (referenceUrlInput.trim()) {
                  if (!addReferenceUrl()) return;
                }
                onOpenChange(false);
              }}
            >
              {referenceUploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {labels.confirm}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
