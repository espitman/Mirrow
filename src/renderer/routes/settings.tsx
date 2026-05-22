import { FormEvent, useEffect, useState } from "react";
import { PlugZap, RefreshCw, Save } from "lucide-react";
import { useLmStudioModelsQuery, useLmStudioStatusQuery, useSettingsQuery, useUpdateSettingsMutation } from "../lib/hooks";
import { StatusBadge } from "../components/StatusBadge";

export function SettingsPage() {
  const settings = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();
  const status = useLmStudioStatusQuery();
  const localModels = useLmStudioModelsQuery();
  const [form, setForm] = useState({
    translationEngine: "online" as "local" | "online",
    lmStudioBaseUrl: "",
    modelName: "",
    temperature: 0.2,
    batchSize: 20,
    defaultTargetLanguage: "Persian",
    onlineBaseUrl: "",
    onlineModelName: "",
    onlineApiKey: "",
  });

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  useEffect(() => {
    if (form.lmStudioBaseUrl) localModels.refetch();
  }, [form.lmStudioBaseUrl]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    updateSettings.mutate(form);
  };

  return (
    <section className="h-full overflow-auto p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Configure online/local engines, batching, and default translation language.</p>
      </header>

      <form onSubmit={submit} className="glass max-w-3xl rounded-xl p-6">
        <div className="mb-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div>
            <div className="text-sm font-medium text-white">{form.translationEngine === "online" ? "Liara / OpenAI-compatible" : "LM Studio"}</div>
            <div className="mt-1 text-xs text-slate-400">{status.data?.message ?? "Checking local model server"}</div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge connected={status.data?.connected} loading={status.isLoading} />
            <button type="button" className="secondary-button" onClick={() => status.refetch()}>
              <PlugZap size={16} />
              Test
            </button>
          </div>
        </div>

        <div className="grid gap-5">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Translation engine</span>
            <select
              className="field"
              value={form.translationEngine}
              onChange={(event) => setForm((current) => ({ ...current, translationEngine: event.target.value as "local" | "online" }))}
            >
              <option value="online">Online - Liara/OpenAI-compatible</option>
              <option value="local">Local - LM Studio</option>
            </select>
          </label>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-4 text-sm font-medium text-white">Online provider</div>
            <div className="grid gap-4">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Liara base URL</span>
                <input
                  className="field"
                  value={form.onlineBaseUrl}
                  onChange={(event) => setForm((current) => ({ ...current, onlineBaseUrl: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Online model</span>
                <input
                  className="field"
                  value={form.onlineModelName}
                  onChange={(event) => setForm((current) => ({ ...current, onlineModelName: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">API key</span>
                <input
                  className="field"
                  type="password"
                  placeholder="Uses Mirook Keychain key if left empty"
                  value={form.onlineApiKey}
                  onChange={(event) => setForm((current) => ({ ...current, onlineApiKey: event.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">Local provider</div>
              <button type="button" className="secondary-button" onClick={() => localModels.refetch()} disabled={localModels.isFetching}>
                <RefreshCw size={16} className={localModels.isFetching ? "animate-spin" : ""} />
                Models
              </button>
            </div>
            <div className="grid gap-4">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">LM Studio base URL</span>
            <input
              className="field"
              value={form.lmStudioBaseUrl}
              onChange={(event) => setForm((current) => ({ ...current, lmStudioBaseUrl: event.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Local model</span>
            <select
              className="field"
              value={form.modelName}
              onChange={(event) => setForm((current) => ({ ...current, modelName: event.target.value }))}
              disabled={localModels.isLoading}
            >
              {form.modelName && !localModels.data?.some((model) => model.id === form.modelName) && (
                <option value={form.modelName}>{form.modelName}</option>
              )}
              {(localModels.data ?? []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
              {!form.modelName && !(localModels.data ?? []).length && <option value="">No local models found</option>}
            </select>
            {localModels.isError && <div className="mt-2 text-xs text-rose-300">Could not load local models. Check LM Studio server.</div>}
          </label>
            </div>
          </div>
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
        </div>

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
