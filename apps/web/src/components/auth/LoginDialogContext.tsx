import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface LoginDialogState {
  open: boolean;
  mode: "signin" | "signup";
  redirectTo?: string;
}

interface LoginDialogContextValue extends LoginDialogState {
  openLogin: (opts?: { mode?: LoginDialogState["mode"]; redirectTo?: string }) => void;
  closeLogin: () => void;
}

const LoginDialogContext = createContext<LoginDialogContextValue | null>(null);

export function LoginDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoginDialogState>({ open: false, mode: "signin" });

  const openLogin = useCallback<LoginDialogContextValue["openLogin"]>((opts) => {
    setState({ open: true, mode: opts?.mode ?? "signin", redirectTo: opts?.redirectTo });
  }, []);

  const closeLogin = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const value = useMemo<LoginDialogContextValue>(
    () => ({ ...state, openLogin, closeLogin }),
    [state, openLogin, closeLogin],
  );

  return <LoginDialogContext.Provider value={value}>{children}</LoginDialogContext.Provider>;
}

export function useLoginDialog(): LoginDialogContextValue {
  const ctx = useContext(LoginDialogContext);
  if (!ctx) {
    throw new Error("useLoginDialog must be used within <LoginDialogProvider>");
  }
  return ctx;
}
