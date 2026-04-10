import { describe, expect, it } from "vitest";
import {
	containsMatch,
	groupByLocation,
	groupByStatus,
	isSessionIgnored,
	parseIgnorePatterns,
	projectLabel,
	sessionMatchesSearch,
	sortActiveFirst,
	sortAlpha,
	sortByDate,
	sortSessions,
} from "./sidebarUtils";
import type { ClaudeSession } from "./types";

function makeSession(
	overrides: Partial<ClaudeSession> & { session_id: string },
): ClaudeSession {
	return {
		pid: 0,
		cwd: "/home/user/project",
		project_name: "project",
		started_at: 0,
		status: "offline",
		display_name: null,
		git_branch: null,
		pending_rename: null,
		...overrides,
	};
}

// ─── sortActiveFirst ────────────────────────────────────────────────────────

describe("sortActiveFirst", () => {
	it("places active sessions before offline", () => {
		const sessions = [
			makeSession({ session_id: "off1", status: "offline", started_at: 100 }),
			makeSession({ session_id: "act1", status: "active", started_at: 50 }),
			makeSession({ session_id: "off2", status: "offline", started_at: 200 }),
			makeSession({ session_id: "act2", status: "active", started_at: 150 }),
		];
		const sorted = sortActiveFirst(sessions);
		expect(sorted.map((s) => s.session_id)).toEqual([
			"act2",
			"act1",
			"off2",
			"off1",
		]);
	});

	it("sorts by started_at descending within the same status", () => {
		const sessions = [
			makeSession({ session_id: "a", status: "active", started_at: 10 }),
			makeSession({ session_id: "b", status: "active", started_at: 30 }),
			makeSession({ session_id: "c", status: "active", started_at: 20 }),
		];
		const sorted = sortActiveFirst(sessions);
		expect(sorted.map((s) => s.session_id)).toEqual(["b", "c", "a"]);
	});

	it("does not mutate the original array", () => {
		const sessions = [
			makeSession({ session_id: "off", status: "offline" }),
			makeSession({ session_id: "act", status: "active" }),
		];
		const original = [...sessions];
		sortActiveFirst(sessions);
		expect(sessions.map((s) => s.session_id)).toEqual(
			original.map((s) => s.session_id),
		);
	});

	it("handles empty array", () => {
		expect(sortActiveFirst([])).toEqual([]);
	});

	it("handles all same status", () => {
		const sessions = [
			makeSession({ session_id: "a", status: "offline", started_at: 5 }),
			makeSession({ session_id: "b", status: "offline", started_at: 15 }),
		];
		const sorted = sortActiveFirst(sessions);
		expect(sorted.map((s) => s.session_id)).toEqual(["b", "a"]);
	});
});

// ─── sortByDate ─────────────────────────────────────────────────────────────

describe("sortByDate", () => {
	it("sorts by started_at descending regardless of status", () => {
		const sessions = [
			makeSession({ session_id: "old", status: "active", started_at: 10 }),
			makeSession({ session_id: "new", status: "offline", started_at: 100 }),
		];
		const sorted = sortByDate(sessions);
		expect(sorted.map((s) => s.session_id)).toEqual(["new", "old"]);
	});
});

// ─── sortAlpha ──────────────────────────────────────────────────────────────

describe("sortAlpha", () => {
	it("sorts by display name alphabetically", () => {
		const sessions = [
			makeSession({ session_id: "z", display_name: "Zebra" }),
			makeSession({ session_id: "a", display_name: "Apple" }),
			makeSession({ session_id: "m", display_name: "Mango" }),
		];
		const sorted = sortAlpha(sessions);
		expect(sorted.map((s) => s.session_id)).toEqual(["a", "m", "z"]);
	});

	it("falls back to project_name when no display_name", () => {
		const sessions = [
			makeSession({ session_id: "b", project_name: "beta" }),
			makeSession({ session_id: "a", project_name: "alpha" }),
		];
		const sorted = sortAlpha(sessions);
		expect(sorted.map((s) => s.session_id)).toEqual(["a", "b"]);
	});

	it("is case-insensitive", () => {
		const sessions = [
			makeSession({ session_id: "b", display_name: "banana" }),
			makeSession({ session_id: "a", display_name: "Apple" }),
		];
		const sorted = sortAlpha(sessions);
		expect(sorted.map((s) => s.session_id)).toEqual(["a", "b"]);
	});
});

// ─── sortSessions ───────────────────────────────────────────────────────────

describe("sortSessions", () => {
	it("delegates to the correct sort function", () => {
		const sessions = [
			makeSession({
				session_id: "off",
				status: "offline",
				started_at: 100,
				display_name: "AAA",
			}),
			makeSession({
				session_id: "act",
				status: "active",
				started_at: 50,
				display_name: "ZZZ",
			}),
		];
		expect(sortSessions(sessions, "active").map((s) => s.session_id)).toEqual([
			"act",
			"off",
		]);
		expect(sortSessions(sessions, "date").map((s) => s.session_id)).toEqual([
			"off",
			"act",
		]);
		expect(sortSessions(sessions, "alpha").map((s) => s.session_id)).toEqual([
			"off",
			"act",
		]);
	});
});

// ─── groupByStatus ──────────────────────────────────────────────────────────

describe("groupByStatus", () => {
	it("separates active and offline into groups with active first", () => {
		const sessions = [
			makeSession({ session_id: "off1", status: "offline" }),
			makeSession({ session_id: "act1", status: "active" }),
		];
		const groups = groupByStatus(sessions);
		expect(groups.map((g) => g.label)).toEqual(["ACTIVE", "OFFLINE"]);
		expect(groups[0].sessions[0].session_id).toBe("act1");
		expect(groups[1].sessions[0].session_id).toBe("off1");
	});

	it("omits empty groups", () => {
		const sessions = [makeSession({ session_id: "act1", status: "active" })];
		const groups = groupByStatus(sessions);
		expect(groups).toHaveLength(1);
		expect(groups[0].label).toBe("ACTIVE");
	});

	it("sorts within each status group by recency", () => {
		const sessions = [
			makeSession({ session_id: "a", status: "active", started_at: 10 }),
			makeSession({ session_id: "b", status: "active", started_at: 30 }),
		];
		const groups = groupByStatus(sessions);
		expect(groups[0].sessions.map((s) => s.session_id)).toEqual(["b", "a"]);
	});
});

// ─── groupByLocation ────────────────────────────────────────────────────────

describe("groupByLocation", () => {
	it("groups sessions by project label", () => {
		const sessions = [
			makeSession({ session_id: "a", cwd: "/home/user/projectA" }),
			makeSession({ session_id: "b", cwd: "/home/user/projectB" }),
			makeSession({ session_id: "c", cwd: "/home/user/projectA" }),
		];
		const groups = groupByLocation(sessions);
		const projectA = groups.find((g) => g.label === "user/projectA");
		expect(projectA).toBeDefined();
		expect(projectA!.sessions).toHaveLength(2);
	});

	it("sorts active sessions above offline within a location group", () => {
		const sessions = [
			makeSession({
				session_id: "off",
				status: "offline",
				cwd: "/repos/app",
				started_at: 100,
			}),
			makeSession({
				session_id: "act",
				status: "active",
				cwd: "/repos/app",
				started_at: 50,
			}),
		];
		const groups = groupByLocation(sessions);
		expect(groups[0].sessions.map((s) => s.session_id)).toEqual(["act", "off"]);
	});

	it("sorts location groups with active sessions above all-offline groups", () => {
		const sessions = [
			makeSession({
				session_id: "off",
				status: "offline",
				cwd: "/repos/alpha",
			}),
			makeSession({ session_id: "act", status: "active", cwd: "/repos/beta" }),
		];
		const groups = groupByLocation(sessions);
		expect(groups[0].label).toBe("repos/beta");
		expect(groups[1].label).toBe("repos/alpha");
	});

	it("sorts all-offline groups alphabetically", () => {
		const sessions = [
			makeSession({ session_id: "z", status: "offline", cwd: "/repos/zeta" }),
			makeSession({ session_id: "a", status: "offline", cwd: "/repos/alpha" }),
		];
		const groups = groupByLocation(sessions);
		expect(groups.map((g) => g.label)).toEqual(["repos/alpha", "repos/zeta"]);
	});

	it("active group order is maintained when session status changes", () => {
		// Simulate: session was offline, now becomes active
		const before = [
			makeSession({
				session_id: "s1",
				status: "offline",
				cwd: "/repos/app",
				started_at: 10,
			}),
			makeSession({
				session_id: "s2",
				status: "active",
				cwd: "/repos/app",
				started_at: 5,
			}),
		];
		const groupsBefore = groupByLocation(before);
		expect(groupsBefore[0].sessions[0].session_id).toBe("s2"); // active first

		// Both active now
		const after = [
			makeSession({
				session_id: "s1",
				status: "active",
				cwd: "/repos/app",
				started_at: 10,
			}),
			makeSession({
				session_id: "s2",
				status: "active",
				cwd: "/repos/app",
				started_at: 5,
			}),
		];
		const groupsAfter = groupByLocation(after);
		expect(groupsAfter[0].sessions[0].session_id).toBe("s1"); // newer first
	});
});

// ─── projectLabel ───────────────────────────────────────────────────────────

describe("projectLabel", () => {
	it("returns last two path segments", () => {
		expect(projectLabel("/home/user/project")).toBe("user/project");
	});

	it("handles trailing slash", () => {
		expect(projectLabel("/home/user/project/")).toBe("user/project");
	});

	it("handles short paths", () => {
		expect(projectLabel("/project")).toBe("/project");
	});
});

// ─── search ─────────────────────────────────────────────────────────────────

describe("containsMatch", () => {
	it("matches case-insensitively", () => {
		expect(containsMatch("Hello World", "hello")).toBe(true);
	});

	it("returns false for non-match", () => {
		expect(containsMatch("Hello", "xyz")).toBe(false);
	});

	it("matches partial substrings", () => {
		expect(containsMatch("claude-manager", "manager")).toBe(true);
	});
});

describe("sessionMatchesSearch", () => {
	it("matches against display name", () => {
		const s = makeSession({
			session_id: "abc-123",
			display_name: "My Session",
		});
		expect(sessionMatchesSearch(s, "my ses")).toBe(true);
	});

	it("matches against project name when no display name", () => {
		const s = makeSession({
			session_id: "abc-123",
			project_name: "backend-api",
		});
		expect(sessionMatchesSearch(s, "backend")).toBe(true);
	});

	it("matches against cwd", () => {
		const s = makeSession({
			session_id: "abc-123",
			cwd: "/home/user/repos/frontend",
		});
		expect(sessionMatchesSearch(s, "repos/front")).toBe(true);
	});

	it("matches against session id", () => {
		const s = makeSession({ session_id: "abc-def-123" });
		expect(sessionMatchesSearch(s, "abc-def")).toBe(true);
	});

	it("matches cwd with tilde form", () => {
		const s = makeSession({
			session_id: "abc",
			cwd: "/Users/jeffrey/repos/frontend",
		});
		expect(sessionMatchesSearch(s, "~/repos")).toBe(true);
	});

	it("matches bare path as if prefixed with ~/", () => {
		const s = makeSession({
			session_id: "abc",
			cwd: "/Users/jeffrey/repos/frontend",
		});
		expect(sessionMatchesSearch(s, "repos/frontend")).toBe(true);
	});

	it("matches bare folder name", () => {
		const s = makeSession({
			session_id: "abc",
			cwd: "/Users/jeffrey/repos/frontend",
		});
		expect(sessionMatchesSearch(s, "frontend")).toBe(true);
	});

	it("matches full expanded path", () => {
		const s = makeSession({
			session_id: "abc",
			cwd: "/Users/jeffrey/repos/frontend",
		});
		expect(sessionMatchesSearch(s, "/users/jeffrey/repos")).toBe(true);
	});

	it("returns false when nothing matches", () => {
		const s = makeSession({
			session_id: "abc",
			project_name: "app",
			cwd: "/tmp",
		});
		expect(sessionMatchesSearch(s, "zzz")).toBe(false);
	});
});

// ─── parseIgnorePatterns ────────────────────────────────────────────────────

describe("parseIgnorePatterns", () => {
	it("parses exclude patterns", () => {
		const { include, exclude } = parseIgnorePatterns("tmp/\nscratch");
		expect(exclude).toEqual(["tmp/", "scratch"]);
		expect(include).toEqual([]);
	});

	it("parses ! as include (un-ignore)", () => {
		const { include, exclude } = parseIgnorePatterns(
			"scratch\n!scratch/important",
		);
		expect(exclude).toEqual(["scratch"]);
		expect(include).toEqual(["scratch/important"]);
	});

	it("ignores empty lines and comments", () => {
		const { exclude } = parseIgnorePatterns("tmp\n\n# a comment\nscratch");
		expect(exclude).toEqual(["tmp", "scratch"]);
	});

	it("trims whitespace", () => {
		const { exclude } = parseIgnorePatterns("  tmp  \n  scratch  ");
		expect(exclude).toEqual(["tmp", "scratch"]);
	});
});

// ─── isSessionIgnored ───────────────────────────────────────────────────────

describe("isSessionIgnored", () => {
	it("ignores session matching an exclude pattern by cwd (exact folder)", () => {
		const s = makeSession({ session_id: "a", cwd: "/Users/user/tmp" });
		const patterns = parseIgnorePatterns("user/tmp");
		expect(isSessionIgnored(s, patterns)).toBe(true);
	});

	it("does not ignore subfolders of a path pattern", () => {
		const s = makeSession({
			session_id: "a",
			cwd: "/Users/user/repos/project",
		});
		const patterns = parseIgnorePatterns("user/repos");
		expect(isSessionIgnored(s, patterns)).toBe(false);
	});

	it("ignores exact folder with trailing slash", () => {
		const s = makeSession({ session_id: "a", cwd: "/Users/user/tmp" });
		const patterns = parseIgnorePatterns("user/tmp/");
		expect(isSessionIgnored(s, patterns)).toBe(true);
	});

	it("ignores session matching by name", () => {
		const s = makeSession({ session_id: "a", display_name: "scratch work" });
		const patterns = parseIgnorePatterns("scratch");
		expect(isSessionIgnored(s, patterns)).toBe(true);
	});

	it("does not ignore non-matching session", () => {
		const s = makeSession({ session_id: "a", cwd: "/Users/user/repos/app" });
		const patterns = parseIgnorePatterns("tmp/");
		expect(isSessionIgnored(s, patterns)).toBe(false);
	});

	it("un-ignores with ! pattern", () => {
		const s = makeSession({
			session_id: "a",
			cwd: "/Users/user/tmp/important",
		});
		const patterns = parseIgnorePatterns("tmp/\n!tmp/important");
		expect(isSessionIgnored(s, patterns)).toBe(false);
	});

	it("matches tilde path form (exact folder)", () => {
		const s = makeSession({ session_id: "a", cwd: "/Users/user/scratch" });
		const patterns = parseIgnorePatterns("~/scratch");
		expect(isSessionIgnored(s, patterns)).toBe(true);
	});

	it("does not match tilde path against subfolder", () => {
		const s = makeSession({ session_id: "a", cwd: "/Users/user/scratch/test" });
		const patterns = parseIgnorePatterns("~/scratch");
		expect(isSessionIgnored(s, patterns)).toBe(false);
	});

	it("returns false with empty patterns", () => {
		const s = makeSession({ session_id: "a", cwd: "/Users/user/repos/app" });
		const patterns = parseIgnorePatterns("");
		expect(isSessionIgnored(s, patterns)).toBe(false);
	});

	it("matches glob * pattern in path", () => {
		const s = makeSession({
			session_id: "a",
			cwd: "/Users/user/repos/tmp-project",
		});
		const patterns = parseIgnorePatterns("repos/tmp-*");
		expect(isSessionIgnored(s, patterns)).toBe(true);
	});

	it("glob * does not match across /", () => {
		const s = makeSession({
			session_id: "a",
			cwd: "/Users/user/repos/tmp/nested",
		});
		const patterns = parseIgnorePatterns("repos/tmp*nested");
		expect(isSessionIgnored(s, patterns)).toBe(false);
	});

	it("glob ** matches across /", () => {
		const s = makeSession({
			session_id: "a",
			cwd: "/Users/user/repos/deep/nested/tmp",
		});
		const patterns = parseIgnorePatterns("repos/**/tmp");
		expect(isSessionIgnored(s, patterns)).toBe(true);
	});

	it("glob ? matches single character", () => {
		const s1 = makeSession({ session_id: "a", cwd: "/Users/user/repos/app1" });
		const s2 = makeSession({ session_id: "b", cwd: "/Users/user/repos/apps" });
		const patterns = parseIgnorePatterns("repos/app?");
		expect(isSessionIgnored(s1, patterns)).toBe(true);
		expect(isSessionIgnored(s2, patterns)).toBe(true);
	});

	it("un-ignores with glob pattern", () => {
		const s = makeSession({
			session_id: "a",
			display_name: "test.env.example",
		});
		const patterns = parseIgnorePatterns("*.env*\n!*.env.example");
		expect(isSessionIgnored(s, patterns)).toBe(false);
	});

	it("ignores with glob but not un-ignored", () => {
		const s = makeSession({ session_id: "a", display_name: "prod.env" });
		const patterns = parseIgnorePatterns("*.env*\n!*.env.example");
		expect(isSessionIgnored(s, patterns)).toBe(true);
	});
});
