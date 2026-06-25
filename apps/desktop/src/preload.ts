/**
 * Preload script — runs in a sandboxed context before the web page loads.
 * Exposes a minimal API to the renderer via contextBridge.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("megickDesktop", {
  platform: process.platform,
  isElectron: true,

  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window:maximize-change", handler);
    return () => {
      ipcRenderer.removeListener("window:maximize-change", handler);
    };
  },

  // Browser navigation controls
  navigateBack: () => ipcRenderer.send("window:navigate-back"),
  navigateForward: () => ipcRenderer.send("window:navigate-forward"),
  refresh: () => ipcRenderer.send("window:refresh"),
  restartApp: () => ipcRenderer.send("app:restart"),
  getVersion: () => ipcRenderer.invoke("app:version") as Promise<string>,
  openExternal: (url: string) => ipcRenderer.send("app:open-external", url),
  getNavigationState: () =>
    ipcRenderer.invoke("window:navigation-state") as Promise<{
      canGoBack: boolean;
      canGoForward: boolean;
    }>,
  onNavigationStateChange: (
    callback: (state: { canGoBack: boolean; canGoForward: boolean }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: { canGoBack: boolean; canGoForward: boolean },
    ) => callback(state);
    ipcRenderer.on("window:navigation-state-change", handler);
    return () => {
      ipcRenderer.removeListener("window:navigation-state-change", handler);
    };
  },
});

contextBridge.exposeInMainWorld("megickUpdater", {
  onInfo: (callback: (info: { currentVersion: string; latestVersion: string; releaseNotes?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { currentVersion: string; latestVersion: string; releaseNotes?: string }) => callback(info);
    ipcRenderer.on("update:info", handler);
    return () => ipcRenderer.removeListener("update:info", handler);
  },
  onProgress: (callback: (progress: { percent: number; status: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { percent: number; status: string }) => callback(progress);
    ipcRenderer.on("update:progress", handler);
    return () => ipcRenderer.removeListener("update:progress", handler);
  },
  onStatus: (callback: (message: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },
  onError: (callback: (message: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("update:error", handler);
    return () => ipcRenderer.removeListener("update:error", handler);
  },
  retry: () => ipcRenderer.send("update:retry"),
});
