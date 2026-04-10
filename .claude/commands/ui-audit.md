Perform a pedantic UI design and accessibility audit. Act as a senior UI designer who obsesses over visual consistency, spacing systems, and polish — and who also enforces WCAG 2.2 AA.

## Process

1. Read every frontend file in `src/` (components, hooks, themes, CSS)
2. Audit against both checklists below
3. Fix every issue found
4. Run `bunx biome check --write` and `bun run test` to verify
5. Update `docs/audits/ui.md` with findings

---

## Visual Design Checklist

### Spacing System
- [ ] All padding/margin/gap values from scale: 2, 4, 6, 8, 12, 16, 24, 32
- [ ] Similar elements spaced identically (e.g. all section headers same margin)
- [ ] Modal padding symmetric and consistent across dialogs

### Typography Hierarchy
- [ ] Font sizes follow scale: 10 (caption), 11 (small), 12 (label), 13 (body), 14 (heading), 16+ (title)
- [ ] Font weights consistent: 400 (normal), 500 (medium), 600 (semibold)
- [ ] Letter-spacing consistent for similar element types
- [ ] No more than 5 distinct font sizes per component

### Color Discipline
- [ ] All colors use CSS variables from theme (no hardcoded hex in components)
- [ ] Status colors use `var(--status-*, fallback)` pattern
- [ ] Modal backdrop opacity consistent across all dialogs
- [ ] Box-shadow values consistent for same elevation level
- [ ] Hover/active/focus state colors consistent across similar elements

### Border & Radius
- [ ] Border-radius from scale: 4 (small), 6 (medium), 8 (large)
- [ ] Border widths consistent (1px standard, 1.5px for emphasis only)
- [ ] No off-scale border-radius values (3, 5, 7, etc.)

### Interaction Patterns
- [ ] Hover effects consistent across similar elements
- [ ] Transition duration uniform (0.1s for micro-interactions)
- [ ] Cursor styles correct on all interactive elements
- [ ] Disabled states have reduced opacity and default cursor

### Component Consistency
- [ ] Similar components share visual language (buttons, inputs, dropdowns, modals)
- [ ] Modal widths consistent (560px standard, responsive max)
- [ ] Input border/radius/padding uniform
- [ ] Icon sizes from scale: 10, 12, 14, 16, 20, 24

### Polish
- [ ] No orphaned or unused styles
- [ ] Text truncation with ellipsis on overflow-prone elements
- [ ] Scroll areas have styled scrollbars
- [ ] No visual jank on state transitions

---

## WCAG 2.2 AA Checklist

### Perceivable
- [ ] Color contrast: 4.5:1 for text, 3:1 for UI components (1.4.3)
- [ ] Non-text content has text alternatives (1.1.1)
- [ ] Info not conveyed by color alone (1.4.1)

### Operable
- [ ] All functionality keyboard-accessible (2.1.1)
- [ ] Focus order logical (2.4.3)
- [ ] Focus indicators visible, not obscured (2.4.7, 2.4.11)
- [ ] Hit targets >= 24x24px (2.5.8)
- [ ] Drag-and-drop has non-dragging alternative (2.5.7)
- [ ] Animations respect prefers-reduced-motion (2.3.3)

### Understandable
- [ ] Form inputs have labels (3.3.2)
- [ ] Consistent help location (3.2.6)
- [ ] No redundant entry (3.3.7)

### Robust
- [ ] ARIA labels on all interactive elements (4.1.2)
- [ ] Modals: role="dialog", aria-modal, focus trap
- [ ] Status indicators: role="status", aria-label
- [ ] Context menus: role="menu", role="menuitem"
- [ ] Live regions for dynamic content (4.1.3)

---

## Design Tokens (reference)

```
Spacing:  2, 4, 6, 8, 12, 16, 24, 32
Radius:   4 (small), 6 (medium), 8 (large)
Font:     10, 11, 12, 13, 14, 16
Weight:   400, 500, 600
Shadow:   "0 4px 16px rgba(0,0,0,0.4)" (dropdown)
          "0 24px 48px rgba(0,0,0,0.6)" (modal)
Backdrop: rgba(0,0,0,0.6)
Modal:    width 560px, borderRadius 8, padding 24
```

## Accepted Patterns
- Status dot colors are fixed (semantic, not theme-dependent) with CSS variable override hooks
- `--text-very-muted` contrast < 4.5:1 for decorative-only elements
- Inline styles (project convention, not CSS classes)
