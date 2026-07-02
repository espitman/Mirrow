import { DEFAULT_SETTINGS } from "../shared/constants.js";
import type { AppSettings } from "../shared/types.js";
import { readJsonFile, writeJsonFile } from "./storage.js";

const SETTINGS_FILE = "settings.json";
const TRANSLATION_ENGINES = ["online", "openrouter", "google", "local"] as const;
const THEME_SOURCES = ["system", "light", "dark"] as const;

export async function getSettings(): Promise<AppSettings> {
  const stored = await readJsonFile<Partial<AppSettings>>(SETTINGS_FILE, {});
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...stored });
}

export async function updateSettings(next: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const settings = sanitizeSettings({ ...current, ...next });
  return writeJsonFile(SETTINGS_FILE, settings);
}

export function sanitizeSettings(settings: AppSettings): AppSettings {
  const enabled = sanitizeEnabledProviders(settings);
  const requestedEngine = TRANSLATION_ENGINES.includes(settings.translationEngine)
    ? settings.translationEngine
    : DEFAULT_SETTINGS.translationEngine;
  const translationEngine = isProviderEnabled(requestedEngine, enabled) ? requestedEngine : firstEnabledProvider(enabled);

  return {
    themeSource: THEME_SOURCES.includes(settings.themeSource) ? settings.themeSource : DEFAULT_SETTINGS.themeSource,
    translationEngine,
    ...enabled,
    lmStudioBaseUrl: String(settings.lmStudioBaseUrl || DEFAULT_SETTINGS.lmStudioBaseUrl),
    temperature: clampNumber(settings.temperature, 0, 2, DEFAULT_SETTINGS.temperature),
    batchSize: Math.round(clampNumber(settings.batchSize, 1, 80, DEFAULT_SETTINGS.batchSize)),
    defaultTargetLanguage: String(settings.defaultTargetLanguage || DEFAULT_SETTINGS.defaultTargetLanguage),
    onlineBaseUrl: String(settings.onlineBaseUrl || DEFAULT_SETTINGS.onlineBaseUrl),
    onlineModelName: String(settings.onlineModelName || DEFAULT_SETTINGS.onlineModelName),
    onlineApiKey: String(settings.onlineApiKey || DEFAULT_SETTINGS.onlineApiKey),
    openRouterBaseUrl: String(settings.openRouterBaseUrl || DEFAULT_SETTINGS.openRouterBaseUrl),
    openRouterModelName: String(settings.openRouterModelName || DEFAULT_SETTINGS.openRouterModelName),
    openRouterApiKey: String(settings.openRouterApiKey || DEFAULT_SETTINGS.openRouterApiKey),
    googleBaseUrl: String(settings.googleBaseUrl || DEFAULT_SETTINGS.googleBaseUrl),
    googleModelName: String(settings.googleModelName || DEFAULT_SETTINGS.googleModelName),
    googleApiKey: String(settings.googleApiKey || DEFAULT_SETTINGS.googleApiKey),
  };
}

function sanitizeEnabledProviders(settings: AppSettings) {
  const enabled = {
    onlineEnabled: booleanSetting(settings.onlineEnabled, DEFAULT_SETTINGS.onlineEnabled),
    openRouterEnabled: booleanSetting(settings.openRouterEnabled, DEFAULT_SETTINGS.openRouterEnabled),
    googleEnabled: booleanSetting(settings.googleEnabled, DEFAULT_SETTINGS.googleEnabled),
    localEnabled: booleanSetting(settings.localEnabled, DEFAULT_SETTINGS.localEnabled),
  };

  if (Object.values(enabled).some(Boolean)) return enabled;

  return {
    ...enabled,
    onlineEnabled: true,
  };
}

function booleanSetting(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isProviderEnabled(engine: AppSettings["translationEngine"], settings: Pick<AppSettings, "onlineEnabled" | "openRouterEnabled" | "googleEnabled" | "localEnabled">) {
  if (engine === "online") return settings.onlineEnabled;
  if (engine === "openrouter") return settings.openRouterEnabled;
  if (engine === "google") return settings.googleEnabled;
  return settings.localEnabled;
}

function firstEnabledProvider(settings: Pick<AppSettings, "onlineEnabled" | "openRouterEnabled" | "googleEnabled" | "localEnabled">): AppSettings["translationEngine"] {
  if (settings.onlineEnabled) return "online";
  if (settings.openRouterEnabled) return "openrouter";
  if (settings.googleEnabled) return "google";
  return "local";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
