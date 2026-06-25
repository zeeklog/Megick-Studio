import { useEffect } from "react";

const runDebugger = new Function("debugger");

export function DevtoolsDebuggerGuard() {
  useEffect(() => {
    if (import.meta.env.DEV || window.megickDesktop?.isElectron) {
      return;
    }

    let timeoutId: number | null = null;
    let disposed = false;

    const scheduleDebugger = () => {
      if (disposed) {
        return;
      }

      runDebugger();
      timeoutId = window.setTimeout(scheduleDebugger, 100);
    };

    scheduleDebugger();

    return () => {
      disposed = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return null;
}
