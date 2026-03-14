import { Briefcase, Mail, CheckCircle } from "lucide-react";

interface StatsCardsProps {
  activeProjects: number;
  requestsSent: number;
  responsesReceived: number;
}

export default function StatsCards({
  activeProjects,
  requestsSent,
  responsesReceived,
}: StatsCardsProps) {
  const cards = [
    {
      label: "Aktive Projekte",
      value: activeProjects,
      icon: Briefcase,
    },
    {
      label: "Anfragen verschickt",
      value: requestsSent,
      icon: Mail,
    },
    {
      label: "Antworten erhalten",
      value: responsesReceived,
      icon: CheckCircle,
    },
  ];

  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {cards.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md dark:border-zinc-700 dark:bg-zinc-800/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-700">
                  <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                    {value}
                  </p>
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    {label}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
