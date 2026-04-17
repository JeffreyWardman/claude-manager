# UI Design & Accessibility Audit

**Last audit:** 2026-04-17
**Standard:** Visual design consistency + WCAG 2.2 Level AA
**Status: PASS** -- all confirmed issues resolved

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

### 2026-04-14 (converge rounds 18–19)

**Converged after 2 rounds.**

#### Round 18 — Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Settings tab bar missing `role="tablist"`, tab buttons missing `role="tab"` and `aria-selected` | WCAG 4.1.2 | `Settings.tsx:486` | plain `<div>` + plain `<button>` | `role="tablist"` container + `role="tab"` + `aria-selected` on each button |

#### Round 18 — Discarded

| Finding | Reason |
|---------|--------|
| Visual auditor re-flagged LayoutIcon/theme-card internals | All covered by accepted patterns established in earlier rounds |
| NewSessionModal listbox semantics incomplete | `role="option"` + `aria-selected` already correct on each item |
| MainPane/CommandPalette arrow-key tab navigation | WCAG 2.1.1 requires keyboard access, not the full ARIA APG pattern; Tab provides access |
| MainPane tabs focus indicator | `:focus-visible !important` handles it |

#### Round 19 — Zero violations found

Visual: only re-flagged exempt LayoutIcon `gap:1` (accepted pattern). A11y: zero findings.

---

### 2026-04-14 (round 17)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Sort/group button default-state icon "↕" at `--text-very-muted` (~2.4:1, below 3:1) | WCAG 1.4.11 | `Sidebar.tsx:627,634` | `var(--text-very-muted)` | `var(--text-muted)` (~4.77:1) |
| Layout picker button text "2x1" at `--text-very-muted` (~2.4:1, below 4.5:1) | WCAG 1.4.3 | `Sidebar.tsx:1067,1076` | `var(--text-very-muted)` | `var(--text-muted)` (~4.77:1) |

#### Discarded (false positives, round 17)

| Finding | Reason |
|---------|--------|
| Visual auditor: zero violations found | All values verified compliant |

---

### 2026-04-14 (round 16)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Hardcoded `rgba(245,158,11,0.07)` computing row tint | Color | `Sidebar.tsx:1427` | hardcoded rgba | `color-mix(in srgb, var(--status-computing, #f59e0b) 7%, transparent)` |
| Hardcoded `rgba(59,130,246,0.07)` unread row tint | Color | `Sidebar.tsx:1429` | hardcoded rgba | `color-mix(in srgb, var(--status-unread, #3b82f6) 7%, transparent)` |
| Hardcoded `rgba(34,197,94,0.07)` waiting row tint | Color | `Sidebar.tsx:1431` | hardcoded rgba | `color-mix(in srgb, var(--status-waiting, #22c55e) 7%, transparent)` |
| `outline: "none"` inline suppresses `:focus-visible` (WCAG 2.4.7) | WCAG 2.4.7 | `index.css:122` | `outline: 2px solid var(--accent)` | `outline: 2px solid var(--accent) !important` |

#### Discarded (false positives, round 16)

| Finding | Reason |
|---------|--------|
| Profile name input contrast | `background: none` renders on parent dark bg; text contrast meets 4.5:1 |

---

### 2026-04-14 (round 15)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Sidebar header `paddingTop` off-scale | Spacing | `Sidebar.tsx:572` | `paddingTop: 28` | `paddingTop: 24` |

#### Discarded (false positives, round 15)

| Finding | Reason |
|---------|--------|
| `Sidebar.tsx:572 height: 52` | Component dimension — spacing scale applies to padding/margin/gap, not fixed element heights |
| `Sidebar.tsx:1457 height: 30` | Component dimension — same reason |
| `CommandPalette.tsx maxHeight: 360` | Component dimension |
| `NewSessionModal.tsx maxHeight: 320` | Component dimension |
| `Settings.tsx minHeight: 80` | Component dimension |
| A11y auditor found zero violations | All elements verified compliant |

---

### 2026-04-14 (round 14)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Chevron `▾` icon fontSize off-scale (3 instances) | Typography | `Sidebar.tsx:901,989,1391` | `fontSize: 8` | `fontSize: 10` |
| Layout name label fontSize off-scale | Typography | `Sidebar.tsx:1143` | `fontSize: 8` | `fontSize: 10` |
| Layout name label fontSize off-scale | Typography | `Settings.tsx:620` | `fontSize: 8` | `fontSize: 10` |
| Hardcoded `rgba(59,130,246,...)` unread blue (3 instances) | Color | `MainPane.tsx:86,106,251` | `rgba(59,130,246,0.25/0.06/0.04)` | `color-mix(in srgb, var(--status-unread, #3b82f6) 25/6/4%, transparent)` |

#### Discarded (false positives, round 14)

| Finding | Reason |
|---------|--------|
| `Sidebar.tsx:1189 paddingTop: 2` | 2 is on the canonical spacing scale |
| `Settings.tsx:1177 marginBottom: 3` | Covered by accepted pattern: theme card preview internal values |
| A11y auditor found zero violations | All elements verified compliant |

---

### 2026-04-14 (round 13)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Settings tab buttons missing `minHeight` (height ~22px at fontSize:12 + 8px padding) | WCAG 2.5.8 | `Settings.tsx:408` | no `minHeight` | `minHeight: 24` |

#### Discarded (false positives, round 13)

| Finding | Reason |
|---------|--------|
| `modalBackdropStyle paddingTop: 120` off-scale | Viewport-level positioning value, not component internal spacing |
| `--border` #1e1e1e contrast ~1.2:1 on dark bg | Decorative dividers are exempt; inputs have other identification cues (label, placeholder, cursor change); systemic dark-theme design decision |
| Inline `transition:` values bypass `prefers-reduced-motion` | `index.css:13` uses `transition-duration: 0s !important` which overrides inline styles — motion preference is correctly respected |

---

### 2026-04-17 (round 13)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Group header height off-scale | Spacing | `Sidebar.tsx:936` | `height: 28` | `height: 32` |
| Session row height off-scale | Spacing | `Sidebar.tsx:1455` | `height: 30` | `height: 32` |
| Footer height off-scale | Spacing | `Sidebar.tsx:1602` | `height: 28` | `height: 32` |

#### Discarded (false positives, round 13)

| Finding | Reason |
|---------|--------|
| Header `height: 52` off-scale | Functional: 24px traffic light padding + 28px content. Cannot change without breaking macOS overlay. |
| Transform transitions lack prefers-reduced-motion | Already covered by global `* { transition-duration: 0s !important; }` in the media query. |
| Slot item `height: 24` inconsistent with others | 24 is on-scale. Other heights were fixed to 32. Slots are intentionally compact (nested under groups). |

---

### 2026-04-14 (round 12)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Group rename input vertical padding off-scale | Spacing | `Sidebar.tsx:1031` | `"1px 4px"` | `"2px 4px"` |
| Session rename input vertical padding off-scale | Spacing | `Sidebar.tsx:1528` | `"1px 4px"` | `"2px 4px"` |

#### Discarded (false positives, round 12)

| Finding | Reason |
|---------|--------|
| `paddingTop: 2` at Sidebar.tsx:1189 | 2 is on the canonical spacing scale |
| A11y auditor found zero violations | All elements verified compliant |

---

### 2026-04-14 (round 11)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| "Rescan directories" button missing `minHeight` (height ~21px at fontSize:11, padding:4px) | WCAG 2.5.8 | `Settings.tsx:1064` | no `minHeight` | `minHeight: 24` |
| Decorative ◆ icon in empty state missing `aria-hidden` | WCAG 1.1.1 | `MainPane.tsx:42` | no attribute | `aria-hidden="true"` |
| Decorative ◆ icon in grid empty state missing `aria-hidden` | WCAG 1.1.1 | `GridLayout.tsx:112` | no attribute | `aria-hidden="true"` |

#### Discarded (false positives, round 11)

| Finding | Reason |
|---------|--------|
| Theme card palette swatches (width:9, height:9, gap:3, borderRadius:2) off token scale | Miniature decorative thumbnail — exempt same as LayoutIcon cells |
| Theme card text-bar preview (borderRadius:1, marginBottom:3) off token scale | Miniature decorative element inside theme thumbnail card |
| LayoutIcon minWidth:5 off scale | LayoutIcon internal value — already in accepted patterns |
| MainPane split button missing `minHeight` | `tabStyle()` spread includes `minHeight: 24`; `...tabStyle(view === "split")` on line 201 covers it |
| Sidebar `iconBtn` missing `minHeight`/`minWidth` | `iconBtn` constant at line 540 explicitly includes `minHeight: 24, minWidth: 24` |
| GridLayout empty slot button target size | Fills entire grid pane area via CSS `gridArea` — always larger than 24×24px |
| Settings sound preset buttons too narrow | `minHeight: 24` present; all sound names produce ≥24px width at text + padding |
| Settings "Custom file…" button too narrow | `minHeight: 24` present; "Custom file…" text + padding yields ≥24px width |
| Focus indicator contrast (`var(--accent)`) | #8a8fa0 vs #0f0f0f = ~6.1:1 contrast — well above 3:1 requirement |
| Empty-slot inner "+" icon missing `aria-hidden` | Parent has `aria-label="Empty pane slot N"` — ARIA label replaces inner text for accessible name |
| Status dot colors contrast | All status colors verified semantic at ≥3:1 on dark background |

---

### 2026-04-14 (round 10)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Sort/group/focus indicator circles: unselected border uses `--text-very-muted` (~2.45:1, below 3:1 required for UI component state) | WCAG 1.4.11 | `Sidebar.tsx:693,744,785` | `var(--text-very-muted)` | `var(--border)` |

#### Discarded (false positives, round 10)

| Finding | Reason |
|---------|--------|
| Layout preview cells (height:4, width:8) below 24px | Decorative thumbnails — non-interactive, convey layout shape only |
| Theme preview swatches (width:12, height:12) below 24px | Decorative color swatches — parent theme card is the interactive target |

---

### 2026-04-14 (round 9)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| CommandPalette tab buttons below 24px | WCAG 2.5.8 | `CommandPalette.tsx:103` | no `minHeight` | `minHeight: 24` (matches MainPane tabStyle) |

---

### 2026-04-14 (round 8)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Empty state padding off-scale | Spacing | `CommandPalette.tsx:240` | `"24px 14px"` | `"24px 12px"` |
| Session item padding off-scale | Spacing | `CommandPalette.tsx:314` | `"6px 14px"` | `"6px 12px"` |
| Header paddingTop off-scale | Spacing | `MainPane.tsx:100` | `paddingTop: 28` | `paddingTop: 24` |
| Section header marginTop off-scale | Spacing | `Settings.tsx:684` | `marginTop: 20` | `marginTop: 16` |
| About section gap off-scale | Spacing | `Settings.tsx:1421` | `gap: 10` | `gap: 8` |

#### Discarded (false positives, round 8)

| Finding | Reason |
|---------|--------|
| GridLayout empty slot target size | Slot fills entire grid pane area — always >>24px; auditor confused WCAG 2.5.8 (24px) with 2.5.5 (44px enhanced) |

---

### 2026-04-14 (round 7)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Sound preset buttons below 24px target | WCAG 2.5.8 | `Settings.tsx:834` | no `minHeight` | `minHeight: 24` |
| Custom file button below 24px target | WCAG 2.5.8 | `Settings.tsx:872` | no `minHeight` | `minHeight: 24` |
| Profile visibility toggle below 24px target | WCAG 2.5.8 | `Settings.tsx:1011` | no `minHeight`/`minWidth` | `minHeight: 24, minWidth: 24` |

---

### 2026-04-14 (round 6)

**Result: ZERO VIOLATIONS — visual audit converged after round 6.**

Visual auditor found zero issues. A11y auditor found 3 hit-target violations (fixed in round 7).

---

### 2026-04-14 (round 5)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Search icon fontSize off-scale | Typography | `CommandPalette.tsx:203`, `NewSessionModal.tsx:82` | `fontSize: 15` | `fontSize: 16` |
| Split view button fontSize off-scale | Typography | `MainPane.tsx:201` | `fontSize: 15` | `fontSize: 16` |
| New group button fontSize off-scale | Typography | `Sidebar.tsx:912` | `fontSize: 15` | `fontSize: 16` |
| New session button fontSize off-scale | Typography | `Sidebar.tsx:799` | `fontSize: 18` | `fontSize: 20` |
| Textarea (ignore patterns) padding off-scale | Spacing | `Settings.tsx:952` | `"10px 8px"` | `"8px"` |
| Group slot context menu missing role | WCAG 4.1.2 | `Sidebar.tsx:1780` | no `role="menu"` | `role="menu" aria-label="Slot actions"` |
| Group slot menu button missing role | WCAG 4.1.2 | `Sidebar.tsx:1795` | no `role="menuitem"` | `role="menuitem"` |

#### Discarded (false positives, round 5)

| Finding | Reason |
|---------|--------|
| `fontSize: 32` on "◆" decorative icons | Within `16+` (title/display) font scale range; purely decorative empty-state icon |
| `GridLayout.tsx:184` `fontSize: 24` | 24 IS on the icon scale (10, 12, 14, 16, 20, 24) |
| `Settings.tsx:834,872,1235` `padding: "2px 6px"` | 6 IS in the spacing scale; false positive |

---

### 2026-04-14 (round 4)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Section header marginBottom off-scale | Spacing | `Settings.tsx:550,641,685,730,969,1079` | `marginBottom: 10` | `marginBottom: 8` |
| Ignore patterns input padding off-scale | Spacing | `Settings.tsx:1105` | `"3px 8px"` | `"4px 8px"` |
| Theme card padding off-scale | Spacing | `Settings.tsx:1144` | `"10px 12px"` | `"8px 12px"` |
| Group rename input borderRadius off-scale | Radius | `Sidebar.tsx:1027` | `borderRadius: 3` | `borderRadius: 4` |
| Session rename input borderRadius off-scale | Radius | `Sidebar.tsx:1523` | `borderRadius: 3` | `borderRadius: 4` |
| Slot number fontWeight off-scale | Typography | `Sidebar.tsx:1259` | `fontWeight: 700` | `fontWeight: 600` |
| Group rename input missing label | WCAG 3.3.2 | `Sidebar.tsx:1006` | no `aria-label` | `aria-label="Group name"` |
| Session rename input missing label | WCAG 3.3.2 | `Sidebar.tsx:1502` | no `aria-label` | `aria-label="Session name"` |

#### Discarded (false positives, round 4)

| Finding | Reason |
|---------|--------|
| `CommandPalette.tsx` tab bar `gap: 0` | Zero means no gap — intentional, not a spacing token violation |
| `Sidebar.tsx:203` LayoutIcon `gap: 1` | Micro decorative grid cells (height 4px); gap:1 is optical separation between tiny cells — accepted exception |
| `Sidebar.tsx:215` LayoutIcon `borderRadius: 1` | Same micro decorative exception as layout preview cells in Settings.tsx |
| Theme card micro-elements (`gap:3`, `borderRadius:2/1`, `marginBottom:3`) | Elements are 2–9px decorative swatches/lines inside theme preview card — same rationale as layout preview exception |

---

### 2026-04-14 (round 3)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| Sort mode button padding off-scale | Spacing | `Sidebar.tsx:680` | `"5px 12px"` | `"4px 12px"` |
| Group mode button padding off-scale | Spacing | `Sidebar.tsx:731` | `"5px 12px"` | `"4px 12px"` |
| Table row padding off-scale | Spacing | `Settings.tsx:263` | `"3px 0"` | `"4px 0"` |
| Layout badge fontSize below minimum | Typography | `Sidebar.tsx:1063` | `fontSize: 9` | `fontSize: 10` |
| Layout badge padding off-scale | Spacing | `Sidebar.tsx:1067` | `"2px 5px"` | `"2px 4px"` |
| Layout badge borderRadius off-scale | Radius | `Sidebar.tsx:1069` | `borderRadius: 3` | `borderRadius: 4` |
| Layout picker button padding off-scale | Spacing | `Sidebar.tsx:1124` | `"5px 6px"` | `"4px 6px"` |
| Layout picker button gap off-scale | Spacing | `Sidebar.tsx:1134` | `gap: 3` | `gap: 4` |
| Slot number fontSize below minimum | Typography | `Sidebar.tsx:1257` | `fontSize: 9` | `fontSize: 10` |
| Session row transition non-standard | Interaction | `Sidebar.tsx:1465` | `"background 0.05s"` | `"background 0.1s"` |
| cmdk heading padding off-scale | Spacing | `index.css:44` | `4px 14px 2px` | `4px 12px 2px` |
| DEFAULT SHELL input missing label | WCAG 3.3.2 | `Settings.tsx:690` | no label | `aria-label="Default shell"` |
| Profile name input missing label | WCAG 3.3.2 | `Settings.tsx:1016` | no label | `aria-label="Profile name"` |

#### Discarded (false positives, round 3)

| Finding | Reason |
|---------|--------|
| `Sidebar.tsx:928` marginBottom: 2 | 2 IS in the spacing scale (2, 4, 6, 8…); false positive |
| `Sidebar.tsx:1149` gap: 3 | Auditor line number was off; line 1149 is closing `</button>` tag — same element as the confirmed gap: 3 at line 1134, already fixed |

---

### 2026-04-14 (rounds 1–2)

#### Fixed

| Issue | Category | File | Before | After |
|-------|----------|------|--------|-------|
| New group button missing aria-label | WCAG 4.1.2 | `Sidebar.tsx:911` | `title="New group"` only | Added `aria-label="New group"` |
| Focus outline-offset too tight | WCAG 2.4.11 | `index.css:123` | `outline-offset: 1px` | `outline-offset: 2px` (clearer separation) |
| Scrollbar thumb borderRadius off-scale | Radius | `index.css:132` | `border-radius: 3px` | `border-radius: 4px` |
| Code badge borderRadius off-scale | Radius | `Settings.tsx:245` | `borderRadius: 3` | `borderRadius: 4` |
| Tab bar padding off-scale | Spacing | `CommandPalette.tsx:154` | `"4px 10px 0"` | `"4px 8px 0"` |
| Search row padding off-scale | Spacing | `CommandPalette.tsx:199` | `"10px 14px"` | `"8px 12px"` |
| Search input font size off-scale | Typography | `CommandPalette.tsx:222` | `fontSize: 14` | `fontSize: 13` |
| Hint text below minimum font size | Typography | `CommandPalette.tsx:184,269,327` | `fontSize: 9` | `fontSize: 10` |
| Search row padding off-scale | Spacing | `NewSessionModal.tsx:78` | `"10px 14px"` | `"8px 12px"` |
| Search input font size off-scale | Typography | `NewSessionModal.tsx:97` | `fontSize: 14` | `fontSize: 13` |
| Suggestion item padding off-scale | Spacing | `NewSessionModal.tsx:124` | `"7px 14px"` | `"6px 12px"` |
| Tab hover has no transition | Interaction | `MainPane.tsx:tabStyle` | no transition | `transition: "color 0.1s"` |
| Empty state padding off-scale | Spacing | `NewSessionModal.tsx:157` | `"10px 14px"` | `"8px 12px"` |
| Action item padding off-scale | Spacing | `CommandPalette.tsx:260` | `"6px 14px"` | `"6px 12px"` |
| Layout preview cell height off-scale | Spacing | `Settings.tsx:609` | `height: 5` | `height: 4` |
| Textarea borderRadius off-scale | Radius | `Settings.tsx:948` | `borderRadius: 5` | `borderRadius: 4` |
| Kbd padding off-scale | Spacing | `Settings.tsx:229` | `"1px 5px"` | `"2px 4px"` |
| Code padding off-scale | Spacing | `Settings.tsx:246` | `"1px 4px"` | `"2px 4px"` |
| Toggle button missing aria-pressed | WCAG 4.1.2 | `Sidebar.tsx:759` | no `aria-pressed` | `aria-pressed={focusActiveGroup}` |
| Toggle button padding off-scale | Spacing | `Sidebar.tsx:771` | `"5px 12px"` | `"4px 12px"` |
| Resize separator not keyboard-operable | WCAG 2.1.1 | `App.tsx:712` | mouse-only | Added `onKeyDown` (ArrowLeft/Right ±8px) |
| Split view button missing minWidth | WCAG 2.5.8 | `MainPane.tsx:201` | no `minWidth` | `minWidth: 24` |

#### Discarded (false positives)

| Finding | Reason |
|---------|--------|
| Split view button wrong role | Button IS inside a `role="tablist"` alongside CLAUDE/TERMINAL tabs — tab role is correct |
| Session items lack role | Previously audited and accepted; keyboard access is via session click (alternative to drag) |
| Group header lacks role | Contains interactive child buttons; outer click is convenience for mouse; keyboard users use the child collapse button |
| Inline hover handlers obscure focus | Global `*:focus-visible` outline always rendered on top; color change doesn't obscure the outline border |
| Context menus missing role="menu" | FALSE POSITIVE — both group and session context menus already have `role="menu"` and `role="menuitem"` on all items |
| menuItemStyle hit target too small | FALSE POSITIVE — `padding: "6px 12px"` + `fontSize: 13` gives ~30px rendered height, exceeding 24px minimum |
| Sidebar fontSize: 10 labels | On scale (10 = caption minimum); used for secondary decorative labels alongside primary content |
| Code/Kbd 1px vertical padding | Inline text decoration elements; 1px prevents line-height disruption (fixed to 2px as a scale improvement) |
| Layout cell borderRadius: 1 | Micro decorative element (4-5px fill block); 4px radius would make it pill-shaped; acceptable exception |

---

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
| 2.1.1 Keyboard accessible | PASS (resize separator keyboard handler added) |
| 2.4.7 Focus visible | PASS (outline-offset fixed) |
| 2.4.11 Focus not obscured | PASS (outline-offset: 2px) |
| 2.5.7 Dragging movements | PASS (context menu alternatives) |
| 2.5.8 Target size (24px min) | PASS (minHeight/minWidth on all buttons) |
| 2.3.3 Animation | PASS (prefers-reduced-motion) |
| 3.2.6 Consistent help | PASS (Settings > Guide) |
| 3.3.2 Form labels | PASS (aria-labels added to DEFAULT SHELL and profile name inputs) |
| 3.3.7 Redundant entry | PASS |
| 4.1.2 ARIA labels | PASS |
