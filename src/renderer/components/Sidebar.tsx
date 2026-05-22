import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpenText, Clock3, Languages, MonitorCog, Settings, Sparkles } from "lucide-react";
import { useLmStudioStatusQuery, useSettingsQuery } from "../lib/hooks";
import { StatusBadge } from "./StatusBadge";

const navItems = [
  { to: "/translate", label: "Translate", icon: Languages },
  { to: "/history", label: "History", icon: Clock3 },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/about", label: "About", icon: BookOpenText },
] as const;

export function Sidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const settings = useSettingsQuery();
  const status = useLmStudioStatusQuery();

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
              <div className="mt-1 text-sm font-semibold text-white">
                {settings.data?.translationEngine === "online"
                  ? (settings.data?.onlineModelName ?? "openai/gpt-4.1-mini")
                  : (settings.data?.modelName ?? "translategemma-4b-it")}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {settings.data?.translationEngine === "online" ? "Liara (Online)" : "LM Studio (Local)"}
              </div>
            </div>
            <MonitorCog className="text-violet" size={19} />
          </div>
          <div className="flex items-center justify-between">
            <StatusBadge connected={status.data?.connected} loading={status.isLoading} />
            <Link to="/settings" className="text-xs font-medium text-violet hover:text-violet/80">
              Change
            </Link>
          </div>
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
