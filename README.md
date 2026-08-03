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

The live embed pins a commit SHA rather than `@main`, because jsDelivr caches the
branch alias for ~12h and cannot be reliably purged. That is why a deploy is
three steps — merge, bump the SHA in the Webflow embed, publish.

A migration off jsDelivr onto Vercel is staged: `vercel.json` holds the build and
cache-header config, and once the repo is linked to a Vercel project the embed
URL becomes permanent and a merge to `main` goes live on its own. It needs one
dashboard step on the repo owner's Vercel account first — see "Migrating to
Vercel" in the `webflow-deploy` skill. Until then the three-step deploy stands.

## Structure

```
src/
  main.js         entry point — imports styles, runs registered modules
  modules/        one file per feature/page module, each with an init()
  styles/
    main.css      custom CSS beyond what Webflow's style panel can set
dist/             built bundle served via jsDelivr (committed)
```

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
