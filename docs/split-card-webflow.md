# Split Card — Webflow ↔ JS contract

Scroll-driven image crossfade for the **Split Card Section** component,
powered by `src/modules/split-card.js` and `src/styles/split-card.css`.

As you scroll the section, the stacked images in the feature swap one at a
time: each holds still for a moment, then the next fades in over it. The
section is as tall as the sequence is long — one viewport of scroll per image —
and the wrap sticks at viewport height, so it reads as a sequence playing in
place rather than a very long card.

## Hook attributes (already set on the component)

The `sse-*` attributes below are the ones already wired on the site, and the
module reads those. It also accepts a `data-split-card` form and the class
names, so none of the three is load-bearing on its own:

| Element                              | Accepted hooks                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| Split Card Section root              | `sse-component="split-card"` / `data-split-card="section"` / `.split-card_section` |
| `split-card_wrap`                    | `sse-part="wrap"` / `data-split-card="wrap"` / `.split-card_wrap`               |
| `split-card_feature`                 | `sse-part="feature"` / `data-split-card="feature"` / `.split-card_feature`      |

The slides are the feature's **direct `.u-image-wrapper` children** — the
Visual Image component roots. The wrappers are the sibling set, not the
`.u-image` elements inside them; each image sits in its own wrapper, so the
images are never siblings of each other. If the wrapper class is ever renamed,
the module falls back to any direct child of the feature that contains an
`img`.

## What the module does

- Fades through the wrappers as the section scrolls, one transition per
  viewport of scroll. Each image holds still for the first 35% of its segment,
  then crossfades over the remaining 65%.
- **Fades in only.** The wrappers are stacked, so later siblings already paint
  over earlier ones — the image below stays opaque and covered, which avoids a
  dip to the background mid-transition. See the known risk below.
- Sets `--image-count` on the section from the real number of wrappers, which
  is what drives the section height.
- Refreshes ScrollTrigger when an image finishes decoding after init, since a
  late-loading image changes the height every start/end was measured against.
- Under `prefers-reduced-motion` it sets the first image and stops — no
  ScrollTrigger, no sequence. The section stays tall and reads as a static card.
- Bails silently if the section has fewer than two images (a single image is a
  static card, not a sequence) and warns to the console if the feature element
  is missing.
- Marks the section `data-split-card-initialized` so it can't be set up twice.

## The CSS ships in this repo, not the embed

`src/styles/split-card.css` carries the section height, the sticky wrap, and
the pre-init rule that hides all but the first image. It is bundled into
`dist/main.css` and loaded site-wide by the embed.

**Do not also paste those rules into the `u-embed-css` embed inside the
component** — the original spec described them as a Designer edit, but this
repo ships its custom CSS in the bundle (same as `hover-tab.css` and
`nav-hover-image.css`), so a copy in the embed would be a second, drifting
source of truth. Leave the embed empty unless there is something genuinely
instance-specific to put in it.

The height comes from a `:has()` chain that counts `.u-image-wrapper`
siblings, covering 1–6 images, so the section is the right height before JS
runs. The module then overwrites `--image-count` with the exact count, which
also covers stacks larger than six. The chain keys on class names rather than
the hook attributes on purpose: it is only the pre-JS/no-JS fallback, and the
module is authoritative once it runs.

Counting the wrappers is what makes this work — a chain of `.u-image ~
.u-image` never matches past the first, because the images are not siblings of
each other. Keying on `.u-image` directly is not possible, since nested
`:has()` is invalid CSS.

## Styling expectations (Designer-owned)

- The `.u-image-wrapper` elements must be absolutely stacked inside the
  feature, filling it. The module only drives opacity — it never positions
  anything.
- The feature needs to be a positioning context for that stack.
- Don't set a height on `split-card_section` in the Designer; the bundled CSS
  owns it.

## Config attributes

All optional, set on the Split Card Section root (expose as component props
for per-instance control). The shorter unprefixed forms from the original
spec — `data-hold`, `data-scrub`, `data-ease`, `data-pin-wrap`,
`data-markers` — are accepted as fallbacks.

| Attribute                   | Default | Meaning                                                                   |
| --------------------------- | ------- | ------------------------------------------------------------------------- |
| `data-split-card-hold`      | `0.35`  | Portion of each segment the image holds before crossfading (clamped 0–0.9) |
| `data-split-card-scrub`     | `1`     | Seconds of catch-up smoothing; `0` hard-links the sequence to scroll       |
| `data-split-card-ease`      | `none`  | GSAP ease name                                                            |
| `data-split-card-crossfade` | `false` | `"true"` also fades the outgoing image out                                |
| `data-split-card-pin-wrap`  | `false` | `"true"` lets GSAP pin the wrap instead of the CSS `position: sticky`      |
| `data-split-card-markers`   | `false` | `"true"` draws ScrollTrigger's debug markers                              |

## Known risk: images that don't fill the frame

Fading in only relies on each wrapper fully covering the one beneath it. The
five Visual Image instances on Onyx Residences do not all use the same Variant
prop — if one doesn't fill the frame, the image underneath will peek out from
behind it during the sequence.

If that shows up, set `data-split-card-crossfade="true"` on the section. The
outgoing image then fades out as the incoming one fades in, at the cost of a
slight dip toward the background mid-transition. No code change or deploy
needed — it's a Designer attribute.

## GSAP

GSAP and ScrollTrigger are bundled from npm into `dist/main.js`, the same way
`hover-tab.js` and `nav-hover-image.js` use GSAP — nothing needs enabling on
the Webflow side. Adding ScrollTrigger grew the bundle from ~77 kB to ~123 kB
(~49 kB gzipped).
