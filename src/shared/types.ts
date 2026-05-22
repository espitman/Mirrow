export type LanguageCode = "auto" | "fa" | "en" | "ar" | "tr" | "fr" | "de";

export type TranslationItem = {
  id: string;
  text: string;
};

export type TranslationResultItem = {
  id: string;
  translation: string;
};

export type TranslationBatch = {
  targetLanguage: string;
  sourceLanguage?: string;
  items: TranslationItem[];
};

export type TranslationBatchResult = {
  items: TranslationResultItem[];
  costToman?: number;
};

export type AppSettings = {
  translationEngine: "local" | "online";
  lmStudioBaseUrl: string;
  modelName: string;
  temperature: number;
  batchSize: number;
  defaultTargetLanguage: string;
  onlineBaseUrl: string;
  onlineModelName: string;
  onlineApiKey: string;
};

export type HistoryItem = {
  id: string;
  url: string;
  title?: string;
  targetLanguage: string;
  translatedAt: string;
};

export type TranslatePageOptions = {
  sourceLanguage?: string;
  targetLanguage: string;
  selectedOnly?: boolean;
};

export type LmStudioStatus = {
  connected: boolean;
  message: string;
};

export type BrowserBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
};

export type TranslationProgress = {
  completed: number;
  total: number;
  message: string;
};

export type TranslationComplete = {
  translatedCount: number;
  total: number;
  url: string;
  title?: string;
};

export type ExclusionModeState = {
  enabled: boolean;
};

export type SelectionModeState = {
  enabled: boolean;
};

export type OnlineCostState = {
  totalToman: number;
};
