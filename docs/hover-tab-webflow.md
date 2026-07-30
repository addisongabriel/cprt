# Hover Tab — Webflow ↔ JS contract

GSAP auto-advancing tabs, wired to the **Hover Tab Layout** and **Hover Tab
Item** components on the CPRT site. Code: `src/components/hover-tab.ts`.

## Attributes (set on the component definitions, so every instance inherits)

| Attribute                  | Element                                    |
| -------------------------- | ------------------------------------------ |
| `sse-component="hover-tab"`| Hover Tab Layout root (`hover-tab_wrap`) — this is what binds the behavior |
| `data-hover-tab="item"`    | Hover Tab Item root (`hover-tab_item`)     |
| `data-hover-tab="trigger"` | `hover-tab_item_trigger`                   |
| `data-hover-tab="pane"`    | `hover-tab_layout`                         |

The three child hooks also accept the engine's own `sse-part="item" | "trigger"
| "pane"` form, so new markup can follow the engine convention without
rewriting what is already wired up. The component targets attributes rather than
class names, so classes can be renamed freely in the Designer.

## What the component does

- Auto-advances through the items in a loop; the last→first wraparound always
  animates forward.
- On a change, the outgoing pane fades to 0 opacity while drifting 2rem in the
  direction of travel (right when advancing right, left when going left) and
  immediately becomes unclickable; the incoming pane follows in from the
  opposite side. Inactive panes stay hidden and unclickable.
- Activates an item when its trigger is hovered (mouse only) or clicked.
- Hovering anywhere inside the component pauses the loop; after the pointer
  leaves it stays paused for the resume delay, then the cadence resumes.
- Toggles the Lumos **`is-active`** state class on the current Hover Tab Item
  root — style the active trigger/pane in the Designer with the state system
  (`--_state---true` / `--_state---false` formulas on descendants).
- Maintains a single **`div.hover-tab_active`** highlight that glides from
  trigger to trigger whenever the active tab changes (hover, click, or
  auto-advance). It lives inside the items' container (`hover-tab_slot`) so it
  shares the triggers' stacking context, and matches the active trigger's box on
  each move, so it also works if trigger sizes differ. A `.hover-tab_active`
  authored anywhere inside the wrap is adopted (style it there); otherwise the
  component creates one, styled by `src/css/site.scss` with the
  `--_hover-tab---active-bg` custom property (default white 75%). With the
  highlight on, drop any per-item active *background* styling — keep `is-active`
  styles for text color only. Triggers need `position` + `z-index` **above the
  highlight's, on the trigger itself** — `hover-tab_item_trigger` has
  `position: relative; z-index: 2` for this. A z-index on the title alone does
  nothing: the trigger's `backdrop-filter` creates a stacking context that traps
  its children's z-index.
- Runs only while on screen (IntersectionObserver); transitions are instant and
  autoplay is off under `prefers-reduced-motion`.
- CSS-only (no JS): hovering or keyboard-focusing the pane's `button_main_wrap`
  zooms the pane's image (`.u-image-wrapper`, scoped inside the pane) to 1.05.
  Tune with `--_hover-tab---zoom-scale` / `--_hover-tab---zoom-duration` on
  `hover-tab_wrap`.

## Styling expectations (Designer-owned)

- Panes should be absolutely stacked within the wrap — the component only
  animates opacity and translate, it does not position them.
- Tab-turns-white-on-hover is pure CSS: `data-trigger="hover"` on the trigger and
  color formulas on its children, per the Lumos trigger system.
- A rule in `src/css/site.scss` hides every pane but the first until the
  component sets `data-hover-tab-ready` on the wrap, so there is no flash of
  stacked panes. It assumes each item is a direct `:first-child`-addressable
  sibling in its container.

## Config attributes

All optional, on the Hover Tab Layout root (expose as component props for
per-instance control). Defaults live in the `CONFIG` block at the top of
`src/components/hover-tab.ts`.

| Attribute                      | Default     | Meaning                                       |
| ------------------------------ | ----------- | --------------------------------------------- |
| `data-tabs-interval`           | `5`         | Seconds between auto-advances                 |
| `data-tabs-duration`           | `0.6`       | Seconds per pane transition                   |
| `data-tabs-resume-delay`       | `3`         | Extra seconds paused after the pointer leaves |
| `data-tabs-shift`              | `2`         | Rem the panes travel while crossfading        |
| `data-tabs-ease`               | `expo.out`  | GSAP ease name                                |
| `data-tabs-autoplay`           | `true`      | `"false"` disables the loop                   |
| `data-tabs-hover-activate`     | `true`      | `"false"` = switch on click only              |
| `data-tabs-highlight`          | `true`      | `"false"` disables the sliding highlight      |
| `data-tabs-highlight-duration` | `0.4`       | Seconds the highlight glides between triggers |

## When it doesn't fire

The console names the component and the missing piece:

| Console output | Meaning |
| -------------- | ------- |
| nothing at all | The bundle isn't loading — check the loader in Site Settings, and that the page has been published. |
| `[engine] GSAP not found` | GSAP isn't enabled on the Webflow side. |
| `[engine] hover-tab: no items found` | The wrap is bound but contains no `data-hover-tab="item"` elements. |
| `[engine] hover-tab: an item is missing its pane` | An item has no `data-hover-tab="pane"` descendant. |

If nothing at all is logged for the component, the usual cause is a missing
`sse-component="hover-tab"` on the wrap — or, on the code side, a missing import
in `src/registry.ts`.
