import { BrowserView, BrowserWindow } from "electron";
import type {
  BrowserBounds,
  BrowserState,
  ExclusionModeState,
  SelectionModeState,
  TranslationComplete,
  TranslationItem,
  TranslationProgress,
  TranslatePageOptions,
} from "../shared/types.js";
import { addHistory } from "./history.js";
import { getSettings } from "./settings.js";
import { translateBatch } from "./translator.js";

const MIN_BROWSER_SIZE = 120;

export class BrowserController {
  private view: BrowserView | null = null;
  private bounds: BrowserBounds | null = null;
  private exclusionModeEnabled = false;
  private selectionModeEnabled = false;
  private onlineCostToman = 0;
  private translationCancelled = false;

  constructor(private readonly window: BrowserWindow) {}

  create() {
    if (this.view) return this.view;

    this.view = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        javascript: true,
      },
    });

    this.window.setBrowserView(this.view);
    this.view.setAutoResize({ width: false, height: false });
    this.view.webContents.setWindowOpenHandler(({ url }) => {
      this.loadUrl(url).catch((error: unknown) => this.sendError(readError(error)));
      return { action: "deny" };
    });

    this.view.webContents.on("did-start-loading", () => this.emitState());
    this.view.webContents.on("did-stop-loading", () => this.emitState());
    this.view.webContents.on("did-navigate", () => this.emitState());
    this.view.webContents.on("did-navigate-in-page", () => this.emitState());
    this.view.webContents.on("page-title-updated", () => this.emitState());
    this.view.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (code !== -3 && isMainFrame) this.sendError(`Website failed to load: ${description || url}`);
    });
    this.view.webContents.on("console-message", (_event, _level, message) => {
      if (!message.startsWith("__MIRROW_RETRANSLATE__:")) return;
      const id = message.slice("__MIRROW_RETRANSLATE__:".length).trim();
      this.retranslateNode(id).catch((error: unknown) => this.sendError(readError(error)));
    });

    if (this.bounds) this.setBounds(this.bounds);
    return this.view;
  }

  destroy() {
    if (!this.view) return;
    this.window.removeBrowserView(this.view);
    this.view.webContents.close();
    this.view = null;
  }

  setBounds(bounds: BrowserBounds) {
    this.bounds = sanitizeBounds(bounds);
    if (!this.view) this.create();
    if (this.bounds.width < MIN_BROWSER_SIZE || this.bounds.height < MIN_BROWSER_SIZE) {
      this.view?.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }
    this.view?.setBounds(this.bounds);
  }

  async loadUrl(rawUrl: string) {
    const view = this.create();
    const url = normalizeUrl(rawUrl);
    await view.webContents.loadURL(url);
    this.emitState();
    return this.getState();
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
    this.view?.webContents.reload();
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
    await this.injectExclusionMode(enabled);
    return { enabled };
  }

  async setSelectionMode(enabled: boolean): Promise<SelectionModeState> {
    this.selectionModeEnabled = enabled;
    if (enabled && this.exclusionModeEnabled) {
      this.exclusionModeEnabled = false;
      await this.injectExclusionMode(false);
    }
    await this.injectSelectionMode(enabled);
    return { enabled };
  }

  async clearExclusions() {
    const script = `
      (() => {
        const nodes = document.querySelectorAll("[data-mirrow-skip='true']");
        for (const node of nodes) {
          node.removeAttribute("data-mirrow-skip");
          node.classList.remove("mirrow-dimmed");
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
        const nodes = document.querySelectorAll("[data-mirrow-include='true']");
        for (const node of nodes) {
          node.removeAttribute("data-mirrow-include");
          node.classList.remove("mirrow-focus-target");
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
    return {
      url: contents?.getURL() ?? "",
      title: contents?.getTitle() ?? "",
      canGoBack: contents?.navigationHistory.canGoBack() ?? false,
      canGoForward: contents?.navigationHistory.canGoForward() ?? false,
      isLoading: contents?.isLoading() ?? false,
    };
  }

  async translatePage(options: TranslatePageOptions): Promise<TranslationComplete> {
    const view = this.view;
    if (!view || !view.webContents.getURL()) {
      throw new Error("Load a website before translating.");
    }
    this.translationCancelled = false;

    const items = await this.collectVisibleTextNodes(Boolean(options.selectedOnly));
    if (!items.length) {
      throw new Error("No visible text was found on this page.");
    }

    const settings = await getSettings();
    const batchSize = settings.batchSize;
    let completed = 0;
    let translatedCount = 0;
    let partialFailure = false;

    await this.applyTranslationFocus(Boolean(options.selectedOnly), items);

    for (let index = 0; index < items.length; index += batchSize) {
      if (this.translationCancelled) break;
      const batchItems = items.slice(index, index + batchSize);
      try {
        const result = await translateBatch(
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

    const wasCancelled = this.translationCancelled;
    this.translationCancelled = false;

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
            const text = node ? (node.textContent || "").trim() : "";
            if (text) items.push({ id, text });
          }
          return items;
        })();
      `,
      true,
    ) as TranslationItem[];

    if (!items.length) return;

    const settings = await getSettings();
    const result = await translateBatch(
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

        const items = [];
        const nodeMap = new Map();
        let counter = 0;
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
          const text = node.textContent ? node.textContent.trim() : "";
          if (!text) continue;
          const id = "t_" + counter++;
          nodeMap.set(id, node);
          items.push({ id, text });
        }

        window.__mirrowNodeMap = nodeMap;
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
        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = [
            "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap');",
            ".mirrow-persian-text{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;font-family:Vazirmatn,Vazir,Tahoma,Arial,sans-serif!important;}",
            ".mirrow-retranslate-button{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;direction:ltr!important;text-align:center!important;}",
            ".mirrow-dimmed{opacity:.16!important;filter:saturate(.45)!important;transition:opacity .2s ease,filter .2s ease!important;}",
            ".mirrow-focus-target{opacity:1!important;filter:none!important;}",
            ".mirrow-text-skeleton{display:inline-block!important;width:var(--mirrow-skeleton-width,120px)!important;height:1em!important;min-height:14px!important;border-radius:999px!important;background:linear-gradient(90deg,rgba(148,163,184,.18),rgba(148,163,184,.42),rgba(148,163,184,.18))!important;background-size:220% 100%!important;animation:mirrowSkeletonPulse 1.1s ease-in-out infinite!important;vertical-align:-.12em!important;}",
            "@keyframes mirrowSkeletonPulse{0%{background-position:220% 0}100%{background-position:-220% 0}}"
          ].join("\\n");
          document.head.appendChild(style);
        }
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
          if (button) return;

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

        let count = 0;
        for (const item of translations) {
          const node = nodeMap.get(item.id);
          if (node && item.translation) {
            node.textContent = item.translation;
            const skeleton = document.querySelector('[data-mirrow-skeleton-for="' + CSS.escape(item.id) + '"]');
            if (skeleton) skeleton.remove();
            if (/[\u0600-\u06FF]/.test(item.translation) && node.parentElement) {
              forcePersianTypography(node.parentElement);
              forcePersianTypography(nearestTextBlock(node.parentElement));
              ensureRetranslateButton(node.parentElement, item.id);
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
          return !el ||
            el === document.documentElement ||
            el === document.body ||
            el.closest(".mirrow-retranslate-button") ||
            ["HTML", "BODY", "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"].includes(el.tagName);
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
        if (window.__mirrowSelectionCleanup) {
          window.__mirrowSelectionCleanup();
          window.__mirrowSelectionCleanup = null;
        }

        document.documentElement.style.removeProperty("cursor");

        if (!${JSON.stringify(enabled)}) return false;

        function isIgnored(el) {
          return !el ||
            el === document.documentElement ||
            el === document.body ||
            el.closest(".mirrow-retranslate-button") ||
            ["HTML", "BODY", "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"].includes(el.tagName);
        }

        function onMouseOver(event) {
          const el = event.target;
          return;
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

          if (el.dataset.mirrowInclude === "true") {
            el.removeAttribute("data-mirrow-include");
            el.classList.remove("mirrow-focus-target");
          } else {
            el.dataset.mirrowInclude = "true";
            el.classList.add("mirrow-focus-target");
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

  private async applyTranslationFocus(selectedOnly: boolean, items: TranslationItem[]) {
    if (!this.view) return;

    const script = `
      (() => {
        const styleId = "mirrow-vazirmatn-font";
        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = [
            "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap');",
            ".mirrow-persian-text{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;font-family:Vazirmatn,Vazir,Tahoma,Arial,sans-serif!important;}",
            ".mirrow-retranslate-button{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;direction:ltr!important;text-align:center!important;}",
            ".mirrow-dimmed{opacity:.16!important;filter:saturate(.45)!important;transition:opacity .2s ease,filter .2s ease!important;}",
            ".mirrow-focus-target{opacity:1!important;filter:none!important;}"
          ].join("\\n");
          document.head.appendChild(style);
        }

        document.querySelectorAll(".mirrow-dimmed").forEach((el) => el.classList.remove("mirrow-dimmed"));

        const itemIds = ${JSON.stringify(items.map((item) => item.id))};

        function addSkeletons() {
          const nodeMap = window.__mirrowNodeMap;
          if (!nodeMap) return;
          for (const id of itemIds) {
            const node = nodeMap.get(id);
            if (!node || !node.parentElement) continue;
            if (document.querySelector('[data-mirrow-skeleton-for="' + CSS.escape(id) + '"]')) continue;
            const text = node.textContent || "";
            const skeleton = document.createElement("span");
            skeleton.dataset.mirrowSkeletonFor = id;
            skeleton.className = "mirrow-text-skeleton";
            skeleton.textContent = " ";
            const width = Math.max(36, Math.min(420, text.trim().length * 7));
            skeleton.style.setProperty("--mirrow-skeleton-width", width + "px");
            node.parentElement.insertBefore(skeleton, node.nextSibling);
            node.textContent = "";
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
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("Enter a URL first.");

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+(:\d+)?(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
  throw new Error("Invalid URL.");
}

function sanitizeBounds(bounds: BrowserBounds): BrowserBounds {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  };
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
