"use client";

import { useState } from "react";
import type { Project } from "@/lib/types";
import ProjectCard from "./ProjectCard";
import ProjectOverviewOverlay from "./ProjectOverviewOverlay";

interface CurrentProjectsProps {
  projects: Project[];
}

export default function CurrentProjects({ projects }: CurrentProjectsProps) {
  const [previewProject, setPreviewProject] = useState<Project | null>(null);

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Aktuelle Projekte
        </h2>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Projekte, die gerade aktiv bearbeitet werden.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={
                project.url
                  ? () => setPreviewProject(project)
                  : undefined
              }
            />
          ))}
        </div>
      </div>
      {previewProject?.url && (
        <ProjectOverviewOverlay
          project={{
            name: previewProject.name,
            url: previewProject.url,
            lovable_project_url: previewProject.lovable_project_url ?? null,
            lovable_screenshot_path: previewProject.lovable_screenshot_path ?? null,
          }}
          onClose={() => setPreviewProject(null)}
        />
      )}
    </section>
  );
}
