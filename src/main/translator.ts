import { TRANSLATION_SYSTEM_PROMPT } from "../shared/constants.js";
import type { AppSettings, LmStudioStatus, TranslationBatch, TranslationBatchResult } from "../shared/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function checkLmStudioConnection(settings: AppSettings): Promise<LmStudioStatus> {
  if (settings.translationEngine === "online") {
    return checkOnlineConnection(settings);
  }

  try {
    const response = await fetch(resolveChatCompletionsUrl(settings), {
      method: "POST",
      headers: await requestHeaders(settings),
      body: JSON.stringify({
        model: resolveModelName(settings),
        temperature: 0,
        messages: [
          { role: "system", content: "Return only valid JSON." },
          { role: "user", content: "{\"ok\":true}" },
        ],
        max_tokens: 8,
      }),
    });

    if (!response.ok) {
      return { connected: false, message: `LM Studio returned ${response.status}` };
    }

    return { connected: true, message: "Connected" };
  } catch {
    return {
      connected: false,
      message: "LM Studio is offline. Please start LM Studio and load the translategemma-4b-it model.",
    };
  }
}

export async function translateBatch(
  batch: TranslationBatch,
  settings: AppSettings,
): Promise<TranslationBatchResult> {
  if (!batch.items.length) return { items: [] };

  let response: Response;
  try {
    response = await fetch(resolveChatCompletionsUrl(settings), {
      method: "POST",
      headers: await requestHeaders(settings),
      body: JSON.stringify({
        model: resolveModelName(settings),
        temperature: settings.temperature,
        messages: [
          { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(batch) },
        ],
      }),
    });
  } catch {
    throw new Error(settings.translationEngine === "online" ? "Online translation provider is unavailable." : "LM Studio is offline. Please start LM Studio and load the translategemma-4b-it model.");
  }

  if (!response.ok) {
    throw new Error(`LM Studio error: ${response.status}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Empty response from LM Studio");
  }

  try {
    return validateTranslationResult(parseTranslationJson(content), batch);
  } catch (error) {
    const repaired = await repairTranslationJson(content, batch, settings).catch(() => null);
    if (repaired) return validateTranslationResult(repaired, batch);

    const salvaged = salvageTranslationJson(content);
    if (salvaged) return validateTranslationResult(salvaged, batch);

    const individual = await translateItemsIndividually(batch, settings).catch(() => null);
    if (individual?.items.length) return validateTranslationResult(individual, batch);

    console.warn("Mirrow could not parse translation JSON", {
      error: error instanceof Error ? error.message : String(error),
      raw: content.slice(0, 2000),
    });

    return {
      items: batch.items.map((item) => ({
        id: item.id,
        translation: item.text,
      })),
    };
  }
}

export function parseTranslationJson(raw: string): TranslationBatchResult {
  const normalize = (value: unknown) => normalizeTranslationJson(value);
  const cleaned = cleanModelJson(raw);

  try {
    return normalize(JSON.parse(cleaned));
  } catch {
    const candidate = extractJsonCandidate(cleaned);
    if (!candidate) {
      throw new Error("Model did not return JSON");
    }

    try {
      return normalize(JSON.parse(candidate));
    } catch {
      throw new Error("Could not parse translation JSON");
    }
  }
}

function validateTranslationResult(result: TranslationBatchResult, batch: TranslationBatch): TranslationBatchResult {
  if (!result || !Array.isArray(result.items)) {
    throw new Error("Translation response did not include an items array");
  }

  const validIds = new Set(batch.items.map((item) => item.id));
  return {
    items: result.items
      .filter((item) => validIds.has(item.id) && typeof item.translation === "string")
      .map((item) => ({ id: item.id, translation: item.translation })),
  };
}

function normalizeTranslationJson(value: unknown): TranslationBatchResult {
  if (Array.isArray(value)) {
    return normalizeTranslationItems(value);
  }

  if (!value || typeof value !== "object") {
    throw new Error("Translation response was not a JSON object");
  }

  const record = value as Record<string, unknown>;
  const items = record.items ?? record.translations ?? record.results;

  if (Array.isArray(items)) {
    return normalizeTranslationItems(items);
  }

  if (items && typeof items === "object") {
    return {
      items: Object.entries(items as Record<string, unknown>).map(([id, translation]) => ({
        id,
        translation: String(translation ?? ""),
      })),
    };
  }

  throw new Error("Translation response did not include an items array");
}

function normalizeTranslationItems(items: unknown[]): TranslationBatchResult {
  return {
    items: items
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        id: String(item.id ?? ""),
        translation: String(item.translation ?? item.translatedText ?? item.text ?? ""),
      })),
  };
}

function cleanModelJson(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim()
    .replace(/,\s*([}\]])/g, "$1");
}

function extractJsonCandidate(raw: string) {
  const firstObject = findBalancedJson(raw, "{", "}");
  if (firstObject) return firstObject;
  return findBalancedJson(raw, "[", "]");
}

function findBalancedJson(raw: string, open: "{" | "[", close: "}" | "]") {
  const start = raw.indexOf(open);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;
    if (char === open) depth += 1;
    if (char === close) depth -= 1;

    if (depth === 0) {
      return raw.slice(start, index + 1).replace(/,\s*([}\]])/g, "$1");
    }
  }

  return null;
}

function salvageTranslationJson(raw: string): TranslationBatchResult | null {
  const items: TranslationBatchResult["items"] = [];
  const pattern =
    /["']id["']\s*:\s*["']([^"']+)["'][\s\S]{0,500}?["'](?:translation|translatedText|text)["']\s*:\s*["']([^"']*)["']/g;

  for (const match of raw.matchAll(pattern)) {
    items.push({ id: match[1], translation: match[2] });
  }

  return items.length ? { items } : null;
}

async function repairTranslationJson(
  raw: string,
  batch: TranslationBatch,
  settings: AppSettings,
): Promise<TranslationBatchResult> {
  const response = await fetch(settings.lmStudioBaseUrl, {
    method: "POST",
    headers: await requestHeaders(settings),
    body: JSON.stringify({
      model: resolveModelName(settings),
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Repair the translation response into valid JSON only. Return exactly this shape: {\"items\":[{\"id\":\"...\",\"translation\":\"...\"}]}. Preserve the ids from the requested items. Do not add markdown or explanations.",
        },
        {
          role: "user",
          content: JSON.stringify({
            requestedItems: batch.items.map((item) => ({ id: item.id, text: item.text })),
            invalidResponse: raw,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LM Studio repair error: ${response.status}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty repair response from LM Studio");

  return parseTranslationJson(content);
}

async function translateItemsIndividually(
  batch: TranslationBatch,
  settings: AppSettings,
): Promise<TranslationBatchResult> {
  const items = [];

  for (const item of batch.items) {
  const response = await fetch(settings.lmStudioBaseUrl, {
      method: "POST",
      headers: await requestHeaders(settings),
      body: JSON.stringify({
        model: resolveModelName(settings),
        temperature: settings.temperature,
        messages: [
          {
            role: "system",
            content:
              "Translate the user text into natural Persian. Return only the translated text. Do not return JSON, markdown, quotes, labels, or explanations.",
          },
          {
            role: "user",
            content: item.text,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`LM Studio individual translation error: ${response.status}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data?.choices?.[0]?.message?.content;
    items.push({
      id: item.id,
      translation: cleanPlainTranslation(raw || item.text),
    });
  }

  return { items };
}

async function checkOnlineConnection(settings: AppSettings): Promise<LmStudioStatus> {
  try {
    const response = await fetch(resolveEndpoint(settings.onlineBaseUrl, "/models"), {
      method: "GET",
      headers: await requestHeaders(settings),
    });

    if (!response.ok) {
      return { connected: false, message: `Online provider returned ${response.status}` };
    }

    return { connected: true, message: "Connected to Liara" };
  } catch {
    return { connected: false, message: "Online provider is unavailable." };
  }
}

function resolveChatCompletionsUrl(settings: AppSettings) {
  if (settings.translationEngine === "online") {
    return resolveEndpoint(settings.onlineBaseUrl, "/chat/completions");
  }

  return settings.lmStudioBaseUrl;
}

function resolveEndpoint(baseUrl: string, path: string) {
  const normalized = (baseUrl || "").trim().replace(/\/+$/, "");
  if (normalized.endsWith(path)) return normalized;
  return `${normalized}${path}`;
}

function resolveModelName(settings: AppSettings) {
  return settings.translationEngine === "online" ? settings.onlineModelName : settings.modelName;
}

async function requestHeaders(settings: AppSettings) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.translationEngine === "online") {
    const apiKey = await resolveOnlineApiKey(settings);
    if (!apiKey) throw new Error("Add the Liara/OpenAI-compatible API key in Settings.");
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function resolveOnlineApiKey(settings: AppSettings) {
  const configured = settings.onlineApiKey.trim();
  if (configured) return configured;

  if (process.platform !== "darwin") return "";

  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s",
      "com.espitman.Mirook",
      "-a",
      "openai-api-key",
      "-w",
    ]);
    return stdout.trim();
  } catch {
    return "";
  }
}

function cleanPlainTranslation(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:text|txt|json)?/i, "")
    .replace(/```$/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/^(translation|translated text|persian)\s*:\s*/i, "")
    .trim();
}
