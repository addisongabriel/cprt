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

**Deploy = get the change onto `main`.** The normal path: branch → PR → merge.
The user has delegated merging: mark the PR ready and merge it yourself, then
confirm the Deploy action ran green. CI handles build + cache purge.

**Ship to `main` as soon as it builds — don't park it in a draft PR.** Nothing
on a feature branch is reachable from the site: jsDelivr pins `@main`, so an
unmerged branch is invisible to the browser and the user cannot test it at all.
Local testing (headless Chromium against `dist/`) proves the module logic, not
the integration — the real markup, CMS-bound attributes, and Designer CSS only
exist on the site, so "it passes locally" is not "it works." For any change the
user will want to see or test on the site, merge first and iterate on `main`
with follow-up commits; each push redeploys in about a minute. Reserve
open-a-PR-and-wait for changes the user explicitly asked to review before they
go live.

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

**Dev mode only works from the user's own machine.** `localhost:5173` resolves
in whichever browser loads the site, so it needs `npm run dev` running on that
same computer. A Vite server started inside a Claude Code cloud session is
unreachable from the user's browser — from those sessions dev mode is not a
testing path, and merging to `main` is the only way to get code onto the site.

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
- **Verify the embed is site-wide before blaming the code.** It belongs in Site
  Settings → Custom code → Head. It can silently end up in a single page's
  page-level head code instead — then the bundle loads on that one page and
  nowhere else, and every other page looks like a broken script while the code
  is fine. Read the real state instead of assuming, via `data_scripts_tool`:
  `get_site_freeform_code` (site head/footer), `get_page_freeform_code` (per
  page), `get_registered_scripts` (the separate registered-script system,
  normally empty here). When moving one site-wide, clear the page-level copy or
  that page fetches the bundle and GSAP twice.
- **Webflow custom code needs a publish.** Editing head code through the MCP or
  the Designer only stages it; it reaches the published site on publish. A
  publish ships *everything* staged, including Designer edits you didn't make —
  compare the page's `lastUpdated` against the site's `lastPublished`
  (`data_pages_tool > list_pages`, `data_sites_tool > list_sites`) and ask first
  when there's unpublished work in flight.
- **Page scoping is selector guards, not a registry.** One bundle loads on
  every page; each module's `init()` bails unless its own selector (e.g.
  `[data-hover-tab="wrap"]`) exists on the page. There is no per-page script
  assignment layer — don't build one unless the bundle gets heavy enough to
  justify code splitting.
- **After any src change, `npm run build` locally and commit `dist/`** (per
  `CLAUDE.md`). CI would catch a forgotten build, but the extra bot commit
  muddies history — treat CI's build-commit as a safety net, not the path.

## Verifying a deploy

1. Deploy action green on `main` — `mcp__github__actions_get > get_workflow_run`.
   This is the check that's always available; the purge step prints jsDelivr's
   response.
2. `curl -s https://cdn.jsdelivr.net/gh/addisongabriel/cprt@main/dist/main.js | tail -c 200`
   and diff against the repo's `dist/main.js`. **This usually fails from a
   Claude Code cloud session** — the environment's network policy 403s the
   CONNECT to `cdn.jsdelivr.net` (and to `*.webflow.io`), which curl reports as
   exit 56 with an *empty body*. An empty body is not a stale or missing file:
   piping it into `grep -c` yields 0 and reads exactly like "the change isn't
   deployed." Never conclude that from it. Check
   `curl -sS -o /dev/null -w '%{http_code}'` or
   `curl -sS "$HTTPS_PROXY/__agentproxy/status"` first, and if the host is
   blocked, say so plainly and fall back to steps 1 and 3.
3. Hard-refresh the published site and check in the browser. The user can run
   these even when the session can't reach the site:
   - `document.querySelector('script[src*="jsdelivr"]')` — is the embed present?
   - is `main.css` landing? (e.g. nav hover images should sit hidden at rest)
   - a module's init marker — `[data-tabs-initialized]`,
     `data-nav-hover-initialized` on `<html>` — did `init()` find its selector
     and bind?

## "It's not showing on the site" — check in this order

Cheapest first. Most reports die at 1 or 2, so don't start by re-reading the
module.

1. **Is it on `main`?** `git log origin/main --oneline -1`. A draft PR is not
   deployed. This is the most common cause by far.
2. **Is the embed site-wide?** See the gotcha above — a page-level embed makes
   it work on exactly one page.
3. **Has the site been published since the last custom-code change?**
4. **Did the Deploy action pass?**
5. **Is the module's selector actually in the published markup?** Every `init()`
   bails silently by design, so a missing hook attribute looks identical to a
   broken script. Attributes inside Webflow **component definitions** are easy
   to miss: a page-level `data_element_tool > query_elements` does **not**
   descend into component definitions, so a 0-match result there proves nothing.
   Re-query with `scope_component_id` for each component in the chain (nested
   components need their own scoped query), or just read the rendered DOM in the
   browser — and treat the user's inspector as better evidence than a negative
   API query.
6. **Only then suspect the code.**

## Reusing this setup for another Webflow project

Copy this repo's `vite.config.js`, `.github/workflows/deploy.yml` (swap the
repo path in the purge URLs — it uses `GITHUB_REPOSITORY`, so only the embed
snippet needs new URLs), the embed snippet (rename the `cprt-dev` localStorage
key), and this skill. Repo must be public, deploy branch must be `main`.
