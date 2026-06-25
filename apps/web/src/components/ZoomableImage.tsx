import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function ZoomableImage({
  src,
  alt,
  className,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [open, setOpen] = useState(false);
  if (!src) return null;

  return (
    <>
      <button
        type="button"
        className="block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
        onClick={() => setOpen(true)}
        aria-label={alt ? `Zoom ${alt}` : "Zoom image"}
      >
        <img src={src} alt={alt} className={className} {...props} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(96vw,1200px)] border-0 bg-transparent p-2 shadow-none">
          <img
            src={src}
            alt={alt}
            className="max-h-[85vh] w-full rounded-xl object-contain"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
