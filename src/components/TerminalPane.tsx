import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useTheme } from "../ThemeContext";
import "@xterm/xterm/css/xterm.css";

interface Props {
  ptyId: string;
  cwd: string;
  cmd?: string;  // if set, spawn this instead of claude (e.g. "/bin/zsh")
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function TerminalPane({ ptyId, cwd, cmd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const { theme } = useTheme();

  // Update xterm theme when app theme changes without recreating the terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme.terminal;
    }
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      theme: theme.terminal,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10000,
      allowProposedApi: true,
    });
    termRef.current = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    let unlistenData: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    listen<string>(`pty-data-${ptyId}`, (e) => {
      term.write(b64ToBytes(e.payload));
    }).then((fn) => { unlistenData = fn; });

    listen<void>(`pty-exit-${ptyId}`, () => {
      term.writeln("\r\n\x1b[2m[process exited]\x1b[0m");
    }).then((fn) => { unlistenExit = fn; });

    const inputDisposable = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      invoke("pty_write", { id: ptyId, data: bytes }).catch(() => {});
    });

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      invoke("pty_resize", { id: ptyId, rows: term.rows, cols: term.cols }).catch(() => {});
    });
    observer.observe(container);

    requestAnimationFrame(async () => {
      fitAddon.fit();
      const { rows, cols } = term;

      const scrollback = await invoke<string | null>("pty_get_scrollback", { id: ptyId });
      if (scrollback !== null) {
        if (scrollback.length > 0) term.write(b64ToBytes(scrollback));
        invoke("pty_resize", { id: ptyId, rows, cols }).catch(() => {});
      } else {
        const skipPermissions = localStorage.getItem("skip-permissions") === "true";
        invoke("pty_spawn", { id: ptyId, cwd, rows, cols, resume: !cmd, cmd: cmd ?? null, skipPermissions }).catch((err: unknown) => {
          term.writeln(`\r\n\x1b[31mFailed to start terminal: ${err}\x1b[0m`);
        });
      }
    });

    return () => {
      termRef.current = null;
      unlistenData?.();
      unlistenExit?.();
      inputDisposable.dispose();
      observer.disconnect();
      term.dispose();
    };
  }, [ptyId, cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
