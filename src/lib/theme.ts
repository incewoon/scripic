import { useEffect, useState } from "react";

export type Theme = "warm" | "midnight" | "linen";

const STORAGE_KEY = "moara_theme_v1";
const EVENT_NAME = "moara:theme-changed";

export const THEMES: Theme[] = ["warm", "midnight", "linen"];

export function getTheme(): Theme {
  if (typeof window === "undefined") return "warm";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "warm" || v === "midnight" || v === "linen") return v;
  return "warm";
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
    // sync once in case boot happened after mount
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
