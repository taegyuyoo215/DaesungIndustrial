type Status = "normal" | "warning" | "critical" | "offline";

const config: Record<Status, { label: string; dot: string; bg: string; text: string }> = {
  normal:   { label: "정상",   dot: "bg-green-400",  bg: "bg-green-50",   text: "text-green-700"  },
  warning:  { label: "주의",   dot: "bg-yellow-400", bg: "bg-yellow-50",  text: "text-yellow-700" },
  critical: { label: "경보",   dot: "bg-red-500",    bg: "bg-red-50",     text: "text-red-700"    },
  offline:  { label: "오프라인", dot: "bg-slate-400",  bg: "bg-slate-100",  text: "text-slate-600"  },
};

export default function StatusBadge({ status }: { status: Status }) {
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-${status === "critical" ? "ping" : "none"}`} />
      {c.label}
    </span>
  );
}
