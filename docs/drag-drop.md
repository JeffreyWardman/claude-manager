# Drag and Drop

## Drag sources

| Source | Data set |
|---|---|
| Session row in sidebar sessions list | `session-id` |
| Session slot in sidebar group section | `session-id` |
| Pane header (⠿) in grid | `pane-idx` |

## Drop targets

| Target | Handler |
|---|---|
| Empty slot in grid | `onDropToSlot` |
| Occupied slot in grid | `onDropToSlot` |
| Slot row in sidebar group section | `onDropToGroupSlot` |
| Divider / ungroup zone in sidebar | `onRemoveFromGroup` |

## Drop behaviour matrix

| Drag source | Target slot | Result |
|---|---|---|
| Session already in group, slot A | Same group, slot B (occupied) | Swap A ↔ B |
| Session already in group, slot A | Same group, slot B (empty) | Move A → B (swap with null) |
| Session not in group | Any group, empty slot | Add to slot |
| Session not in group | Any group, occupied slot | Do nothing |
| Pane header (`pane-idx`) | Any slot in same group | Swap unconditionally |
| Any session | Ungroup zone | Remove from its group slot (set to null) |

## WebKit note

Draggable `div` elements require `userSelect: "none"` in WebKit (Tauri on macOS). Without it, WebKit interprets the mousedown as a text-selection gesture and the drag never starts.

## Occupied-pane overlay

Xterm.js renders a `<canvas>` that absorbs pointer events. When any drag is in progress (`dragstart` on `document`), a transparent `position: absolute; inset: 0` overlay is rendered above the canvas on each occupied pane. This overlay holds the `onDragOver`/`onDrop` handlers so drops over live terminals work correctly. The overlay is removed on `dragend`/`drop` so normal terminal interaction is unaffected.
