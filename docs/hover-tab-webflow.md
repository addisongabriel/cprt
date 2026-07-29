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
- Maintains a single **`div.hover-tab_active`** highlight that glides from
  trigger to trigger whenever the active tab changes (hover, click, or
  auto-advance). It lives inside the items' container (`hover-tab_slot`) so
  it shares the triggers' stacking context, and matches the active trigger's
  box each move, so it also works if trigger sizes ever differ. If a
  `.hover-tab_active` element is authored anywhere inside the wrap in the
  Designer it is adopted (style it there);
  otherwise the module creates one, styled by `src/styles/hover-tab.css` with
  the `--_hover-tab---active-bg` custom property (default white 75%). With the
  highlight on, drop any per-item active *background* styling — keep `is-active`
  styles for text color only. Triggers need `position` + `z-index` so their
  text paints above the highlight.
- Runs only while on screen (IntersectionObserver); transitions are instant
  and autoplay is off under `prefers-reduced-motion`.
- CSS-only (no JS): hovering or keyboard-focusing the pane's `button_main_wrap`
  zooms the pane's image (`.u-image-wrapper`, scoped inside the pane) to 1.05.
  Tune with `--_hover-tab---zoom-scale` / `--_hover-tab---zoom-duration` on
  `hover-tab_wrap`.

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
| `data-tabs-highlight`      | `true`         | `"false"` disables the sliding highlight      |
| `data-tabs-highlight-duration` | `0.4`      | Seconds the highlight glides between triggers |
