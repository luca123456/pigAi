"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface Profile {
  id: string;
  name: string;
  created_at: string;
}

const DEFAULT_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
const STORAGE_KEY = "pigai_selected_profile_id";

interface ProfileContextValue {
  profiles: Profile[];
  selectedProfileId: string;
  setSelectedProfileId: (id: string) => void;
  refreshProfiles: () => Promise<void>;
  createProfile: (name: string) => Promise<Profile | null>;
  isLoading: boolean;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileIdState] =
    useState<string>(DEFAULT_PROFILE_ID);
  const [isLoading, setIsLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSelectedProfileIdState(stored);
    setHydrated(true);
  }, []);

  const refreshProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/profiles");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      const list: Profile[] = Array.isArray(data) ? data : [];
      setProfiles(list);

      setSelectedProfileIdState((prev) => {
        const exists = list.some((p) => p.id === prev);
        if (!exists && list.length > 0) {
          const fallback = list[0].id;
          localStorage.setItem(STORAGE_KEY, fallback);
          return fallback;
        }
        return prev;
      });
    } catch (err) {
      console.error("Profile laden:", err);
      setProfiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createProfile = useCallback(async (name: string): Promise<Profile | null> => {
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("Fehler beim Erstellen");
      const profile = await res.json();
      await refreshProfiles();
      setSelectedProfileIdState(profile.id);
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, profile.id);
      }
      return profile;
    } catch (err) {
      console.error("Profil erstellen:", err);
      return null;
    }
  }, [refreshProfiles]);

  const setSelectedProfileId = useCallback((id: string) => {
    setSelectedProfileIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  useEffect(() => {
    if (hydrated) refreshProfiles();
  }, [hydrated, refreshProfiles]);

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        selectedProfileId,
        setSelectedProfileId,
        refreshProfiles,
        createProfile,
        isLoading,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return ctx;
}
