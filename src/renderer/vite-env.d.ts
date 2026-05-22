/// <reference types="vite/client" />

import type {
  AppSettings,
  BrowserBounds,
  BrowserState,
  ExclusionModeState,
  HistoryItem,
  LmStudioStatus,
  OnlineCostState,
  TranslationBatch,
  TranslationComplete,
  TranslationProgress,
  TranslatePageOptions,
} from "../shared/types";

declare global {
  interface Window {
    mirrow: {
      browser: {
        setBounds: (bounds: BrowserBounds) => Promise<void>;
        getState: () => Promise<BrowserState>;
        loadUrl: (url: string) => Promise<BrowserState>;
        goBack: () => Promise<BrowserState>;
        goForward: () => Promise<BrowserState>;
        reload: () => Promise<BrowserState>;
        setExclusionMode: (enabled: boolean) => Promise<ExclusionModeState>;
        clearExclusions: () => Promise<number>;
        onState: (callback: (state: BrowserState) => void) => () => void;
      };
      translation: {
        start: (options: TranslatePageOptions) => Promise<TranslationComplete>;
        translateBatch: (batch: TranslationBatch) => Promise<unknown>;
        onProgress: (callback: (progress: TranslationProgress) => void) => () => void;
        onError: (callback: (message: string) => void) => () => void;
        onComplete: (callback: (payload: TranslationComplete) => void) => () => void;
      };
      settings: {
        get: () => Promise<AppSettings>;
        update: (settings: Partial<AppSettings>) => Promise<AppSettings>;
      };
      history: {
        get: () => Promise<HistoryItem[]>;
        add: (item: HistoryItem) => Promise<HistoryItem[]>;
        clear: () => Promise<HistoryItem[]>;
      };
      lmStudio: {
        checkConnection: () => Promise<LmStudioStatus>;
      };
      onlineCost: {
        get: () => Promise<OnlineCostState>;
        reset: () => Promise<OnlineCostState>;
        onUpdate: (callback: (state: OnlineCostState) => void) => () => void;
      };
    };
  }
}
