import { create } from 'zustand';

/**
 * Global Theme Management Store for LORAN LAB
 * Supports 'light' (Bright / Warm Bone), 'dark' (Deep Carbon), and 'system' modes.
 * Persists user preference to localStorage and updates <html class="dark" data-theme="...">.
 */

function getSystemPreference() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem('loran_theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // fallback if localStorage is restricted
  }
  return 'dark'; // Default to precision dark instrument mode
}

function applyThemeToDOM(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const effective = theme === 'system' ? getSystemPreference() : theme;

  if (effective === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
  }
}

// Initial hydration application
const initialTheme = getStoredTheme();
applyThemeToDOM(initialTheme);

// System theme change listener
if (typeof window !== 'undefined') {
  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      const current = getStoredTheme();
      if (current === 'system') {
        applyThemeToDOM('system');
      }
    });
  } catch {
    // ignore older browsers
  }
}

export const useThemeStore = create((set, get) => ({
  theme: initialTheme,
  effectiveTheme: initialTheme === 'system' ? getSystemPreference() : initialTheme,

  setTheme: (newTheme) => {
    try {
      localStorage.setItem('loran_theme', newTheme);
    } catch {
      // ignore
    }
    applyThemeToDOM(newTheme);
    const effective = newTheme === 'system' ? getSystemPreference() : newTheme;
    set({ theme: newTheme, effectiveTheme: effective });
  },

  toggleTheme: () => {
    const current = get().effectiveTheme;
    const next = current === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
}));
