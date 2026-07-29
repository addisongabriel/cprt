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

## Divergence warning

`src/modules/nav-hover-image.js` is the bundled equivalent of
`nav-hover-image.js`, and the two are **not** kept in sync automatically. They
now differ in behavior as well as implementation:

| | `slater/` (in use) | `src/modules/` (dormant) |
| --- | --- | --- |
| Cross-fade timing | the site's CSS on the images | GSAP, owns the duration |
| Before first hover | first `nav-image-id` in DOM order is showing | nothing showing |
| Pointer leaves a link | image stays — last hovered persists | fades back to rest |

If both ever load on the same page, the second to initialize bails with an
"already initialized" warning. Pick one delivery path per site.
