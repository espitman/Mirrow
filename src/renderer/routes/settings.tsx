import { FormEvent, useEffect, useState } from "react";
import { PlugZap, RefreshCw, Save } from "lucide-react";
import {
  useGoogleAiModelsQuery,
  useLmStudioStatusQuery,
  useSettingsQuery,
  useUpdateSettingsMutation,
} from "../lib/hooks";
import { StatusBadge } from "../components/StatusBadge";
import { DEFAULT_SETTINGS, LIARA_MODEL_OPTIONS, OPENROUTER_MODEL_OPTIONS } from "../../shared/constants";

type SettingsTab = "engine" | "providers" | "general";
type TranslationEngine = "local" | "online" | "google" | "openrouter";
type EnabledKey = "onlineEnabled" | "openRouterEnabled" | "googleEnabled" | "localEnabled";
const ENGINE_OPTIONS: Array<{ value: TranslationEngine; label: string }> = [
  { value: "online", label: "Liara" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "google", label: "Google AI Studio - Gemini" },
  { value: "local", label: "Local - LM Studio" },
];

function enabledKey(translationEngine: TranslationEngine): EnabledKey {
  if (translationEngine === "online") return "onlineEnabled";
  if (translationEngine === "openrouter") return "openRouterEnabled";
  if (translationEngine === "google") return "googleEnabled";
  return "localEnabled";
}

function ProviderHeader({
  title,
  enabled,
  onChange,
  className = "mb-4",
}: {
  title: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <div className="text-sm font-medium text-white">{title}</div>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input
          className="h-4 w-4 accent-violet"
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        Enabled
      </label>
    </div>
  );
}

export function SettingsPage() {
  const settings = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();
  const status = useLmStudioStatusQuery();
  const [activeTab, setActiveTab] = useState<SettingsTab>("engine");
  const [form, setForm] = useState({
    translationEngine: "online" as TranslationEngine,
    onlineEnabled: true,
    openRouterEnabled: true,
    googleEnabled: true,
    localEnabled: true,
    lmStudioBaseUrl: "",
    temperature: 0.2,
    batchSize: 20,
    defaultTargetLanguage: "Persian",
    onlineBaseUrl: "",
    onlineModelName: "",
    onlineApiKey: "",
    openRouterBaseUrl: "",
    openRouterModelName: "",
    openRouterApiKey: "",
    googleBaseUrl: "",
    googleModelName: "",
    googleApiKey: "",
  });
  const googleModels = useGoogleAiModelsQuery(form, false);

  useEffect(() => {
    if (settings.data) setForm({ ...DEFAULT_SETTINGS, ...settings.data });
  }, [settings.data]);

  useEffect(() => {
    if (form.googleEnabled && form.googleApiKey && form.translationEngine === "google") googleModels.refetch();
  }, [form.googleEnabled, form.googleApiKey, form.googleBaseUrl, form.translationEngine]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    updateSettings.mutate(form);
  };

  const engineLabel =
    form.translationEngine === "google"
      ? "Google AI Studio"
      : form.translationEngine === "openrouter"
        ? "OpenRouter"
      : form.translationEngine === "online"
        ? "Liara"
        : "LM Studio";
  const activeModel =
    form.translationEngine === "google"
      ? form.googleModelName
      : form.translationEngine === "openrouter"
        ? form.openRouterModelName
        : form.translationEngine === "online"
          ? form.onlineModelName
          : "Local endpoint";
  const activeModelOptions =
    form.translationEngine === "google"
      ? [
          ...(form.googleModelName ? [{ label: form.googleModelName, value: form.googleModelName }] : []),
          ...((googleModels.data ?? [])
            .filter((model) => model.id !== form.googleModelName)
            .map((model) => ({ label: model.name, value: model.id }))),
        ]
      : form.translationEngine === "openrouter"
        ? [
            ...(form.openRouterModelName && !OPENROUTER_MODEL_OPTIONS.some((model) => model.value === form.openRouterModelName)
              ? [{ label: form.openRouterModelName, value: form.openRouterModelName }]
              : []),
            ...OPENROUTER_MODEL_OPTIONS,
          ]
        : form.translationEngine === "online"
          ? [
              ...(form.onlineModelName && !LIARA_MODEL_OPTIONS.some((model) => model.value === form.onlineModelName)
                ? [{ label: form.onlineModelName, value: form.onlineModelName }]
                : []),
              ...LIARA_MODEL_OPTIONS,
            ]
          : [];
  const setActiveModel = (model: string) => {
    if (form.translationEngine === "google") {
      setForm((current) => ({ ...current, googleModelName: model }));
      return;
    }
    if (form.translationEngine === "openrouter") {
      setForm((current) => ({ ...current, openRouterModelName: model }));
      return;
    }
    if (form.translationEngine === "online") {
      setForm((current) => ({ ...current, onlineModelName: model }));
    }
  };
  const enabledEngines = ENGINE_OPTIONS.filter((option) => isEngineEnabled(option.value));
  const setEngine = (translationEngine: TranslationEngine) => {
    if (!isEngineEnabled(translationEngine)) return;
    setForm((current) => ({ ...current, translationEngine }));
  };
  const toggleEngine = (translationEngine: TranslationEngine, enabled: boolean) => {
    setForm((current) => {
      const next = { ...current, [enabledKey(translationEngine)]: enabled };
      const stillHasEnabled = ENGINE_OPTIONS.some((option) => next[enabledKey(option.value)] !== false);
      if (!stillHasEnabled) return current;
      if (!enabled && current.translationEngine === translationEngine) {
        next.translationEngine = ENGINE_OPTIONS.find((option) => next[enabledKey(option.value)] !== false)?.value ?? "online";
      }
      return next;
    });
  };
  function isEngineEnabled(translationEngine: TranslationEngine) {
    return form[enabledKey(translationEngine)] !== false;
  }
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "engine", label: "Engine" },
    { id: "providers", label: "Providers" },
    { id: "general", label: "General" },
  ];

  return (
    <section className="h-full overflow-auto p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Configure Liara, OpenRouter, Google, local engines, batching, and default translation language.</p>
      </header>

      <form onSubmit={submit} className="glass max-w-3xl rounded-xl p-6">
        <div className="mb-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div>
            <div className="text-sm font-medium text-white">{engineLabel}</div>
            <div className="mt-1 text-xs text-slate-400">{status.data?.message ?? "Checking translation provider"}</div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge connected={status.data?.connected} loading={status.isLoading} />
            <button type="button" className="secondary-button" onClick={() => status.refetch()}>
              <PlugZap size={16} />
              Test
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-1 rounded-lg bg-black/20 p-1 text-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`rounded-md px-3 py-2 transition ${activeTab === tab.id ? "bg-violet text-white" : "text-slate-300 hover:bg-white/[0.08]"}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "engine" && (
          <div className="grid gap-5">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Translation engine</span>
              <select
                className="field"
                value={form.translationEngine}
                onChange={(event) => setEngine(event.target.value as TranslationEngine)}
              >
                {enabledEngines.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {form.translationEngine === "local" ? (
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Local endpoint URL</span>
                <input
                  className="field"
                  value={form.lmStudioBaseUrl}
                  onChange={(event) => setForm((current) => ({ ...current, lmStudioBaseUrl: event.target.value }))}
                />
              </label>
            ) : (
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Model</span>
                <select
                  className="field"
                  value={activeModel}
                  onChange={(event) => setActiveModel(event.target.value)}
                  disabled={form.translationEngine === "google" && googleModels.isFetching}
                >
                  {activeModelOptions.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                  {form.translationEngine === "google" && !activeModel && !activeModelOptions.length && (
                    <option value="">No Gemini models loaded</option>
                  )}
                </select>
              </label>
            )}

            <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Active provider</span>
                <span className="font-medium text-white">{engineLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Model</span>
                <span className="max-w-[320px] truncate font-medium text-white">{activeModel}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "providers" && (
          <div className="grid gap-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <ProviderHeader
                title="Liara"
                enabled={form.onlineEnabled}
                onChange={(enabled) => toggleEngine("online", enabled)}
              />
              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Liara base URL</span>
                  <input
                    className="field"
                    disabled={!form.onlineEnabled}
                    value={form.onlineBaseUrl}
                    onChange={(event) => setForm((current) => ({ ...current, onlineBaseUrl: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Liara model</span>
                  <select
                    className="field"
                    disabled={!form.onlineEnabled}
                    value={form.onlineModelName}
                    onChange={(event) => setForm((current) => ({ ...current, onlineModelName: event.target.value }))}
                  >
                    {form.onlineModelName && !LIARA_MODEL_OPTIONS.some((model) => model.value === form.onlineModelName) && (
                      <option value={form.onlineModelName}>{form.onlineModelName}</option>
                    )}
                    {LIARA_MODEL_OPTIONS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">API key</span>
                  <input
                    className="field"
                    disabled={!form.onlineEnabled}
                    type="password"
                    placeholder="Uses Mirook Keychain key if left empty"
                    value={form.onlineApiKey}
                    onChange={(event) => setForm((current) => ({ ...current, onlineApiKey: event.target.value }))}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <ProviderHeader
                title="OpenRouter"
                enabled={form.openRouterEnabled}
                onChange={(enabled) => toggleEngine("openrouter", enabled)}
              />
              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">OpenRouter base URL</span>
                  <input
                    className="field"
                    disabled={!form.openRouterEnabled}
                    value={form.openRouterBaseUrl}
                    onChange={(event) => setForm((current) => ({ ...current, openRouterBaseUrl: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">OpenRouter model</span>
                  <select
                    className="field"
                    disabled={!form.openRouterEnabled}
                    value={form.openRouterModelName}
                    onChange={(event) => setForm((current) => ({ ...current, openRouterModelName: event.target.value }))}
                  >
                    {form.openRouterModelName && !OPENROUTER_MODEL_OPTIONS.some((model) => model.value === form.openRouterModelName) && (
                      <option value={form.openRouterModelName}>{form.openRouterModelName}</option>
                    )}
                    {OPENROUTER_MODEL_OPTIONS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">OpenRouter API key</span>
                  <input
                    className="field"
                    disabled={!form.openRouterEnabled}
                    type="password"
                    placeholder="Uses TextLens/OpenRouter key if left empty"
                    value={form.openRouterApiKey}
                    onChange={(event) => setForm((current) => ({ ...current, openRouterApiKey: event.target.value }))}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <ProviderHeader
                  title="Google AI Studio"
                  enabled={form.googleEnabled}
                  onChange={(enabled) => toggleEngine("google", enabled)}
                  className="mb-0 flex-1"
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => googleModels.refetch()}
                  disabled={!form.googleEnabled || googleModels.isFetching || !form.googleApiKey}
                >
                  <RefreshCw size={16} className={googleModels.isFetching ? "animate-spin" : ""} />
                  Models
                </button>
              </div>
              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Gemini base URL</span>
                  <input
                    className="field"
                    disabled={!form.googleEnabled}
                    value={form.googleBaseUrl}
                    onChange={(event) => setForm((current) => ({ ...current, googleBaseUrl: event.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Gemini model</span>
                  <select
                    className="field"
                    value={form.googleModelName}
                    onChange={(event) => setForm((current) => ({ ...current, googleModelName: event.target.value }))}
                    disabled={!form.googleEnabled || googleModels.isFetching}
                  >
                    {form.googleModelName && !googleModels.data?.some((model) => model.id === form.googleModelName) && (
                      <option value={form.googleModelName}>{form.googleModelName}</option>
                    )}
                    {(googleModels.data ?? []).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                    {!form.googleModelName && !(googleModels.data ?? []).length && <option value="">No Gemini models loaded</option>}
                  </select>
                  {googleModels.isError && <div className="mt-2 text-xs text-rose-300">Could not load Gemini models. Check the API key.</div>}
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Google AI Studio API key</span>
                  <input
                    className="field"
                    disabled={!form.googleEnabled}
                    type="password"
                    placeholder="AIza..."
                    value={form.googleApiKey}
                    onChange={(event) => setForm((current) => ({ ...current, googleApiKey: event.target.value }))}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <ProviderHeader
                title="Local provider"
                enabled={form.localEnabled}
                onChange={(enabled) => toggleEngine("local", enabled)}
              />
              <div className="grid gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-300">Local endpoint URL</span>
                  <input
                    className="field"
                    disabled={!form.localEnabled}
                    value={form.lmStudioBaseUrl}
                    onChange={(event) => setForm((current) => ({ ...current, lmStudioBaseUrl: event.target.value }))}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === "general" && (
          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Temperature</span>
              <input
                className="field"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={form.temperature}
                onChange={(event) => setForm((current) => ({ ...current, temperature: Number(event.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Batch size</span>
              <input
                className="field"
                type="number"
                min="1"
                max="80"
                value={form.batchSize}
                onChange={(event) => setForm((current) => ({ ...current, batchSize: Number(event.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Default target</span>
              <input
                className="field"
                value={form.defaultTargetLanguage}
                onChange={(event) => setForm((current) => ({ ...current, defaultTargetLanguage: event.target.value }))}
              />
            </label>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button className="primary-button" disabled={updateSettings.isPending}>
            <Save size={16} />
            Save Settings
          </button>
          {updateSettings.isSuccess && <span className="text-sm text-emerald-300">Saved</span>}
          {updateSettings.isError && <span className="text-sm text-rose-300">Could not save settings</span>}
        </div>
      </form>
    </section>
  );
}
