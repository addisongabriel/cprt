# Map Resolve — the short-link Worker

A Cloudflare Worker that expands `maps.app.goo.gl/…` links so the client can
paste Google's share links straight into a CMS field. Source: `map-resolve.js`.

**This is the only part of the repo that isn't served by jsDelivr.** It's a
one-time deploy, entirely separate from `npm run build` and the `main` branch
pipeline. Once it's live and its URL is in `src/modules/map-embed.js`, nobody
has to touch it again.

## Why it exists

A short link is just an id — the destination only appears when something
follows the redirect. Browsers can't: `maps.app.goo.gl` sends no CORS headers,
so a `fetch()` from the Webflow site either fails outright or comes back opaque
with the final URL stripped. Reading the redirect needs to happen off the
browser, and that's all this does. It holds no secrets, stores nothing, and
returns only public Google URLs.

## Deploy

```bash
cd worker
npx wrangler login     # once, per machine
npx wrangler deploy
```

Wrangler prints the URL it deployed to:

```
https://cprt-map-resolve.<your-subdomain>.workers.dev
```

Paste that into `RESOLVER` at the top of `src/modules/map-embed.js`, then
`npm run build` and commit `dist/`. That's the whole wiring — short links start
working on the next deploy.

Free tier covers this comfortably: 100,000 requests/day, and the edge cache
means one origin request per link per day no matter how many visitors see it.

## Check it

```bash
curl "https://cprt-map-resolve.<your-subdomain>.workers.dev/?u=https%3A%2F%2Fmaps.app.goo.gl%2FVZTUE5yUNMm7Z49QA"
```

```json
{ "url": "https://www.google.com/maps/place/…" }
```

An `x-cache: hit` response header on the second call means the edge cache is
doing its job.

## When it stops resolving

Add `&debug=1` to any request. It replays the lookup, skips the cache, and
returns the whole redirect chain instead of the answer:

```bash
curl "https://cprt-map-resolve.gabe-f64.workers.dev/?u=https%3A%2F%2Fmaps.app.goo.gl%2FVZTUE5yUNMm7Z49QA&debug=1"
```

```json
{
  "url": null,
  "why": "Google served a bot check (/sorry/) instead of the redirect",
  "hops": [
    { "url": "https://maps.app.goo.gl/…", "status": 302, "location": "…", "resolvedTo": "…" },
    { "url": "…", "status": 200, "bodyLength": 4211, "bodySnippet": "…" }
  ]
}
```

`why` is also folded into the normal 502 body, so the browser console says what
went wrong rather than just that something did. Google serves datacenter IPs
differently from browsers — a bot check or a consent wall where a browser gets
a plain 302 — and this is the only way to see which.

## Contract

`GET /?u=<url-encoded short link>`

| Status | Body | When |
| ------ | ---- | ---- |
| 200 | `{"url":"https://www.google.com/maps/…"}` | resolved |
| 400 | `{"error":"…"}` | `u` missing, not a URL, or not a `goo.gl`/`g.co` host |
| 403 | `{"error":"origin not allowed"}` | `ALLOW_ORIGINS` is set and the caller isn't on it |
| 405 | `{"error":"GET only"}` | anything but GET/OPTIONS |
| 502 | `{"error":"…"}` | the link didn't resolve to a Google Maps URL |

The Worker returns the **long URL**, not an embed URL. Parsing stays in
`map-embed.js` so per-element config (`data-map-zoom`, `data-map-prefer`, …)
still applies and the cache entry stays the same for every element using that
link.

## Locking it down

`ALLOW_ORIGINS` in `map-resolve.js` is empty, which allows any origin. To
restrict it to the CPRT site, list every origin the map runs on — the live
domain and the Webflow staging domain both:

```js
const ALLOW_ORIGINS = ['https://cprt.com', 'https://cprt.webflow.io']
```

Miss one and maps go blank there with a 403 in the console, so it's worth
leaving open unless there's a reason not to.

Note the `SHORTENER` guard is not optional: the Worker follows redirects on
whatever URL it's handed, so restricting input to Google's shorteners is what
stops it becoming a general-purpose request relay.

## Gotchas

- **Rename it and you break the site.** The deployed URL is compiled into
  `dist/main.js`. Change `name` in `wrangler.toml` and you must update
  `RESOLVER` and rebuild.
- **`maps.app.goo.gl` responses are not contractual.** Google can change the
  interstitial's markup; the Worker follows redirects first and only scrapes
  HTML as a fallback, so a markup change degrades to a 502 (logged in the
  browser console) rather than a wrong map.
- **The module works without it.** With `RESOLVER` empty, short links log the
  old "paste the full URL instead" warning and every other URL shape is
  unaffected. The Worker is an upgrade, not a dependency.
