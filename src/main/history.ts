import type { HistoryItem } from "../shared/types.js";
import { readJsonFile, writeJsonFile } from "./storage.js";

const HISTORY_FILE = "history.json";

export async function getHistory(): Promise<HistoryItem[]> {
  const items = await readJsonFile<HistoryItem[]>(HISTORY_FILE, []);
  return Array.isArray(items) ? items : [];
}

export async function addHistory(item: HistoryItem): Promise<HistoryItem[]> {
  const current = await getHistory();
  const next = [sanitizeHistoryItem(item), ...current.filter((entry) => entry.url !== item.url)].slice(0, 100);
  return writeJsonFile(HISTORY_FILE, next);
}

export async function clearHistory(): Promise<HistoryItem[]> {
  return writeJsonFile(HISTORY_FILE, []);
}

function sanitizeHistoryItem(item: HistoryItem): HistoryItem {
  return {
    id: item.id || crypto.randomUUID(),
    url: String(item.url || ""),
    title: item.title ? String(item.title) : undefined,
    targetLanguage: String(item.targetLanguage || "Persian"),
    translatedAt: item.translatedAt || new Date().toISOString(),
  };
}
