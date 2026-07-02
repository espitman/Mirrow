import { ipcMain } from "electron";
import type { AppSettings, BrowserBounds, HistoryItem, TranslationBatch, TranslatePageOptions } from "../shared/types.js";
import type { BrowserController } from "./browser.js";
import { addHistory, clearHistory, getHistory } from "./history.js";
import { getSettings, sanitizeSettings, updateSettings } from "./settings.js";
import { checkLmStudioConnection, listGoogleAiModels, translateBatch } from "./translator.js";

export function registerIpc(browser: BrowserController) {
  [
    "browser:set-bounds",
    "browser:get-state",
    "browser:load-url",
    "browser:create-tab",
    "browser:switch-tab",
    "browser:close-tab",
    "browser:reorder-tabs",
    "browser:show-tab-menu",
    "browser:go-back",
    "browser:go-forward",
    "browser:reload",
    "browser:set-exclusion-mode",
    "browser:clear-exclusions",
    "browser:set-selection-mode",
    "browser:clear-selections",
    "browser:set-instant-translate-mode",
    "online-cost:get",
    "online-cost:reset",
    "translate:cancel",
    "translate:start",
    "translate:batch",
    "settings:get",
    "settings:update",
    "history:get",
    "history:add",
    "history:clear",
    "lmstudio:check-connection",
    "google-ai:list-models",
  ].forEach((channel) => ipcMain.removeHandler(channel));

  ipcMain.handle("browser:set-bounds", (_event, bounds: BrowserBounds) => browser.setBounds(bounds));
  ipcMain.handle("browser:get-state", () => browser.getState());
  ipcMain.handle("browser:load-url", (_event, url: string) => browser.loadUrl(String(url)));
  ipcMain.handle("browser:create-tab", (_event, url?: string) => browser.createTab(url ? String(url) : undefined));
  ipcMain.handle("browser:switch-tab", (_event, id: string) => browser.switchTab(String(id)));
  ipcMain.handle("browser:close-tab", (_event, id: string) => browser.closeTab(String(id)));
  ipcMain.handle("browser:reorder-tabs", (_event, orderedIds: string[]) => browser.reorderTabs(Array.isArray(orderedIds) ? orderedIds.map(String) : []));
  ipcMain.handle("browser:show-tab-menu", (_event, id: string) => browser.showTabContextMenu(String(id)));
  ipcMain.handle("browser:go-back", () => browser.goBack());
  ipcMain.handle("browser:go-forward", () => browser.goForward());
  ipcMain.handle("browser:reload", () => browser.reload());
  ipcMain.handle("browser:set-exclusion-mode", (_event, enabled: boolean) => browser.setExclusionMode(Boolean(enabled)));
  ipcMain.handle("browser:clear-exclusions", () => browser.clearExclusions());
  ipcMain.handle("browser:set-selection-mode", (_event, enabled: boolean) => browser.setSelectionMode(Boolean(enabled)));
  ipcMain.handle("browser:clear-selections", () => browser.clearSelections());
  ipcMain.handle("browser:set-instant-translate-mode", (_event, enabled: boolean) => browser.setInstantTranslateMode(Boolean(enabled)));
  ipcMain.handle("online-cost:get", () => browser.getOnlineCost());
  ipcMain.handle("online-cost:reset", () => browser.resetOnlineCost());

  ipcMain.handle("translate:start", (_event, options: TranslatePageOptions) => {
    return browser.translatePage({
      sourceLanguage: String(options?.sourceLanguage || "auto"),
      targetLanguage: String(options?.targetLanguage || "Persian"),
      selectedOnly: Boolean(options?.selectedOnly),
    });
  });
  ipcMain.handle("translate:cancel", () => browser.cancelTranslation());
  ipcMain.handle("translate:batch", async (_event, batch: TranslationBatch) => {
    const settings = await getSettings();
    return translateBatch(batch, settings);
  });

  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:update", (_event, settings: Partial<AppSettings>) => updateSettings(settings));

  ipcMain.handle("history:get", () => getHistory());
  ipcMain.handle("history:add", (_event, item: HistoryItem) => addHistory(item));
  ipcMain.handle("history:clear", () => clearHistory());

  ipcMain.handle("lmstudio:check-connection", async () => checkLmStudioConnection(await getSettings()));
  ipcMain.handle("google-ai:list-models", async (_event, settings?: Partial<AppSettings>) => {
    return listGoogleAiModels(sanitizeSettings({ ...(await getSettings()), ...(settings ?? {}) }));
  });
}
