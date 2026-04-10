import { useEffect, useRef, useState } from "react";

interface Props {
	cwds: string[];
	onConfirm: (dir: string) => void;
	onClose: () => void;
}

function formatCwd(cwd: string): string {
	return cwd.replace(/^\/Users\/[^/]+/, "~");
}

export function NewSessionModal({ cwds, onConfirm, onClose }: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const [value, setValue] = useState("");
	const [activeIdx, setActiveIdx] = useState(0);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
			if (e.key === "Tab" && dialogRef.current) {
				const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
				);
				if (focusable.length === 0) return;
				const first = focusable[0];
				const last = focusable[focusable.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [onClose]);

	const uniqueCwds = [...new Set(cwds)];
	const filtered = value.trim()
		? uniqueCwds.filter(
				(c) =>
					c.toLowerCase().includes(value.toLowerCase()) ||
					formatCwd(c).toLowerCase().includes(value.toLowerCase()),
			)
		: uniqueCwds;

	// Reset active index when filter changes
	useEffect(() => {
		setActiveIdx(0);
	}, []);

	function confirm(dir: string) {
		const trimmed = dir.trim();
		if (!trimmed) return;
		onConfirm(trimmed);
		onClose();
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			e.preventDefault();
			if (filtered.length > 0 && activeIdx < filtered.length) {
				confirm(filtered[activeIdx]);
			} else if (value.trim()) {
				confirm(value.trim());
			}
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIdx((i) => Math.max(i - 1, 0));
		}
	}

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="New session"
			style={{
				position: "fixed",
				inset: 0,
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "center",
				paddingTop: 120,
				background: "rgba(0,0,0,0.6)",
				zIndex: 50,
				backdropFilter: "blur(4px)",
			}}
			onClick={onClose}
		>
			<div
				ref={dialogRef}
				onClick={(e) => e.stopPropagation()}
				style={{
					width: 560,
					background: "#1a1a1a",
					border: "1px solid #2a2a2a",
					borderRadius: 8,
					overflow: "hidden",
					boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
				}}
			>
				{/* Input row */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "10px 14px",
						borderBottom: filtered.length > 0 ? "1px solid #222" : undefined,
					}}
				>
					<span style={{ color: "#8a8a8a", fontSize: 15 }}>⌕</span>
					<input
						ref={inputRef}
						aria-label="Project path"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="~/path/to/project"
						style={{
							flex: 1,
							background: "none",
							border: "none",
							outline: "none",
							color: "#ededef",
							fontSize: 14,
							fontFamily: "inherit",
						}}
					/>
					<span style={{ color: "#8a8a8a", fontSize: 11 }}>esc</span>
				</div>

				{/* Suggestions */}
				{filtered.length > 0 && (
					<div
						role="listbox"
						aria-label="Recent directories"
						style={{ maxHeight: 320, overflowY: "auto", padding: "4px 0" }}
					>
						{filtered.map((cwd, i) => (
							<button
								type="button"
								key={cwd}
								role="option"
								aria-selected={i === activeIdx}
								onClick={() => confirm(cwd)}
								onMouseEnter={() => setActiveIdx(i)}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									width: "100%",
									padding: "7px 14px",
									cursor: "pointer",
									background:
										i === activeIdx ? "rgba(255,255,255,0.07)" : "none",
									fontSize: 13,
									color: i === activeIdx ? "#ededef" : "#9ca3af",
									border: "none",
									textAlign: "left",
									fontFamily: "inherit",
								}}
							>
								<span style={{ fontSize: 11, color: "#8a8a8a" }}>⌂</span>
								<span style={{ flex: 1 }}>{formatCwd(cwd)}</span>
								<span
									style={{
										fontSize: 11,
										color: "#8a8a8a",
										fontFamily: "monospace",
									}}
								>
									{cwd.split("/").pop()}
								</span>
							</button>
						))}
					</div>
				)}

				{/* Empty state when typing a custom path */}
				{filtered.length === 0 && value.trim() && (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "10px 14px",
							fontSize: 13,
							color: "#8a8a8a",
						}}
					>
						<span>Open in</span>
						<span style={{ color: "#9ca3af", fontFamily: "monospace" }}>
							{value.trim()}
						</span>
						<span
							style={{ marginLeft: "auto", fontSize: 11, color: "#8a8a8a" }}
						>
							↵ enter
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
