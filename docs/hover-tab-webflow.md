# Hover Tab — Webflow ↔ JS contract

GSAP auto-advancing tabs (Figma node `16304:1893`) powered by
`src/modules/hover-tab.js`, wired to the **Hover Tab Layout** and
**Hover Tab Item** components on the CPRT site.

## Hook attributes (already set on the component definitions)

The module targets these attributes, not class names, so classes can be
renamed freely in the Designer:

| Attribute                  | Element                                    |
| -------------------------- | ------------------------------------------ |
| `data-hover-tab="wrap"`    | Hover Tab Layout root (`hover-tab_wrap`)   |
| `data-hover-tab="item"`    | Hover Tab Item root (`hover-tab_item`)     |
| `data-hover-tab="trigger"` | `hover-tab_item_trigger`                   |
| `data-hover-tab="pane"`    | `hover-tab_layout`                         |

## What the module does

- Auto-advances through the items in a loop; the last→first wraparound always
  animates forward.
- On a change, the outgoing pane fades to 0 opacity while drifting 2rem in the
  direction of travel (right when advancing right, left when going left) and
  immediately becomes unclickable; the incoming pane follows in from the
  opposite side. Inactive panes stay `visibility: hidden` / unclickable.
- Activates an item when its trigger is hovered (mouse only) or clicked.
- Hovering anywhere inside the component pauses the loop; after the pointer
  leaves it stays paused for the resume delay, then the cadence resumes.
- Toggles the Lumos **`is-active`** state class on the current Hover Tab Item
  root — style the active trigger/pane in the Designer with the state system
  (`--_state---true` / `--_state---false` formulas on descendants).
- Runs only while on screen (IntersectionObserver); transitions are instant
  and autoplay is off under `prefers-reduced-motion`.

## Styling expectations (Designer-owned)

- Panes should be absolutely stacked within the wrap (the module only animates
  opacity/translate — it does not position them).
- Tab-turns-white-on-hover is pure CSS: `data-trigger="hover"` on the trigger
  and color formulas on its children, per the Lumos trigger system.
- A tiny rule in `src/styles/hover-tab.css` hides every pane but the first
  until the module initializes, to avoid a flash of stacked panes. It assumes
  each item is a direct `:first-child`-addressable sibling in its container.

## Config attributes

All optional, set on the Hover Tab Layout root (expose as component props for
per-instance control):

| Attribute                  | Default        | Meaning                                       |
| -------------------------- | -------------- | --------------------------------------------- |
| `data-tabs-interval`       | `5`            | Seconds between auto-advances                 |
| `data-tabs-duration`       | `0.6`          | Seconds per pane transition                   |
| `data-tabs-resume-delay`   | `3`            | Extra seconds paused after the pointer leaves |
| `data-tabs-shift`          | `2`            | Rem the panes travel while crossfading        |
| `data-tabs-ease`           | `power2.inOut` | GSAP ease name                                |
| `data-tabs-autoplay`       | `true`         | `"false"` disables the loop                   |
| `data-tabs-hover-activate` | `true`         | `"false"` = switch on click only              |
