# CPRT — Webflow custom code

This repo holds custom JS/CSS for the CPRT Webflow site. The site is built in
Webflow with the Lumos framework; use the `lumos` skill for any Webflow build
or Lumos convention question.

## Commands

- `npm run dev` — Vite dev server on :5173 (Webflow loads `/src/main.js` during dev)
- `npm run build` — bundle to `dist/main.js` + `dist/main.css`; `dist/` is
  committed because jsDelivr serves it straight from this repo

## Deploy

`main` is the deploy branch: on every push, CI rebuilds `dist/` and purges
jsDelivr, so a merge to `main` is live on the site in about a minute. The full
pipeline, Webflow embed snippet, and gotchas (repo must stay public, cache
verification) live in the `webflow-deploy` skill — use it for anything
deploy-related.

## Rules

- New features go in `src/modules/` as a module exporting `init()`, registered
  in `src/main.js`. Every module must guard on its own selector — one bundle
  loads on every page.
- CSS follows Lumos: variables over raw values, `rem` never `px`, no media
  queries (fluid/container-query responsiveness), interactions via the
  CSS-only trigger & state system rather than JS wherever possible.
- Run `npm run build` and commit the updated `dist/` with any src change.
