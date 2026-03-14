"use client";

import { useState } from "react";
import { ChevronDown, Plus, Loader2 } from "lucide-react";
import { useProfile } from "@/lib/profile-context";

export default function ProfileSelector() {
  const {
    profiles,
    selectedProfileId,
    setSelectedProfileId,
    createProfile,
    isLoading,
  } = useProfile();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  const selected = profiles.find((p) => p.id === selectedProfileId);
  const displayName = selected?.name ?? "Standard";

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const created = await createProfile(newName.trim());
    setCreating(false);
    if (created) {
      setNewName("");
      setShowNew(false);
      setOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-800">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        <span className="text-sm text-zinc-500">Profile...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      >
        <span>{displayName}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-zinc-200 bg-white py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedProfileId(p.id);
                  setOpen(false);
                }}
                className={`block w-full px-4 py-2 text-left text-sm ${
                  p.id === selectedProfileId
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {p.name}
              </button>
            ))}
            <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
            {showNew ? (
              <div className="px-3 py-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Profilname"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setShowNew(false);
                  }}
                  autoFocus
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating || !newName.trim()}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Erstellen
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNew(false)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNew(true)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                <Plus className="h-4 w-4" />
                Neues Profil
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
