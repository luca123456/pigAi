"use client";

import { useState } from "react";
import { ExternalLink, Image, Link, X } from "lucide-react";
import LovablePreviewOverlay from "./LovablePreviewOverlay";

interface ProjectOverviewProject {
  name: string;
  url: string;
  lovable_project_url?: string | null;
  lovable_screenshot_path?: string | null;
  screenshot_path?: string | null;
}

interface ProjectOverviewOverlayProps {
  project: ProjectOverviewProject;
  onClose: () => void;
}

export default function ProjectOverviewOverlay({ project, onClose }: ProjectOverviewOverlayProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {project.name}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {project.screenshot_path ? (
            <a
              href={project.screenshot_path}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
            >
              <img
                src={project.screenshot_path}
                alt={`Screenshot ${project.url}`}
                className="h-48 w-full object-cover object-top"
              />
            </a>
          ) : (
            <div className="mt-4 flex h-32 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <span className="text-sm text-zinc-400">Kein Screenshot verfuegbar</span>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              <Image className="h-4 w-4" />
              Preview oeffnen
            </button>
            {project.lovable_project_url && (
              <a
                href={project.lovable_project_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <ExternalLink className="h-4 w-4" />
                In Lovable oeffnen
              </a>
            )}
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Link className="h-4 w-4" />
              Original-URL oeffnen
            </a>
          </div>
        </div>
      </div>
      {showPreview && project.url && (
        <LovablePreviewOverlay
          url={project.url}
          lovable_project_url={project.lovable_project_url ?? null}
          lovable_screenshot_path={project.lovable_screenshot_path ?? null}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
