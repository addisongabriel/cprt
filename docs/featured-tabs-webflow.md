# Featured Tabs — Webflow build guide

An auto-advancing tab component (Figma node `16304:1893` in the CPRT file):
a full-bleed pane area with a blurred tab bar pinned to the top. Behavior is
driven by `src/modules/featured-tabs.js` (GSAP); base styles for the generated
tab buttons live in `src/styles/featured-tabs.css`.

## How it behaves

- Tabs auto-advance in a loop. The wraparound from the last tab to the first
  always animates "forward".
- On a change, the outgoing pane fades to 0 opacity while drifting 2rem in the
  direction of travel (right when advancing right, left when going left), and
  immediately stops being clickable. The incoming pane follows from the
  opposite side of the same drift.
- Tab buttons turn white on hover (and keyboard focus); the current tab gets
  the Lumos `is-active` state class.
- Hovering anywhere inside the component pauses the loop. After the pointer
  leaves, it stays paused for the resume delay, then the normal cadence
  resumes.
- The loop only runs while the component is on screen, and transitions are
  instant (with autoplay off) for users who prefer reduced motion.

## Component structure (Designer)

Build **Section Featured Tabs** as an open component with a slot. The tab
*buttons are not authored* — the module generates one per pane inside the menu
container, labelled from each pane's hidden label text, so the bar can never
fall out of sync with the panes.

```
Section Featured Tabs                        (component)
└─ DivBlock  .featured-tabs_wrap             data-featured-tabs="wrap"  + config attrs
   ├─ DivBlock  .featured-tabs_menu          data-featured-tabs="menu"   (leave empty)
   └─ Slot "Tabs"
      └─ Featured Tab                        (component, one instance per tab)
```

**Featured Tab** (the per-tab component dropped into the slot):

```
Featured Tab                                 (component)
└─ DivBlock  .featured-tabs_pane             data-featured-tabs="pane"
   ├─ TextBlock  .featured-tabs_pane_label   data-featured-tabs="label"  ← bind "Label" prop
   ├─ Image     .featured-tabs_pane_media    ← bind "Image" prop (cover, absolute inset 0)
   ├─ DivBlock  .featured-tabs_pane_overlay  (absolute inset 0, black 20%)
   └─ DivBlock  .featured-tabs_pane_content  (relative, z-index 1, centered column;
      ├─ Heading                              top padding clears the 5rem menu)
      └─ Button "See more"
```

Suggested props on Featured Tab: **Label** (text → the hidden label TextBlock),
**Image** (image), **Heading** (text), **Button text** / **Button link**. The
pane content can also be a nested slot if layouts need to vary per tab.

Notes:

- Panes should be the only children of the slot area — the pre-JS CSS shows the
  first pane and hides the rest via `:not(:first-child)`.
- The pane, label, and button base styles ship in `featured-tabs.css`. Styling
  for `_pane_media`, `_pane_overlay`, and `_pane_content` is authored in the
  Designer as usual (variables, rem, no breakpoints).
- Visual knobs (colors, tab bar height, blur, radius) are component-scoped
  custom properties on `.featured-tabs_wrap` — override them there in the
  Designer to swap the Figma fallbacks for site variables:
  `--_featured-tabs---color-light`, `--_featured-tabs---color-dark`,
  `--_featured-tabs---tab-idle`, `--_featured-tabs---tab-active`,
  `--_featured-tabs---menu-height`, `--_featured-tabs---menu-blur`,
  `--_featured-tabs---border-width`, `--_featured-tabs---radius`.

## Config attributes

All optional, set on the `wrap` element (exposed as component props if you
want per-instance control):

| Attribute                | Default         | Meaning                                    |
| ------------------------ | --------------- | ------------------------------------------ |
| `data-tabs-interval`     | `5`             | Seconds between auto-advances              |
| `data-tabs-duration`     | `0.6`           | Seconds per pane transition                |
| `data-tabs-resume-delay` | `3`             | Extra seconds paused after the pointer leaves |
| `data-tabs-shift`        | `2`             | Rem the panes travel while crossfading     |
| `data-tabs-ease`         | `power2.inOut`  | GSAP ease name                             |
| `data-tabs-autoplay`     | `true`          | `"false"` disables the loop                |
