---
name: webflow-deploy
description: How custom JS/CSS ships from this repo to the CPRT Webflow site. Use whenever making code changes that need to go live, explaining the deploy pipeline, debugging why a change isn't showing on the site, or setting up the same GitHub→jsDelivr workflow for another Webflow project.
---

# Webflow deploy workflow (GitHub → jsDelivr → Webflow)

This repo is the single source of truth for the CPRT site's custom code. There
is no Slater/Odyn — deploys are pure GitHub. A merge (or push) to `main` is a
production deploy; it's live on the site about a minute later.

## The pipeline

1. Code lives in `src/` (modules in `src/modules/`, styles in `src/styles/` —
   conventions in `CLAUDE.md`). Vite bundles to `dist/main.js` + `dist/main.css`,
   and `dist/` is committed.
2. jsDelivr serves those files straight from the repo:
   - `https://cdn.jsdelivr.net/gh/addisongabriel/cprt@main/dist/main.js`
   - `https://cdn.jsdelivr.net/gh/addisongabriel/cprt@main/dist/main.css`
3. `.github/workflows/deploy.yml` runs on every push to `main`: `npm ci` →
   `npm run build` → commits `dist/` if it changed → purges the two jsDelivr
   URLs. So even a src-only edit made in the GitHub UI deploys correctly.
4. The Webflow site loads the two URLs via the site-wide embed below.

**Deploy = get the change onto `main`.** The normal path: branch → PR → the
user merges. Nothing else to do; CI handles build + cache purge.

## The Webflow embed (site-wide custom code)

Lives in Site Settings → Custom code → Head code. Canonical copy — if it needs
changing, update it here too:

```html
<!-- CPRT custom code — served from github.com/addisongabriel/cprt -->
<script>
  (() => {
    if (localStorage.getItem('cprt-dev') === 'true') {
      // Dev mode: load the local Vite server (npm run dev). CSS is injected
      // by Vite through the JS import, so one module script is enough.
      const s = document.createElement('script')
      s.type = 'module'
      s.src = 'http://localhost:5173/src/main.js'
      document.head.append(s)
    } else {
      const l = document.createElement('link')
      l.rel = 'stylesheet'
      l.href = 'https://cdn.jsdelivr.net/gh/addisongabriel/cprt@main/dist/main.css'
      const s = document.createElement('script')
      s.defer = true
      s.src = 'https://cdn.jsdelivr.net/gh/addisongabriel/cprt@main/dist/main.js'
      document.head.append(l, s)
    }
  })()
</script>
```

Dev mode toggle (per browser, per device) — run in the console:
`localStorage.setItem('cprt-dev', 'true')` / `localStorage.removeItem('cprt-dev')`.

The bundle is deliberately classic-script-safe (single file, no import/export
statements). If the Vite config ever changes to emit real ES modules or code
splitting, the embed's prod branch must switch to `type="module"`.

## Constraints and gotchas

- **The repo must stay public.** jsDelivr cannot serve private repos — if the
  repo goes private, the site silently keeps the last cached bundle until the
  cache expires, then 403s. If code must be private, switch hosting to
  Cloudflare Pages/Vercel and update the embed URLs.
- **`main` is the deploy branch.** jsDelivr can't address branch names with
  slashes, so deploys pin `@main`. Feature branches follow the
  `claude/<feature>` naming; PRs target `main`.
- **Cache behavior:** the CI purge clears jsDelivr's edge cache. A browser
  that recently loaded the old file may hold it up to its max-age — when
  verifying a deploy, hard-refresh, or curl the CDN URL and diff against
  `dist/` in the repo.
- **Page scoping is selector guards, not a registry.** One bundle loads on
  every page; each module's `init()` bails unless its own selector (e.g.
  `[data-hover-tab="wrap"]`) exists on the page. There is no per-page script
  assignment layer — don't build one unless the bundle gets heavy enough to
  justify code splitting.
- **After any src change, `npm run build` locally and commit `dist/`** (per
  `CLAUDE.md`). CI would catch a forgotten build, but the extra bot commit
  muddies history — treat CI's build-commit as a safety net, not the path.

## Verifying a deploy

1. Action run green on `main` (the purge step prints jsDelivr's response).
2. `curl -s https://cdn.jsdelivr.net/gh/addisongabriel/cprt@main/dist/main.js | tail -c 200`
   and compare against the repo's `dist/main.js`.
3. Hard-refresh the published site; check the DevTools console for module
   logs/errors.

## Reusing this setup for another Webflow project

Copy this repo's `vite.config.js`, `.github/workflows/deploy.yml` (swap the
repo path in the purge URLs — it uses `GITHUB_REPOSITORY`, so only the embed
snippet needs new URLs), the embed snippet (rename the `cprt-dev` localStorage
key), and this skill. Repo must be public, deploy branch must be `main`.
