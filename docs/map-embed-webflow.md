# Map Embed — Webflow ↔ JS contract

Paste a Google Maps URL, get a map that fills its container. Powered by
`src/modules/map-embed.js` + `src/styles/map-embed.css`, with a paste-ready
standalone build at `slater/map-embed.js`.

**No API key, no billing account.** The module builds URLs for Google's free
`output=embed` endpoint — the same thing the Share → Embed panel produces —
so nothing here touches a metered API. See [Cost](#cost) for when a key would
actually become necessary.

## The minimum

One Div Block, one attribute, a height:

```html
<div data-map-url="https://www.google.com/maps/place/Empire+State+Building/@40.7484,-73.9857,17z/data=…"></div>
```

The module injects an `<iframe>` inside that div at `width: 100%; height: 100%`,
absolutely positioned to fill it. **Sizing is entirely yours** — the div is the
container, so set its height (or aspect ratio) in the Designer and the map
follows. A div with no height renders a zero-tall map.

## Hook attributes (set these in the Designer)

| Attribute            | Element                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `data-map-url="…"`   | the map container; the value is the Google Maps URL              |
| `data-map="embed"`   | alternative container hook, for when the URL comes from a child  |
| `data-map="url"`     | child element whose **text** is the URL; hidden by CSS           |

Use `data-map-url` for a static map. For a CMS map, use whichever binding is
less painful in the Collection List: Webflow can bind a custom attribute's
value to a field (`data-map-url`), or you can drop a Text Block inside the
container, bind it to the field, and mark it `data-map="url"`. Binding the
field as the container's own text works too — the module reads it and removes
it before injecting the iframe.

## What the module accepts

Anything an author is plausibly holding when they think "the Google Maps link":

| Input | Handled as |
| ----- | ---------- |
| `…/maps/place/Name/@lat,lng,17z/data=…!3d<lat>!4d<lng>` | pin at the place's exact coordinates |
| `…/maps/@lat,lng,15z` | map centered there |
| `…/maps/search/coffee+brooklyn/@…` | search term, biased to those coordinates |
| `…/maps/search/?api=1&query=Space+Needle` | that query |
| `…/maps/dir/Boston/Providence` (or `?api=1&origin=…&destination=…`) | directions between the two |
| `…/maps?q=…`, `?ll=…`, `?daddr=…` | whatever those params say |
| `…/maps?cid=3450197597791569041` | that place, by id — the full Google place card |
| `…/maps?ftid=0x89c2…:0xd134…` | same thing, in Google's hex notation |
| `https://www.google.com/maps/embed?pb=…` (Share → **Embed a map**) | passed straight through, untouched |
| A whole `<iframe …>` snippet copied from the Share panel | its `src` is extracted, then as above |
| A plain address with no URL at all — `350 Fifth Ave, New York` | a search query |
| `https://maps.app.goo.gl/…` (Share → **Copy link**) | expanded via the resolver Worker, then as above — see [Short links](#short-links) |

## Short links

`maps.app.goo.gl/…` is what the Share sheet hands out by default, so it's what
an author is most likely holding. **Those work** — but only because of one
piece of infrastructure outside this repo.

A short link is just an id; the destination appears only when something follows
its redirect. A browser can't: Google serves no CORS headers on that host, so a
`fetch()` from the site comes back opaque with the final URL stripped, and the
link can't be iframed directly either. That one hop has to happen off the
browser, and `worker/map-resolve.js` — a Cloudflare Worker — is all it is. The
module calls it, gets the long URL back, and parses that exactly as if the
author had pasted it. Everything downstream (`data-map-zoom`, `data-map-prefer`,
the pin rules below) behaves identically.

**Already wired up.** The Worker is deployed at
`https://cprt-map-resolve.gabe-f64.workers.dev` and both builds point at it —
`RESOLVER` in `src/modules/map-embed.js`, and first in the `RESOLVERS` list in
`slater/map-embed.js`. Source and redeploy instructions:
[`worker/README.md`](../worker/README.md).

The two builds differ in what happens when the Worker doesn't answer:

| | Falls back to |
| --- | --- |
| `slater/map-embed.js` (standalone) | three public CORS proxies, tried in order |
| `src/modules/map-embed.js` (bundle) | nothing — logs a warning |

The standalone build's extra fallbacks are free services nobody here controls,
so they can rate-limit, slow down, or vanish. They exist so a paste-in copy of
that file still works somewhere the Worker isn't reachable, not as something to
depend on. If short links fail everywhere at once, check the Worker first.

Adding fallbacks to the bundle means turning `RESOLVER` into a list the same
way; it wasn't done there because the bundle is ours and the Worker is the
supported path.

What this costs at runtime, once wired:

- **One request per unique link, not per map.** Answers are cached in the
  visitor's `sessionStorage`, deduplicated in memory across a Collection List
  (ten cards sharing a link resolve once), and cached at Cloudflare's edge for a
  day across all visitors.
- **Nothing until the map is on screen.** Resolution waits behind the same
  IntersectionObserver as the iframe, so an off-screen map costs no request.
- **A failed lookup isn't retried.** The container is marked before the request
  goes out, so a re-scan — or the standalone build's MutationObserver, which
  fires constantly — can't turn one broken link into a request loop. The failure
  is logged once, with the Worker's own explanation attached.

`g.co/…` and the older `goo.gl/maps/…` links go the same route.

### An id beats a point

A `cid` (or `ftid`) URL is a place's *identity*, not a location — Google hands
these out from "copy link" on a business, and they carry no coordinates and no
place name at all. When one is present it outranks everything below, because
it's both exact and fully labeled: the map renders the complete place card.

Only the URL's own params count here. The id also sits inside the `data=` blob
of a `/place/` URL, but that's used only as a last resort, after coordinates and
names, since coordinates are the better-proven path.

### Which point the pin lands on

Coordinates are preferred when they identify the place itself (the `!3d…!4d…`
pair in a `/place/` URL, or an explicit `ll=`/`q=lat,lng`), because they're
exact. The pin's label is then the coordinates rather than the business name.

When the only coordinates present are the viewport center (`@lat,lng` on a
`/search/` URL, say), the place name wins instead and the coordinates are
demoted to a search bias — that's both more accurate and better labeled.

Two ways to get the full Google-styled place card (name, photo, hours,
directions link):

- Set `data-map-prefer="name"`, which searches by name with the coordinates as
  a bias, or
- paste the Share → **Embed a map** URL, which is Google's own embed and always
  renders the complete card.

## Config attributes

All optional, on the container. Expose them as component props for per-instance
control.

| Attribute         | Default  | Meaning                                                        |
| ----------------- | -------- | -------------------------------------------------------------- |
| `data-map-zoom`   | from URL | Zoom level, overriding whatever the URL implies                |
| `data-map-title`  | `Map`    | The iframe's title — what a screen reader announces            |
| `data-map-pin`    | `true`   | `false` centers the map with no marker                         |
| `data-map-prefer` | `coords` | `name` labels the pin with the place name (see above)          |
| `data-map-lang`   | —        | Language code for the map UI, e.g. `fr`                        |
| `data-map-lazy`   | `true`   | `false` builds the iframe immediately, without waiting         |
| `data-map-resolver` | `RESOLVER` in the module | Short-link resolver endpoint, for pointing one map at a different Worker |

`data-map-resolver` is a per-element escape hatch and shouldn't normally be set
— the resolver is site-wide. `window.CPRT_MAP_RESOLVER`, set before the bundle
runs, overrides it for a page without a rebuild.

## Behavior

- **Lazy by default.** The iframe isn't created until the container comes within
  200px of the viewport, and carries `loading="lazy"` on top of that. A map is
  one of the heaviest things on a page; a map below the fold shouldn't cost
  anything until it's nearly on screen.
- **Idempotent.** Re-running skips any container whose URL hasn't changed, so
  nothing reloads on a re-scan.
- **Quiet on empty.** A container with no URL (an unfilled CMS field) renders
  nothing and says nothing. Only genuinely unusable URLs log a warning, under a
  `[map-embed]` prefix, with the offending element attached.
- **Re-scannable.** `window.CPRT.mapEmbed.refresh()` picks up containers added
  after load — a CMS filter, a modal, an Ajax page swap. The standalone build
  does this automatically via a `MutationObserver`.
- The URL parser is exported as `window.CPRT.mapEmbed.toEmbedSrc(url, config)`
  if you ever want to check what a given URL resolves to from the console.
  `window.CPRT.mapEmbed.resolveShortLink(shortUrl)` does the same for the
  resolver hop, returning a promise for the expanded URL.

## When the map doesn't appear

Open the console on the published page. There are only three outcomes, and they
point at three different problems:

| What you see | What it is |
| ------------ | ---------- |
| A `[map-embed]` warning naming your URL | The URL couldn't be parsed. The message says what to do — usually paste a Share → **Embed a map** URL instead, which always works. |
| `…is a shortened link, and no resolver is configured` | The Worker isn't deployed or `RESOLVER` is empty. See [Short links](#short-links). |
| `resolver returned 502…` / `resolver returned 403…` | The Worker is reachable but couldn't expand that link. 403 means `ALLOW_ORIGINS` doesn't list this domain; 502 means Google didn't hand back a maps URL. `worker/README.md` has both. |
| No warning, and no `<iframe>` inside the container in the inspector | The bundle isn't loading on that page. Check the embed snippet — see the `webflow-deploy` skill. |
| No warning, an `<iframe>` **is** there, but nothing is visible | The container has no height. This is the most common one: the iframe fills its container, so a zero-tall container is a zero-tall map. Give the div a height in the Designer, or set `--_map---ratio`. |

A map far below the fold builds only once you scroll near it, so check while the
container is actually on screen.

## Styling expectations (Designer-owned)

- **Give the container a height.** Any Lumos sizing works — a fluid height, a
  fixed one, `100%` inside a sized parent, a grid row.
- **Or give it a ratio.** `src/styles/map-embed.css` reads `--_map---ratio`, so
  setting that custom property on the container (e.g. `16 / 9`) sizes it from
  its width with no height at all. Unset, it's `auto` and the Designer's height
  is what counts.
- The CSS sets `position: relative` on the container. Anything you layer over
  the map (an overlay, a caption) just needs a `z-index`.
- Rounded corners need `overflow: clip` on the container — the iframe is a
  rectangle and will otherwise poke out of the radius.

## Two ways to ship it

**As part of the bundle (default).** The module is registered in `src/main.js`,
so it's already in `dist/main.js` and runs on every page of the site. Adding the
attributes in the Designer is the entire job — no embed, no script tag.

**As a self-contained component.** If the map should carry its own code — a
component you'll paste into another site, or a page that doesn't load the
bundle — put an HTML Embed inside the component and paste
`slater/map-embed.js` between `<script>` tags:

```html
<div data-map-url="https://www.google.com/maps/place/…" style="height: 24rem"></div>
<script>
  /* contents of slater/map-embed.js */
</script>
```

That build has no dependencies and styles the iframe inline, so it needs
neither `dist/main.js` nor `dist/main.css`. It's the same contract and the same
parser — the differences are listed in `slater/README.md`. To confirm it wired
up: `document.documentElement.hasAttribute('data-map-embed-on')`.

## Cost

| Approach | Key? | Cost |
| -------- | ---- | ---- |
| **This module** (`output=embed`) | No | Free |
| Share → **Embed a map** `pb` URL | No | Free |
| [Maps Embed API](https://developers.google.com/maps/documentation/embed) | Yes | Free, unlimited — but needs a key and a billing account on file |
| Maps JavaScript API | Yes | Metered, monthly credit |

The `output=embed` endpoint is what every "embed a map without an API key"
answer on the internet uses. It's long-lived and unlikely to disappear, but it's
not formally documented, so it comes with no support commitment from Google. If
it ever changes, the fallback is a one-line swap: paste Share → Embed URLs into
the same `data-map-url` attribute and the module passes them through untouched.

Reach for the keyed Maps Embed API only if you need something these can't do —
directions/streetview modes with fine control, or a specific map type per
instance. Custom map styling (brand colors, hidden POIs) needs the Maps
JavaScript API, which is the metered one.
