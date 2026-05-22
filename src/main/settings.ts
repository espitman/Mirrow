import { DEFAULT_SETTINGS } from "../shared/constants.js";
import type { AppSettings } from "../shared/types.js";
import { readJsonFile, writeJsonFile } from "./storage.js";

const SETTINGS_FILE = "settings.json";

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
  const translationEngine = ["local", "online", "google"].includes(settings.translationEngine)
    ? settings.translationEngine
    : DEFAULT_SETTINGS.translationEngine;

  return {
    translationEngine,
    lmStudioBaseUrl: String(settings.lmStudioBaseUrl || DEFAULT_SETTINGS.lmStudioBaseUrl),
    modelName: String(settings.modelName || DEFAULT_SETTINGS.modelName),
    temperature: clampNumber(settings.temperature, 0, 2, DEFAULT_SETTINGS.temperature),
    batchSize: Math.round(clampNumber(settings.batchSize, 1, 80, DEFAULT_SETTINGS.batchSize)),
    defaultTargetLanguage: String(settings.defaultTargetLanguage || DEFAULT_SETTINGS.defaultTargetLanguage),
    onlineBaseUrl: String(settings.onlineBaseUrl || DEFAULT_SETTINGS.onlineBaseUrl),
    onlineModelName: String(settings.onlineModelName || DEFAULT_SETTINGS.onlineModelName),
    onlineApiKey: String(settings.onlineApiKey || DEFAULT_SETTINGS.onlineApiKey),
    googleBaseUrl: String(settings.googleBaseUrl || DEFAULT_SETTINGS.googleBaseUrl),
    googleModelName: String(settings.googleModelName || DEFAULT_SETTINGS.googleModelName),
    googleApiKey: String(settings.googleApiKey || DEFAULT_SETTINGS.googleApiKey),
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
