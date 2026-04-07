export type SessionStatus = "active" | "offline";
export type PaneLayout = "1x1" | "2x1" | "1x2" | "2x2";

export interface PaneGroup {
  id: string;
  name: string;
  layout: PaneLayout;
  slots: (string | null)[];
}

export interface ClaudeSession {
  pid: number;
  session_id: string;
  cwd: string;
  project_name: string;
  started_at: number;
  status: SessionStatus;
  display_name: string | null;
  git_branch: string | null;
  pending_rename: string | null;
}
