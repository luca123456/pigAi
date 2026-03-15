import { ExternalLink, X } from "lucide-react";

interface LovablePreviewOverlayProps {
  url: string;
  lovable_project_url: string | null;
  lovable_screenshot_path: string | null;
  onClose: () => void;
}

export default function LovablePreviewOverlay({
  url,
  lovable_project_url,
  lovable_screenshot_path,
  onClose,
}: LovablePreviewOverlayProps) {
  const displayUrl = url.replace(/^https?:\/\/(www\.)?/, "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Lovable-Vorschau: {displayUrl}
            </h3>
            {lovable_project_url && (
              <a
                href={lovable_project_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1 text-sm text-violet-600 hover:underline dark:text-violet-400"
              >
                In Lovable oeffnen
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-800">
          {lovable_screenshot_path ? (
            <img
              src={lovable_screenshot_path}
              alt="Lovable-Vorschau"
              className="mx-auto max-w-full"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="max-w-2xl text-sm text-zinc-700 dark:text-zinc-300">
                Kein Screenshot verfuegbar.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
