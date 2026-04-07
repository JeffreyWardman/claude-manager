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
  const [value, setValue] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const uniqueCwds = [...new Set(cwds)];
  const filtered = value.trim()
    ? uniqueCwds.filter((c) => c.toLowerCase().includes(value.toLowerCase()) || formatCwd(c).toLowerCase().includes(value.toLowerCase()))
    : uniqueCwds;

  // Reset active index when filter changes
  useEffect(() => { setActiveIdx(0); }, [value]);

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
          <span style={{ color: "#4b4b4b", fontSize: 15 }}>⌕</span>
          <input
            ref={inputRef}
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
          <span style={{ color: "#3b3b3b", fontSize: 11 }}>esc</span>
        </div>

        {/* Suggestions */}
        {filtered.length > 0 && (
          <div style={{ maxHeight: 320, overflowY: "auto", padding: "4px 0" }}>
            {filtered.map((cwd, i) => (
              <div
                key={cwd}
                onClick={() => confirm(cwd)}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 14px",
                  cursor: "pointer",
                  background: i === activeIdx ? "rgba(255,255,255,0.07)" : "none",
                  fontSize: 13,
                  color: i === activeIdx ? "#ededef" : "#9ca3af",
                }}
              >
                <span style={{ fontSize: 11, color: "#4b4b4b" }}>⌂</span>
                <span style={{ flex: 1 }}>{formatCwd(cwd)}</span>
                <span style={{ fontSize: 11, color: "#3b3b3b", fontFamily: "monospace" }}>
                  {cwd.split("/").pop()}
                </span>
              </div>
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
              color: "#4b4b4b",
            }}
          >
            <span>Open in</span>
            <span style={{ color: "#9ca3af", fontFamily: "monospace" }}>{value.trim()}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#3b3b3b" }}>↵ enter</span>
          </div>
        )}
      </div>
    </div>
  );
}
