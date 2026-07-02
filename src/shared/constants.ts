import type { AppSettings } from "./types.js";

export const DEFAULT_SETTINGS: AppSettings = {
  themeSource: "dark",
  translationEngine: "online",
  onlineEnabled: true,
  openRouterEnabled: true,
  googleEnabled: true,
  localEnabled: true,
  lmStudioBaseUrl: "http://localhost:1234/v1/chat/completions",
  temperature: 0.2,
  batchSize: 20,
  defaultTargetLanguage: "Persian",
  onlineBaseUrl: "https://ai.liara.ir/api/6a0ccd2d298429714a4b3e25/v1",
  onlineModelName: "openai/gpt-4.1-mini",
  onlineApiKey: "",
  openRouterBaseUrl: "https://openrouter.ai/api/v1",
  openRouterModelName: "google/gemma-4-31b-it:free",
  openRouterApiKey: "",
  googleBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  googleModelName: "gemini-flash-latest",
  googleApiKey: "",
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

export const LIARA_MODEL_OPTIONS = [
  { label: "GPT-5 Nano", value: "openai/gpt-5-nano" },
  { label: "GPT-5.4 Nano", value: "openai/gpt-5.4-nano" },
  { label: "GPT-5 Mini", value: "openai/gpt-5-mini" },
  { label: "GPT-4o Mini", value: "openai/gpt-4o-mini" },
  { label: "GPT-4.1 Mini", value: "openai/gpt-4.1-mini" },
  { label: "DeepSeek Chat V3 0324", value: "deepseek/deepseek-chat-v3-0324" },
  { label: "Mistral Nemo", value: "mistralai/mistral-nemo" },
  { label: "Gemini 3.1 Flash Lite", value: "google/gemini-3.1-flash-lite" },
  { label: "Gemini 2.5 Flash Lite", value: "google/gemini-2.5-flash-lite" },
];

export const OPENROUTER_MODEL_OPTIONS = [
  { label: "Gemma 4 31B IT Free", value: "google/gemma-4-31b-it:free" },
  { label: "GPT-4.1 Mini", value: "openai/gpt-4.1-mini" },
  { label: "Gemini 2.0 Flash Lite", value: "google/gemini-2.0-flash-lite-001" },
  { label: "Claude 3.5 Sonnet", value: "anthropic/claude-3.5-sonnet" },
];

export const TRANSLATION_SYSTEM_PROMPT =
  "You are a precise website translation engine. Translate the provided visible website text into natural Persian. Preserve meaning, tone, numbers, punctuation, brand names, product names, URLs, placeholders, and formatting intent. Return only valid JSON with exactly this shape: {\"items\":[{\"id\":\"same id\",\"translation\":\"Persian translation\"}]}. Do not use markdown. Do not add explanations.";
