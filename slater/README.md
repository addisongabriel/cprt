# Slater builds

Standalone, paste-ready versions of the site's custom code, for hosting through
Slater instead of the GitHub → jsDelivr pipeline.

Nothing in `src/` imports these files, so they are **not** part of
`dist/main.js`. They are plain scripts: no imports, no bundler, no dependencies.
Copy the file contents straight into Slater's JS panel.

## Conventions these follow

- **No `DOMContentLoaded`.** Slater may execute the script after that event has
  already fired, in which case a listener never calls back. Each script runs
  immediately and, if its hooks aren't in the DOM yet, watches with a
  `MutationObserver` until they appear (bounded, then reports what it found).
- **No timing or easing in the script.** Transitions belong to the site's own
  CSS on the elements. The scripts only toggle state classes, so changing a
  duration is a CSS edit and never a code change. The one exception is a
  first-paint transition suppression, so applying the initial hidden state
  doesn't animate.
- **No console logging.** Instead each script marks the document once it has
  actually wired up, which is the check to run when something looks dead:
  `document.documentElement.hasAttribute('data-nav-hover-on')`. False means no
  hooks were matched, so any effect on screen is coming from site CSS, not from
  the script.
- **Authoritative but fail-safe.** These scripts own the state they manage, with
  `!important`, so a pre-existing hover rule can't outrank them and revert
  things. That authority is gated behind the wired-up marker above, so a script
  that never finds its hooks changes nothing at all rather than pinning elements
  invisible with a rule nothing is left to undo.

## Files

| File | Purpose | Docs |
| ---- | ------- | ---- |
| `nav-hover-image.js` | Hovering a `nav-link-id` element cross-fades in the `nav-image-id` image with the same id | `docs/nav-hover-image-webflow.md` |
| `map-embed.js` | Turns a `data-map-url` Google Maps URL into a keyless iframe that fills its container | `docs/map-embed-webflow.md` |

`map-embed.js` also works pasted between `<script>` tags in a Webflow HTML
Embed — inside a component, so the map ships its own code — which is the one
case here that isn't about Slater. It styles the iframe inline and needs no
stylesheet. Its bundled twin (`src/modules/map-embed.js`) is behaviorally
identical; it differs only in running on `init()` from `main.js` instead of
immediately, taking its iframe styling from `main.css`, and skipping the
`MutationObserver` re-scan (call `window.CPRT.mapEmbed.refresh()` instead).
Loading both on one page is harmless but pointless — each would skip the
other's already-built maps.

Both carry their own `RESOLVER` constant for expanding `maps.app.goo.gl` short
links (see `worker/README.md`), and **the two are separate values** — deploying
the Worker means pasting its URL into both files, or setting
`window.CPRT_MAP_RESOLVER` on the page, which either build will pick up.

## Divergence warning

`src/modules/nav-hover-image.js` is the bundled equivalent of
`nav-hover-image.js`, and the two are **not** kept in sync automatically. They
now differ in behavior as well as implementation:

| | `slater/` (in use) | `src/modules/` (dormant) |
| --- | --- | --- |
| Cross-fade timing | the site's CSS on the images | GSAP, owns the duration |
| Before first hover | first `nav-image-id` in DOM order is showing | nothing showing |
| Pointer leaves a link | image stays — last hovered persists | fades back to rest |
| Property pages | skipped — `SKIP_PATH` | skipped — `SKIP_PATH` |

`SKIP_PATH` is the one rule the two builds deliberately share, and it is the one
thing to change in both places at once: it lists the paths where the nav hover
does not run at all (see `docs/nav-hover-image-webflow.md`). Because the Slater
file is pasted rather than built, editing it here changes nothing on the site
until it is re-pasted into Slater's JS panel.

If both ever load on the same page, the second to initialize bails with an
"already initialized" warning. Pick one delivery path per site.
