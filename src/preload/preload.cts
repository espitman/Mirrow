import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  BrowserBounds,
  BrowserState,
  HistoryItem,
  InstantTranslateModeState,
  LmStudioModel,
  OnlineCostState,
  SelectionModeState,
  TranslationBatch,
  TranslationComplete,
  TranslationProgress,
  TranslatePageOptions,
  ExclusionModeState,
} from "../shared/types.js";

const on = <T,>(channel: string, callback: (payload: T) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("mirrow", {
  browser: {
    setBounds: (bounds: BrowserBounds) => ipcRenderer.invoke("browser:set-bounds", bounds),
    getState: () => ipcRenderer.invoke("browser:get-state") as Promise<BrowserState>,
    loadUrl: (url: string) => ipcRenderer.invoke("browser:load-url", url) as Promise<BrowserState>,
    createTab: (url?: string) => ipcRenderer.invoke("browser:create-tab", url) as Promise<BrowserState>,
    switchTab: (id: string) => ipcRenderer.invoke("browser:switch-tab", id) as Promise<BrowserState>,
    closeTab: (id: string) => ipcRenderer.invoke("browser:close-tab", id) as Promise<BrowserState>,
    goBack: () => ipcRenderer.invoke("browser:go-back") as Promise<BrowserState>,
    goForward: () => ipcRenderer.invoke("browser:go-forward") as Promise<BrowserState>,
    reload: () => ipcRenderer.invoke("browser:reload") as Promise<BrowserState>,
    setExclusionMode: (enabled: boolean) => ipcRenderer.invoke("browser:set-exclusion-mode", enabled) as Promise<ExclusionModeState>,
    clearExclusions: () => ipcRenderer.invoke("browser:clear-exclusions") as Promise<number>,
    setSelectionMode: (enabled: boolean) => ipcRenderer.invoke("browser:set-selection-mode", enabled) as Promise<SelectionModeState>,
    clearSelections: () => ipcRenderer.invoke("browser:clear-selections") as Promise<number>,
    setInstantTranslateMode: (enabled: boolean) => ipcRenderer.invoke("browser:set-instant-translate-mode", enabled) as Promise<InstantTranslateModeState>,
    onState: (callback: (state: BrowserState) => void) => on("browser:state", callback),
  },
  translation: {
    start: (options: TranslatePageOptions) => ipcRenderer.invoke("translate:start", options),
    cancel: () => ipcRenderer.invoke("translate:cancel") as Promise<{ cancelled: boolean }>,
    translateBatch: (batch: TranslationBatch) => ipcRenderer.invoke("translate:batch", batch),
    onProgress: (callback: (progress: TranslationProgress) => void) => on("translate:progress", callback),
    onError: (callback: (message: string) => void) => on("translate:error", callback),
    onComplete: (callback: (payload: TranslationComplete) => void) => on("translate:complete", callback),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (settings: Partial<AppSettings>) => ipcRenderer.invoke("settings:update", settings),
  },
  history: {
    get: () => ipcRenderer.invoke("history:get"),
    add: (item: HistoryItem) => ipcRenderer.invoke("history:add", item),
    clear: () => ipcRenderer.invoke("history:clear"),
  },
  lmStudio: {
    checkConnection: () => ipcRenderer.invoke("lmstudio:check-connection"),
  },
  googleAi: {
    listModels: (settings?: Partial<AppSettings>) => ipcRenderer.invoke("google-ai:list-models", settings) as Promise<LmStudioModel[]>,
  },
  onlineCost: {
    get: () => ipcRenderer.invoke("online-cost:get") as Promise<OnlineCostState>,
    reset: () => ipcRenderer.invoke("online-cost:reset") as Promise<OnlineCostState>,
    onUpdate: (callback: (state: OnlineCostState) => void) => on("online-cost:update", callback),
  },
});
