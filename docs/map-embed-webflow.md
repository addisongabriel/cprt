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

**Short links don't work** — `maps.app.goo.gl/…` and `goo.gl/maps/…` only
resolve by following a redirect, which a browser can't do cross-origin. The
module detects them and logs what to do instead: open the link and copy the
full `google.com/maps` URL out of the address bar. This is the one input worth
warning authors about, since the share sheet hands out short links by default.

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

## When the map doesn't appear

Open the console on the published page. There are only three outcomes, and they
point at three different problems:

| What you see | What it is |
| ------------ | ---------- |
| A `[map-embed]` warning naming your URL | The URL couldn't be parsed. The message says what to do — usually paste a Share → **Embed a map** URL instead, which always works. |
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
