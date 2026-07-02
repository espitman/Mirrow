type StatusBadgeProps = {
  connected?: boolean;
  loading?: boolean;
};

export function StatusBadge({ connected, loading }: StatusBadgeProps) {
  const label = loading ? "Checking" : connected ? "Connected" : "Offline";
  const tone = connected ? "bg-emerald-400" : loading ? "bg-amber-300" : "bg-rose-400";

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#5f6368]/70 bg-[#202124] px-2.5 py-1 text-xs text-[#e8eaed]">
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      {label}
    </span>
  );
}
