import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark' | 'system';

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
};

const DEFAULT_STORAGE_KEY = 'bilim-theme';

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(storageKey: string, defaultTheme: Theme): Theme {
  if (typeof window === 'undefined') {
    return defaultTheme;
  }

  const storedTheme = window.localStorage.getItem(storageKey);

  return isTheme(storedTheme) ? storedTheme : defaultTheme;
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return getSystemTheme();
  }

  const root = document.documentElement;
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;

  root.classList.remove('light', 'dark');
  root.classList.add(resolvedTheme);
  root.style.colorScheme = resolvedTheme;

  return resolvedTheme;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = DEFAULT_STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() =>
    getStoredTheme(storageKey, defaultTheme)
  );
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    applyTheme(getStoredTheme(storageKey, defaultTheme))
  );

  useEffect(() => {
    const nextResolvedTheme = applyTheme(theme);
    setResolvedTheme(nextResolvedTheme);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, theme);
    }
  }, [theme, storageKey]);

  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemThemeChange = () => {
      const nextResolvedTheme = applyTheme('system');
      setResolvedTheme(nextResolvedTheme);
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [theme]);

  const value = useMemo<ThemeProviderState>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: setThemeState,
    }),
    [theme, resolvedTheme]
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider.');
  }

  return context;
}