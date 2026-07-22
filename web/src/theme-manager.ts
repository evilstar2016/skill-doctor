/**
 * Skill Doctor — Theme manager (additive foundation)
 *
 * Extends the existing theme support (styles.css `:root[data-theme="dark"]`
 * + localStorage key `skill-doctor-theme`) with a third "system" state that
 * follows the OS preference via `prefers-color-scheme`.
 *
 * Behavior contract:
 *  - 'light'  -> sets data-theme="light"  (always light)
 *  - 'dark'   -> sets data-theme="dark"   (always dark)
 *  - 'system' -> removes data-theme        (theme-system.css media query drives it)
 *
 * Fully backward compatible: existing stored 'light'/'dark' values keep working.
 */
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'skill-doctor-theme';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** Apply the stored theme once at startup (call from main.tsx or App mount). */
export function initTheme(): Theme {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}

/**
 * React hook: returns the current theme and a setter that applies it immediately.
 * Replaces the inline `useState<Theme>` + `useEffect` currently in App.tsx.
 */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Keep in sync if the OS preference changes while in 'system' mode.
  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = (next: Theme) => setThemeState(next);
  return [theme, setTheme];
}
