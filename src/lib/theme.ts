import { useEffect, useState } from "react";

export type Theme = "timeless" | "minimal" | "storyteller";

const STORAGE_KEY = "moara_theme_v1";
const EVENT_NAME = "moara:theme-changed";

export const THEMES: Theme[] = ["timeless", "minimal", "storyteller"];
const DEFAULT_THEME: Theme = "timeless";

export function getTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "timeless" || v === "minimal" || v === "storyteller") return v;
  if (v !== null) {
    // migrate legacy values (warm/midnight/linen) → default
    try { window.localStorage.setItem(STORAGE_KEY, DEFAULT_THEME); } catch {}
  }
  return DEFAULT_THEME;
}

export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: theme }));
}

export function applyThemeOnBoot() {
  if (typeof window === "undefined") return;
  document.documentElement.dataset.theme = getTheme();
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  useEffect(() => {
    const onChange = (e: Event) => {
      const t = (e as CustomEvent<Theme>).detail;
      if (t) setThemeState(t);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setThemeState(getTheme());
    };
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onStorage);
    setThemeState(getTheme());
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = (t: Theme) => {
    setTheme(t);
    setThemeState(t);
  };

  return [theme, update];
}
