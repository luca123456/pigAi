import type { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
  onClick?: () => void;
}

export default function ProjectCard({ project, onClick }: ProjectCardProps) {
  const hasLocation = !!(project.city || project.category);
  const locationText = [project.city, project.category].filter(Boolean).join(" · ");

  return (
    <article
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={`flex flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-md transition hover:shadow-lg dark:border-zinc-700 dark:bg-zinc-800/50 ${onClick ? "cursor-pointer" : ""}`}
    >
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {project.name}
      </h3>
      {hasLocation && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {locationText}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-600 dark:text-zinc-200">
          {project.status}
        </span>
      </div>
    </article>
  );
}
