import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpenText, ChevronDown, Clock3, Languages, MonitorCog, Settings, Sparkles } from "lucide-react";
import { LIARA_MODEL_OPTIONS, OPENROUTER_MODEL_OPTIONS } from "../../shared/constants";
import { useGoogleAiModelsQuery, useLmStudioStatusQuery, useSettingsQuery, useUpdateSettingsMutation } from "../lib/hooks";
import { StatusBadge } from "./StatusBadge";

const navItems = [
  { to: "/translate", label: "Translate", icon: Languages },
  { to: "/history", label: "History", icon: Clock3 },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/about", label: "About", icon: BookOpenText },
] as const;

type TranslationEngine = "online" | "openrouter" | "local" | "google";
const ENGINE_LABELS: Record<TranslationEngine, string> = {
  online: "Liara",
  openrouter: "OR",
  google: "Google",
  local: "Local",
};

export function Sidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const settings = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();
  const status = useLmStudioStatusQuery();
  const selectedEngine = settings.data?.translationEngine ?? "online";
  const enabledEngines = ([
    ["online", settings.data?.onlineEnabled],
    ["openrouter", settings.data?.openRouterEnabled],
    ["google", settings.data?.googleEnabled],
    ["local", settings.data?.localEnabled],
  ] as Array<[TranslationEngine, boolean | undefined]>)
    .filter(([, enabled]) => enabled !== false)
    .map(([engine]) => engine);
  const googleModels = useGoogleAiModelsQuery(
    settings.data ?? {},
    selectedEngine === "google" && settings.data?.googleEnabled !== false && Boolean(settings.data?.googleApiKey),
  );
  const [onlineCost, setOnlineCost] = useState(0);

  useEffect(() => {
    window.mirrow.onlineCost.get().then((state) => setOnlineCost(state.totalToman)).catch(() => undefined);
    return window.mirrow.onlineCost.onUpdate((state) => setOnlineCost(state.totalToman));
  }, []);

  const setEngine = (translationEngine: TranslationEngine) => {
    if (!enabledEngines.includes(translationEngine)) return;
    updateSettings.mutate({ translationEngine });
  };
  const setModel = (model: string) => {
    if (selectedEngine === "google") {
      updateSettings.mutate({ googleModelName: model });
      return;
    }
    if (selectedEngine === "openrouter") {
      updateSettings.mutate({ openRouterModelName: model });
      return;
    }
    if (selectedEngine === "online") {
      updateSettings.mutate({ onlineModelName: model });
    }
  };
  const engineModel =
    selectedEngine === "google"
      ? (settings.data?.googleModelName ?? "gemini-flash-latest")
      : selectedEngine === "openrouter"
        ? (settings.data?.openRouterModelName ?? "google/gemma-4-31b-it:free")
      : selectedEngine === "online"
        ? (settings.data?.onlineModelName ?? "openai/gpt-4.1-mini")
        : "Local endpoint";
  const engineProvider =
    selectedEngine === "google"
      ? "Google AI Studio (Gemini)"
      : selectedEngine === "openrouter"
        ? "OpenRouter"
      : selectedEngine === "online"
        ? "Liara"
        : "LM Studio (Local)";
  const modelOptions =
    selectedEngine === "google"
      ? [
          ...(engineModel ? [{ label: engineModel, value: engineModel }] : []),
          ...((googleModels.data ?? [])
            .filter((model) => model.id !== engineModel)
            .map((model) => ({ label: model.name, value: model.id }))),
        ]
      : selectedEngine === "openrouter"
        ? [
            ...(engineModel && !OPENROUTER_MODEL_OPTIONS.some((model) => model.value === engineModel)
              ? [{ label: engineModel, value: engineModel }]
              : []),
            ...OPENROUTER_MODEL_OPTIONS,
          ]
      : selectedEngine === "online"
        ? [
            ...(engineModel && !LIARA_MODEL_OPTIONS.some((model) => model.value === engineModel)
              ? [{ label: engineModel, value: engineModel }]
              : []),
            ...LIARA_MODEL_OPTIONS,
          ]
        : [];

  return (
    <aside className="drag-region flex h-full w-[292px] shrink-0 flex-col border-r border-white/10 bg-black/20 px-4 pb-4 pt-12 backdrop-blur-xl">
      <div className="no-drag mb-7 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet text-white shadow-glow">
          <Sparkles size={22} />
        </div>
        <div>
          <div className="text-lg font-semibold tracking-normal text-white">Mirrow</div>
          <div className="text-xs text-slate-400">AI Web Translator</div>
        </div>
      </div>

      <nav className="no-drag space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active ? "bg-white/[0.1] text-white" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="no-drag mt-6 space-y-4">
        <section className="glass rounded-xl p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase text-slate-500">Engine</div>
              <div className="mt-1 break-words text-sm font-semibold text-white">{engineModel}</div>
              <div className="mt-1 text-xs text-slate-400">{engineProvider}</div>
            </div>
            <MonitorCog className="text-violet" size={19} />
          </div>
          <div className="flex items-center justify-between">
            <StatusBadge connected={status.data?.connected} loading={status.isLoading} />
            <Link to="/settings" className="text-xs font-medium text-violet hover:text-violet/80">
              Change
            </Link>
          </div>
          <div className={`mt-3 grid gap-1 rounded-lg bg-black/20 p-1 text-xs ${enabledEngines.length >= 4 ? "grid-cols-4" : enabledEngines.length === 3 ? "grid-cols-3" : enabledEngines.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {enabledEngines.map((engine) => (
              <button
                key={engine}
                className={`rounded-md px-2 py-1.5 transition ${selectedEngine === engine ? "bg-violet text-white" : "text-slate-300 hover:bg-white/[0.08]"}`}
                onClick={() => setEngine(engine)}
              >
                {ENGINE_LABELS[engine]}
              </button>
            ))}
          </div>
          {selectedEngine === "local" ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-2 py-2">
              <div className="text-xs uppercase text-slate-500">URL</div>
              <div className="mt-1 truncate text-xs text-slate-200">{settings.data?.lmStudioBaseUrl}</div>
            </div>
          ) : (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs uppercase text-slate-500">Model</span>
              <div className="relative">
                <select
                  className="h-9 w-full appearance-none rounded-lg border border-white/10 bg-black/20 px-2 pr-10 text-xs text-white outline-none transition focus:border-violet/60"
                  value={engineModel}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={updateSettings.isPending || !modelOptions.length}
                  title="Switch model"
                >
                  {modelOptions.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-200" size={16} />
              </div>
            </label>
          )}
          {(selectedEngine === "online" || selectedEngine === "google" || selectedEngine === "openrouter") && (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase text-slate-500">
                  {selectedEngine === "google" ? "Google cost" : selectedEngine === "openrouter" ? "OpenRouter cost" : "Liara cost"}
                </span>
                <button
                  className="text-xs text-slate-400 hover:text-white"
                  onClick={() => window.mirrow.onlineCost.reset().then((state) => setOnlineCost(state.totalToman))}
                >
                  Reset
                </button>
              </div>
              <div className="mt-1 text-lg font-semibold text-white">{Math.round(onlineCost).toLocaleString("en-US")} Toman</div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-3 text-xs uppercase text-slate-500">Theme</div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/20 p-1 text-xs text-slate-300">
            <button className="rounded-md px-2 py-1.5 hover:bg-white/[0.08]">System</button>
            <button className="rounded-md px-2 py-1.5 hover:bg-white/[0.08]">Light</button>
            <button className="rounded-md bg-white/[0.1] px-2 py-1.5 text-white">Dark</button>
          </div>
        </section>
      </div>

      <div className="no-drag mt-auto rounded-xl border border-violet/20 bg-violet/10 p-4">
        <div className="text-sm font-semibold text-white">Mirrow</div>
        <div className="mt-1 text-xs leading-5 text-slate-300">See the world in your language.</div>
      </div>
    </aside>
  );
}
