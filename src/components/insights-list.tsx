import type { Insight } from "@/lib/insights";

const TONE_STYLES: Record<Insight["tone"], { border: string; icon: string; iconClass: string }> = {
  good: { border: "border-emerald-400/25 bg-emerald-400/6", icon: "▲", iconClass: "text-emerald-300" },
  bad: { border: "border-rose-400/25 bg-rose-400/6", icon: "▼", iconClass: "text-rose-300" },
  warning: { border: "border-amber-400/25 bg-amber-400/6", icon: "!", iconClass: "text-amber-300" },
  neutral: { border: "border-white/10 bg-white/4", icon: "i", iconClass: "text-ink-300" },
};

export function InsightsList({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {insights.map((insight) => {
        const tone = TONE_STYLES[insight.tone];
        return (
          <article key={insight.id} className={`rounded-2xl border px-4 py-4 ${tone.border}`}>
            <h3 className="flex items-start gap-2 text-sm font-semibold text-ink-100">
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/8 text-[10px] font-bold ${tone.iconClass}`}
              >
                {tone.icon}
              </span>
              {insight.title}
            </h3>
            <p className="mt-2 pl-7 text-sm leading-relaxed text-ink-300">{insight.text}</p>
          </article>
        );
      })}
    </div>
  );
}
