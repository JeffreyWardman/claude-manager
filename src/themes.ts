import type { ITheme } from "@xterm/xterm";

export interface Theme {
  id: string;
  name: string;
  bg: { sidebar: string; main: string };
  border: string;
  text: { primary: string; secondary: string; muted: string; veryMuted: string };
  item: { selected: string; hover: string };
  accent: string;
  terminal: ITheme;
}

export const themes: Theme[] = [
  {
    id: "void",
    name: "Void",
    bg: { sidebar: "#111111", main: "#0f0f0f" },
    border: "#1e1e1e",
    text: { primary: "#ededef", secondary: "#9ca3af", muted: "#4b4b4b", veryMuted: "#2a2a2a" },
    item: { selected: "rgba(255,255,255,0.07)", hover: "rgba(255,255,255,0.04)" },
    accent: "#6b7280",
    terminal: {
      background: "#0f0f0f", foreground: "#c5c8c6", cursor: "#aeafad",
      cursorAccent: "#0f0f0f", selectionBackground: "rgba(255,255,255,0.12)",
      black: "#1d1f21", red: "#cc6666", green: "#b5bd68", yellow: "#f0c674",
      blue: "#81a2be", magenta: "#b294bb", cyan: "#8abeb7", white: "#c5c8c6",
      brightBlack: "#666666", brightRed: "#d54e53", brightGreen: "#b9ca4a",
      brightYellow: "#e7c547", brightBlue: "#7aa6da", brightMagenta: "#c397d8",
      brightCyan: "#70c0b1", brightWhite: "#eaeaea",
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    bg: { sidebar: "#181825", main: "#1e1e2e" },
    border: "#313244",
    text: { primary: "#cdd6f4", secondary: "#a6adc8", muted: "#585b70", veryMuted: "#45475a" },
    item: { selected: "rgba(205,214,244,0.1)", hover: "rgba(205,214,244,0.05)" },
    accent: "#cba6f7",
    terminal: {
      background: "#1e1e2e", foreground: "#cdd6f4", cursor: "#f5e0dc",
      cursorAccent: "#1e1e2e", selectionBackground: "rgba(205,214,244,0.15)",
      black: "#45475a", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af",
      blue: "#89b4fa", magenta: "#f5c2e7", cyan: "#94e2d5", white: "#bac2de",
      brightBlack: "#585b70", brightRed: "#f38ba8", brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af", brightBlue: "#89b4fa", brightMagenta: "#f5c2e7",
      brightCyan: "#94e2d5", brightWhite: "#a6adc8",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    bg: { sidebar: "#21222c", main: "#282a36" },
    border: "#44475a",
    text: { primary: "#f8f8f2", secondary: "#6272a4", muted: "#44475a", veryMuted: "#373844" },
    item: { selected: "rgba(248,248,242,0.1)", hover: "rgba(248,248,242,0.05)" },
    accent: "#bd93f9",
    terminal: {
      background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2",
      cursorAccent: "#282a36", selectionBackground: "rgba(248,248,242,0.15)",
      black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
      brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94",
      brightYellow: "#ffffa5", brightBlue: "#d6acff", brightMagenta: "#ff92df",
      brightCyan: "#a4ffff", brightWhite: "#ffffff",
    },
  },
  {
    id: "light",
    name: "Light",
    bg: { sidebar: "#f0f0f0", main: "#fafafa" },
    border: "#e5e7eb",
    text: { primary: "#111827", secondary: "#374151", muted: "#9ca3af", veryMuted: "#d1d5db" },
    item: { selected: "rgba(0,0,0,0.07)", hover: "rgba(0,0,0,0.04)" },
    accent: "#6b7280",
    terminal: {
      background: "#fafafa", foreground: "#2e3440", cursor: "#2e3440",
      cursorAccent: "#fafafa", selectionBackground: "rgba(0,0,0,0.12)",
      black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#d08770",
      blue: "#5e81ac", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
      brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b", brightBlue: "#81a1c1", brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb", brightWhite: "#eceff4",
    },
  },
];

export const defaultTheme = themes[0];
