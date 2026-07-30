# mesh-cprt — CPRT custom code

Custom JavaScript for the CPRT Webflow site, built on the Sygnal Site Engine
(SSE 2) and served from Cloudflare Pages. Use the `sitesmith-engine` skill for
anything involving this project's structure, deploys, or Webflow wiring.

## The stack

| Layer | Choice |
| --- | --- |
| Framework | `@sygnal/sse-core` 2.x, TypeScript |
| CDN / build | Cloudflare Pages project `mesh-cprt` |
| Branches | `staging` → `staging.mesh-cprt.pages.dev`, `main` → `mesh-cprt.pages.dev` |
| Animation | GSAP, loaded by Webflow, never bundled |
| Webflow site | CPRT (`6a68c0adabd439c942e5f362`), Sitesmith workspace |

## Commands

- `npm run build` — typechecks, compiles SCSS, bundles to `dist/`. A change is
  not done until this passes.
- `npm run typecheck` — types only.
- Never start `npm run watch` or `npm run serve` in an agent session; they are
  long-running. Ask the user to run them.

## Rules

- **A module only runs if it is imported in `src/registry.ts`.** The
  `@component` decorator fires when the module loads, and the only thing that
  loads it is that import. Forget it and the code silently never runs.
- **The binding attribute is `sse-component`**, on the element the behavior
  belongs to — set it on the Webflow component definition's root so every
  instance inherits it. Child elements are queried by `sse-part` (or the
  existing `data-hover-tab` / `nav-*-id` hooks these components already accept).
- **Never hand-edit `dist/`.** It is generated and git-ignored; Cloudflare
  builds it.
- **Never import GSAP.** Read it through `getGsap()` in `src/lib/gsap.ts`, which
  warns and disables one animation rather than throwing.
- Every component opens with a `CONFIG` block; no magic numbers below it.
  Per-instance overrides come from `data-*` attributes via `readConfig()`.
- Fail quietly and locally: guard every DOM query, `console.warn` naming the
  component and the missing piece, never a thrown error.
- Styles live in `src/css/site.scss` → `dist/css/site.css`, injected by
  `Page.loadEngineCSS` in `src/site.ts`. Keep layout in the Designer and reserve
  this file for states that are awkward to express there. Lumos rules apply:
  variables over raw values, `rem` never `px`, no breakpoint media queries.

## Deploy

Push to `staging`, verify, then merge to `main`. Never commit directly to
`main`. Cloudflare builds take one to two minutes, so a green push proves
nothing — verify against the build stamp:

```bash
SHA=$(git rev-parse --short HEAD)
curl -fsS https://staging.mesh-cprt.pages.dev/index.js | grep -q "$SHA" && echo LIVE
```

The same SHA prints in the browser console as `[engine] CPRT v… build <sha>`.
