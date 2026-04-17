import type { ClaudeSession } from "./types";

export const isWindows = navigator.platform?.toLowerCase().includes("win") ?? false;
const sep = isWindows ? "\\" : "/";

export function formatCwd(cwd: string): string {
	if (isWindows) {
		return cwd.replace(/^C:\\Users\\[^\\]+/, "~");
	}
	return cwd.replace(/^\/[Uu]sers\/[^/]+/, "~");
}

export function pathBasename(filepath: string): string {
	const trimmed = isWindows ? filepath.replace(/\\+$/, "") : filepath.replace(/\/+$/, "");
	return trimmed.split(sep).pop() ?? "";
}

export function sessionDisplayName(session: ClaudeSession): string {
	return session.display_name || `${session.project_name}-${session.session_id.slice(0, 5)}`;
}

export const modalBackdropStyle = {
	position: "fixed" as const,
	inset: 0,
	display: "flex",
	alignItems: "flex-start" as const,
	justifyContent: "center" as const,
	paddingTop: 120,
	background: "rgba(0,0,0,0.6)",
	zIndex: 50,
	backdropFilter: "blur(4px)",
};

export const modalDialogStyle = {
	width: 560,
	background: "var(--bg-sidebar)",
	border: "1px solid var(--border)",
	borderRadius: 8,
	overflow: "hidden" as const,
	boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
};

export const menuItemStyle = {
	display: "block" as const,
	width: "100%",
	background: "none",
	border: "none",
	color: "var(--text-secondary)",
	fontSize: 13,
	textAlign: "left" as const,
	padding: "6px 12px",
	cursor: "pointer",
	fontFamily: "inherit",
};

export function menuItemHover(e: React.MouseEvent<HTMLButtonElement>) {
	e.currentTarget.style.background = "var(--item-hover)";
}

export function menuItemUnhover(e: React.MouseEvent<HTMLButtonElement>) {
	e.currentTarget.style.background = "none";
}

export function defaultShell(): string {
	const platform = navigator.platform?.toLowerCase() ?? "";
	if (platform.includes("win")) {
		return "powershell";
	}
	if (platform.includes("mac")) {
		return "/bin/zsh";
	}
	return "/bin/bash";
}

export const noAutocorrect = {
	autoCorrect: "off",
	autoCapitalize: "off",
	spellCheck: false,
} as const;
