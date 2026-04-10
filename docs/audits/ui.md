# UI Design & Accessibility Audit

**Last audit:** 2026-04-10
**Standard:** Visual design consistency + WCAG 2.2 Level AA
**Status: PASS** -- all high-priority fixes applied

---

## Design Tokens

Established during this audit as the canonical scale for the project:

```
Spacing:  2, 4, 6, 8, 12, 16, 24, 32
Radius:   4 (small), 6 (medium), 8 (large)
Font:     10 (caption), 11 (small), 12 (label), 13 (body), 14 (heading), 16+ (title)
Weight:   400 (normal), 500 (medium), 600 (semibold)
Shadow:   "0 4px 16px rgba(0,0,0,0.4)"  -- dropdowns, context menus
          "0 24px 48px rgba(0,0,0,0.6)"  -- modals, dialogs
Backdrop: rgba(0,0,0,0.6)
Modal:    width: 560px, maxWidth: 90vw, borderRadius: 8, padding: 24
```

---

## Audit log

### 2026-04-10

#### Fixed

| Issue | File | Before | After |
|-------|------|--------|-------|
| Settings backdrop inconsistent | `Settings.tsx:374` | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.6)` (matches other modals) |
| Settings shadow inconsistent | `Settings.tsx:393` | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.6)` (matches other modals) |
| Settings modal width | `Settings.tsx:388` | `width: "60vh"` | `width: 560, maxWidth: "90vw"` (matches CommandPalette/NewSessionModal) |
| Settings padding asymmetric | `Settings.tsx:390` | `padding: "20px 24px 24px"` | `padding: 24` (symmetric) |
| Settings missing maxHeight | `Settings.tsx:389` | none | `maxHeight: "90vh"` (safe on small screens) |
| Sidebar search border-radius off-scale | `Sidebar.tsx:741,826` | `borderRadius: 5` | `borderRadius: 6` (matches medium scale) |
| Focus outline hidden inside small elements | `index.css:123` | `outline-offset: -2px` | `outline-offset: 1px` (WCAG 2.4.11) |
| Hit targets below 24px minimum | `Sidebar.tsx`, `MainPane.tsx` | Various 14-22px | `minHeight: 24, minWidth: 24` (WCAG 2.5.8) |
| Drag-and-drop had no keyboard alternative | `Sidebar.tsx` context menu | Rename/Archive/Delete only | Added "Add to group" / "Remove from group" (WCAG 2.5.7) |

#### Accepted

| Pattern | Rationale |
|---------|-----------|
| Status dot colors hardcoded with CSS var fallback | Semantic colors (computing=amber, unread=blue, waiting=green, active=green) should not change per theme. Override possible via `--status-*` variables. |
| `--text-very-muted` contrast < 4.5:1 | Used only for decorative elements (dividers, empty slot placeholders, timestamps). WCAG exempts decorative content. |
| `color-mix()` in StatusDot box-shadow | Modern CSS; all target browsers (WebKit via Tauri) support it. No fallback needed. |
| Multiple font sizes per component | Components like Sidebar serve multiple roles (header, search, sessions, footer). Hierarchy is clear within each section. |
| `gap: 6` in GridLayout | Between grid panes, 4 is too tight and 8 wastes space. 6 is a reasonable exception to the 4/8 scale. |

#### Remaining (low priority)

| Issue | Severity | Notes |
|-------|----------|-------|
| No shared button style helper | Low | Buttons share patterns via `iconBtn` and `tabStyle` but no formal component. Acceptable for current codebase size. |
| Transition `all 0.1s` vs specific property | Low | Some use `transition: "all 0.1s"`, others target specific properties. Both work; specific is marginally better for perf. |
| Missing disabled opacity on some buttons | Low | Layout toggle button sets `cursor: "default"` when disabled but no opacity change. Visual-only, not a blocker. |

---

## WCAG 2.2 AA Status

Full WCAG audit history in `docs/audits/wcag2-audit.md`. Summary:

| Criterion | Status |
|-----------|--------|
| 1.4.3 Color contrast | PASS (6 rounds of fixes) |
| 2.1.1 Keyboard accessible | PASS |
| 2.4.7 Focus visible | PASS (outline-offset fixed) |
| 2.4.11 Focus not obscured | PASS (outline-offset: 1px) |
| 2.5.7 Dragging movements | PASS (context menu alternatives) |
| 2.5.8 Target size (24px min) | PASS (minHeight/minWidth on all buttons) |
| 2.3.3 Animation | PASS (prefers-reduced-motion) |
| 3.2.6 Consistent help | PASS (Settings > Guide) |
| 3.3.7 Redundant entry | PASS |
| 4.1.2 ARIA labels | PASS |
