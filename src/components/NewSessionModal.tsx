import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
	formatCwd,
	modalBackdropStyle,
	modalDialogStyle,
	noAutocorrect,
	pathBasename,
} from "../utils";

interface Props {
	cwds: string[];
	onConfirm: (dir: string) => void;
	onClose: () => void;
}

export function NewSessionModal({ cwds, onConfirm, onClose }: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const [value, setValue] = useState("");
	const [activeIdx, setActiveIdx] = useState(0);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useFocusTrap(dialogRef, onClose);

	const uniqueCwds = [...new Set(cwds)];
	const filtered = value.trim()
		? uniqueCwds.filter(
				(c) =>
					c.toLowerCase().includes(value.toLowerCase()) ||
					formatCwd(c).toLowerCase().includes(value.toLowerCase()),
			)
		: uniqueCwds;

	function confirm(dir: string) {
		const trimmed = dir.trim();
		if (!trimmed) {
			return;
		}
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
			style={modalBackdropStyle}
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					onClose();
				}
			}}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation prevents backdrop dismiss */}
			<div
				ref={dialogRef}
				onClick={(e) => e.stopPropagation()}
				style={{ ...modalDialogStyle, padding: "24px 12px" }}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "8px 12px",
						borderBottom: filtered.length > 0 ? "1px solid var(--border)" : undefined,
					}}
				>
					<span style={{ color: "var(--text-muted)", fontSize: 16 }}>⌕</span>
					<input
						ref={inputRef}
						aria-label="Project path"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						{...noAutocorrect}
						onKeyDown={handleKeyDown}
						placeholder="~/path/to/project"
						style={{
							flex: 1,
							background: "none",
							border: "none",
							outline: "none",
							color: "var(--text-primary)",
							fontSize: 13,
							fontFamily: "inherit",
						}}
					/>
					<span style={{ color: "var(--text-muted)", fontSize: 11 }}>esc</span>
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
									padding: "6px 12px",
									cursor: "pointer",
									background: i === activeIdx ? "var(--item-selected)" : "none",
									fontSize: 13,
									color: i === activeIdx ? "var(--text-primary)" : "var(--text-secondary)",
									border: "none",
									textAlign: "left",
									fontFamily: "inherit",
								}}
							>
								<span style={{ fontSize: 11, color: "var(--text-muted)" }}>⌂</span>
								<span style={{ flex: 1 }}>{formatCwd(cwd)}</span>
								<span
									style={{
										fontSize: 11,
										color: "var(--text-muted)",
										fontFamily: "monospace",
									}}
								>
									{pathBasename(cwd)}
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
							padding: "8px 12px",
							fontSize: 13,
							color: "var(--text-muted)",
						}}
					>
						<span>Open in</span>
						<span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>
							{value.trim()}
						</span>
						<span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
							↵ enter
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
