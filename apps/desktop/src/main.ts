import { app, BrowserWindow, ipcMain, Menu, net, screen, shell, type BrowserWindowConstructorOptions } from "electron";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { basename, join } from "node:path";

const IS_DEV = !app.isPackaged;
const IS_MAC = process.platform === "darwin";
const PROD_URL = process.env.MEGICK_WEB_URL ?? "https://megick.com";
const LOGIN_PATH = "/desktop-login";
const DEV_URL = `http://localhost:${process.env.WEB_DEV_PORT ?? 8080}`;
const LOADING_HTML_PATH = join(__dirname, "loading.html");
const UPDATE_HTML_PATH = join(__dirname, "update.html");
const MIN_LOADING_SCREEN_MS = 3000;
type DesktopLocale = "zh-CN" | "zh-TW" | "en" | "ja" | "fr" | "de";

interface DesktopUpdateCheckResponse {
  updateAvailable: boolean;
  currentVersion: string;
  latest?: {
    version: string;
    downloadUrl: string;
    fileName?: string | null;
    fileSizeBytes?: string | null;
    sha256?: string | null;
    releaseNotes?: string | null;
    forceUpdate: boolean;
  } | null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function desktopLocale(): DesktopLocale {
  const locale = app.getLocale().toLowerCase().replace(/_/g, "-");
  if (
    locale === "zh-tw" ||
    locale === "zh-hk" ||
    locale === "zh-mo" ||
    locale === "zh-hant" ||
    locale.startsWith("zh-tw-") ||
    locale.startsWith("zh-hk-") ||
    locale.startsWith("zh-mo-") ||
    locale.startsWith("zh-hant-")
  ) {
    return "zh-TW";
  }
  if (locale === "zh" || locale === "zh-cn" || locale === "zh-hans" || locale.startsWith("zh-hans-")) {
    return "zh-CN";
  }
  if (locale.startsWith("ja")) return "ja";
  if (locale.startsWith("fr")) return "fr";
  if (locale.startsWith("de")) return "de";
  return "en";
}

function desktopText(key: keyof typeof desktopMessages.en, values?: Record<string, string | number>) {
  const message = desktopMessages[desktopLocale()][key];
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (_, token: string) => String(values[token] ?? ""));
}

const desktopMessages = {
  "zh-CN": {
    updateDownloading: "正在下载安装包…",
    updateVerifying: "正在校验安装包…",
    updateChecksumFailed: "安装包校验失败，请重试下载",
    updateOpeningInstaller: "下载完成，正在打开安装程序…",
    updateFailed: "更新失败，请重试",
    updateDownloadFailed: "下载安装包失败：{statusCode}",
    updateDownloadingPercent: "下载中 {percent}%",
    updateDownloadedSize: "已下载 {sizeMb} MB",
  },
  "zh-TW": {
    updateDownloading: "正在下載安裝包…",
    updateVerifying: "正在校驗安裝包…",
    updateChecksumFailed: "安裝包校驗失敗，請重新下載",
    updateOpeningInstaller: "下載完成，正在開啟安裝程式…",
    updateFailed: "更新失敗，請重試",
    updateDownloadFailed: "安裝包下載失敗：{statusCode}",
    updateDownloadingPercent: "下載中 {percent}%",
    updateDownloadedSize: "已下載 {sizeMb} MB",
  },
  en: {
    updateDownloading: "Downloading installer...",
    updateVerifying: "Verifying installer...",
    updateChecksumFailed: "Installer verification failed. Please download again.",
    updateOpeningInstaller: "Download complete. Opening installer...",
    updateFailed: "Update failed. Please try again.",
    updateDownloadFailed: "Installer download failed: {statusCode}",
    updateDownloadingPercent: "Downloading {percent}%",
    updateDownloadedSize: "Downloaded {sizeMb} MB",
  },
  ja: {
    updateDownloading: "インストーラーをダウンロード中...",
    updateVerifying: "インストーラーを検証中...",
    updateChecksumFailed: "インストーラーの検証に失敗しました。再度ダウンロードしてください。",
    updateOpeningInstaller: "ダウンロード完了。インストーラーを開いています...",
    updateFailed: "更新に失敗しました。もう一度お試しください。",
    updateDownloadFailed: "インストーラーのダウンロードに失敗しました：{statusCode}",
    updateDownloadingPercent: "ダウンロード中 {percent}%",
    updateDownloadedSize: "{sizeMb} MB ダウンロード済み",
  },
  fr: {
    updateDownloading: "Téléchargement de l'installateur...",
    updateVerifying: "Vérification de l'installateur...",
    updateChecksumFailed: "La vérification de l'installateur a échoué. Téléchargez à nouveau.",
    updateOpeningInstaller: "Téléchargement terminé. Ouverture de l'installateur...",
    updateFailed: "Échec de la mise à jour. Réessayez.",
    updateDownloadFailed: "Échec du téléchargement de l'installateur : {statusCode}",
    updateDownloadingPercent: "Téléchargement {percent}%",
    updateDownloadedSize: "{sizeMb} Mo téléchargés",
  },
  de: {
    updateDownloading: "Installer wird heruntergeladen...",
    updateVerifying: "Installer wird geprüft...",
    updateChecksumFailed: "Installer-Prüfung fehlgeschlagen. Bitte erneut herunterladen.",
    updateOpeningInstaller: "Download abgeschlossen. Installer wird geöffnet...",
    updateFailed: "Update fehlgeschlagen. Bitte erneut versuchen.",
    updateDownloadFailed: "Installer-Download fehlgeschlagen: {statusCode}",
    updateDownloadingPercent: "Download {percent}%",
    updateDownloadedSize: "{sizeMb} MB heruntergeladen",
  },
} satisfies Record<DesktopLocale, Record<string, string>>;

function getInitialWindowBounds(): Pick<BrowserWindowConstructorOptions, "width" | "height" | "minWidth" | "minHeight"> {
  const display = screen.getPrimaryDisplay();
  const { width: workWidth, height: workHeight } = display.workAreaSize;
  const width = Math.round(Math.min(Math.max(workWidth * 0.82, 1120), 1440));
  const height = Math.round(Math.min(Math.max(workHeight * 0.84, 720), 960));
  const minWidth = Math.round(Math.min(960, workWidth * 0.9));
  const minHeight = Math.round(Math.min(640, workHeight * 0.9));
  return { width, height, minWidth, minHeight };
}

const WINDOW_OPTIONS: BrowserWindowConstructorOptions = {
  title: "Megick Studio",
  backgroundColor: "#110f0a",
  frame: false,
  show: false,
  useContentSize: true,
  center: true,
  resizable: true,
  thickFrame: true,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    devTools: IS_DEV,
    preload: join(__dirname, "preload.js"),
  },
};

function createWindow(loginUrl: string): BrowserWindow {
  const bootStartedAt = Date.now();
  const win = new BrowserWindow({ ...WINDOW_OPTIONS, ...getInitialWindowBounds() });

  const sendMaximizeState = () => win.webContents.send("window:maximize-change", win.isMaximized());
  const sendNavigationState = () => {
    win.webContents.send("window:navigation-state-change", {
      canGoBack: win.webContents.canGoBack(),
      canGoForward: win.webContents.canGoForward(),
    });
  };
  win.on("maximize", sendMaximizeState);
  win.on("unmaximize", sendMaximizeState);
  win.webContents.on("did-navigate", sendNavigationState);
  win.webContents.on("did-navigate-in-page", sendNavigationState);

  void win.loadFile(LOADING_HTML_PATH);
  win.once("ready-to-show", () => {
    win.show();
    if (IS_DEV) win.webContents.openDevTools({ mode: "detach" });
    const elapsedMs = Date.now() - bootStartedAt;
    const remainingBootMs = Math.max(MIN_LOADING_SCREEN_MS - elapsedMs, 0);
    void wait(remainingBootMs).then(() => {
      if (!win.isDestroyed()) void win.loadURL(loginUrl);
    });
  });
  return win;
}

function desktopPlatform() {
  if (process.platform === "darwin") return "MAC";
  if (process.platform === "win32") return "WIN";
  return null;
}

async function checkForDesktopUpdate(baseUrl: string): Promise<DesktopUpdateCheckResponse | null> {
  if (IS_DEV && process.env.MEGICK_ENABLE_UPDATE_CHECK !== "true") return null;
  const platform = desktopPlatform();
  if (!platform) return null;
  const url = new URL("/api/desktop-updates/check", baseUrl);
  url.searchParams.set("platform", platform);
  url.searchParams.set("version", app.getVersion());
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Update check failed with status ${res.status}`);
  return (await res.json()) as DesktopUpdateCheckResponse;
}

function createUpdateWindow(update: NonNullable<DesktopUpdateCheckResponse["latest"]>) {
  const win = new BrowserWindow({
    width: 560,
    height: 520,
    minWidth: 520,
    minHeight: 480,
    title: "Megick Studio Update",
    backgroundColor: "#110f0a",
    resizable: false,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "preload.js"),
    },
  });

  win.on("close", (event) => {
    if (update.forceUpdate !== false) {
      event.preventDefault();
      app.quit();
    }
  });
  void win.loadFile(UPDATE_HTML_PATH);
  win.once("ready-to-show", () => {
    win.show();
    win.webContents.send("update:info", {
      currentVersion: app.getVersion(),
      latestVersion: update.version,
      releaseNotes: update.releaseNotes ?? "",
    });
    void downloadAndInstallUpdate(win, update);
  });
  ipcMain.removeAllListeners("update:retry");
  ipcMain.on("update:retry", () => void downloadAndInstallUpdate(win, update));
  return win;
}

async function downloadAndInstallUpdate(win: BrowserWindow, update: NonNullable<DesktopUpdateCheckResponse["latest"]>) {
  try {
    win.webContents.send("update:status", desktopText("updateDownloading"));
    const installerPath = await downloadInstaller(win, update);
    if (update.sha256) {
      win.webContents.send("update:status", desktopText("updateVerifying"));
      const actual = await sha256File(installerPath);
      if (actual.toLowerCase() !== update.sha256.toLowerCase()) {
        await rm(installerPath, { force: true });
        throw new Error(desktopText("updateChecksumFailed"));
      }
    }
    win.webContents.send("update:progress", { percent: 100, status: desktopText("updateOpeningInstaller") });
    const error = await shell.openPath(installerPath);
    if (error) throw new Error(error);
    app.quit();
  } catch (error) {
    win.webContents.send("update:error", error instanceof Error ? error.message : desktopText("updateFailed"));
  }
}

async function downloadInstaller(win: BrowserWindow, update: NonNullable<DesktopUpdateCheckResponse["latest"]>) {
  const updatesDir = join(app.getPath("userData"), "updates");
  await mkdir(updatesDir, { recursive: true });
  const fileName = safeInstallerName(update.fileName || basename(new URL(update.downloadUrl).pathname) || `Megick-${update.version}`);
  const target = join(updatesDir, fileName);

  return new Promise<string>((resolve, reject) => {
    const request = net.request(update.downloadUrl);
    request.on("response", (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(desktopText("updateDownloadFailed", { statusCode: response.statusCode })));
        return;
      }
      const total = Number(response.headers["content-length"] ?? update.fileSizeBytes ?? 0);
      let received = 0;
      const output = createWriteStream(target);
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        const percent = total > 0 ? (received / total) * 100 : 0;
        win.webContents.send("update:progress", {
          percent,
          status:
            total > 0
              ? desktopText("updateDownloadingPercent", { percent: Math.round(percent) })
              : desktopText("updateDownloadedSize", { sizeMb: Math.round(received / 1024 / 1024) }),
        });
      });
      Readable.fromWeb(response as never).pipe(output);
      output.on("finish", () => output.close(() => resolve(target)));
      output.on("error", reject);
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

async function sha256File(path: string) {
  const { createReadStream } = await import("node:fs");
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(path);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
    input.on("error", reject);
  });
}

function safeInstallerName(fileName: string) {
  const clean = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return clean && clean !== "." && clean !== ".." ? clean : "Megick-Studio-Installer";
}

function registerIpcHandlers() {
  ipcMain.on("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.on("window:maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on("window:close", (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.on("window:navigate-back", (event) => {
    if (event.sender.canGoBack()) event.sender.goBack();
  });
  ipcMain.on("window:navigate-forward", (event) => {
    if (event.sender.canGoForward()) event.sender.goForward();
  });
  ipcMain.on("window:refresh", (event) => event.sender.reload());
  ipcMain.on("app:restart", () => {
    app.relaunch();
    app.exit(0);
  });
  ipcMain.on("app:open-external", (_event, url: string) => {
    try {
      const externalUrl = new URL(url);
      if (externalUrl.protocol === "https:" || externalUrl.protocol === "http:") void shell.openExternal(externalUrl.toString());
    } catch {
      return;
    }
  });
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("window:isMaximized", (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false);
  ipcMain.handle("window:navigation-state", (event) => ({
    canGoBack: event.sender.canGoBack(),
    canGoForward: event.sender.canGoForward(),
  }));
}

app.whenReady().then(() => {
  registerIpcHandlers();

  if (IS_MAC) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "Megick Studio", submenu: [{ role: "about" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] },
      { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
      { label: "View", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
      { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }

  const loginUrl = IS_DEV ? `${DEV_URL}${LOGIN_PATH}` : `${PROD_URL}${LOGIN_PATH}`;
  console.log(`🚀 Megick Desktop — loading ${loginUrl}`);
  void checkForDesktopUpdate(IS_DEV ? DEV_URL : PROD_URL)
    .then((update) => {
      if (update?.updateAvailable && update.latest) createUpdateWindow(update.latest);
      else createWindow(loginUrl);
    })
    .catch((error) => {
      console.warn(`Update check skipped: ${(error as Error).message}`);
      createWindow(loginUrl);
    });
});

app.on("window-all-closed", () => {
  if (!IS_MAC) app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const loginUrl = `${PROD_URL}${LOGIN_PATH}`;
    createWindow(loginUrl);
  }
});

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
});
