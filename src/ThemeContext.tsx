import { invoke } from "@tauri-apps/api/core";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { defaultTheme, type Theme, themes } from "./themes";

interface ThemeContextValue {
	theme: Theme;
	allThemes: Theme[];
	setThemeId: (id: string) => void;
	previewTheme: (t: Theme) => void;
	clearPreview: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
	theme: defaultTheme,
	allThemes: themes,
	setThemeId: () => {},
	previewTheme: () => {},
	clearPreview: () => {},
});

export function applyTheme(t: Theme) {
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

function isValidTheme(v: unknown): v is Theme {
	if (!v || typeof v !== "object") {
		return false;
	}
	const o = v as Record<string, unknown>;
	const bg = o.bg as Record<string, unknown> | undefined;
	const text = o.text as Record<string, unknown> | undefined;
	const item = o.item as Record<string, unknown> | undefined;
	return (
		typeof o.id === "string" &&
		typeof o.name === "string" &&
		typeof o.accent === "string" &&
		typeof o.border === "string" &&
		!!bg &&
		typeof bg.main === "string" &&
		typeof bg.sidebar === "string" &&
		!!text &&
		typeof text.primary === "string" &&
		!!item &&
		typeof item.selected === "string"
	);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [themeId, setThemeIdState] = useState(
		() => localStorage.getItem("cm-theme") ?? defaultTheme.id,
	);
	const [customThemes, setCustomThemes] = useState<Theme[]>([]);

	useEffect(() => {
		invoke<unknown[]>("get_custom_themes")
			.then((raw) => {
				const builtinIds = new Set(themes.map((t) => t.id));
				const valid = raw.filter(isValidTheme).filter((t) => !builtinIds.has(t.id));
				setCustomThemes(valid);
			})
			.catch(() => {});
	}, []);

	const allThemes = useMemo(() => [...themes, ...customThemes], [customThemes]);

	const theme = allThemes.find((t) => t.id === themeId) ?? defaultTheme;

	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	const setThemeId = (id: string) => {
		setThemeIdState(id);
		localStorage.setItem("cm-theme", id);
	};

	const previewTheme = useCallback((t: Theme) => {
		applyTheme(t);
	}, []);

	const clearPreview = useCallback(() => {
		applyTheme(theme);
	}, [theme]);

	return (
		<ThemeContext.Provider value={{ theme, allThemes, setThemeId, previewTheme, clearPreview }}>
			{children}
		</ThemeContext.Provider>
	);
}

export const useTheme = () => useContext(ThemeContext);
