import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const score = project.score ?? 0;

  return (
    <article className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-md transition hover:shadow-lg dark:border-zinc-700 dark:bg-zinc-800/50">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {project.name}
      </h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {project.city} · {project.category}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-600 dark:text-zinc-200">
          {project.status}
        </span>
      </div>
      {project.score != null && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Fortschritt</span>
            <span>{project.score}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-600">
            <div
              className="h-full rounded-full bg-zinc-600 dark:bg-zinc-400"
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>
      )}
    </article>
  );
}
