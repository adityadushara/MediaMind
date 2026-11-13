import React from "react";
import { BookOpen, CheckCircle2, Bookmark, Clock } from "lucide-react";

interface MetricsCardsProps {
  totalItems: number;
  wantToConsume: number;
  consuming: number;
  completed: number;
}

export function MetricsCards({
  totalItems,
  wantToConsume,
  consuming,
  completed,
}: MetricsCardsProps) {
  const cards = [
    {
      title: "Total Saved Content",
      value: totalItems,
      subtitle: "Across all media types",
      icon: BookOpen,
      iconColor: "text-indigo-400",
      bgColor: "bg-indigo-500/10",
      borderColor: "border-indigo-500/20",
    },
    {
      title: "Currently Consuming",
      value: consuming,
      subtitle: "Active reading / watching",
      icon: Clock,
      iconColor: "text-sky-400",
      bgColor: "bg-sky-500/10",
      borderColor: "border-sky-500/20",
    },
    {
      title: "Want to Consume",
      value: wantToConsume,
      subtitle: "Queued for later",
      icon: Bookmark,
      iconColor: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
    },
    {
      title: "Completed",
      value: completed,
      subtitle: "Finished & archived",
      icon: CheckCircle2,
      iconColor: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className={`p-5 rounded-xl border bg-neutral-900/40 backdrop-blur-sm ${card.borderColor} transition-all hover:bg-neutral-900/70`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                {card.title}
              </span>
              <div className={`p-2 rounded-lg ${card.bgColor} ${card.iconColor}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-white mb-1">
              {card.value}
            </div>
            <div className="text-xs text-neutral-500">{card.subtitle}</div>
          </div>
        );
      })}
    </div>
  );
}
