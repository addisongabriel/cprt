---
name: webflow-deploy
description: How custom JS/CSS ships from this repo to the CPRT Webflow site. Use whenever making code changes that need to go live, explaining the deploy pipeline, debugging why a change isn't showing on the site, or setting up the same GitHub→jsDelivr workflow for another Webflow project.
---

# Webflow deploy workflow (GitHub → jsDelivr → Webflow)

This repo is the single source of truth for the CPRT site's custom code. There
is no Slater/Odyn — deploys are pure GitHub.

**A deploy is three steps, not one.** Merging to `main` is only the first:

1. Merge to `main` — CI builds `dist/` and verifies the CDN serves it.
2. Update the `SHA` in the Webflow embed to the commit CI printed.
3. Publish the site.

Skip 2 or 3 and the site keeps loading the previous bundle, with no error
anywhere — it just silently looks like the change didn't work. Do not tell the
user a change is live after step 1.

## The pipeline

1. Code lives in `src/` (modules in `src/modules/`, styles in `src/styles/` —
   conventions in `CLAUDE.md`). Vite bundles to `dist/main.js` + `dist/main.css`,
   and `dist/` is committed.
2. jsDelivr serves those files straight from the repo, from a **commit-pinned**
   url — not `@main`. See the branch-alias gotcha below for why:
   - `https://cdn.jsdelivr.net/gh/addisongabriel/cprt@<sha>/dist/main.js`
   - `https://cdn.jsdelivr.net/gh/addisongabriel/cprt@<sha>/dist/main.css`
3. `.github/workflows/deploy.yml` runs on every push to `main`: `npm ci` →
   `npm run build` → commits `dist/` if it changed → best-effort `@main` purge →
   **verifies the commit-pinned url actually serves the bytes just built, and
   fails the deploy if it doesn't** → prints the SHA to put in the embed as a
   job notice. So even a src-only edit made in the GitHub UI deploys correctly.
4. The Webflow site loads the two urls via the site-wide embed below.

**Deploy = get the change onto `main`.** The normal path: branch → PR → merge.
The user has delegated merging: mark the PR ready and merge it yourself, then
confirm the Deploy action ran green. CI handles build + cache purge.

**Ship to `main` as soon as it builds — don't park it in a draft PR.** Nothing
on a feature branch is reachable from the site: the embed loads a commit on
`main`, so an unmerged branch is invisible to the browser and the user cannot
test it at all. Then immediately do steps 2 and 3 above — merging alone puts
nothing in front of the user.
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
<!-- CPRT custom code — served from github.com/addisongabriel/cprt
     Pinned to a commit SHA on purpose: jsDelivr's @main branch alias caches the
     branch→commit mapping for ~12h and the purge API does not reset it, so @main
     can serve a stale bundle for hours. A commit URL is immutable.
     UPDATE THE SHA BELOW ON EVERY DEPLOY, or the site keeps loading old code. -->
<script>
  (() => {
    const SHA = '<commit sha — the Deploy run prints it>'
    if (localStorage.getItem('cprt-dev') === 'true') {
      // Dev mode: load the local Vite server (npm run dev). CSS is injected
      // by Vite through the JS import, so one module script is enough.
      const s = document.createElement('script')
      s.type = 'module'
      s.src = 'http://localhost:5173/src/main.js'
      document.head.append(s)
    } else {
      const base = `https://cdn.jsdelivr.net/gh/addisongabriel/cprt@${SHA}/dist/`
      const l = document.createElement('link')
      l.rel = 'stylesheet'
      l.href = base + 'main.css'
      const s = document.createElement('script')
      s.defer = true
      s.src = base + 'main.js'
      document.head.append(l, s)
    }
  })()
</script>
```

Only the `SHA` line changes between deploys. Update it with
`data_scripts_tool > set_site_freeform_code` (rewrites the whole block, so send
the badge `<style>` along with it) or by hand in the Designer, then publish.
Worth automating from CI with a Webflow API token in repo secrets — not set up
yet.

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
- **`@main` cannot be reliably refreshed — this cost hours once.** jsDelivr
  caches the branch→commit mapping for ~12h, and the purge API does **not** reset
  it: purging `@main/dist/main.js` clears the file, then jsDelivr re-resolves
  `main` from its own stale mapping and serves the same old commit again. The
  purge response still says `"status": "finished"` with every provider `true`, so
  CI goes green while the site loads a bundle from hours ago. Observed: two
  successful purges 20 minutes apart, CDN still serving a pre-merge bundle.
  Hence commit pinning — and hence the CI step that compares served bytes to
  built bytes, which is the only thing that actually catches this.
- **Browser cache is a separate layer.** A browser holding the old file will
  disagree with the CDN. `fetch(url, { cache: 'reload' })` in the console reads
  the CDN directly and is the way to tell the two apart: if that shows the new
  bundle but the page doesn't, it's the browser; if it shows the old bundle, it's
  the CDN.
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
   This is the check that's always available, and it now means something: the
   run fails if the commit-pinned CDN url doesn't serve the bytes just built.
   Green here rules out the whole CDN layer. Grab the SHA from the run's notice
   (or `get_job_logs`) for the embed.
   **Do not read the purge step as proof of anything** — it is best-effort and
   reports success even when `@main` stays stale.
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
2. **Does the embed's `SHA` match the commit you want?** A stale SHA loads old
   code with no error at all. Read it with
   `data_scripts_tool > get_site_freeform_code`.
3. **Is the embed site-wide?** See the gotcha above — a page-level embed makes
   it work on exactly one page.
4. **Has the site been published since the last custom-code change?**
5. **Did the Deploy action pass?** Its CDN-verify step fails on a stale or
   missing bundle; check the run, not just the merge.
6. **Is the CDN actually serving the new bytes?** Have the user run
   `fetch(url, { cache: 'reload' }).then(r => r.text()).then(t => console.log(t.length))`
   and compare with `wc -c < dist/main.js`. A size match means the CDN is fine
   and the problem is downstream.
7. **Is the module's selector actually in the published markup?** Every `init()`
   bails silently by design, so a missing hook attribute looks identical to a
   broken script. Attributes inside Webflow **component definitions** are easy
   to miss: a page-level `data_element_tool > query_elements` does **not**
   descend into component definitions, so a 0-match result there proves nothing.
   Re-query with `scope_component_id` for each component in the chain (nested
   components need their own scoped query), or just read the rendered DOM in the
   browser — and treat the user's inspector as better evidence than a negative
   API query.
8. **Only then suspect the code.**

## Reusing this setup for another Webflow project

Copy this repo's `vite.config.js`, `.github/workflows/deploy.yml` (swap the
repo path in the purge URLs — it uses `GITHUB_REPOSITORY`, so only the embed
snippet needs new URLs), the embed snippet (rename the `cprt-dev` localStorage
key), and this skill. Repo must be public, deploy branch must be `main`.
