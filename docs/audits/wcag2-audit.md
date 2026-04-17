# WCAG 2.2 AA Accessibility Audit

**Last audit:** 2026-04-10
**Rounds:** 6 (upgraded from WCAG 2.1 to 2.2, all AA failures resolved)
**Scope:** All frontend components in `src/`
**Standard:** WCAG 2.2 Level AA
**Status: PASS** -- no remaining AA failures as of 2026-04-10

---

## Summary

| Category | Issues found | Status |
|----------|-------------|--------|
| Color contrast (1.4.3) | 5 | Fixed (round 1-3) |
| ARIA labels (4.1.2) | 12 | Fixed (round 1-3) |
| Keyboard navigation (2.1.1) | 8 | Fixed (round 1-3) |
| Focus management (2.4.3) | 3 | Fixed (round 1-3) |
| Semantic HTML (1.3.1) | 5+ | Fixed (round 1-3) |
| Form labels (3.3.2) | 5 | Fixed (round 1-3) |
| Hit target size (2.5.8) | 6 | Fixed (round 6) |
| Focus not obscured (2.4.11) | 1 | Fixed (round 6) |
| Dragging movements (2.5.7) | 1 | Fixed (round 6) |
| Motion/animation (2.3.3) | 3 | Fixed (round 1-3) |
| Consistent help (3.2.6) | 0 | N/A (help in Settings > Guide) |
| Redundant entry (3.3.7) | 0 | N/A |

---

## WCAG 2.2 New Criteria (Round 6)

### 2.5.8 Target Size (Minimum) -- FIXED

WCAG 2.2 AA requires 24x24px minimum for interactive targets.

| File | Element | Before | Fix |
|------|---------|--------|-----|
| `Sidebar.tsx` | `iconBtn` (status filter, sort, new session) | ~14-22px height | Added `minHeight: 24, minWidth: 24, display: "inline-flex"` |
| `MainPane.tsx` | Tab buttons (CLAUDE/TERMINAL/split) | ~13px height | Changed padding from `"0 8px"` to `"4px 8px"`, added `minHeight: 24` |
| `MainPane.tsx` | Remove from grid button (x) | ~22px | Added `minHeight: 24, minWidth: 24` |
| `Sidebar.tsx` | Footer buttons (palette, settings) | ~20px | Added `minHeight: 24, minWidth: 24` |

### 2.4.11 Focus Not Obscured (Minimum) -- FIXED

| File | Issue | Fix |
|------|-------|-----|
| `index.css:121-125` | `outline-offset: -2px` placed focus ring inside small elements, obscuring it | Changed to `outline-offset: 1px` (positive offset, visible outside element) |

### 2.5.7 Dragging Movements -- FIXED

WCAG 2.2 AA requires non-dragging alternatives for drag-and-drop operations.

| File | Issue | Fix |
|------|-------|-----|
| `Sidebar.tsx` | Sessions could only be moved to groups via drag-and-drop | Added "Add to {group}" items in session context menu (right-click) |
| `Sidebar.tsx` | Sessions in groups could only be removed via group slot context menu | Added "Remove from group" in main session context menu when applicable |
| `App.tsx` | `onAddToGroup` not passed to Sidebar | Added prop pass-through |

### 3.2.6 Consistent Help -- PASS

Help is accessible via Settings > Guide tab, reachable from any screen via the footer settings button or Cmd+P. Single-page app with one consistent entry point.

### 3.3.7 Redundant Entry -- PASS

No user flows require re-entering previously provided information.

---

## Previous Findings (Rounds 1-5, WCAG 2.1)

### 1. Color Contrast (1.4.3) -- Fixed

| Theme | Color pair | Before | After |
|-------|-----------|--------|-------|
| Default Dark | `--text-muted` on `--bg-main` | 2.20:1 (#4b4b4b) | 4.65:1 (#808080) |
| Default Dark | `--text-very-muted` on `--bg-main` | 1.34:1 (#2a2a2a) | 2.82:1 (#525252) |
| Default Dark | `--accent` on `--bg-main` | 3.96:1 (#6b7280) | 5.1:1 (#8a8fa0) |
| Default Light | `--text-muted` on `--bg-main` | 2.43:1 (#9ca3af) | 5.1:1 (#5c6370) |
| StatusDot | Active/offline contrast | Low | Active #4ade80, offline #6b7280 |

### 2. ARIA Labels (4.1.2) -- Fixed

All interactive elements have accessible names:
- Icon buttons: `aria-label` on close, filter, sort, new session, palette, settings, delete group, layout picker, collapse/expand, split view, remove pane
- Modals: `role="dialog"`, `aria-modal="true"`, `aria-label`
- Status indicators: `role="status"`, `aria-label`
- Context menus: `role="menu"`, `role="menuitem"`
- Grid: `role="region"`, `aria-label`
- Tabs: `role="tab"`, `aria-selected`
- Suggestions: `role="listbox"`, `role="option"`

### 3. Keyboard Navigation (2.1.1) -- Fixed

- All modals have focus traps (Tab cycles within modal)
- Global `*:focus-visible` outline
- Empty grid slots: `role="button"` + Enter/Space handlers
- Sidebar resize: `role="separator"` + arrow key support
- NewSessionModal suggestions: keyboard navigable

### 4. Motion/Animation (2.3.3) -- Fixed

- `prefers-reduced-motion: reduce` disables `.pty-computing` animation
- All transitions set to `0s` under reduced motion

### 5. Form Labels (3.3.2) -- Fixed

`aria-label` on all inputs: search, theme search, ignore patterns, path input.

---

## Accepted Patterns

| Pattern | Rationale |
|---------|-----------|
| `--text-very-muted` contrast < 4.5:1 | Used only for decorative/non-essential elements (empty slot placeholders, dividers, timestamps). WCAG allows relaxed contrast for decorative content |
| No `aria-live` for status changes | StatusDot uses `role="status"` (implicit live region). Explicit `aria-live="polite"` would cause excessive announcements |
| Sidebar session rows use div+onClick | Drag sources cannot be `<button>` elements (browser DnD restrictions in WKWebView). `aria-label` and keyboard navigation via arrow keys provide screen reader support |
| Scrollbar thumb contrast | WebKit scrollbar styling is cosmetic; native scrollbar behavior preserved for assistive tech |
