import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { themes, Theme, defaultTheme } from "./themes";

interface ThemeContextValue {
  theme: Theme;
  allThemes: Theme[];
  setThemeId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: defaultTheme,
  allThemes: themes,
  setThemeId: () => {},
});

function applyTheme(t: Theme) {
  const r = document.documentElement;
  r.style.setProperty("--bg-sidebar", t.bg.sidebar);
  r.style.setProperty("--bg-main", t.bg.main);
  r.style.setProperty("--border", t.border);
  r.style.setProperty("--text-primary", t.text.primary);
  r.style.setProperty("--text-secondary", t.text.secondary);
  r.style.setProperty("--text-muted", t.text.muted);
  r.style.setProperty("--text-very-muted", t.text.veryMuted);
  r.style.setProperty("--item-selected", t.item.selected);
  r.style.setProperty("--item-hover", t.item.hover);
  r.style.setProperty("--accent", t.accent);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(
    () => localStorage.getItem("cm-theme") ?? defaultTheme.id
  );

  const theme = themes.find((t) => t.id === themeId) ?? defaultTheme;

  // Apply CSS vars whenever theme changes (and on first mount)
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setThemeId = (id: string) => {
    setThemeIdState(id);
    localStorage.setItem("cm-theme", id);
  };

  return (
    <ThemeContext.Provider value={{ theme, allThemes: themes, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
