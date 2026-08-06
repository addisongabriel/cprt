# CPRT — Webflow Custom Code

Custom JavaScript and CSS for the CPRT Webflow site, built with the
[Lumos](https://www.lumosframework.com/) framework conventions. The site itself
lives in Webflow; this repo holds only the code Webflow can't author natively,
bundled into a single `dist/main.js` + `dist/main.css`.

## Setup

```sh
npm install
```

## Development

```sh
npm run dev
```

Then, in Webflow **Site Settings → Custom Code → Footer**, load the dev bundle
while working:

```html
<script type="module" src="http://localhost:5173/src/main.js"></script>
```

Vite serves the source with hot reload, so changes appear in the Webflow
preview/staging domain immediately. Remove or swap this tag before publishing
to production.

## Production

```sh
npm run build
```

Commit the `dist/` output. It is served from this repo through jsDelivr:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/addisongabriel/cprt@main/dist/main.css" />
<script type="module" src="https://cdn.jsdelivr.net/gh/addisongabriel/cprt@main/dist/main.js"></script>
```

Pin a tag or commit (`@v0.1.0` / `@<sha>`) instead of `@main` when you need
cache-stable releases — jsDelivr caches `@main` for up to 12 hours.

## Structure

```
src/
  main.js         entry point — imports styles, runs registered modules
  modules/        one file per feature/page module, each with an init()
  styles/
    main.css      custom CSS beyond what Webflow's style panel can set
dist/             built bundle served via jsDelivr (committed)
slater/           standalone paste-in builds — not part of the bundle
worker/           Cloudflare Worker: expands Google Maps short links
docs/             per-module Webflow ↔ JS contracts
```

`worker/` is the one thing here that jsDelivr doesn't serve — it's deployed
separately, once, and only exists because expanding a `maps.app.goo.gl` link
needs a hop the browser can't make. See `worker/README.md`.

## Conventions (Lumos)

- **Classes**: custom classes use underscores (`hero_wrap`, `hero_title`) and
  come first; `u-` utilities stack on top; `is-` combos modify one custom class.
- **Variables over values**: reference Webflow variables (custom properties)
  for type, color, spacing, radius — never hardcode.
- **Breakpointless**: no styles on tablet/mobile breakpoints and no media
  queries here; use fluid variables, wrapping flex, autofit grids, and
  container queries. `rem` only, never `px`.
- **Interactions are CSS-only** via the trigger & state system
  (`data-trigger` / `data-state` on an ancestor, `--_trigger---on/off` read in
  descendants). JS in this repo is for behavior CSS genuinely can't do.
