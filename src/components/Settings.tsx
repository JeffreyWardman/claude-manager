import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { applyTheme, useTheme } from "../ThemeContext";
import type { PaneLayout, Profile } from "../types";
import { defaultShell, formatCwd, noAutocorrect, pathBasename } from "../utils";

const APP_VERSION = "0.1.0";

import { LAYOUT_ORDER as TILING_OPTIONS } from "../groupOps";

// Cell definitions for layout previews: [gridColumn, gridRow]
const LAYOUT_CELLS: Record<PaneLayout, [string, string][]> = {
	"1x1": [["1", "1"]],
	"2x1": [
		["1", "1"],
		["2", "1"],
	],
	"1x2": [
		["1", "1"],
		["1", "2"],
	],
	"2x2": [
		["1", "1"],
		["2", "1"],
		["1", "2"],
		["2", "2"],
	],
	"3x1": [
		["1", "1"],
		["2", "1"],
		["3", "1"],
	],
	"1x3": [
		["1", "1"],
		["1", "2"],
		["1", "3"],
	],
	"3x2": [
		["1", "1"],
		["2", "1"],
		["3", "1"],
		["1", "2"],
		["2", "2"],
		["3", "2"],
	],
	"2x3": [
		["1", "1"],
		["2", "1"],
		["1", "2"],
		["2", "2"],
		["1", "3"],
		["2", "3"],
	],
	"2+1": [
		["1", "1"],
		["2", "1"],
		["1 / 3", "2"],
	],
	"1+2": [
		["1 / 3", "1"],
		["1", "2"],
		["2", "2"],
	],
	"3+1": [
		["1", "1"],
		["2", "1"],
		["3", "1"],
		["1 / 4", "2"],
	],
	"1+3": [
		["1 / 4", "1"],
		["1", "2"],
		["2", "2"],
		["3", "2"],
	],
};

const LAYOUT_GRID: Record<PaneLayout, { cols: number; rows: number }> = {
	"1x1": { cols: 1, rows: 1 },
	"2x1": { cols: 2, rows: 1 },
	"1x2": { cols: 1, rows: 2 },
	"2x2": { cols: 2, rows: 2 },
	"3x1": { cols: 3, rows: 1 },
	"1x3": { cols: 1, rows: 3 },
	"3x2": { cols: 3, rows: 2 },
	"2x3": { cols: 2, rows: 3 },
	"2+1": { cols: 2, rows: 2 },
	"1+2": { cols: 2, rows: 2 },
	"3+1": { cols: 3, rows: 2 },
	"1+3": { cols: 3, rows: 2 },
};

interface Props {
	onClose: () => void;
	enabledLayouts: PaneLayout[];
	onChangeEnabledLayouts: (layouts: PaneLayout[]) => void;
	profiles: Profile[];
	onSaveProfiles: (profiles: Profile[]) => void;
	onRefreshProfiles: () => void;
}

type Tab = "preferences" | "theme" | "hotkeys" | "guide" | "about";

const LIGHT_IDS = new Set([
	"default-light",
	"catppuccin-latte",
	"github-light",
	"gruvbox-light",
	"nord-light",
	"one-light",
	"rose-pine-dawn",
	"solarized-light",
	"tokyo-night-light",
]);

function isLightTheme(t: { id: string; bg: { main: string } }): boolean {
	if (LIGHT_IDS.has(t.id)) {
		return true;
	}
	// Heuristic for custom themes: parse the main bg brightness
	const hex = t.bg.main.replace("#", "");
	if (hex.length === 6) {
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		return (r * 299 + g * 587 + b * 114) / 1000 > 128;
	}
	return false;
}

function pairThemes(
	themes: typeof import("../themes").themes,
): Array<{ dark?: (typeof themes)[0]; light?: (typeof themes)[0] }> {
	const dark = themes.filter((t) => !isLightTheme(t));
	const light = themes.filter((t) => isLightTheme(t));
	const pairs: Array<{
		dark?: (typeof themes)[0];
		light?: (typeof themes)[0];
	}> = [];

	// Pin Claude pair first, then Basic/default pair
	const pinPrefixes = ["claude-", "default-"];
	const pinned = new Set<string>();
	for (const prefix of pinPrefixes) {
		const d = dark.find((t) => t.id.startsWith(prefix));
		const l = light.find((t) => t.id.startsWith(prefix));
		if (d || l) {
			pairs.push({ dark: d, light: l });
			if (d) pinned.add(d.id);
			if (l) pinned.add(l.id);
		}
	}

	const remaining = dark
		.filter((t) => !pinned.has(t.id))
		.sort((a, b) => a.name.localeCompare(b.name));
	const usedLight = new Set([...pinned]);

	for (const d of remaining) {
		// Try to find a light pair by family name
		const base = d.name.replace(/ Dark$/, "").replace(/ Mocha$/, "");
		const match = light.find(
			(l) =>
				!usedLight.has(l.id) &&
				(l.name.startsWith(base) || l.id.replace("-light", "") === d.id.replace("-dark", "")),
		);
		if (match) {
			usedLight.add(match.id);
		}
		pairs.push({ dark: d, light: match });
	}

	// Any unmatched light themes
	for (const l of light
		.filter((t) => !usedLight.has(t.id))
		.sort((a, b) => a.name.localeCompare(b.name))) {
		pairs.push({ light: l });
	}

	return pairs;
}

function fuzzyMatch(text: string, query: string): boolean {
	const lower = text.toLowerCase();
	let qi = 0;
	for (let i = 0; i < lower.length && qi < query.length; i++) {
		if (lower[i] === query[qi]) {
			qi++;
		}
	}
	return qi === query.length;
}

const HOTKEYS = [
	{ keys: "⌘K", desc: "Command palette" },
	{ keys: "⌘P", desc: "Settings" },
	{ keys: "⌘N", desc: "New window" },
	{ keys: "⌘⇧N / ⌘T", desc: "New session" },
	{ keys: "⌘M", desc: "Minimize window" },
	{ keys: "⌘W", desc: "Delete session" },
	{ keys: "⌘⌫", desc: "Delete group or session" },
	{ keys: "⌘B", desc: "Toggle sidebar" },
	{ keys: "⌃Tab", desc: "Next group" },
	{ keys: "⌃⇧Tab", desc: "Previous group" },
	{ keys: "↑ / ↓", desc: "Navigate sessions" },
	{ keys: "Enter", desc: "Rename selected" },
	{ keys: "⌘1–9", desc: "Jump to group" },
];

function P({ children }: { children: React.ReactNode }) {
	return <p style={{ margin: "4px 0" }}>{children}</p>;
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<kbd
			style={{
				fontSize: 11,
				color: "var(--text-muted)",
				background: "var(--bg-main)",
				border: "1px solid var(--border)",
				borderRadius: 4,
				padding: "2px 4px",
				fontFamily: "inherit",
			}}
		>
			{children}
		</kbd>
	);
}

function Code({ children }: { children: React.ReactNode }) {
	return (
		<code
			style={{
				fontSize: 11,
				color: "var(--accent)",
				background: "var(--bg-main)",
				borderRadius: 4,
				padding: "2px 4px",
			}}
		>
			{children}
		</code>
	);
}

function Table({ rows }: { rows: [string, string][] }) {
	return (
		<div style={{ margin: "6px 0" }}>
			{rows.map(([left, right]) => (
				<div
					key={left}
					style={{
						display: "flex",
						gap: 12,
						padding: "4px 0",
						borderBottom: "1px solid var(--border)",
					}}
				>
					<span
						style={{
							fontWeight: 500,
							color: "var(--text-primary)",
							minWidth: 110,
							flexShrink: 0,
							fontSize: 11,
						}}
					>
						{left}
					</span>
					<span style={{ fontSize: 11 }}>{right}</span>
				</div>
			))}
		</div>
	);
}

type PrefSection = "layouts" | "general" | "sound" | "ignore" | "profiles";
type GuideSection =
	| "filtering"
	| "activity"
	| "actions"
	| "ignore"
	| "groups"
	| "multiwindow"
	| "multiprofile"
	| "themes";

function SectionNav<T extends string>({
	items,
	active,
	onSelect,
}: {
	items: { key: T; label: string; hidden?: boolean }[];
	active: T;
	onSelect: (key: T) => void;
}) {
	return (
		<div
			style={{
				width: 120,
				flexShrink: 0,
				borderRight: "1px solid var(--border)",
				overflowY: "auto",
				padding: "8px 0",
			}}
		>
			{items
				.filter((item) => !item.hidden)
				.map((item) => (
					<button
						type="button"
						key={item.key}
						onClick={() => onSelect(item.key)}
						style={{
							display: "block",
							width: "100%",
							background: active === item.key ? "var(--item-selected)" : "none",
							border: "none",
							color: active === item.key ? "var(--text-primary)" : "var(--text-muted)",
							fontSize: 12,
							textAlign: "left",
							padding: "6px 12px",
							cursor: "pointer",
							fontFamily: "inherit",
						}}
						onMouseEnter={(e) => {
							if (active !== item.key) {
								e.currentTarget.style.background = "var(--item-hover)";
							}
						}}
						onMouseLeave={(e) => {
							if (active !== item.key) {
								e.currentTarget.style.background = "none";
							}
						}}
					>
						{item.label}
					</button>
				))}
		</div>
	);
}

export function Settings({
	onClose,
	enabledLayouts,
	onChangeEnabledLayouts,
	profiles,
	onSaveProfiles,
	onRefreshProfiles,
}: Props) {
	const { theme, allThemes, setThemeId, previewTheme, clearPreview } = useTheme();
	const [tab, setTab] = useState<Tab>("preferences");
	const [prefSection, setPrefSection] = useState<PrefSection>("general");
	const [guideSection, setGuideSection] = useState<GuideSection>("filtering");
	const [skipPermissions, setSkipPermissions] = useState(
		() => localStorage.getItem("skip-permissions") === "true",
	);
	const [ignorePatterns, setIgnorePatterns] = useState(
		() => localStorage.getItem("ignore-patterns") ?? "",
	);
	const [customShell, setCustomShell] = useState(() => localStorage.getItem("default-shell") ?? "");
	const [notifSound, setNotifSound] = useState(
		() => localStorage.getItem("notif-sound-enabled") === "true",
	);
	const [notifSoundPath, setNotifSoundPath] = useState(
		() => localStorage.getItem("notif-sound-path") ?? "",
	);

	const [platform, setPlatform] = useState<string>("macos");
	useEffect(() => {
		invoke<string>("get_platform")
			.then((p) => {
				setPlatform(p);
				if (p === "windows" && !localStorage.getItem("notif-sound-path")) {
					const defaultPath = "C:\\Windows\\Media\\Windows Ding.wav";
					setNotifSoundPath(defaultPath);
					localStorage.setItem("notif-sound-path", defaultPath);
				}
			})
			.catch(() => {});
	}, []);

	const handleClose = () => {
		applyTheme(theme);
		onClose();
	};
	const dialogRef = useRef<HTMLDivElement>(null);
	useFocusTrap(dialogRef, handleClose);
	const [themeSearch, setThemeSearch] = useState("");

	const tabStyle = (t: Tab) => ({
		background: "none",
		border: "none",
		cursor: "pointer",
		fontSize: 12,
		fontWeight: 500,
		color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
		padding: "4px 8px",
		minHeight: 24,
		borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
		fontFamily: "inherit",
	});

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Settings"
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1000,
			}}
			onClick={handleClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					handleClose();
				}
			}}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation prevents backdrop dismiss */}
			<div
				ref={dialogRef}
				style={{
					background: "var(--bg-sidebar)",
					border: "1px solid var(--border)",
					borderRadius: 8,
					width: 560,
					maxWidth: "90vw",
					height: "60vh",
					maxHeight: "90vh",
					padding: 24,
					display: "flex",
					flexDirection: "column",
					boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: 16,
					}}
				>
					<span
						style={{
							fontSize: 13,
							fontWeight: 600,
							color: "var(--text-primary)",
						}}
					>
						Settings
					</span>
					<button
						type="button"
						aria-label="Close settings"
						onClick={handleClose}
						style={{
							background: "none",
							border: "none",
							color: "var(--text-muted)",
							cursor: "pointer",
							fontSize: 16,
							lineHeight: 1,
							padding: "8px",
						}}
						onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
						onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
					>
						×
					</button>
				</div>

				{/* Tabs */}
				<div
					role="tablist"
					aria-label="Settings sections"
					style={{
						display: "flex",
						gap: 4,
						borderBottom: "1px solid var(--border)",
						marginBottom: 16,
					}}
				>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "preferences"}
						style={tabStyle("preferences")}
						onClick={() => setTab("preferences")}
					>
						Preferences
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "theme"}
						style={tabStyle("theme")}
						onClick={() => setTab("theme")}
					>
						Theme
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "hotkeys"}
						style={tabStyle("hotkeys")}
						onClick={() => setTab("hotkeys")}
					>
						Hotkeys
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "guide"}
						style={tabStyle("guide")}
						onClick={() => setTab("guide")}
					>
						Guide
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "about"}
						style={tabStyle("about")}
						onClick={() => setTab("about")}
					>
						About
					</button>
				</div>

				{/* Content */}
				<div
					style={{
						flex: 1,
						overflow: "hidden",
						minHeight: 0,
						display: "flex",
						flexDirection: "column",
					}}
				>
					{tab === "preferences" && (
						<div style={{ display: "flex", flex: 1, minHeight: 0 }}>
							<SectionNav
								items={[
									{ key: "general" as PrefSection, label: "General" },
									{ key: "layouts" as PrefSection, label: "Layouts" },
									{ key: "sound" as PrefSection, label: "Sound" },
									{ key: "ignore" as PrefSection, label: "Folders" },
									{
										key: "profiles" as PrefSection,
										label: "Profiles",
										hidden: profiles.length < 2,
									},
								]}
								active={prefSection}
								onSelect={setPrefSection}
							/>
							<div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
								{prefSection === "layouts" && (
									<>
										<div
											style={{
												fontSize: 10,
												fontWeight: 600,
												letterSpacing: "0.06em",
												color: "var(--text-muted)",
												marginBottom: 8,
											}}
										>
											TILING LAYOUTS
										</div>
										<div
											style={{
												display: "grid",
												gridTemplateColumns: "repeat(4, 1fr)",
												gap: 6,
											}}
										>
											{TILING_OPTIONS.map((layout) => {
												const enabled = enabledLayouts.includes(layout);
												const { cols, rows } = LAYOUT_GRID[layout];
												const cells = LAYOUT_CELLS[layout];
												return (
													<button
														type="button"
														key={layout}
														onClick={() => {
															if (layout === "1x1") {
																return;
															}
															const next = enabled
																? enabledLayouts.filter((l) => l !== layout)
																: [...enabledLayouts, layout];
															onChangeEnabledLayouts(next);
														}}
														style={{
															background: enabled ? "var(--bg-main)" : "transparent",
															border: `1.5px solid ${enabled ? "var(--accent)" : "var(--border)"}`,
															borderRadius: 6,
															padding: "8px 4px",
															cursor: layout === "1x1" ? "default" : "pointer",
															display: "flex",
															flexDirection: "column",
															alignItems: "center",
															gap: 4,
															opacity: enabled ? 1 : 0.4,
															transition: "all 0.1s",
														}}
													>
														<div
															style={{
																display: "grid",
																gridTemplateColumns: `repeat(${cols}, 1fr)`,
																gridTemplateRows: `repeat(${rows}, 1fr)`,
																gap: 1,
																color: enabled ? "var(--text-primary)" : "var(--text-muted)",
															}}
														>
															{cells.map(([gc, gr], i) => (
																<div
																	key={i}
																	style={{
																		gridColumn: gc,
																		gridRow: gr,
																		width: "100%",
																		height: 4,
																		background: "currentColor",
																		borderRadius: 1,
																		minWidth: 6,
																	}}
																/>
															))}
														</div>
														<span
															style={{
																fontSize: 10,
																fontWeight: 600,
																letterSpacing: "0.02em",
																color: enabled ? "var(--text-secondary)" : "var(--text-muted)",
															}}
														>
															{layout}
														</span>
													</button>
												);
											})}
										</div>
									</>
								)}
								{prefSection === "general" && (
									<>
										<div
											style={{
												fontSize: 10,
												fontWeight: 600,
												letterSpacing: "0.06em",
												color: "var(--text-muted)",
												marginBottom: 8,
											}}
										>
											SESSION DEFAULTS
										</div>
										<label
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
												cursor: "pointer",
												fontSize: 12,
												color: "var(--text-secondary)",
											}}
										>
											<input
												type="checkbox"
												checked={skipPermissions}
												onChange={(e) => {
													const val = e.target.checked;
													setSkipPermissions(val);
													localStorage.setItem("skip-permissions", String(val));
												}}
												style={{ accentColor: "var(--accent)" }}
											/>
											Use --dangerously-skip-permissions
										</label>
										<div
											style={{
												fontSize: 10,
												color: "var(--text-muted)",
												marginTop: 4,
												marginLeft: 24,
											}}
										>
											Applies to newly spawned sessions only
										</div>
										<div
											style={{
												fontSize: 10,
												fontWeight: 600,
												letterSpacing: "0.06em",
												color: "var(--text-muted)",
												marginTop: 16,
												marginBottom: 8,
											}}
										>
											DEFAULT SHELL
										</div>
										<input
											aria-label="Default shell"
											value={customShell}
											onChange={(e) => {
												setCustomShell(e.target.value);
												localStorage.setItem("default-shell", e.target.value);
											}}
											placeholder={defaultShell()}
											{...noAutocorrect}
											style={{
												background: "var(--bg-main)",
												border: "1px solid var(--border)",
												borderRadius: 4,
												padding: "6px 8px",
												color: "var(--text-primary)",
												fontSize: 12,
												fontFamily: "monospace",
												width: "100%",
												outline: "none",
											}}
										/>
										<div
											style={{
												fontSize: 10,
												color: "var(--text-muted)",
												marginTop: 4,
											}}
										>
											Shell used for the Terminal tab. Leave blank for system default.
										</div>
									</>
								)}
								{prefSection === "sound" && (
									<>
										<div
											style={{
												fontSize: 10,
												fontWeight: 600,
												letterSpacing: "0.06em",
												color: "var(--text-muted)",
												marginBottom: 8,
											}}
										>
											COMPLETION SOUND
										</div>
										<label
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
												cursor: "pointer",
												fontSize: 12,
												color: "var(--text-secondary)",
											}}
										>
											<input
												type="checkbox"
												checked={notifSound}
												onChange={(e) => {
													const val = e.target.checked;
													setNotifSound(val);
													localStorage.setItem("notif-sound-enabled", String(val));
												}}
												style={{ accentColor: "var(--accent)" }}
											/>
											Play sound when a session completes
										</label>
										{notifSound && (
											<div
												style={{
													marginTop: 8,
													marginLeft: 24,
													display: "flex",
													flexDirection: "column",
													gap: 6,
												}}
											>
												<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
													{(platform === "linux"
														? [
																["Bell", "/usr/share/sounds/freedesktop/stereo/bell.oga"],
																["Complete", "/usr/share/sounds/freedesktop/stereo/complete.oga"],
																[
																	"Dialog Info",
																	"/usr/share/sounds/freedesktop/stereo/dialog-information.oga",
																],
																["Message", "/usr/share/sounds/freedesktop/stereo/message.oga"],
																[
																	"Service Login",
																	"/usr/share/sounds/freedesktop/stereo/service-login.oga",
																],
															]
														: platform === "windows"
															? [
																	["Balloon", "C:\\Windows\\Media\\Windows Balloon.wav"],
																	["Chimes", "C:\\Windows\\Media\\chimes.wav"],
																	["Chord", "C:\\Windows\\Media\\chord.wav"],
																	["Ding", "C:\\Windows\\Media\\Windows Ding.wav"],
																	["Foreground", "C:\\Windows\\Media\\Windows Foreground.wav"],
																	["Notify", "C:\\Windows\\Media\\Windows Notify.wav"],
																	[
																		"Notify Calendar",
																		"C:\\Windows\\Media\\Windows Notify Calendar.wav",
																	],
																	["Notify Email", "C:\\Windows\\Media\\Windows Notify Email.wav"],
																	[
																		"Print Complete",
																		"C:\\Windows\\Media\\Windows Print complete.wav",
																	],
																	["Tada", "C:\\Windows\\Media\\tada.wav"],
																]
															: [
																	["Basso", "/System/Library/Sounds/Basso.aiff"],
																	["Blow", "/System/Library/Sounds/Blow.aiff"],
																	["Bottle", "/System/Library/Sounds/Bottle.aiff"],
																	["Frog", "/System/Library/Sounds/Frog.aiff"],
																	["Funk", "/System/Library/Sounds/Funk.aiff"],
																	["Glass", "/System/Library/Sounds/Glass.aiff"],
																	["Hero", "/System/Library/Sounds/Hero.aiff"],
																	["Morse", "/System/Library/Sounds/Morse.aiff"],
																	["Ping", "/System/Library/Sounds/Ping.aiff"],
																	["Pop", "/System/Library/Sounds/Pop.aiff"],
																	["Purr", "/System/Library/Sounds/Purr.aiff"],
																	["Sosumi", "/System/Library/Sounds/Sosumi.aiff"],
																	["Submarine", "/System/Library/Sounds/Submarine.aiff"],
																	["Tink", "/System/Library/Sounds/Tink.aiff"],
																]
													).map(([name, path]) => {
														const isSelected = notifSoundPath === path;
														return (
															<button
																type="button"
																key={name}
																onClick={() => {
																	setNotifSoundPath(path);
																	localStorage.setItem("notif-sound-path", path);
																	invoke("play_sound", { path });
																}}
																style={{
																	background: isSelected ? "var(--accent)" : "var(--bg-main)",
																	border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
																	borderRadius: 4,
																	color: isSelected ? "var(--bg-main)" : "var(--text-muted)",
																	fontSize: 10,
																	padding: "2px 6px",
																	minHeight: 24,
																	cursor: "pointer",
																	fontFamily: "inherit",
																}}
															>
																{name}
															</button>
														);
													})}
												</div>
												<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
													<button
														type="button"
														onClick={async () => {
															const { open } = await import("@tauri-apps/plugin-dialog");
															const path = await open({
																title: "Select notification sound",
																filters: [
																	{
																		name: "Audio",
																		extensions: ["mp3", "wav", "ogg", "m4a", "aac", "aiff"],
																	},
																],
															});
															if (typeof path === "string") {
																setNotifSoundPath(path);
																localStorage.setItem("notif-sound-path", path);
																import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
																	new Audio(convertFileSrc(path)).play().catch(() => {});
																});
															}
														}}
														style={{
															background: "var(--bg-main)",
															border: "1px solid var(--border)",
															borderRadius: 4,
															color: "var(--text-secondary)",
															fontSize: 10,
															padding: "2px 6px",
															minHeight: 24,
															cursor: "pointer",
															fontFamily: "inherit",
														}}
													>
														Custom file...
													</button>
													{notifSoundPath &&
														!notifSoundPath.startsWith("/System/") &&
														!notifSoundPath.startsWith("/usr/share/sounds/") &&
														!notifSoundPath.startsWith("C:\\Windows\\Media\\") && (
															<span
																style={{
																	fontSize: 10,
																	color: "var(--text-muted)",
																	overflow: "hidden",
																	textOverflow: "ellipsis",
																	whiteSpace: "nowrap",
																	flex: 1,
																}}
															>
																{pathBasename(notifSoundPath)}
															</span>
														)}
												</div>
											</div>
										)}
									</>
								)}
								{prefSection === "ignore" && (
									<>
										<div
											style={{
												fontSize: 10,
												fontWeight: 600,
												letterSpacing: "0.06em",
												color: "var(--text-muted)",
												marginBottom: 6,
											}}
										>
											IGNORE PATTERNS
										</div>
										<div
											style={{
												fontSize: 10,
												color: "var(--text-muted)",
												marginBottom: 6,
											}}
										>
											One pattern per line. Matches against session name and path (relative to home
											directory). Supports globs (<Code>*</Code>, <Code>**</Code>, <Code>?</Code>).
											Prefix with <Code>!</Code> to un-ignore. Lines starting with <Code>#</Code>{" "}
											are comments.
										</div>
										<textarea
											aria-label="Ignore patterns"
											ref={(el) => {
												if (el) {
													el.style.height = "auto";
													el.style.height = `${Math.max(80, el.scrollHeight)}px`;
												}
											}}
											value={ignorePatterns}
											onChange={(e) => {
												setIgnorePatterns(e.target.value);
												localStorage.setItem("ignore-patterns", e.target.value);
											}}
											placeholder=""
											autoCorrect="off"
											autoCapitalize="off"
											spellCheck={false}
											style={{
												width: "100%",
												minHeight: 80,
												overflow: "hidden",
												background: "var(--bg-main)",
												border: "1px solid var(--border)",
												borderRadius: 4,
												color: "var(--text-primary)",
												fontSize: 11,
												padding: "8px",
												outline: "none",
												fontFamily: "Menlo, Monaco, 'Courier New', monospace",
												resize: "vertical",
												lineHeight: 1.5,
											}}
										/>
									</>
								)}
								{prefSection === "profiles" && (
									<>
										<div
											style={{
												fontSize: 10,
												fontWeight: 600,
												letterSpacing: "0.06em",
												color: "var(--text-muted)",
												marginBottom: 8,
											}}
										>
											PROFILES
										</div>
										{(() => {
											const visible = profiles.filter((p) => !p.hidden);
											const hidden = profiles.filter((p) => p.hidden);
											const renderProfile = (profile: (typeof profiles)[0]) => (
												<div
													key={profile.id}
													style={{
														display: "flex",
														alignItems: "center",
														gap: 8,
														padding: "6px 8px",
														borderRadius: 6,
														background: "var(--item-hover)",
														opacity: profile.hidden ? 0.5 : 1,
													}}
												>
													<button
														type="button"
														aria-label={profile.hidden ? "Show profile" : "Hide profile"}
														onClick={() => {
															const updated = profiles.map((p) =>
																p.id === profile.id ? { ...p, hidden: !p.hidden } : p,
															);
															onSaveProfiles(updated);
														}}
														style={{
															background: "none",
															border: "none",
															cursor: "pointer",
															color: profile.hidden
																? "var(--text-very-muted)"
																: "var(--text-muted)",
															fontSize: 14,
															padding: "2px 4px",
															minHeight: 24,
															minWidth: 24,
															flexShrink: 0,
														}}
													>
														{profile.hidden ? "\u25E1" : "\u25E0"}
													</button>
													<input
														aria-label="Profile name"
														value={profile.name}
														{...noAutocorrect}
														onChange={(e) => {
															const updated = profiles.map((p) =>
																p.id === profile.id ? { ...p, name: e.target.value } : p,
															);
															onSaveProfiles(updated);
														}}
														style={{
															flex: 1,
															background: "none",
															border: "none",
															color: "var(--text-primary)",
															fontSize: 13,
															fontFamily: "inherit",
															outline: "none",
														}}
													/>
													<span
														style={{
															fontSize: 10,
															color: "var(--text-very-muted)",
															flexShrink: 0,
														}}
													>
														{formatCwd(profile.path)}
													</span>
												</div>
											);
											return (
												<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
													{visible.map(renderProfile)}
													{hidden.length > 0 && (
														<>
															<div
																style={{
																	display: "flex",
																	alignItems: "center",
																	gap: 8,
																	marginTop: 4,
																}}
															>
																<div style={{ flex: 1, height: 1, background: "var(--border)" }} />
																<span
																	style={{
																		fontSize: 10,
																		color: "var(--text-muted)",
																		letterSpacing: "0.06em",
																		fontWeight: 600,
																	}}
																>
																	HIDDEN
																</span>
																<div style={{ flex: 1, height: 1, background: "var(--border)" }} />
															</div>
															{hidden.map(renderProfile)}
														</>
													)}
												</div>
											);
										})()}
										<button
											type="button"
											onClick={onRefreshProfiles}
											style={{
												marginTop: 8,
												background: "none",
												border: "1px solid var(--border)",
												borderRadius: 6,
												color: "var(--text-secondary)",
												cursor: "pointer",
												fontSize: 11,
												padding: "4px 12px",
												minHeight: 24,
												fontFamily: "inherit",
											}}
										>
											Rescan directories
										</button>
									</>
								)}
							</div>
						</div>
					)}

					{tab === "theme" && (
						<div style={{ flex: 1, overflowY: "auto" }}>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									marginBottom: 8,
								}}
							>
								<div
									style={{
										fontSize: 10,
										fontWeight: 600,
										letterSpacing: "0.06em",
										color: "var(--text-muted)",
									}}
								>
									THEME
								</div>
								<input
									aria-label="Search themes"
									value={themeSearch}
									onChange={(e) => setThemeSearch(e.target.value)}
									{...noAutocorrect}
									placeholder="Search..."
									style={{
										flex: 1,
										background: "var(--bg-main)",
										border: "1px solid var(--border)",
										borderRadius: 4,
										color: "var(--text-primary)",
										fontSize: 11,
										padding: "4px 8px",
										outline: "none",
										fontFamily: "inherit",
									}}
								/>
							</div>
							<div
								role="listbox"
								aria-label="Theme list"
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 8,
								}}
								onMouseLeave={() => clearPreview()}
							>
								{pairThemes(
									allThemes.filter(
										(t) => !themeSearch || fuzzyMatch(t.name, themeSearch.toLowerCase()),
									),
								).flatMap(({ dark, light }) => {
									const renderCard = (t: (typeof allThemes)[0]) => {
										const isActive = t.id === theme.id;
										const palette = [
											t.terminal.red,
											t.terminal.green,
											t.terminal.yellow,
											t.terminal.blue,
											t.terminal.magenta,
											t.terminal.cyan,
										] as string[];
										return (
											<button
												type="button"
												key={t.id}
												onClick={() => setThemeId(t.id)}
												onMouseEnter={() => previewTheme(t)}
												style={{
													background: t.bg.main,
													border: `1.5px solid ${isActive ? t.accent : t.border}`,
													borderRadius: 6,
													padding: "8px 12px",
													cursor: "pointer",
													textAlign: "left",
													outline: "none",
													transition: "border-color 0.1s",
												}}
											>
												<div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
													{palette.map((c, i) => (
														<div
															key={i}
															style={{
																width: 9,
																height: 9,
																borderRadius: 2,
																background: c,
															}}
														/>
													))}
												</div>
												<div style={{ marginBottom: 8 }}>
													<div
														style={{
															height: 2,
															borderRadius: 1,
															background: t.text.primary,
															width: "60%",
															marginBottom: 3,
															opacity: 0.8,
														}}
													/>
													<div
														style={{
															height: 2,
															borderRadius: 1,
															background: t.text.muted,
															width: "40%",
														}}
													/>
												</div>
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
														alignItems: "center",
													}}
												>
													<span
														style={{
															fontSize: 11,
															fontWeight: 500,
															color: t.text.primary,
														}}
													>
														{t.name}
													</span>
													{isActive && <span style={{ fontSize: 10, color: t.accent }}>✓</span>}
												</div>
											</button>
										);
									};
									return [
										light ? renderCard(light) : <div key={`empty-light-${dark?.id}`} />,
										dark ? renderCard(dark) : <div key={`empty-dark-${light?.id}`} />,
									];
								})}
							</div>
						</div>
					)}

					{tab === "hotkeys" && (
						<div style={{ flex: 1, overflowY: "auto" }}>
							{HOTKEYS.map(({ keys, desc }) => (
								<div
									key={keys}
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										padding: "6px 0",
										borderBottom: "1px solid var(--border)",
									}}
								>
									<span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{desc}</span>
									<kbd
										style={{
											fontSize: 11,
											color: "var(--text-muted)",
											background: "var(--bg-main)",
											border: "1px solid var(--border)",
											borderRadius: 4,
											padding: "2px 6px",
											fontFamily: "inherit",
										}}
									>
										{keys}
									</kbd>
								</div>
							))}
						</div>
					)}

					{tab === "guide" && (
						<div style={{ display: "flex", flex: 1, minHeight: 0 }}>
							<SectionNav
								items={[
									{ key: "filtering" as GuideSection, label: "Search & Filter" },
									{ key: "activity" as GuideSection, label: "Activity" },
									{ key: "actions" as GuideSection, label: "Actions" },
									{ key: "ignore" as GuideSection, label: "Folders" },
									{ key: "groups" as GuideSection, label: "Groups" },
									{ key: "multiwindow" as GuideSection, label: "Multi-window" },
									{ key: "multiprofile" as GuideSection, label: "Multi-profile" },
									{ key: "themes" as GuideSection, label: "Themes" },
								]}
								active={guideSection}
								onSelect={setGuideSection}
							/>
							<div
								style={{
									flex: 1,
									overflowY: "auto",
									padding: 16,
									color: "var(--text-secondary)",
									fontSize: 12,
									lineHeight: 1.7,
								}}
							>
								{guideSection === "filtering" && (
									<>
										<P>The sidebar header has clickable controls for filtering and sorting:</P>
										<Table
											rows={[
												["ALL / LIVE / OFF", "Filter by status"],
												[
													"Sort/Group dropdown",
													"Sort by date or name; group by status or location",
												],
											]}
										/>
										<P>
											The search bar filters groups and sessions by name, path, or ID. Scope with a
											prefix:
										</P>
										<Table
											rows={[
												["@group:", "Search group names only"],
												["@tab:", "Search sessions/tabs only"],
												["@folder:", "Search by folder/path"],
												["(no prefix)", "Search everything"],
											]}
										/>
										<P>Folder search accepts full paths, ~/paths, or bare names (assumes ~/).</P>
									</>
								)}
								{guideSection === "activity" && (
									<>
										<P>Each session shows a coloured status dot:</P>
										<Table
											rows={[
												["Amber (pulsing)", "Claude is computing"],
												["Blue (glow)", "Completed — unread"],
												["Green (glow)", "Waiting for input"],
												["Grey", "Offline"],
											]}
										/>
										<P>
											Unread is cleared when you click the pane, click the session in the sidebar,
											or type in it.
										</P>
										<P>
											Enable a completion sound in Preferences to get an audio notification when a
											session finishes.
										</P>
									</>
								)}
								{guideSection === "actions" && (
									<>
										<P>Right-click a session in the sidebar for:</P>
										<Table
											rows={[
												["Rename", "Set a display name for the session."],
												["Delete", "Permanently removes conversation file. Cannot be undone."],
											]}
										/>
									</>
								)}
								{guideSection === "ignore" && (
									<>
										<P>
											Hide sessions from the sidebar via Preferences &gt; Ignore Patterns. One
											pattern per line, matched against session name and path (relative to home
											directory).
										</P>
										<P>
											Supports globs: <Code>*</Code> (any characters within a segment),{" "}
											<Code>**</Code> (any characters across segments), <Code>?</Code> (single
											character). Prefix with <Code>!</Code> to un-ignore. Lines starting with{" "}
											<Code>#</Code> are comments.
										</P>
									</>
								)}
								{guideSection === "groups" && (
									<>
										<P>
											Drag sessions onto a group header to add them. If the group is full, it
											automatically expands to the next enabled layout.
										</P>
										<P>
											Change tiling layouts from the layout icon in the group header. Enable or
											disable layouts in Preferences.
										</P>
										<P>
											Cycle between groups with <Kbd>Ctrl+Tab</Kbd> / <Kbd>Ctrl+Shift+Tab</Kbd>, or
											jump directly with <Kbd>Cmd+1</Kbd>–<Kbd>9</Kbd>. Delete the active group with{" "}
											<Kbd>Cmd+Delete</Kbd>.
										</P>
									</>
								)}
								{guideSection === "multiwindow" && (
									<P>
										<Kbd>Cmd+N</Kbd> opens a new window. Windows share the same session pool but
										have independent layouts. Session locking prevents two windows from resuming the
										same Claude session. New windows inherit the active profile.
									</P>
								)}
								{guideSection === "multiprofile" && (
									<P>
										If you use multiple Claude accounts via <Code>CLAUDE_CONFIG_DIR</Code>, the app
										auto-detects all <Code>~/.claude*</Code> directories. When 2+ profiles exist, a
										profile pill appears in the sidebar footer — click to switch. Each window shows
										one profile at a time. Rename or hide profiles in Preferences.
									</P>
								)}
								{guideSection === "themes" && (
									<P>
										Drop JSON theme files into <Code>~/.config/claude-manager/themes/</Code>. See
										the{" "}
										<button
											type="button"
											onClick={() => {
												import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
													openUrl(
														"https://github.com/JeffreyWardman/claude-manager/blob/main/README.md#custom-themes",
													),
												);
											}}
											style={{
												color: "var(--accent)",
												cursor: "pointer",
												background: "none",
												border: "none",
												padding: 0,
												font: "inherit",
												textDecoration: "underline",
											}}
										>
											README
										</button>{" "}
										for the full JSON schema.
									</P>
								)}
							</div>
						</div>
					)}

					{tab === "about" && (
						<div
							style={{
								flex: 1,
								overflowY: "auto",
								color: "var(--text-secondary)",
								fontSize: 12,
								lineHeight: 1.6,
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									marginBottom: 8,
								}}
							>
								<span
									style={{
										fontSize: 14,
										fontWeight: 600,
										color: "var(--text-primary)",
									}}
								>
									Claude Manager
								</span>
								<a
									href="https://github.com/JeffreyWardman/claude-manager"
									onClick={(e) => {
										e.preventDefault();
										import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
											openUrl("https://github.com/JeffreyWardman/claude-manager"),
										);
									}}
									aria-label="GitHub repository"
									style={{ color: "var(--text-muted)", lineHeight: 1, cursor: "pointer" }}
									onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
									onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
								>
									<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
										<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
									</svg>
								</a>
							</div>
							<div style={{ marginBottom: 12 }}>
								<span style={{ color: "var(--text-muted)" }}>Version </span>
								{APP_VERSION}
							</div>
							<p style={{ marginBottom: 12 }}>
								A desktop app for managing multiple Claude Code sessions side by side.
							</p>
							<p style={{ color: "var(--text-muted)", fontSize: 11 }}>
								MIT License — Jeffrey Wardman
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
