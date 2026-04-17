import type { ClaudeSession } from "./types";
import { formatCwd, isWindows } from "./utils";

interface SidebarGroup {
	label: string;
	sessions: ClaudeSession[];
}

export type SortMode = "active" | "date" | "alpha";

export function sortActiveFirst(sessions: ClaudeSession[]): ClaudeSession[] {
	return [...sessions].sort((a, b) => {
		const ao = a.status === "active" ? 0 : 1;
		const bo = b.status === "active" ? 0 : 1;
		return ao - bo || (b.last_modified || b.started_at) - (a.last_modified || a.started_at);
	});
}

export function sortByDate(sessions: ClaudeSession[]): ClaudeSession[] {
	return [...sessions].sort(
		(a, b) => (b.last_modified || b.started_at) - (a.last_modified || a.started_at),
	);
}

export function sortAlpha(sessions: ClaudeSession[]): ClaudeSession[] {
	return [...sessions].sort((a, b) => {
		const na = (a.display_name || a.project_name).toLowerCase();
		const nb = (b.display_name || b.project_name).toLowerCase();
		return na.localeCompare(nb);
	});
}

export function sortSessions(sessions: ClaudeSession[], mode: SortMode): ClaudeSession[] {
	switch (mode) {
		case "active":
			return sortActiveFirst(sessions);
		case "date":
			return sortByDate(sessions);
		case "alpha":
			return sortAlpha(sessions);
	}
}

export function projectLabel(cwd: string): string {
	const sep = isWindows ? "\\" : "/";
	const parts = cwd.replace(isWindows ? /\\+$/ : /\/+$/, "").split(sep);
	if (parts.length >= 2) {
		return parts.slice(-2).join("/");
	}
	return parts[parts.length - 1] || cwd;
}

export function groupByStatus(
	sessions: ClaudeSession[],
	sort: SortMode = "active",
): SidebarGroup[] {
	return [
		{
			label: "ACTIVE",
			sessions: sortSessions(
				sessions.filter((s) => s.status === "active"),
				sort,
			),
		},
		{
			label: "OFFLINE",
			sessions: sortSessions(
				sessions.filter((s) => s.status === "offline"),
				sort,
			),
		},
	].filter((g) => g.sessions.length > 0);
}

export function groupByLocation(
	sessions: ClaudeSession[],
	sort: SortMode = "active",
): SidebarGroup[] {
	const map = new Map<string, ClaudeSession[]>();
	for (const s of sessions) {
		const key = projectLabel(s.cwd);
		if (!map.has(key)) {
			map.set(key, []);
		}
		map.get(key)!.push(s);
	}
	return Array.from(map.entries())
		.map(([label, sess]) => ({ label, sessions: sortSessions(sess, sort) }))
		.sort((a, b) => {
			const aActive = a.sessions.some((s) => s.status === "active") ? 0 : 1;
			const bActive = b.sessions.some((s) => s.status === "active") ? 0 : 1;
			if (aActive !== bActive) {
				return aActive - bActive;
			}
			return a.label.localeCompare(b.label);
		});
}

export function parseIgnorePatterns(raw: string): {
	include: string[];
	exclude: string[];
} {
	const include: string[] = [];
	const exclude: string[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		if (trimmed.startsWith("!")) {
			const pat = trimmed.slice(1).trim();
			if (pat) {
				include.push(pat.toLowerCase());
			}
		} else {
			exclude.push(trimmed.toLowerCase());
		}
	}
	return { include, exclude };
}

function globToRegex(pattern: string): RegExp {
	let re = "";
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];
		if (c === "*" && pattern[i + 1] === "*") {
			re += ".*";
			i++; // skip second *
			if (pattern[i + 1] === "/") {
				i++;
			} // skip trailing /
		} else if (c === "*") {
			re += "[^/]*";
		} else if (c === "?") {
			re += "[^/]";
		} else {
			re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
	}
	return new RegExp(re);
}

function matchesGlob(text: string, pattern: string): boolean {
	return globToRegex(pattern).test(text.toLowerCase());
}

function patternMatchesSession(
	pattern: string,
	name: string,
	cwd: string,
	cwdTilde: string,
): boolean {
	if (/[*?]/.test(pattern)) {
		return (
			matchesGlob(name, pattern) || matchesGlob(cwd, pattern) || matchesGlob(cwdTilde, pattern)
		);
	}
	// Path-like pattern (contains /) → exact match against cwd ending
	if (pattern.includes("/")) {
		const p = pattern.replace(/\/$/, "");
		return cwd.endsWith(p) || cwdTilde.endsWith(p);
	}
	// Plain keyword → substring match against name and cwd
	return name.includes(pattern) || cwd.includes(pattern) || cwdTilde.includes(pattern);
}

export function isSessionIgnored(
	session: ClaudeSession,
	patterns: { include: string[]; exclude: string[] },
): boolean {
	const name = (session.display_name || session.project_name).toLowerCase();
	const cwd = session.cwd.toLowerCase();
	const cwdTilde = formatCwd(cwd);

	const excluded = patterns.exclude.some((p) => patternMatchesSession(p, name, cwd, cwdTilde));
	if (!excluded) {
		return false;
	}

	const included = patterns.include.some((p) => patternMatchesSession(p, name, cwd, cwdTilde));
	return !included;
}

export function containsMatch(text: string, query: string): boolean {
	return text.toLowerCase().includes(query);
}

export function sessionMatchesFolder(session: ClaudeSession, query: string): boolean {
	const cwd = session.cwd;
	const cwdTilde = formatCwd(cwd);
	return containsMatch(cwd, query) || containsMatch(cwdTilde, query);
}

export function sessionMatchesSearch(session: ClaudeSession, query: string): boolean {
	const name = session.display_name || session.project_name;
	return (
		containsMatch(name, query) ||
		containsMatch(session.session_id, query) ||
		sessionMatchesFolder(session, query)
	);
}
