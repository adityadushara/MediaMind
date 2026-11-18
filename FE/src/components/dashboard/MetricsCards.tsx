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
      title: "Saved Items",
      value: totalItems,
      subtitle: "In your personal library",
      icon: BookOpen,
      iconColor: "text-amber-800",
      bgColor: "bg-amber-100",
      borderColor: "border-amber-200",
    },
    {
      title: "Reading / Watching",
      value: consuming,
      subtitle: "Currently in progress",
      icon: Clock,
      iconColor: "text-blue-800",
      bgColor: "bg-blue-100",
      borderColor: "border-blue-200",
    },
    {
      title: "Want to Study",
      value: wantToConsume,
      subtitle: "Saved for upcoming sessions",
      icon: Bookmark,
      iconColor: "text-orange-800",
      bgColor: "bg-orange-100",
      borderColor: "border-orange-200",
    },
    {
      title: "Finished",
      value: completed,
      subtitle: "Completed & learned",
      icon: CheckCircle2,
      iconColor: "text-emerald-800",
      bgColor: "bg-emerald-100",
      borderColor: "border-emerald-200",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="p-5 rounded-2xl border border-stone-200 bg-white shadow-sm transition-all hover:shadow-md hover:border-amber-300"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                {card.title}
              </span>
              <div className={`p-2 rounded-xl ${card.bgColor} ${card.iconColor}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold tracking-tight text-stone-900 mb-1">
              {card.value}
            </div>
            <div className="text-xs font-medium text-stone-500">{card.subtitle}</div>
          </div>
        );
      })}
    </div>
  );
}
