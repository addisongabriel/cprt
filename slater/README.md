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
- **`DEBUG` flag at the top** of each file, on by default, logging under a
  bracketed prefix. Turn it off once the behavior is confirmed.

## Files

| File | Purpose | Docs |
| ---- | ------- | ---- |
| `nav-hover-image.js` | Hovering a `nav-link-id` element cross-fades in the `nav-image-id` image with the same id | `docs/nav-hover-image-webflow.md` |

## Divergence warning

`src/modules/nav-hover-image.js` is the bundled equivalent of
`nav-hover-image.js`, and the two are **not** kept in sync automatically. The
bundled one drives the cross-fade with GSAP (so it owns the duration); the
Slater one leaves timing to CSS. If both ever load on the same page, the second
to initialize bails with an "already initialized" warning. Pick one delivery
path per site.
