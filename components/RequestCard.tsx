import type { SentRequest } from "@/lib/types";

interface RequestCardProps {
  request: SentRequest;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function RequestCard({ request }: RequestCardProps) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-md transition hover:shadow-lg dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
            {request.businessName}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {request.city} · {request.category}
          </p>
        </div>
        <div className="flex flex-col gap-1 text-sm sm:items-end">
          <time
            dateTime={request.sentAt}
            className="text-zinc-500 dark:text-zinc-400"
          >
            {formatDate(request.sentAt)}
          </time>
          <span className="inline-flex w-fit items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-600 dark:text-zinc-200">
            {request.status}
          </span>
        </div>
      </div>
    </article>
  );
}
