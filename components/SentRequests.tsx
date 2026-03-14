import type { SentRequest } from "@/lib/types";
import RequestCard from "./RequestCard";

interface SentRequestsProps {
  requests: SentRequest[];
}

export default function SentRequests({ requests }: SentRequestsProps) {
  return (
    <section className="border-t border-zinc-200 px-4 py-12 dark:border-zinc-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Anfrage verschickt
        </h2>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Betriebe, bei denen bereits eine E-Mail-Anfrage versendet wurde.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      </div>
    </section>
  );
}
