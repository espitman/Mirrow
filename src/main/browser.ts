import { BrowserView, BrowserWindow, Menu } from "electron";
import type {
  BrowserBounds,
  BrowserState,
  ExclusionModeState,
  InstantTranslateModeState,
  SelectionModeState,
  TranslationComplete,
  TranslationBatch,
  TranslationBatchResult,
  TranslationItem,
  TranslationProgress,
  TranslatePageOptions,
} from "../shared/types.js";
import { addHistory } from "./history.js";
import { getSettings } from "./settings.js";
import { translateBatch } from "./translator.js";
import { resolveNavigationInput } from "../shared/navigation.js";

const MIN_BROWSER_SIZE = 120;
const LOCAL_TRANSLATION_CONCURRENCY = 8;
const ONLINE_TRANSLATION_CONCURRENCY = 2;
const GOOGLE_TRANSLATION_CONCURRENCY = 3;
const LOCAL_MIN_BATCH_SIZE = 36;
const TRANSLATION_RETRY_ATTEMPTS = 3;

type BrowserTabRecord = {
  id: string;
  view: BrowserView;
  isLoading: boolean;
};

export class BrowserController {
  private view: BrowserView | null = null;
  private tabs: BrowserTabRecord[] = [];
  private activeTabId = "";
  private bounds: BrowserBounds | null = null;
  private exclusionModeEnabled = false;
  private selectionModeEnabled = false;
  private instantTranslateModeEnabled = false;
  private onlineCostToman = 0;
  private translationCancelled = false;
  private translationInProgress = false;
  private activeTranslateOptions: TranslatePageOptions | null = null;
  private dynamicPickQueue: Promise<void> = Promise.resolve();

  constructor(private readonly window: BrowserWindow) {}

  create() {
    if (this.view) return this.view;
    const tab = this.createTabRecord();
    this.tabs.push(tab);
    this.activateTab(tab.id);
    this.emitState();
    return tab.view;
  }

  createTab(rawUrl?: string) {
    const tab = this.createTabRecord();
    this.tabs.push(tab);
    this.activateTab(tab.id);
    if (rawUrl) {
      this.loadUrl(rawUrl).catch((error: unknown) => {
        if (!isNavigationAbortError(error)) this.sendError(readError(error));
      });
    }
    this.emitState();
    return this.getState();
  }

  switchTab(id: string) {
    const tab = this.tabs.find((item) => item.id === id);
    if (!tab) return this.getState();
    this.activateTab(tab.id);
    this.emitState();
    this.reinjectInstantTranslateMode(0);
    return this.getState();
  }

  closeTab(id: string) {
    const tab = this.tabs.find((item) => item.id === id);
    if (!tab) return this.getState();

    const wasActive = tab.id === this.activeTabId;
    this.window.removeBrowserView(tab.view);
    tab.view.webContents.close();
    this.tabs = this.tabs.filter((item) => item.id !== id);

    if (!this.tabs.length) {
      this.view = null;
      this.activeTabId = "";
      this.create();
      return this.getState();
    }

    if (wasActive) {
      const nextTab = this.tabs[Math.max(0, this.tabs.length - 1)];
      this.activateTab(nextTab.id);
    }

    this.emitState();
    return this.getState();
  }

  createTabToRight(targetId: string, rawUrl?: string) {
    const targetIndex = this.tabs.findIndex((tab) => tab.id === targetId);
    const tab = this.createTabRecord();
    const insertIndex = targetIndex >= 0 ? targetIndex + 1 : this.tabs.length;
    this.tabs.splice(insertIndex, 0, tab);
    this.activateTab(tab.id);
    if (rawUrl) {
      this.loadUrl(rawUrl).catch((error: unknown) => {
        if (!isNavigationAbortError(error)) this.sendError(readError(error));
      });
    }
    this.emitState();
    return this.getState();
  }

  duplicateTab(id: string) {
    const tab = this.tabs.find((item) => item.id === id);
    const url = tab?.view.webContents.getURL();
    if (!url) return this.getState();
    return this.createTabToRight(id, url);
  }

  reloadTab(id: string) {
    const tab = this.tabs.find((item) => item.id === id);
    if (!tab) return this.getState();
    tab.isLoading = true;
    tab.view.webContents.reload();
    this.emitState();
    return this.getState();
  }

  async closeOtherTabs(id: string) {
    const idsToClose = this.tabs.map((tab) => tab.id).filter((tabId) => tabId !== id);
    for (const tabId of idsToClose) this.closeTab(tabId);
    return this.getState();
  }

  async closeTabsToRight(id: string) {
    const targetIndex = this.tabs.findIndex((tab) => tab.id === id);
    if (targetIndex < 0) return this.getState();
    const idsToClose = this.tabs.slice(targetIndex + 1).map((tab) => tab.id);
    for (const tabId of idsToClose) this.closeTab(tabId);
    return this.getState();
  }

  showTabContextMenu(id: string) {
    const tabIndex = this.tabs.findIndex((tab) => tab.id === id);
    const tab = this.tabs[tabIndex];
    if (!tab) return this.getState();

    const hasUrl = Boolean(tab.view.webContents.getURL());
    const hasOtherTabs = this.tabs.length > 1;
    const hasTabsToRight = tabIndex >= 0 && tabIndex < this.tabs.length - 1;
    const menu = Menu.buildFromTemplate([
      {
        label: "New Tab to the Right",
        click: () => this.createTabToRight(id),
      },
      {
        label: "Duplicate",
        enabled: hasUrl,
        click: () => this.duplicateTab(id),
      },
      { type: "separator" },
      {
        label: "Reload",
        click: () => this.reloadTab(id),
      },
      { type: "separator" },
      {
        label: "Close",
        click: () => this.closeTab(id),
      },
      {
        label: "Close Other Tabs",
        enabled: hasOtherTabs,
        click: () => {
          this.closeOtherTabs(id).catch((error: unknown) => this.sendError(readError(error)));
        },
      },
      {
        label: "Close Tabs to the Right",
        enabled: hasTabsToRight,
        click: () => {
          this.closeTabsToRight(id).catch((error: unknown) => this.sendError(readError(error)));
        },
      },
    ]);
    menu.popup({ window: this.window });
    return this.getState();
  }

  reorderTabs(orderedIds: string[]) {
    const tabsById = new Map(this.tabs.map((tab) => [tab.id, tab]));
    const nextTabs = orderedIds
      .map((id) => tabsById.get(id))
      .filter((tab): tab is BrowserTabRecord => Boolean(tab));
    const remainingTabs = this.tabs.filter((tab) => !orderedIds.includes(tab.id));
    this.tabs = [...nextTabs, ...remainingTabs];
    this.emitState();
    return this.getState();
  }

  private createTabRecord(): BrowserTabRecord {
    const id = crypto.randomUUID();

    const view = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        javascript: true,
      },
    });

    const tab: BrowserTabRecord = { id, view, isLoading: false };
    view.setAutoResize({ width: false, height: false });
    view.webContents.setWindowOpenHandler(({ url }) => {
      this.createTab(url);
      return { action: "deny" };
    });

    view.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
      if (!isMainFrame || isInPlace) return;
      tab.isLoading = true;
      this.emitStateIfActive(tab.id);
    });
    view.webContents.on("did-stop-loading", () => {
      tab.isLoading = false;
      this.emitStateIfActive(tab.id);
      this.reinjectInstantTranslateModeForTab(tab.id);
    });
    view.webContents.on("did-finish-load", () => {
      tab.isLoading = false;
      this.emitStateIfActive(tab.id);
      this.reinjectInstantTranslateModeForTab(tab.id);
    });
    view.webContents.on("did-navigate", () => {
      tab.isLoading = false;
      this.emitStateIfActive(tab.id);
      this.reinjectInstantTranslateModeForTab(tab.id);
    });
    view.webContents.on("dom-ready", () => this.reinjectInstantTranslateModeForTab(tab.id));
    view.webContents.on("did-navigate-in-page", () => this.emitStateIfActive(tab.id));
    view.webContents.on("page-title-updated", () => this.emitStateIfActive(tab.id));
    view.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) return;
      tab.isLoading = false;
      this.emitStateIfActive(tab.id);
      if (code !== -3 && tab.id === this.activeTabId) this.sendError(`Website failed to load: ${description || url}`);
    });
    view.webContents.on("console-message", (_event, _level, message) => {
      if (tab.id !== this.activeTabId) return;
      if (message.startsWith("__MIRROW_RETRANSLATE__:")) {
        const id = message.slice("__MIRROW_RETRANSLATE__:".length).trim();
        this.retranslateNode(id).catch((error: unknown) => this.sendError(readError(error)));
        return;
      }
      if (message.startsWith("__MIRROW_PICK_TRANSLATE__:")) {
        const token = message.slice("__MIRROW_PICK_TRANSLATE__:".length).trim();
        if (!this.translationInProgress || !token) return;
        const options = this.activeTranslateOptions;
        if (!options) return;
        this.dynamicPickQueue = this.dynamicPickQueue
          .then(() => this.translatePickedElement(token, options))
          .catch((error: unknown) => this.sendError(readError(error)));
      }
      if (message.startsWith("__MIRROW_INSTANT_TRANSLATE__:")) {
        const token = message.slice("__MIRROW_INSTANT_TRANSLATE__:".length).trim();
        if (!token) return;
        this.dynamicPickQueue = this.dynamicPickQueue
          .then(() => this.translatePickedElement(token, { sourceLanguage: "auto", targetLanguage: "" }))
          .catch((error: unknown) => this.sendError(readError(error)));
      }
    });

    return tab;
  }

  private activateTab(id: string) {
    const tab = this.tabs.find((item) => item.id === id);
    if (!tab) return;
    this.activeTabId = tab.id;
    this.view = tab.view;
    this.window.setBrowserView(tab.view);
    if (this.bounds) this.applyBoundsToView(tab.view, this.bounds);
  }

  private getActiveTab() {
    return this.tabs.find((item) => item.id === this.activeTabId) ?? null;
  }

  private getTabForView(view: BrowserView) {
    return this.tabs.find((item) => item.view === view) ?? null;
  }

  private applyBoundsToView(view: BrowserView, bounds: BrowserBounds) {
    if (bounds.width < MIN_BROWSER_SIZE || bounds.height < MIN_BROWSER_SIZE) {
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }
    view.setBounds(bounds);
  }

  private emitStateIfActive(tabId: string) {
    if (tabId === this.activeTabId) this.emitState();
  }

  private reinjectInstantTranslateModeForTab(tabId: string) {
    if (tabId === this.activeTabId) this.reinjectInstantTranslateMode();
  }

  destroy() {
    for (const tab of this.tabs) {
      this.window.removeBrowserView(tab.view);
      tab.view.webContents.close();
    }
    this.tabs = [];
    this.activeTabId = "";
    this.view = null;
  }

  setBounds(bounds: BrowserBounds) {
    this.bounds = sanitizeBounds(bounds);
    if (!this.view) this.create();
    if (this.view) this.applyBoundsToView(this.view, this.bounds);
  }

  async loadUrl(rawUrl: string) {
    const view = this.create();
    const tab = this.getTabForView(view);
    const url = normalizeUrl(rawUrl);
    if (tab) tab.isLoading = true;
    this.emitState();
    try {
      await view.webContents.loadURL(url);
      return this.getState();
    } catch (error) {
      if (!isNavigationAbortError(error)) throw error;
      return this.getState();
    } finally {
      if (tab) tab.isLoading = false;
      this.emitState();
    }
  }

  async goBack() {
    if (this.view?.webContents.navigationHistory.canGoBack()) this.view.webContents.navigationHistory.goBack();
    return this.getState();
  }

  async goForward() {
    if (this.view?.webContents.navigationHistory.canGoForward()) this.view.webContents.navigationHistory.goForward();
    return this.getState();
  }

  async reload() {
    if (!this.view) return this.getState();
    const tab = this.getActiveTab();
    if (tab) tab.isLoading = true;
    this.emitState();
    this.view.webContents.reload();
    return this.getState();
  }

  cancelTranslation() {
    this.translationCancelled = true;
    this.sendProgress({ completed: 0, total: 0, message: "Cancelling translation..." });
    return { cancelled: true };
  }

  async setExclusionMode(enabled: boolean): Promise<ExclusionModeState> {
    this.exclusionModeEnabled = enabled;
    if (enabled && this.selectionModeEnabled) {
      this.selectionModeEnabled = false;
      await this.injectSelectionMode(false);
    }
    if (enabled && this.instantTranslateModeEnabled) {
      this.instantTranslateModeEnabled = false;
      await this.injectInstantTranslateMode(false);
    }
    await this.injectExclusionMode(enabled);
    return { enabled };
  }

  async setSelectionMode(enabled: boolean): Promise<SelectionModeState> {
    this.selectionModeEnabled = enabled;
    if (enabled && this.exclusionModeEnabled) {
      this.exclusionModeEnabled = false;
      await this.injectExclusionMode(false);
    }
    if (enabled && this.instantTranslateModeEnabled) {
      this.instantTranslateModeEnabled = false;
      await this.injectInstantTranslateMode(false);
    }
    await this.injectSelectionMode(enabled);
    return { enabled };
  }

  async setInstantTranslateMode(enabled: boolean): Promise<InstantTranslateModeState> {
    this.instantTranslateModeEnabled = enabled;
    if (enabled && this.exclusionModeEnabled) {
      this.exclusionModeEnabled = false;
      await this.injectExclusionMode(false);
    }
    if (enabled && this.selectionModeEnabled) {
      this.selectionModeEnabled = false;
      await this.injectSelectionMode(false);
    }
    if (enabled) {
      this.reinjectInstantTranslateMode(0);
    } else {
      await this.injectInstantTranslateMode(false);
    }
    return { enabled };
  }

  private reinjectInstantTranslateMode(delayMs = 50, attempt = 1) {
    if (!this.instantTranslateModeEnabled || !this.view || this.view.webContents.isDestroyed()) return;
    setTimeout(() => {
      if (!this.instantTranslateModeEnabled || !this.view || this.view.webContents.isDestroyed()) return;
      this.injectInstantTranslateMode(true).catch(() => {
        if (attempt < 12) this.reinjectInstantTranslateMode(Math.min(1000, 120 * attempt), attempt + 1);
      });
    }, delayMs);
  }

  async clearExclusions() {
    const script = `
      (() => {
        const nodes = document.querySelectorAll("[data-mirrow-skip='true']");
        for (const node of nodes) {
          node.removeAttribute("data-mirrow-skip");
          node.classList.remove("mirrow-dimmed");
          node.classList.remove("mirrow-excluded-preview");
          node.style.removeProperty("outline");
          node.style.removeProperty("outline-offset");
          node.style.removeProperty("cursor");
          if (node.dataset.mirrowPreviousOpacity !== undefined) {
            node.style.opacity = node.dataset.mirrowPreviousOpacity;
            delete node.dataset.mirrowPreviousOpacity;
          } else {
            node.style.removeProperty("opacity");
          }
        }
        return nodes.length;
      })();
    `;
    return (await this.view?.webContents.executeJavaScript(script, true)) ?? 0;
  }

  async clearSelections() {
    const script = `
      (() => {
        const nodes = document.querySelectorAll("[data-mirrow-include='true'], .mirrow-picked-preview, .mirrow-focus-target, .mirrow-pick-hover, .mirrow-instant-hover");
        for (const node of nodes) {
          node.removeAttribute("data-mirrow-include");
          node.removeAttribute("data-mirrow-live-pick-id");
          node.removeAttribute("data-mirrow-pending");
          node.classList.remove("mirrow-focus-target");
          node.classList.remove("mirrow-picked-preview");
          node.classList.remove("mirrow-pick-hover");
          node.classList.remove("mirrow-instant-hover");
          node.style.removeProperty("outline");
          node.style.removeProperty("outline-offset");
          node.style.removeProperty("box-shadow");
        }
        return nodes.length;
      })();
    `;
    return (await this.view?.webContents.executeJavaScript(script, true)) ?? 0;
  }

  private async clearPickPreviews() {
    const script = `
      (() => {
        const nodes = document.querySelectorAll("[data-mirrow-include='true'], .mirrow-picked-preview, .mirrow-focus-target, .mirrow-pick-hover, .mirrow-instant-hover");
        for (const node of nodes) {
          node.removeAttribute("data-mirrow-include");
          node.removeAttribute("data-mirrow-live-pick-id");
          node.removeAttribute("data-mirrow-pending");
          node.classList.remove("mirrow-focus-target");
          node.classList.remove("mirrow-picked-preview");
          node.classList.remove("mirrow-pick-hover");
          node.classList.remove("mirrow-instant-hover");
          node.style.removeProperty("outline");
          node.style.removeProperty("outline-offset");
          node.style.removeProperty("box-shadow");
        }
        return nodes.length;
      })();
    `;
    return (await this.view?.webContents.executeJavaScript(script, true)) ?? 0;
  }

  getOnlineCost() {
    return { totalToman: Math.round(this.onlineCostToman) };
  }

  resetOnlineCost() {
    this.onlineCostToman = 0;
    this.emitOnlineCost();
    return this.getOnlineCost();
  }

  getState(): BrowserState {
    const contents = this.view?.webContents;
    const activeTab = this.getActiveTab();
    return {
      url: contents?.getURL() ?? "",
      title: contents?.getTitle() ?? "",
      canGoBack: contents?.navigationHistory.canGoBack() ?? false,
      canGoForward: contents?.navigationHistory.canGoForward() ?? false,
      isLoading: activeTab?.isLoading ?? false,
      activeTabId: this.activeTabId,
      tabs: this.tabs.map((tab) => ({
        id: tab.id,
        url: tab.view.webContents.getURL(),
        title: tab.view.webContents.getTitle(),
        isLoading: tab.isLoading,
      })),
    };
  }

  async translatePage(options: TranslatePageOptions): Promise<TranslationComplete> {
    const view = this.view;
    if (!view || !view.webContents.getURL()) {
      throw new Error("Load a website before translating.");
    }
    this.translationCancelled = false;
    this.sendProgress({ completed: 0, total: 0, message: "Preparing page..." });

    const items = await this.collectVisibleTextNodes(Boolean(options.selectedOnly));
    if (!items.length) {
      throw new Error("No visible text was found on this page.");
    }
    this.sendProgress({
      completed: 0,
      total: items.length,
      message: `Found ${items.length} text nodes`,
    });

    const settings = await getSettings();
    const batchSize = resolveBatchSize(settings);
    let completed = 0;
    let translatedCount = 0;
    let partialFailure = false;
    this.translationInProgress = true;
    this.activeTranslateOptions = options;

    this.sendProgress({
      completed: 0,
      total: items.length,
      message: "Preparing skeletons...",
    });
    await this.applyTranslationFocus(Boolean(options.selectedOnly), items);

    const batches = chunkItems(items, batchSize);
    const concurrency = resolveTranslationConcurrency(settings.translationEngine);
    let nextBatchIndex = 0;
    this.sendProgress({
      completed: 0,
      total: items.length,
      message: `Sending ${batches.length} batches (${concurrency} parallel)...`,
    });

    const translateNextBatch = async () => {
      while (!this.translationCancelled) {
        const batchIndex = nextBatchIndex;
        nextBatchIndex += 1;
        const batchItems = batches[batchIndex];
        if (!batchItems) return;

        try {
          const result = await this.translateBatchWithRetry(
            {
              sourceLanguage: options.sourceLanguage,
              targetLanguage: options.targetLanguage || settings.defaultTargetLanguage,
              items: batchItems,
            },
            settings,
          );
          await this.applyTranslations(result.items);
          translatedCount += result.items.length;
          if (Number.isFinite(result.costToman)) {
            this.onlineCostToman += result.costToman ?? 0;
            this.emitOnlineCost();
          }
        } catch (error) {
          partialFailure = true;
          this.sendError(readError(error));
        }

        completed += batchItems.length;
        this.sendProgress({
          completed,
          total: items.length,
          message: `Translating ${completed} / ${items.length} text nodes`,
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, batches.length) }, () => translateNextBatch()),
    );

    const wasCancelled = this.translationCancelled;
    this.translationCancelled = false;
    await this.dynamicPickQueue;
    this.translationInProgress = false;
    this.activeTranslateOptions = null;
    await this.clearPickPreviews();

    if (partialFailure && translatedCount === 0) {
      throw new Error("Translation failed before any text could be translated.");
    }

    const complete = {
      translatedCount,
      total: items.length,
      url: view.webContents.getURL(),
      title: view.webContents.getTitle(),
    };

    await addHistory({
      id: crypto.randomUUID(),
      url: complete.url,
      title: complete.title,
      targetLanguage: options.targetLanguage || settings.defaultTargetLanguage,
      translatedAt: new Date().toISOString(),
    });

    this.window.webContents.send("translate:complete", complete);
    if (wasCancelled) this.sendError("Translation stopped.");
    if (partialFailure) this.sendError("Some parts of the page could not be translated.");
    return complete;
  }

  async retranslateNode(idList: string) {
    if (!this.view || !idList) return;
    const ids = idList.split(",").map((id) => id.trim()).filter(Boolean);
    if (!ids.length) return;

    const items = await this.view.webContents.executeJavaScript(
      `
        (() => {
          const ids = ${JSON.stringify(ids)};
          const items = [];
          for (const id of ids) {
            const node = window.__mirrowNodeMap && window.__mirrowNodeMap.get(id);
            const text = (
              window.__mirrowSourceTextMap && window.__mirrowSourceTextMap.get(id) ||
              node && node.__mirrowOriginalText ||
              node && node.textContent ||
              ""
            ).trim();
            if (text) items.push({ id, text });
          }
          return items;
        })();
      `,
      true,
    ) as TranslationItem[];

    if (!items.length) return;

    const settings = await getSettings();
    await this.applyRetranslationSkeleton(ids);
    const result = await this.translateBatchWithRetry(
      {
        targetLanguage: settings.defaultTargetLanguage,
        items,
      },
      settings,
    );
    await this.applyTranslations(result.items);
    if (Number.isFinite(result.costToman)) {
      this.onlineCostToman += result.costToman ?? 0;
      this.emitOnlineCost();
    }
    this.sendProgress({
      completed: result.items.length,
      total: items.length,
      message: `Translated picked section (${result.items.length} / ${items.length})`,
    });
  }

  private async translatePickedElement(token: string, options: TranslatePageOptions) {
    if (!this.view || this.translationCancelled) return;
    const items = await this.collectPickedElementTextNodes(token);
    if (!items.length) return;

    const settings = await getSettings();
    this.sendProgress({
      completed: 0,
      total: items.length,
      message: `Queued picked section (${items.length} text nodes)`,
    });
    const result = await this.translateBatchWithRetry(
      {
        sourceLanguage: options.sourceLanguage,
        targetLanguage: options.targetLanguage || settings.defaultTargetLanguage,
        items,
      },
      settings,
    );
    await this.applyTranslations(result.items);
    if (Number.isFinite(result.costToman)) {
      this.onlineCostToman += result.costToman ?? 0;
      this.emitOnlineCost();
    }
  }

  private async translateBatchWithRetry(
    batch: TranslationBatch,
    settings: Awaited<ReturnType<typeof getSettings>>,
  ): Promise<TranslationBatchResult> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= TRANSLATION_RETRY_ATTEMPTS; attempt += 1) {
      if (this.translationCancelled) throw new Error("Translation stopped.");

      try {
        return await translateBatch(batch, settings);
      } catch (error) {
        lastError = error;
        if (attempt === TRANSLATION_RETRY_ATTEMPTS) break;
        this.sendProgress({
          completed: 0,
          total: batch.items.length,
          message: `Retrying batch ${attempt + 1} / ${TRANSLATION_RETRY_ATTEMPTS}...`,
        });
        await delay(500 * attempt);
      }
    }

    throw lastError;
  }

  private async collectPickedElementTextNodes(token: string): Promise<TranslationItem[]> {
    if (!this.view) return [];

    const script = `
      (() => {
        const token = ${JSON.stringify(token)};
        if (window.__mirrowInstantItemsByToken instanceof Map && window.__mirrowInstantItemsByToken.has(token)) {
          const items = window.__mirrowInstantItemsByToken.get(token) || [];
          window.__mirrowInstantItemsByToken.delete(token);
          return items;
        }
        const root = Array.from(document.querySelectorAll("[data-mirrow-live-pick-id]"))
          .find((node) => node.dataset.mirrowLivePickId === token);
        if (!root || root.dataset.mirrowTranslated === "true" || root.dataset.mirrowPending === "true") return [];
        root.dataset.mirrowPending = "true";

        function isVisibleElement(el) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0;
        }

        function shouldSkipElement(el) {
          const tag = el.tagName.toLowerCase();
          if (el.closest(".mirrow-retranslate-button")) return true;
          if (el.closest(".mirrow-text-skeleton")) return true;
          return [
            "script", "style", "noscript", "svg", "canvas", "input",
            "textarea", "code", "pre", "iframe", "select", "option", "button"
          ].includes(tag);
        }

        function nearestTextBlock(el) {
          let current = el;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const tag = current.tagName.toLowerCase();
            if (
              ["p", "li", "article", "section", "header", "footer", "main", "aside", "nav", "blockquote", "figcaption", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag) ||
              ["block", "list-item", "table-cell", "flex", "grid"].includes(style.display)
            ) {
              return current;
            }
            current = current.parentElement;
          }
          return el;
        }

        function forceSkeletonHost(el) {
          if (!el) return;
          el.classList.add("mirrow-skeleton-host");
          el.setAttribute("dir", "rtl");
          el.style.setProperty("direction", "rtl", "important");
          el.style.setProperty("text-align", "right", "important");
          el.style.setProperty("unicode-bidi", "plaintext", "important");
        }

        const items = [];
        const nodeMap = window.__mirrowNodeMap instanceof Map ? window.__mirrowNodeMap : new Map();
        const sourceTextMap = window.__mirrowSourceTextMap instanceof Map ? window.__mirrowSourceTextMap : new Map();
        const handledBlocks = new Set();
        let counter = nodeMap.size;
        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              const text = node.textContent ? node.textContent.trim() : "";
              if (!text) return NodeFilter.FILTER_REJECT;
              if (text.length <= 1 && !/[A-Za-z0-9\\u0600-\\u06FF]/.test(text)) {
                return NodeFilter.FILTER_REJECT;
              }
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              if (parent.closest("[data-mirrow-skip='true']")) return NodeFilter.FILTER_REJECT;
              if (parent.closest("[data-mirrow-translated='true']")) return NodeFilter.FILTER_REJECT;
              if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
              if (!isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        const blocksToSkeleton = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const parent = node.parentElement;
          if (!parent) continue;
          const block = nearestTextBlock(parent);
          if (!block || handledBlocks.has(block)) continue;
          const text = block.textContent ? block.textContent.trim().replace(/\\s+/g, " ") : "";
          if (!text) continue;
          const id = "t_" + counter++;
          handledBlocks.add(block);
          nodeMap.set(id, block);
          sourceTextMap.set(id, text);
          block.__mirrowOriginalText = text;
          items.push({ id, text });
          blocksToSkeleton.push({ id, text, block });
        }

        for (const { id, text, block } of blocksToSkeleton) {
          forceSkeletonHost(block);
          if (!document.querySelector('[data-mirrow-skeleton-for="' + CSS.escape(id) + '"]')) {
            const skeleton = document.createElement("span");
            skeleton.dataset.mirrowSkeletonFor = id;
            skeleton.className = "mirrow-text-skeleton";
            skeleton.setAttribute("dir", "rtl");
            skeleton.textContent = " ";
            const width = Math.max(36, Math.min(420, text.length * 7));
            skeleton.style.setProperty("--mirrow-skeleton-width", width + "px");
            block.textContent = "";
            block.appendChild(skeleton);
          }
        }

        window.__mirrowNodeMap = nodeMap;
        window.__mirrowSourceTextMap = sourceTextMap;
        if (!items.length) {
          root.removeAttribute("data-mirrow-pending");
        }
        return items;
      })();
    `;

    return (await this.view.webContents.executeJavaScript(script, true)) ?? [];
  }

  private async applyRetranslationSkeleton(ids: string[]) {
    if (!this.view) return;

    const script = `
      (() => {
        const ids = ${JSON.stringify(ids)};
        const nodeMap = window.__mirrowNodeMap;
        if (!nodeMap) return 0;

        function nearestTextBlock(el) {
          let current = el;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const tag = current.tagName.toLowerCase();
            if (
              ["p", "li", "article", "section", "header", "footer", "main", "aside", "nav", "blockquote", "figcaption", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag) ||
              ["block", "list-item", "table-cell", "flex", "grid"].includes(style.display)
            ) {
              return current;
            }
            current = current.parentElement;
          }
          return el;
        }

        function forceSkeletonHost(el) {
          if (!el) return;
          el.classList.add("mirrow-skeleton-host");
          el.setAttribute("dir", "rtl");
          el.style.setProperty("direction", "rtl", "important");
          el.style.setProperty("text-align", "right", "important");
          el.style.setProperty("unicode-bidi", "plaintext", "important");
        }

        let count = 0;
        for (const id of ids) {
          const target = nodeMap.get(id);
          if (!target) continue;
          const isElementUnit = target.nodeType === Node.ELEMENT_NODE;
          const host = isElementUnit ? target : target.parentElement;
          if (!host) continue;
          const block = nearestTextBlock(host);
          forceSkeletonHost(host);
          forceSkeletonHost(block);
          block.querySelectorAll(".mirrow-retranslate-button").forEach((button) => {
            button.disabled = true;
            button.style.opacity = ".55";
            button.style.pointerEvents = "none";
          });

          let skeleton = document.querySelector('[data-mirrow-skeleton-for="' + CSS.escape(id) + '"]');
          if (!skeleton) {
            skeleton = document.createElement("span");
            skeleton.dataset.mirrowSkeletonFor = id;
            skeleton.className = "mirrow-text-skeleton";
            skeleton.setAttribute("dir", "rtl");
            skeleton.textContent = " ";
            if (isElementUnit) {
              host.textContent = "";
              host.appendChild(skeleton);
            } else {
              host.insertBefore(skeleton, target.nextSibling);
            }
          }
          const sourceText = (
            window.__mirrowSourceTextMap && window.__mirrowSourceTextMap.get(id) ||
            target.__mirrowOriginalText ||
            target.textContent ||
            ""
          );
          const width = Math.max(36, Math.min(420, sourceText.trim().length * 7));
          skeleton.style.setProperty("--mirrow-skeleton-width", width + "px");
          if (!isElementUnit) target.textContent = "";
          count += 1;
        }
        return count;
      })();
    `;
    await this.view.webContents.executeJavaScript(script, true);
  }

  private async collectVisibleTextNodes(selectedOnly: boolean): Promise<TranslationItem[]> {
    const script = `
      (() => {
        const selectedOnly = ${JSON.stringify(selectedOnly)};
        function isVisibleElement(el) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0;
        }

        function shouldSkipElement(el) {
          const tag = el.tagName.toLowerCase();
          if (el.closest(".mirrow-retranslate-button")) return true;
          return [
            "script", "style", "noscript", "svg", "canvas", "input",
            "textarea", "code", "pre", "iframe", "select", "option", "button"
          ].includes(tag);
        }

        function nearestTextBlock(el) {
          let current = el;
          while (current && current !== document.body) {
            const tag = current.tagName.toLowerCase();
            if (["p", "li", "blockquote", "figcaption", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
              return current;
            }
            current = current.parentElement;
          }
          return el;
        }

        const items = [];
        const nodeMap = window.__mirrowNodeMap instanceof Map ? window.__mirrowNodeMap : new Map();
        const sourceTextMap = window.__mirrowSourceTextMap instanceof Map ? window.__mirrowSourceTextMap : new Map();
        const handledBlocks = new Set();
        let counter = nodeMap.size;
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              const text = node.textContent ? node.textContent.trim() : "";
        if (!text) return NodeFilter.FILTER_REJECT;
              if (text.length <= 1 && !/[A-Za-z0-9\\u0600-\\u06FF]/.test(text)) {
                return NodeFilter.FILTER_REJECT;
              }
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              if (parent.closest("[data-mirrow-skip='true']")) return NodeFilter.FILTER_REJECT;
              if (parent.closest("[data-mirrow-translated='true']")) return NodeFilter.FILTER_REJECT;
              if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
              if (!isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        while (walker.nextNode()) {
          const node = walker.currentNode;
          const parent = node.parentElement;
          if (selectedOnly && (!parent || !parent.closest("[data-mirrow-include='true']"))) continue;
          const block = parent ? nearestTextBlock(parent) : parent;
          if (!block || handledBlocks.has(block)) continue;
          const text = block.textContent ? block.textContent.trim().replace(/\\s+/g, " ") : "";
          if (!text) continue;
          const id = "t_" + counter++;
          handledBlocks.add(block);
          nodeMap.set(id, block);
          sourceTextMap.set(id, text);
          block.__mirrowOriginalText = text;
          items.push({ id, text });
        }

        window.__mirrowNodeMap = nodeMap;
        window.__mirrowSourceTextMap = sourceTextMap;
        return items;
      })();
    `;

    return (await this.view?.webContents.executeJavaScript(script, true)) ?? [];
  }

  private async applyTranslations(items: Array<{ id: string; translation: string }>) {
    const script = `
      (() => {
        const translations = ${JSON.stringify(items)};
        const styleId = "mirrow-vazirmatn-font";
        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement("style");
          style.id = styleId;
          document.head.appendChild(style);
        }
        style.textContent = [
          "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap');",
          ".mirrow-persian-text{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;font-family:Vazirmatn,Vazir,Tahoma,Arial,sans-serif!important;}",
          ".mirrow-retranslate-button{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;direction:ltr!important;text-align:center!important;}",
          ".mirrow-dimmed{opacity:.16!important;filter:saturate(.45)!important;transition:opacity .2s ease,filter .2s ease!important;}",
          ".mirrow-focus-target{opacity:1!important;filter:none!important;}",
          ".mirrow-pick-hover{background:rgba(56,189,248,.14)!important;box-shadow:inset 0 0 0 9999px rgba(56,189,248,.035)!important;transition:background .12s ease,box-shadow .12s ease!important;}",
          ".mirrow-instant-hover{outline:2px solid #8b5cf6!important;outline-offset:2px!important;background:rgba(139,92,246,.12)!important;}",
          ".mirrow-picked-preview{background:rgba(34,197,94,.12)!important;box-shadow:inset 0 0 0 9999px rgba(34,197,94,.04)!important;transition:background .16s ease,box-shadow .16s ease!important;}",
          ".mirrow-excluded-preview{opacity:.34!important;filter:saturate(.45)!important;transition:opacity .16s ease,filter .16s ease!important;}",
          ".mirrow-skeleton-host{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;}",
          ".mirrow-text-skeleton{display:block!important;width:var(--mirrow-skeleton-width,120px)!important;height:1em!important;min-height:14px!important;margin-left:auto!important;margin-right:0!important;border-radius:999px!important;background:linear-gradient(90deg,rgba(148,163,184,.18),rgba(148,163,184,.42),rgba(148,163,184,.18))!important;background-size:220% 100%!important;animation:mirrowSkeletonPulse 1.1s ease-in-out infinite!important;vertical-align:-.12em!important;}",
          "@keyframes mirrowSkeletonPulse{0%{background-position:220% 0}100%{background-position:-220% 0}}"
        ].join("\\n");
        const nodeMap = window.__mirrowNodeMap;
        if (!nodeMap) return 0;

        function nearestTextBlock(el) {
          let current = el;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const tag = current.tagName.toLowerCase();
            if (
              ["p", "li", "article", "section", "header", "footer", "main", "aside", "nav", "blockquote", "figcaption", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag) ||
              ["block", "list-item", "table-cell", "flex", "grid"].includes(style.display)
            ) {
              return current;
            }
            current = current.parentElement;
          }
          return el;
        }

        function forcePersianTypography(el) {
          if (!el) return;
          el.setAttribute("dir", "rtl");
          el.classList.add("mirrow-persian-text");
          el.style.setProperty("direction", "rtl", "important");
          el.style.setProperty("text-align", "right", "important");
          el.style.setProperty("unicode-bidi", "plaintext", "important");
          el.style.setProperty("font-family", "Vazirmatn, Vazir, Tahoma, Arial, sans-serif", "important");
        }

        function ensureRetranslateButton(el, id) {
          const host = nearestTextBlock(el);
          if (!host) return;

          const existingIds = (host.dataset.mirrowNodeIds || "")
            .split(",")
            .filter(Boolean);
          if (!existingIds.includes(id)) {
            existingIds.push(id);
            host.dataset.mirrowNodeIds = existingIds.join(",");
          }

          let button = Array.from(host.children).find((child) => child.classList.contains("mirrow-retranslate-button"));
          if (button) {
            button.disabled = false;
            button.style.removeProperty("opacity");
            button.style.removeProperty("pointer-events");
            return;
          }

          button = document.createElement("button");
          button.type = "button";
          button.className = "mirrow-retranslate-button";
          button.textContent = "↻";
          button.title = "Retranslate this part";
          button.style.cssText = [
            "display:inline-flex",
            "align-items:center",
            "justify-content:center",
            "width:28px",
            "height:28px",
            "padding:0",
            "margin-inline-start:8px",
            "float:inline-end",
            "clear:inline-end",
            "border-radius:6px",
            "border:1px solid rgba(139,92,246,.5)",
            "background:rgba(139,92,246,.16)",
            "color:#7c3aed",
            "font:600 16px system-ui",
            "cursor:pointer",
            "position:static",
            "vertical-align:baseline",
            "transform:none",
            "z-index:2147483647"
          ].join(";");
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            console.log("__MIRROW_RETRANSLATE__:" + (host.dataset.mirrowNodeIds || id));
          });
          host.appendChild(button);
        }

        function clearPickPreview(el) {
          let current = el;
          while (current && current !== document.body) {
            current.classList.remove("mirrow-picked-preview", "mirrow-focus-target", "mirrow-pick-hover", "mirrow-instant-hover");
            current.removeAttribute("data-mirrow-include");
            current.removeAttribute("data-mirrow-live-pick-id");
            current.removeAttribute("data-mirrow-pending");
            current = current.parentElement;
          }
        }

        let count = 0;
        for (const item of translations) {
          const target = nodeMap.get(item.id);
          if (target && item.translation) {
            const skeleton = document.querySelector('[data-mirrow-skeleton-for="' + CSS.escape(item.id) + '"]');
            if (skeleton) skeleton.remove();
            const isElementUnit = target.nodeType === Node.ELEMENT_NODE;
            const host = isElementUnit ? target : target.parentElement;
            if (host) host.textContent = item.translation;
            else target.textContent = item.translation;
            const block = host ? nearestTextBlock(host) : null;
            if (host) {
              host.dataset.mirrowTranslated = "true";
              host.classList.remove("mirrow-skeleton-host");
            }
            if (block) {
              block.dataset.mirrowTranslated = "true";
              block.classList.remove("mirrow-skeleton-host");
            }
            if (host) {
              clearPickPreview(host);
              clearPickPreview(block);
            }
            if (/[\u0600-\u06FF]/.test(item.translation) && host) {
              forcePersianTypography(host);
              forcePersianTypography(block);
              ensureRetranslateButton(host, item.id);
            }
            count += 1;
          }
        }
        return count;
      })();
    `;
    await this.view?.webContents.executeJavaScript(script, true);
  }

  private emitState() {
    this.window.webContents.send("browser:state", this.getState());
  }

  private async injectExclusionMode(enabled: boolean) {
    if (!this.view) return;

    const script = `
      (() => {
        if (window.__mirrowExclusionCleanup) {
          window.__mirrowExclusionCleanup();
          window.__mirrowExclusionCleanup = null;
        }

        document.documentElement.style.removeProperty("cursor");

        if (!${JSON.stringify(enabled)}) return false;

        function isIgnored(el) {
          if (!el ||
            el === document.documentElement ||
            el === document.body ||
            el.closest(".mirrow-retranslate-button") ||
            el.closest(".mirrow-text-skeleton") ||
            ["HTML", "BODY", "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"].includes(el.tagName)) {
            return true;
          }
          const block = nearestTextBlock(el);
          return !block || block.closest("[data-mirrow-translated='true']") || block.closest("[data-mirrow-pending='true']");
        }

        function shouldSkipElement(el) {
          const tag = el.tagName.toLowerCase();
          if (el.closest(".mirrow-retranslate-button")) return true;
          if (el.closest(".mirrow-text-skeleton")) return true;
          return [
            "script", "style", "noscript", "svg", "canvas", "input",
            "textarea", "code", "pre", "iframe", "select", "option", "button"
          ].includes(tag);
        }

        function isVisibleElement(el) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0;
        }

        function nearestTextBlock(el) {
          let current = el;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const tag = current.tagName.toLowerCase();
            if (
              ["p", "li", "article", "section", "header", "footer", "main", "aside", "nav", "blockquote", "figcaption", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag) ||
              ["block", "list-item", "table-cell", "flex", "grid"].includes(style.display)
            ) {
              return current;
            }
            current = current.parentElement;
          }
          return el;
        }

        function forceSkeletonHost(el) {
          if (!el) return;
          el.classList.add("mirrow-skeleton-host");
          el.setAttribute("dir", "rtl");
          el.style.setProperty("direction", "rtl", "important");
          el.style.setProperty("text-align", "right", "important");
          el.style.setProperty("unicode-bidi", "plaintext", "important");
        }

        function collectAndSkeleton(root, token) {
          if (!root || root.dataset.mirrowTranslated === "true" || root.dataset.mirrowPending === "true") return [];
          root.dataset.mirrowPending = "true";
          root.dataset.mirrowLivePickId = token;

          const items = [];
          const nodeMap = window.__mirrowNodeMap instanceof Map ? window.__mirrowNodeMap : new Map();
          const sourceTextMap = window.__mirrowSourceTextMap instanceof Map ? window.__mirrowSourceTextMap : new Map();
          const handledBlocks = new Set();
          let counter = nodeMap.size;
          const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode(node) {
                const text = node.textContent ? node.textContent.trim() : "";
                if (!text) return NodeFilter.FILTER_REJECT;
                if (text.length <= 1 && !/[A-Za-z0-9\\u0600-\\u06FF]/.test(text)) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest("[data-mirrow-skip='true']")) return NodeFilter.FILTER_REJECT;
                if (parent.closest("[data-mirrow-translated='true']")) return NodeFilter.FILTER_REJECT;
                if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
                if (!isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );

          const blocksToSkeleton = [];
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const parent = node.parentElement;
            if (!parent) continue;
            const block = nearestTextBlock(parent);
            if (!block || handledBlocks.has(block)) continue;
            const text = block.textContent ? block.textContent.trim().replace(/\\s+/g, " ") : "";
            if (!text) continue;
            const id = "t_" + counter++;
            handledBlocks.add(block);
            nodeMap.set(id, block);
            sourceTextMap.set(id, text);
            block.__mirrowOriginalText = text;
            items.push({ id, text });
            blocksToSkeleton.push({ id, text, block });
          }

          for (const { id, text, block } of blocksToSkeleton) {
            forceSkeletonHost(block);
            if (!document.querySelector('[data-mirrow-skeleton-for="' + CSS.escape(id) + '"]')) {
              const skeleton = document.createElement("span");
              skeleton.dataset.mirrowSkeletonFor = id;
              skeleton.className = "mirrow-text-skeleton";
              skeleton.setAttribute("dir", "rtl");
              skeleton.textContent = " ";
              const width = Math.max(36, Math.min(420, text.length * 7));
              skeleton.style.setProperty("--mirrow-skeleton-width", width + "px");
              block.textContent = "";
              block.appendChild(skeleton);
            }
          }

          window.__mirrowNodeMap = nodeMap;
          window.__mirrowSourceTextMap = sourceTextMap;
          window.__mirrowInstantItemsByToken = window.__mirrowInstantItemsByToken instanceof Map ? window.__mirrowInstantItemsByToken : new Map();
          window.__mirrowInstantItemsByToken.set(token, items);
          if (!items.length) root.removeAttribute("data-mirrow-pending");
          return items;
        }

        function onMouseOver(event) {
          const el = event.target;
          if (isIgnored(el)) return;
        }

        function onMouseOut(event) {
          const el = event.target;
          if (isIgnored(el)) return;
        }

        function onClick(event) {
          const el = event.target;
          if (isIgnored(el)) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          if (el.dataset.mirrowSkip === "true") {
            el.removeAttribute("data-mirrow-skip");
            el.classList.remove("mirrow-dimmed");
            el.classList.remove("mirrow-excluded-preview");
            el.style.removeProperty("outline");
            el.style.removeProperty("outline-offset");
            if (el.dataset.mirrowPreviousOpacity !== undefined) {
              el.style.opacity = el.dataset.mirrowPreviousOpacity;
              delete el.dataset.mirrowPreviousOpacity;
            } else {
              el.style.removeProperty("opacity");
            }
          } else {
            el.dataset.mirrowSkip = "true";
            el.classList.add("mirrow-excluded-preview");
            if (el.dataset.mirrowPreviousOpacity === undefined) {
              el.dataset.mirrowPreviousOpacity = el.style.opacity || "";
            }
            el.style.removeProperty("outline");
            el.style.removeProperty("outline-offset");
          }
        }

        document.documentElement.style.cursor = "crosshair";
        document.addEventListener("mouseover", onMouseOver, true);
        document.addEventListener("mouseout", onMouseOut, true);
        document.addEventListener("click", onClick, true);

        window.__mirrowExclusionCleanup = () => {
          document.documentElement.style.removeProperty("cursor");
          document.removeEventListener("mouseover", onMouseOver, true);
          document.removeEventListener("mouseout", onMouseOut, true);
          document.removeEventListener("click", onClick, true);
        };

        return true;
      })();
    `;

    await this.view.webContents.executeJavaScript(script, true);
  }

  private async injectSelectionMode(enabled: boolean) {
    if (!this.view) return;

    const script = `
      (() => {
        const styleId = "mirrow-vazirmatn-font";
        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement("style");
          style.id = styleId;
          document.head.appendChild(style);
        }
        style.textContent = [
          "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap');",
          ".mirrow-persian-text{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;font-family:Vazirmatn,Vazir,Tahoma,Arial,sans-serif!important;}",
          ".mirrow-retranslate-button{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;direction:ltr!important;text-align:center!important;}",
          ".mirrow-dimmed{opacity:.16!important;filter:saturate(.45)!important;transition:opacity .2s ease,filter .2s ease!important;}",
          ".mirrow-focus-target{opacity:1!important;filter:none!important;}",
          ".mirrow-pick-hover{outline:2px solid #38bdf8!important;outline-offset:2px!important;background:rgba(56,189,248,.10)!important;}",
          ".mirrow-instant-hover{outline:2px solid #8b5cf6!important;outline-offset:2px!important;background:rgba(139,92,246,.12)!important;}",
          ".mirrow-picked-preview{outline:2px solid #22c55e!important;outline-offset:2px!important;background:rgba(34,197,94,.12)!important;box-shadow:inset 0 0 0 9999px rgba(34,197,94,.04)!important;}",
          ".mirrow-excluded-preview{opacity:.34!important;filter:saturate(.45)!important;transition:opacity .16s ease,filter .16s ease!important;}",
          ".mirrow-skeleton-host{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;}",
          ".mirrow-text-skeleton{display:block!important;width:var(--mirrow-skeleton-width,120px)!important;height:1em!important;min-height:14px!important;margin-left:auto!important;margin-right:0!important;border-radius:999px!important;background:linear-gradient(90deg,rgba(148,163,184,.18),rgba(148,163,184,.42),rgba(148,163,184,.18))!important;background-size:220% 100%!important;animation:mirrowSkeletonPulse 1.1s ease-in-out infinite!important;vertical-align:-.12em!important;}",
          "@keyframes mirrowSkeletonPulse{0%{background-position:220% 0}100%{background-position:-220% 0}}"
        ].join("\\n");

        if (window.__mirrowSelectionCleanup) {
          window.__mirrowSelectionCleanup();
          window.__mirrowSelectionCleanup = null;
        }

        document.documentElement.style.removeProperty("cursor");

        if (!${JSON.stringify(enabled)}) return false;

        function isIgnored(el) {
          if (!el ||
            el === document.documentElement ||
            el === document.body ||
            el.closest(".mirrow-retranslate-button") ||
            el.closest(".mirrow-text-skeleton") ||
            ["HTML", "BODY", "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"].includes(el.tagName)) {
            return true;
          }
          const block = nearestTextBlock(el);
          return !block || block.closest("[data-mirrow-translated='true']") || block.closest("[data-mirrow-pending='true']");
        }

        function isVisibleElement(el) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0;
        }

        function shouldSkipElement(el) {
          const tag = el.tagName.toLowerCase();
          if (el.closest(".mirrow-retranslate-button")) return true;
          if (el.closest(".mirrow-text-skeleton")) return true;
          return [
            "script", "style", "noscript", "svg", "canvas", "input",
            "textarea", "code", "pre", "iframe", "select", "option", "button"
          ].includes(tag);
        }

        function nearestTextBlock(el) {
          let current = el;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const tag = current.tagName.toLowerCase();
            if (
              ["p", "li", "article", "section", "header", "footer", "main", "aside", "nav", "blockquote", "figcaption", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag) ||
              ["block", "list-item", "table-cell", "flex", "grid"].includes(style.display)
            ) {
              return current;
            }
            current = current.parentElement;
          }
          return el;
        }

        function forceSkeletonHost(el) {
          if (!el) return;
          el.classList.add("mirrow-skeleton-host");
          el.setAttribute("dir", "rtl");
          el.style.setProperty("direction", "rtl", "important");
          el.style.setProperty("text-align", "right", "important");
          el.style.setProperty("unicode-bidi", "plaintext", "important");
        }

        function collectAndSkeleton(root, token) {
          if (!root || root.dataset.mirrowTranslated === "true" || root.dataset.mirrowPending === "true") return [];
          root.dataset.mirrowPending = "true";
          root.dataset.mirrowLivePickId = token;

          const items = [];
          const nodeMap = window.__mirrowNodeMap instanceof Map ? window.__mirrowNodeMap : new Map();
          const sourceTextMap = window.__mirrowSourceTextMap instanceof Map ? window.__mirrowSourceTextMap : new Map();
          const handledBlocks = new Set();
          let counter = nodeMap.size;
          const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode(node) {
                const text = node.textContent ? node.textContent.trim() : "";
                if (!text) return NodeFilter.FILTER_REJECT;
                if (text.length <= 1 && !/[A-Za-z0-9\\u0600-\\u06FF]/.test(text)) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest("[data-mirrow-skip='true']")) return NodeFilter.FILTER_REJECT;
                if (parent.closest("[data-mirrow-translated='true']")) return NodeFilter.FILTER_REJECT;
                if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
                if (!isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );

          const blocksToSkeleton = [];
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const parent = node.parentElement;
            if (!parent) continue;
            const block = nearestTextBlock(parent);
            if (!block || handledBlocks.has(block)) continue;
            const text = block.textContent ? block.textContent.trim().replace(/\\s+/g, " ") : "";
            if (!text) continue;
            const id = "t_" + counter++;
            handledBlocks.add(block);
            nodeMap.set(id, block);
            sourceTextMap.set(id, text);
            block.__mirrowOriginalText = text;
            items.push({ id, text });
            blocksToSkeleton.push({ id, text, block });
          }

          for (const { id, text, block } of blocksToSkeleton) {
            forceSkeletonHost(block);
            if (!document.querySelector('[data-mirrow-skeleton-for="' + CSS.escape(id) + '"]')) {
              const skeleton = document.createElement("span");
              skeleton.dataset.mirrowSkeletonFor = id;
              skeleton.className = "mirrow-text-skeleton";
              skeleton.setAttribute("dir", "rtl");
              skeleton.textContent = " ";
              const width = Math.max(36, Math.min(420, text.length * 7));
              skeleton.style.setProperty("--mirrow-skeleton-width", width + "px");
              block.textContent = "";
              block.appendChild(skeleton);
            }
          }

          window.__mirrowNodeMap = nodeMap;
          window.__mirrowSourceTextMap = sourceTextMap;
          window.__mirrowInstantItemsByToken = window.__mirrowInstantItemsByToken instanceof Map ? window.__mirrowInstantItemsByToken : new Map();
          window.__mirrowInstantItemsByToken.set(token, items);
          if (!items.length) root.removeAttribute("data-mirrow-pending");
          return items;
        }

        function onMouseOver(event) {
          const el = event.target;
          if (isIgnored(el) || el.dataset.mirrowInclude === "true") return;
          el.classList.add("mirrow-pick-hover");
        }

        function onMouseOut(event) {
          const el = event.target;
          if (isIgnored(el)) return;
          el.classList.remove("mirrow-pick-hover");
        }

        function onClick(event) {
          const el = event.target;
          if (isIgnored(el)) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          if (el.dataset.mirrowInclude === "true") {
            el.removeAttribute("data-mirrow-include");
            el.removeAttribute("data-mirrow-live-pick-id");
            el.removeAttribute("data-mirrow-pending");
            el.classList.remove("mirrow-focus-target");
            el.classList.remove("mirrow-picked-preview");
            el.classList.remove("mirrow-pick-hover");
          } else {
            el.dataset.mirrowInclude = "true";
            const token = (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) || String(Date.now()) + "_" + Math.random().toString(36).slice(2);
            el.dataset.mirrowLivePickId = token;
            el.classList.add("mirrow-focus-target");
            el.classList.add("mirrow-picked-preview");
            el.classList.remove("mirrow-pick-hover");
            console.log("__MIRROW_PICK_TRANSLATE__:" + token);
          }
        }

        document.documentElement.style.cursor = "copy";
        document.addEventListener("mouseover", onMouseOver, true);
        document.addEventListener("mouseout", onMouseOut, true);
        document.addEventListener("click", onClick, true);

        window.__mirrowSelectionCleanup = () => {
          document.documentElement.style.removeProperty("cursor");
          document.removeEventListener("mouseover", onMouseOver, true);
          document.removeEventListener("mouseout", onMouseOut, true);
          document.removeEventListener("click", onClick, true);
        };

        return true;
      })();
    `;

    await this.view.webContents.executeJavaScript(script, true);
  }

  private async injectInstantTranslateMode(enabled: boolean) {
    if (!this.view) return;

    const script = `
      (() => {
        const styleId = "mirrow-vazirmatn-font";
        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement("style");
          style.id = styleId;
          document.head.appendChild(style);
        }
        style.textContent = [
          "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap');",
          ".mirrow-persian-text{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;font-family:Vazirmatn,Vazir,Tahoma,Arial,sans-serif!important;}",
          ".mirrow-retranslate-button{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;direction:ltr!important;text-align:center!important;}",
          ".mirrow-dimmed{opacity:.16!important;filter:saturate(.45)!important;transition:opacity .2s ease,filter .2s ease!important;}",
          ".mirrow-focus-target{opacity:1!important;filter:none!important;}",
          ".mirrow-instant-hover{outline:2px solid #8b5cf6!important;outline-offset:2px!important;background:rgba(139,92,246,.12)!important;}",
          ".mirrow-skeleton-host{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;}",
          ".mirrow-text-skeleton{display:block!important;width:var(--mirrow-skeleton-width,120px)!important;height:1em!important;min-height:14px!important;margin-left:auto!important;margin-right:0!important;border-radius:999px!important;background:linear-gradient(90deg,rgba(148,163,184,.18),rgba(148,163,184,.42),rgba(148,163,184,.18))!important;background-size:220% 100%!important;animation:mirrowSkeletonPulse 1.1s ease-in-out infinite!important;vertical-align:-.12em!important;}",
          "@keyframes mirrowSkeletonPulse{0%{background-position:220% 0}100%{background-position:-220% 0}}"
        ].join("\\n");

        if (window.__mirrowInstantCleanup) {
          window.__mirrowInstantCleanup();
          window.__mirrowInstantCleanup = null;
        }

        document.documentElement.style.removeProperty("cursor");
        document.querySelectorAll(".mirrow-instant-hover").forEach((node) => node.classList.remove("mirrow-instant-hover"));

        if (!${JSON.stringify(enabled)}) return false;

        function isIgnored(el) {
          if (!el ||
            el === document.documentElement ||
            el === document.body ||
            el.closest(".mirrow-retranslate-button") ||
            el.closest(".mirrow-text-skeleton") ||
            ["HTML", "BODY", "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"].includes(el.tagName)) {
            return true;
          }
          const block = nearestTextBlock(el);
          return !block || block.closest("[data-mirrow-translated='true']") || block.closest("[data-mirrow-pending='true']");
        }

        function isVisibleElement(el) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0;
        }

        function shouldSkipElement(el) {
          const tag = el.tagName.toLowerCase();
          if (el.closest(".mirrow-retranslate-button")) return true;
          if (el.closest(".mirrow-text-skeleton")) return true;
          return [
            "script", "style", "noscript", "svg", "canvas", "input",
            "textarea", "code", "pre", "iframe", "select", "option", "button"
          ].includes(tag);
        }

        function nearestTextBlock(el) {
          let current = el;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const tag = current.tagName.toLowerCase();
            if (
              ["p", "li", "article", "section", "header", "footer", "main", "aside", "nav", "blockquote", "figcaption", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag) ||
              ["block", "list-item", "table-cell", "flex", "grid"].includes(style.display)
            ) {
              return current;
            }
            current = current.parentElement;
          }
          return el;
        }

        function forceSkeletonHost(el) {
          if (!el) return;
          el.classList.add("mirrow-skeleton-host");
          el.setAttribute("dir", "rtl");
          el.style.setProperty("direction", "rtl", "important");
          el.style.setProperty("text-align", "right", "important");
          el.style.setProperty("unicode-bidi", "plaintext", "important");
        }

        function collectAndSkeleton(root, token) {
          if (!root || root.dataset.mirrowTranslated === "true" || root.dataset.mirrowPending === "true") return [];
          root.dataset.mirrowPending = "true";
          root.dataset.mirrowLivePickId = token;

          const items = [];
          const nodeMap = window.__mirrowNodeMap instanceof Map ? window.__mirrowNodeMap : new Map();
          const sourceTextMap = window.__mirrowSourceTextMap instanceof Map ? window.__mirrowSourceTextMap : new Map();
          const handledBlocks = new Set();
          let counter = nodeMap.size;
          const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode(node) {
                const text = node.textContent ? node.textContent.trim() : "";
                if (!text) return NodeFilter.FILTER_REJECT;
                if (text.length <= 1 && !/[A-Za-z0-9\\u0600-\\u06FF]/.test(text)) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest("[data-mirrow-skip='true']")) return NodeFilter.FILTER_REJECT;
                if (parent.closest("[data-mirrow-translated='true']")) return NodeFilter.FILTER_REJECT;
                if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
                if (!isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );

          const blocksToSkeleton = [];
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const parent = node.parentElement;
            if (!parent) continue;
            const block = nearestTextBlock(parent);
            if (!block || handledBlocks.has(block)) continue;
            const text = block.textContent ? block.textContent.trim().replace(/\\s+/g, " ") : "";
            if (!text) continue;
            const id = "t_" + counter++;
            handledBlocks.add(block);
            nodeMap.set(id, block);
            sourceTextMap.set(id, text);
            block.__mirrowOriginalText = text;
            items.push({ id, text });
            blocksToSkeleton.push({ id, text, block });
          }

          for (const { id, text, block } of blocksToSkeleton) {
            forceSkeletonHost(block);
            if (!document.querySelector('[data-mirrow-skeleton-for="' + CSS.escape(id) + '"]')) {
              const skeleton = document.createElement("span");
              skeleton.dataset.mirrowSkeletonFor = id;
              skeleton.className = "mirrow-text-skeleton";
              skeleton.setAttribute("dir", "rtl");
              skeleton.textContent = " ";
              const width = Math.max(36, Math.min(420, text.length * 7));
              skeleton.style.setProperty("--mirrow-skeleton-width", width + "px");
              block.textContent = "";
              block.appendChild(skeleton);
            }
          }

          window.__mirrowNodeMap = nodeMap;
          window.__mirrowSourceTextMap = sourceTextMap;
          window.__mirrowInstantItemsByToken = window.__mirrowInstantItemsByToken instanceof Map ? window.__mirrowInstantItemsByToken : new Map();
          window.__mirrowInstantItemsByToken.set(token, items);
          if (!items.length) root.removeAttribute("data-mirrow-pending");
          return items;
        }

        function onMouseOver(event) {
          const el = event.target;
          if (isIgnored(el)) return;
          nearestTextBlock(el).classList.add("mirrow-instant-hover");
        }

        function onMouseOut(event) {
          const el = event.target;
          if (isIgnored(el)) return;
          nearestTextBlock(el).classList.remove("mirrow-instant-hover");
        }

        function onClick(event) {
          const el = event.target;
          if (isIgnored(el)) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          const token = (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) || String(Date.now()) + "_" + Math.random().toString(36).slice(2);
          const block = nearestTextBlock(el);
          block.classList.remove("mirrow-instant-hover");
          const items = collectAndSkeleton(block, token);
          if (!items.length) return;
          console.log("__MIRROW_INSTANT_TRANSLATE__:" + token);
        }

        document.documentElement.style.cursor = "copy";
        document.addEventListener("mouseover", onMouseOver, true);
        document.addEventListener("mouseout", onMouseOut, true);
        document.addEventListener("click", onClick, true);

        window.__mirrowInstantCleanup = () => {
          document.documentElement.style.removeProperty("cursor");
          document.querySelectorAll(".mirrow-instant-hover").forEach((node) => node.classList.remove("mirrow-instant-hover"));
          document.removeEventListener("mouseover", onMouseOver, true);
          document.removeEventListener("mouseout", onMouseOut, true);
          document.removeEventListener("click", onClick, true);
        };

        return true;
      })();
    `;

    await this.view.webContents.executeJavaScript(script, true);
  }

  private async applyTranslationFocus(selectedOnly: boolean, items: TranslationItem[]) {
    if (!this.view) return;

    const script = `
      (() => {
        const styleId = "mirrow-vazirmatn-font";
        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement("style");
          style.id = styleId;
          document.head.appendChild(style);
        }
        style.textContent = [
          "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap');",
          ".mirrow-persian-text{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;font-family:Vazirmatn,Vazir,Tahoma,Arial,sans-serif!important;}",
          ".mirrow-retranslate-button{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;direction:ltr!important;text-align:center!important;}",
          ".mirrow-dimmed{opacity:.16!important;filter:saturate(.45)!important;transition:opacity .2s ease,filter .2s ease!important;}",
          ".mirrow-focus-target{opacity:1!important;filter:none!important;}",
          ".mirrow-pick-hover{background:rgba(56,189,248,.14)!important;box-shadow:inset 0 0 0 9999px rgba(56,189,248,.035)!important;transition:background .12s ease,box-shadow .12s ease!important;}",
          ".mirrow-instant-hover{outline:2px solid #8b5cf6!important;outline-offset:2px!important;background:rgba(139,92,246,.12)!important;}",
          ".mirrow-picked-preview{background:rgba(34,197,94,.12)!important;box-shadow:inset 0 0 0 9999px rgba(34,197,94,.04)!important;transition:background .16s ease,box-shadow .16s ease!important;}",
          ".mirrow-excluded-preview{opacity:.34!important;filter:saturate(.45)!important;transition:opacity .16s ease,filter .16s ease!important;}",
          ".mirrow-skeleton-host{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;}",
          ".mirrow-text-skeleton{display:block!important;width:var(--mirrow-skeleton-width,120px)!important;height:1em!important;min-height:14px!important;margin-left:auto!important;margin-right:0!important;border-radius:999px!important;background:linear-gradient(90deg,rgba(148,163,184,.18),rgba(148,163,184,.42),rgba(148,163,184,.18))!important;background-size:220% 100%!important;animation:mirrowSkeletonPulse 1.1s ease-in-out infinite!important;vertical-align:-.12em!important;}",
          "@keyframes mirrowSkeletonPulse{0%{background-position:220% 0}100%{background-position:-220% 0}}"
        ].join("\\n");

        document.querySelectorAll(".mirrow-dimmed").forEach((el) => el.classList.remove("mirrow-dimmed"));

        const itemIds = ${JSON.stringify(items.map((item) => item.id))};

        function nearestTextBlock(el) {
          let current = el;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const tag = current.tagName.toLowerCase();
            if (
              ["p", "li", "article", "section", "header", "footer", "main", "aside", "nav", "blockquote", "figcaption", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag) ||
              ["block", "list-item", "table-cell", "flex", "grid"].includes(style.display)
            ) {
              return current;
            }
            current = current.parentElement;
          }
          return el;
        }

        function forceSkeletonHost(el) {
          if (!el) return;
          el.classList.add("mirrow-skeleton-host");
          el.setAttribute("dir", "rtl");
          el.style.setProperty("direction", "rtl", "important");
          el.style.setProperty("text-align", "right", "important");
          el.style.setProperty("unicode-bidi", "plaintext", "important");
        }

        function addSkeletons() {
          const nodeMap = window.__mirrowNodeMap;
          if (!nodeMap) return;
          for (const id of itemIds) {
            const target = nodeMap.get(id);
            if (!target) continue;
            if (document.querySelector('[data-mirrow-skeleton-for="' + CSS.escape(id) + '"]')) continue;
            const isElementUnit = target.nodeType === Node.ELEMENT_NODE;
            const host = isElementUnit ? target : target.parentElement;
            if (!host) continue;
            const text = (window.__mirrowSourceTextMap && window.__mirrowSourceTextMap.get(id)) || target.__mirrowOriginalText || target.textContent || "";
            const skeleton = document.createElement("span");
            skeleton.dataset.mirrowSkeletonFor = id;
            skeleton.className = "mirrow-text-skeleton";
            skeleton.setAttribute("dir", "rtl");
            skeleton.textContent = " ";
            const width = Math.max(36, Math.min(420, text.trim().length * 7));
            skeleton.style.setProperty("--mirrow-skeleton-width", width + "px");
            const block = nearestTextBlock(host);
            forceSkeletonHost(host);
            forceSkeletonHost(block);
            if (isElementUnit) {
              target.textContent = "";
              target.appendChild(skeleton);
            } else {
              host.insertBefore(skeleton, target.nextSibling);
              target.textContent = "";
            }
          }
        }

        if (${JSON.stringify(selectedOnly)}) {
          const selected = new Set(Array.from(document.querySelectorAll("[data-mirrow-include='true']")));
          for (const child of Array.from(document.body.children)) {
            const containsSelected = Array.from(selected).some((node) => child === node || child.contains(node));
            if (!containsSelected) child.classList.add("mirrow-dimmed");
          }
          selected.forEach((node) => node.classList.add("mirrow-focus-target"));
          addSkeletons();
          return;
        }

        document.querySelectorAll("[data-mirrow-skip='true']").forEach((node) => node.classList.add("mirrow-dimmed"));
        addSkeletons();
      })();
    `;

    await this.view.webContents.executeJavaScript(script, true);
  }

  private sendProgress(progress: TranslationProgress) {
    this.window.webContents.send("translate:progress", progress);
  }

  private sendError(message: string) {
    this.window.webContents.send("translate:error", message);
  }

  private emitOnlineCost() {
    this.window.webContents.send("online-cost:update", this.getOnlineCost());
  }
}

export function normalizeUrl(rawUrl: string) {
  return resolveNavigationInput(rawUrl).url;
}

function sanitizeBounds(bounds: BrowserBounds): BrowserBounds {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  };
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const normalizedSize = Math.max(1, Math.round(size));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += normalizedSize) {
    chunks.push(items.slice(index, index + normalizedSize));
  }
  return chunks;
}

function resolveBatchSize(settings: { translationEngine: string; batchSize: number }) {
  if (settings.translationEngine === "local") {
    return Math.max(LOCAL_MIN_BATCH_SIZE, settings.batchSize);
  }
  return settings.batchSize;
}

function resolveTranslationConcurrency(engine: string) {
  if (engine === "local") return LOCAL_TRANSLATION_CONCURRENCY;
  if (engine === "google") return GOOGLE_TRANSLATION_CONCURRENCY;
  return ONLINE_TRANSLATION_CONCURRENCY;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isNavigationAbortError(error: unknown) {
  const message = readError(error);
  return message.includes("ERR_ABORTED") || message.includes("(-3)");
}
