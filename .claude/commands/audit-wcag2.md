Run a WCAG 2.2 AA accessibility audit on this project's frontend code.

## Instructions

1. Use the Explore agent to perform a thorough WCAG 2.2 AA audit. The agent should read ALL frontend files in `src/` and check for:
   - **Color contrast** (1.4.3): Calculate actual ratios for text vs background colors in themes.ts and any hardcoded colors. Require 4.5:1 for normal text, 3:1 for large text and UI components.
   - **ARIA labels** (4.1.2, 1.1.1): All interactive elements (buttons, inputs, links) must have accessible names. Icon-only buttons need aria-label.
   - **Keyboard support** (2.1.1): All interactive elements must be operable via keyboard. Check for div-with-onClick without tabIndex/onKeyDown.
   - **Focus management** (2.4.3, 2.4.7): Modals must trap focus. All focusable elements must have visible focus indicators.
   - **Semantic HTML** (1.3.1): Proper use of roles (dialog, menu, tab, button, region, separator). Headings hierarchy.
   - **Form labels** (1.3.1, 3.3.2): All inputs must have associated labels or aria-label.
   - **Motion** (2.3.3): Animations must respect prefers-reduced-motion.
   - **Hit targets** (2.5.5): Interactive elements should be at least 44x44px.
   - **Live regions** (4.1.3): Dynamic content changes should be announced to screen readers.

2. Cross-reference findings against the existing audit at `docs/audits/wcag2-audit.md` to identify what's already been fixed vs what's new.

3. For each issue found, report: file:line, WCAG criterion, severity (Critical/High/Medium/Low), and fix suggestion.

4. Update `docs/audits/wcag2-audit.md` with the new findings and updated fix status. If no new failures are found, update the "Last audit" date and confirm "Status: PASS".

5. If issues are found, fix them. After fixing, re-audit to confirm the fixes are correct.

Files to audit:
- src/index.css
- src/themes.ts
- src/App.tsx
- src/components/Sidebar.tsx
- src/components/Settings.tsx
- src/components/MainPane.tsx
- src/components/GridLayout.tsx
- src/components/CommandPalette.tsx
- src/components/NewSessionModal.tsx
- src/components/StatusDot.tsx
- src/components/TerminalPane.tsx
