import type { AppSettings } from "./types.js";

export const DEFAULT_SETTINGS: AppSettings = {
  translationEngine: "online",
  lmStudioBaseUrl: "http://localhost:1234/v1/chat/completions",
  modelName: "translategemma-4b-it",
  temperature: 0.2,
  batchSize: 20,
  defaultTargetLanguage: "Persian",
  onlineBaseUrl: "https://ai.liara.ir/api/6a0ccd2d298429714a4b3e25/v1",
  onlineModelName: "openai/gpt-4.1-mini",
  onlineApiKey: "",
};

export const LANGUAGE_OPTIONS = [
  { label: "Auto Detect", value: "auto" },
  { label: "Persian", value: "Persian" },
  { label: "English", value: "English" },
  { label: "Arabic", value: "Arabic" },
  { label: "Turkish", value: "Turkish" },
  { label: "French", value: "French" },
  { label: "German", value: "German" },
];

export const TRANSLATION_SYSTEM_PROMPT =
  "You are a precise website translation engine. Translate the provided visible website text into natural Persian. Preserve meaning, tone, numbers, punctuation, brand names, product names, URLs, placeholders, and formatting intent. Return only valid JSON with exactly this shape: {\"items\":[{\"id\":\"same id\",\"translation\":\"Persian translation\"}]}. Do not use markdown. Do not add explanations.";
