# Nav Hover Image — Webflow ↔ JS contract

Hovering a nav link swaps in its paired image inside the mega dropdown. Code:
`src/components/nav-hover-image.ts`.

This is the port of the Slater build that was running on the site, so the
behavior is the one that was tuned there: the fallback image shows at rest, the
last hovered image persists, and the cross-fade timing belongs to the site's own
CSS rather than to JavaScript.

## Attributes (set in the Designer)

| Attribute                        | Element                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| `sse-component="nav-hover-image"`| the dropdown wrap holding both the links and the image stack (`nav_dropdown_mega_wrap`) — this is what binds the behavior |
| `nav-link-id="x"`                | the nav link, or the wrapper around it, that gets hovered      |
| `nav-image-id="x"`               | the image (or its wrapper) revealed for the link with that id  |
| `nav-image-default`              | optional, on **one** image: overrides which one shows before the first hover |

Ids are arbitrary strings — they only have to match between the pair, and are
trimmed and matched case-insensitively. Both the bare and `data-` prefixed forms
work (`nav-link-id` or `data-nav-link-id`), since Webflow accepts either.

Each element carrying `sse-component="nav-hover-image"` is an independent
instance with its own fallback image and its own last-hovered image, which is
what lets the two mega dropdowns coexist without affecting each other.

**CMS-driven lists:** the links and images in the CPRT mega dropdowns come from
collection lists, so `nav-link-id` and `nav-image-id` need to be bound to a
field that is identical on both sides — the item slug is the natural choice.
Bind the attribute value to that field on the link inside the links list and on
the image inside the images list.

## What the component does

- Shows the fallback image from the start, so the dropdown is never empty when
  it opens. The fallback is the image flagged `nav-image-default`, or the first
  `nav-image-id` in DOM order.
- Hovering a `nav-link-id` element swaps to its matching image, and that image
  then stays — moving off the link does not clear it, so closing and reopening
  the dropdown shows whatever was hovered last.
- Keyboard focus works the same as hover (`focusin`, which bubbles, so the hook
  can sit on a wrapper around the `<a>`).
- Hover only fires for `pointerType === 'mouse'`, so a tap on touch doesn't
  leave an image stuck on.
- Toggles the Lumos **`is-active`** state class on the hovered link, so the
  active link's look can be styled in the Designer with the state system.
- Marks inactive images `aria-hidden`, which stands in for `visibility: hidden`
  (that can't be transitioned without snapping at one end of the fade).
- Links whose id has no matching image are ignored — no listeners bound.
- Showing the fallback does **not** depend on links being found. A dropdown with
  images but no matching links still shows its first image; it just won't
  respond to hover.

## Timing belongs to your CSS

The component sets no duration and no easing. It toggles the class
`is-nav-image-active`, and `src/css/site.scss` flips opacity between 0 and 1 —
so a `transition: opacity 200ms <ease>` on the images in the Designer is what
runs the cross-fade, and changing it is a Designer edit rather than a code
change.

Those opacity rules use `!important`, so the component is the single authority
on which image shows and a stray hover rule can't outrank it, and they force
`visibility: inherit` to neutralize any per-item visibility rule (the kind that
hides them all and un-hides only the hovered one). `inherit` rather than
`visible` on purpose: the images live inside a dropdown whose closed state is
`visibility: hidden`, and inheriting means they follow that open/closed state
instead of leaking out of a closed dropdown.

All of it is gated behind `[data-nav-hover-on]`, which the component sets on the
wrap only once it has found images and painted a state. If the hooks are never
found, none of those rules apply and the markup behaves exactly as it would
without the component, rather than being pinned invisible by an `!important`
rule that nothing is left to undo.

## Styling expectations (Designer-owned)

The image stack is yours to position: a wrapper with `position: relative`, each
image `position: absolute` with inset 0 so they sit on top of each other. The
component only toggles a class — it never sets position, size, or z-index.

## Config attributes

Optional, on the wrap. Defaults live in the `CONFIG` block at the top of
`src/components/nav-hover-image.ts`.

| Attribute                     | Default | Meaning                                                        |
| ----------------------------- | ------- | -------------------------------------------------------------- |
| `data-nav-hover-retry-window` | `4000`  | Milliseconds to keep watching for CMS markup that renders late. `0` disables the watch. |

## When it doesn't fire

| Console output | Meaning |
| -------------- | ------- |
| nothing at all | Either the bundle isn't loading, or no element carries `sse-component="nav-hover-image"`. |
| `[engine] nav-hover-image: no elements matching …` | The wrap is bound but contains no `nav-image-id` elements — check the attribute is on the published markup and spelled exactly. |
| no warning, but no swap on hover | Images were found, but no link id matches an image id. Compare the two bound CMS fields. |

`document.querySelector('[data-nav-hover-on]')` returning an element is the
quick check that the component wired up: if it's `null`, anything happening on
screen is coming from site CSS, not from this component.
