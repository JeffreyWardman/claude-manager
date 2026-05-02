import { useEffect, useRef } from "react";

export function useFocusTrap(
	dialogRef: React.RefObject<HTMLDivElement | null>,
	onEscape?: () => void,
) {
	const onEscapeRef = useRef(onEscape);
	onEscapeRef.current = onEscape;

	// biome-ignore lint/correctness/useExhaustiveDependencies: dialogRef is a stable ref; onEscape is read from ref to avoid resubscribing on every render
	useEffect(() => {
		const previouslyFocused = document.activeElement as HTMLElement | null;
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && onEscapeRef.current) {
				onEscapeRef.current();
			}
			if (e.key === "Tab" && dialogRef.current) {
				const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
				);
				if (focusable.length === 0) {
					return;
				}
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
		return () => {
			window.removeEventListener("keydown", handleKey);
			previouslyFocused?.focus();
		};
	}, []);
}
