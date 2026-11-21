export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'pesobudget_theme_v1';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
  } catch {
    // Ignore storage access errors in private contexts
  }
  return 'dark';
}

export function applyTheme(theme: ThemeMode, persist = true): ThemeMode {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', theme === 'dark' ? '#020617' : '#0f172a');
    }
  }

  if (persist && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write errors
    }
    window.dispatchEvent(new CustomEvent<ThemeMode>('pesobudget:theme_changed', { detail: theme }));
  }

  return theme;
}

export function initTheme(): ThemeMode {
  const current = getStoredTheme();
  return applyTheme(current, false);
}

export function toggleStoredTheme(current: ThemeMode): ThemeMode {
  const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
  return applyTheme(next, true);
}
