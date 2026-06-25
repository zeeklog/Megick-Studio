import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { invalidateMe } from "@/hooks/useAuth";
import { useLoginDialog } from "./LoginDialogContext";
import { AuthFormContent } from "./AuthFormContent";

export function LoginDialog() {
  const { open, mode, redirectTo, closeLogin } = useLoginDialog();
  const queryClient = useQueryClient();

  const handleSuccess = useCallback(async () => {
    await invalidateMe(queryClient);
    closeLogin();
    if (redirectTo) {
      window.location.assign(redirectTo);
    }
  }, [queryClient, closeLogin, redirectTo]);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : closeLogin())}>
      <DialogContent className="max-w-[27rem] gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-2xl sm:p-0">
        <DialogTitle className="sr-only">Megick account sign in</DialogTitle>
        <DialogDescription className="sr-only">
          Sign in or create a Megick account with email or OAuth.
        </DialogDescription>
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_16%_-8%,color-mix(in_oklab,var(--neon-purple)_32%,transparent),transparent_36%),radial-gradient(circle_at_92%_110%,color-mix(in_oklab,var(--neon-pink)_26%,transparent),transparent_38%),linear-gradient(145deg,color-mix(in_oklab,var(--background)_96%,white_4%),var(--background))] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_28%,transparent_72%,rgba(255,255,255,0.08))]" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <div className="relative px-6 pb-6 pt-7 sm:px-7 sm:pb-7 sm:pt-8">
            <AuthFormContent
              mode={mode}
              redirectTo={redirectTo ?? "/"}
              onSuccess={handleSuccess}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
