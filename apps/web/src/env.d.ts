declare const __PUBLIC_SITE_URL__: string;

interface Window {
  megickDesktop?: {
    platform: string;
    isElectron: boolean;
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
    navigateBack: () => void;
    navigateForward: () => void;
    refresh: () => void;
    restartApp: () => void;
    getVersion: () => Promise<string>;
    openExternal: (url: string) => void;
    getNavigationState: () => Promise<{
      canGoBack: boolean;
      canGoForward: boolean;
    }>;
    onNavigationStateChange: (
      callback: (state: { canGoBack: boolean; canGoForward: boolean }) => void,
    ) => () => void;
  };
  megickUpdater?: {
    onInfo: (callback: (info: { currentVersion: string; latestVersion: string; releaseNotes?: string }) => void) => () => void;
    onProgress: (callback: (progress: { percent: number; status: string }) => void) => () => void;
    onStatus: (callback: (message: string) => void) => () => void;
    onError: (callback: (message: string) => void) => () => void;
    retry: () => void;
  };
}
