# Nav Hover Image — Webflow ↔ JS contract

Hovering a nav link cross-fades in its paired image. Powered by
`src/modules/nav-hover-image.js` + `src/styles/nav-hover-image.css`.

## Hook attributes (set these in the Designer)

The module targets attributes, not class names, so classes can be renamed
freely. Ids are arbitrary strings — they only have to match between the pair.

| Attribute            | Element                                                    |
| -------------------- | ---------------------------------------------------------- |
| `nav-link-id="x"`    | the nav link (or the wrapper around it) that gets hovered   |
| `nav-image-id="x"`   | the image (or its wrapper) revealed for that link           |
| `nav-image-default`  | optional, on **one** image: what shows when nothing's hovered |

Both the bare and `data-` prefixed forms work (`nav-link-id` or
`data-nav-link-id`) — Webflow accepts either as a custom attribute. Ids are
trimmed and matched case-insensitively.

## What the module does

- On load, every `nav-image-id` image is set to 0 opacity /
  `visibility: hidden`. If one image carries `nav-image-default`, that one
  starts (and returns to) visible instead.
- Hovering a `nav-link-id` element cross-fades its matching image in and every
  other image out — 0.4s `power2.out` by default. Only one image is ever
  visible.
- Pointing away from the links fades back to the rest state (the default image,
  or nothing). The reset waits one animation frame, so sliding straight from one
  link to the next swaps images without blinking through the rest state.
- Keyboard focus works the same as hover (`focusin`/`focusout`, which bubble, so
  the hook can sit on a wrapper around the `<a>`).
- Hover only fires for `pointerType === 'mouse'`, so a tap on touch doesn't
  leave an image stuck on.
- Toggles the Lumos **`is-active`** state class on the hovered link, so the
  active link's look can be styled in the Designer with the state system
  (`--_state---true` / `--_state---false` formulas on descendants).
- Transitions are instant under `prefers-reduced-motion`.
- Links whose id has no matching image are ignored (no listeners bound).

## Styling expectations (Designer-owned)

- **The image stack is yours to position.** Put the images in a wrapper with
  `position: relative`, and each image `position: absolute` with inset 0 so they
  sit on top of each other. The module only animates opacity/visibility — it
  never sets position, size, or z-index.
- `src/styles/nav-hover-image.css` hides the non-default images up front so the
  stack can't flash before JS runs, and sets `pointer-events: none` on them
  (they're a hover preview, not a click target). GSAP writes opacity and
  visibility inline, which overrides those rules.

## Config attributes

Optional, on a `data-nav-hover="wrap"` element (expose as component props for
per-instance control):

| Attribute                 | Default      | Meaning                       |
| ------------------------- | ------------ | ----------------------------- |
| `data-nav-hover-duration` | `0.4`        | Seconds per cross-fade        |
| `data-nav-hover-ease`     | `power2.out` | GSAP ease name                |

## Scoping

`data-nav-hover="wrap"` is optional:

- **No wrap on the page** (the common case — one nav): the whole document is
  treated as a single instance. Just add the id attributes and it works.
- **One or more wraps**: each becomes an independent instance, matching links to
  images only within itself. Use this if a page needs two separate link/image
  sets, or to set the config attributes above.
