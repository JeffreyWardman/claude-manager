import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface SearchHit {
	session_id: string;
	project_name: string;
	cwd: string;
	snippet: string;
	match_count: number;
	last_modified: number;
}

interface Props {
	configDir: string;
	onClose: () => void;
	onSelect: (sessionId: string) => void;
}

export function ConversationSearch({ configDir, onClose, onSelect }: Props) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchHit[]>([]);
	const [loading, setLoading] = useState(false);
	const [activeIdx, setActiveIdx] = useState(0);
	const dialogRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useFocusTrap(dialogRef, onClose);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		if (query.trim().length < 2) {
			setResults([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		const timer = setTimeout(async () => {
			try {
				const hits = await invoke<SearchHit[]>("search_conversations", {
					configDir,
					query: query.trim(),
					limit: 50,
				});
				setResults(hits);
				setActiveIdx(0);
			} catch {
				setResults([]);
			} finally {
				setLoading(false);
			}
		}, 250);
		return () => clearTimeout(timer);
	}, [query, configDir]);

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			onClose();
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIdx((i) => Math.min(i + 1, results.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIdx((i) => Math.max(i - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			const hit = results[activeIdx];
			if (hit) {
				onSelect(hit.session_id);
			}
		}
	};

	const renderSnippet = (snippet: string, q: string) => {
		const lower = snippet.toLowerCase();
		const needle = q.toLowerCase();
		const parts: React.ReactNode[] = [];
		let i = 0;
		while (i < snippet.length) {
			const found = lower.indexOf(needle, i);
			if (found === -1) {
				parts.push(snippet.slice(i));
				break;
			}
			if (found > i) {
				parts.push(snippet.slice(i, found));
			}
			parts.push(
				<mark
					key={found}
					style={{ background: "var(--accent)", color: "var(--bg-main)", borderRadius: 2 }}
				>
					{snippet.slice(found, found + needle.length)}
				</mark>,
			);
			i = found + needle.length;
		}
		return parts;
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click only
		<div
			role="presentation"
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.5)",
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "center",
				paddingTop: "12vh",
				zIndex: 1000,
			}}
			onClick={onClose}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label="Find in conversations"
				style={{
					background: "var(--bg-sidebar)",
					border: "1px solid var(--border)",
					borderRadius: 8,
					width: 640,
					maxWidth: "90vw",
					maxHeight: "70vh",
					display: "flex",
					flexDirection: "column",
					boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
					overflow: "hidden",
				}}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={onKeyDown}
			>
				<div
					style={{
						padding: "10px 12px",
						borderBottom: "1px solid var(--border)",
					}}
				>
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search conversation contents…"
						aria-label="Search conversations"
						autoCorrect="off"
						autoCapitalize="off"
						spellCheck={false}
						style={{
							width: "100%",
							background: "var(--bg-main)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							color: "var(--text-primary)",
							fontSize: 13,
							padding: "8px 10px",
							outline: "none",
						}}
					/>
				</div>
				<div style={{ flex: 1, overflowY: "auto" }}>
					{query.trim().length < 2 ? (
						<div
							style={{
								padding: 16,
								color: "var(--text-very-muted)",
								fontSize: 11,
							}}
						>
							Type at least 2 characters to search across all sessions, including
							archived and filtered ones.
						</div>
					) : loading ? (
						<div
							style={{
								padding: 16,
								color: "var(--text-very-muted)",
								fontSize: 11,
							}}
						>
							Searching…
						</div>
					) : results.length === 0 ? (
						<div
							style={{
								padding: 16,
								color: "var(--text-very-muted)",
								fontSize: 11,
							}}
						>
							No matches.
						</div>
					) : (
						<div role="listbox">
							{results.map((hit, idx) => {
								const active = idx === activeIdx;
								return (
									<div
										key={hit.session_id}
										role="option"
										aria-selected={active}
										tabIndex={-1}
										onMouseEnter={() => setActiveIdx(idx)}
										onClick={() => onSelect(hit.session_id)}
										style={{
											padding: "8px 12px",
											background: active ? "var(--item-selected)" : "transparent",
											borderBottom: "1px solid var(--border)",
											cursor: "pointer",
										}}
									>
										<div
											style={{
												display: "flex",
												alignItems: "baseline",
												justifyContent: "space-between",
												gap: 8,
												marginBottom: 2,
											}}
										>
											<span
												style={{
													fontSize: 12,
													fontWeight: 600,
													color: "var(--text-primary)",
												}}
											>
												{hit.project_name}
											</span>
											<span
												style={{
													fontSize: 10,
													color: "var(--text-very-muted)",
												}}
											>
												{hit.match_count} match{hit.match_count === 1 ? "" : "es"}
											</span>
										</div>
										<div
											style={{
												fontSize: 11,
												color: "var(--text-muted)",
												lineHeight: 1.5,
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
										>
											{renderSnippet(hit.snippet, query.trim())}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
