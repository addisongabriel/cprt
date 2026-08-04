# Nav Hover Image — Webflow ↔ JS contract

Hovering a nav link cross-fades in its paired image. Powered by
`src/modules/nav-hover-image.js` + `src/styles/nav-hover-image.css`.

> **The CPRT site runs the Slater build, not this module.** The hook attributes
> and id pairing below are identical, but `slater/nav-hover-image.js` differs on
> timing (owned by the site's CSS, not GSAP) and on rest behavior: the first
> image in DOM order shows before any hover, and the last hovered image persists
> instead of fading back. See `slater/README.md` for the comparison. Everything
> in this file describes the bundled module unless noted.

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

## Debugging (temporary)

The module logs to the console under a `[nav-hover]` prefix, so you can tell
firing from not-firing without guessing. `DEBUG` at the top of
`src/modules/nav-hover-image.js` turns it all off — strip it once the effect is
confirmed working, since one bundle loads on every page.

What each outcome means:

| Console output | Meaning |
| -------------- | ------- |
| nothing at all | The bundle isn't loading. Check the Webflow embed — see the `webflow-deploy` skill. |
| `nothing to wire up. Found no elements matching …` | JS is running but the hook attributes aren't in the published markup on this page. |
| `hooks found, but no link id matches an image id` | Both sets exist but the values don't line up; the log prints both lists to compare. |
| `main.css doesn't look loaded` | The JS arrived but the stylesheet didn't, so the images were never hidden. |
| `wired up N link(s)` | Success — it's listening. |
| `hover → <id>` / `back to rest` | Hover is firing and resolving to that id. |

`links with no matching image` / `images with no matching link` are warnings, not
failures — they list the leftovers on each side, which is usually enough to spot
a typo or a stale CMS slug.

## Where it doesn't run

Property pages are excluded — the script returns before it looks for any hooks,
so on those pages the nav images are left entirely to the site's own CSS. The
exclusion is a path prefix, `/^\/propert(y|ies)/i`, which covers:

| Path | |
| ---- | --- |
| `/properties/<slug>` | the static Properties folder (e.g. `/properties/onyx-residences`) |
| `/properties-cms/<slug>` | the Properties CMS collection |
| `/property-types/<slug>` | the Property Types collection |
| `/property`, `/properties` | a bare index at either slug |

Both builds carry the same rule — `SKIP_PATH` near the top of
`src/modules/nav-hover-image.js` and of `slater/nav-hover-image.js`. Edit both
if the set of excluded paths changes; nothing keeps them in sync.

In the Slater build the guard sits ahead of `injectStyles()` on purpose, so the
`html[data-nav-hover-on]` rules are never added on those pages. That matters
because those rules are `!important` — added with no script left to toggle
them, they'd pin the whole image stack invisible.

## Scoping

`data-nav-hover="wrap"` is optional:

- **No wrap on the page** (the common case — one nav): the whole document is
  treated as a single instance. Just add the id attributes and it works.
- **One or more wraps**: each becomes an independent instance, matching links to
  images only within itself. Use this if a page needs two separate link/image
  sets, or to set the config attributes above.
