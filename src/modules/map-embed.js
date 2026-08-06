/*
  Map Embed — turns any Google Maps URL into a keyless, container-filling
  iframe. Authoring guide: docs/map-embed-webflow.md

  No Google Maps API key and no billing account: the module builds URLs for
  the free `output=embed` endpoint (the same thing Google's own "Share → Embed
  a map" panel produces), so nothing here ever hits a metered API.

  Markup contract — one attribute is enough:
    data-map-url="https://maps.google.com/…"   the URL; bindable to a CMS field
    data-map="embed"                           alternative hook, for when the
                                               URL comes from a child element
    data-map="url"                             child whose text is the URL
                                               (easiest thing to bind inside a
                                               Collection List); hidden by CSS

  Config attributes (optional, on the same element as the hook):
    data-map-zoom      zoom level, overriding whatever the URL implies
    data-map-title     iframe title, read by screen readers  (default "Map")
    data-map-pin       "false" centers the map without a marker
    data-map-prefer    "name" labels the pin with the place name instead of
                       pinning its exact coordinates
    data-map-lang      language code for the map UI, e.g. "fr"
    data-map-lazy      "false" builds the iframe immediately instead of
                       waiting until it's near the viewport
    data-map-resolver  short-link resolver endpoint, overriding RESOLVER below

  The iframe is absolutely positioned to fill the hook element, so the map's
  size is entirely Designer-owned: give the element a height, or an aspect
  ratio via --_map---ratio, and the map fills it.
*/

const HOOK_SELECTOR = '[data-map="embed"], [data-map-url]'
const EMBED_ORIGIN = 'https://maps.google.com/maps'

/*
  The share sheet hands out maps.app.goo.gl links by default, so that's what an
  author is holding — but a short link is only an id, and Google serves no CORS
  headers on that host, so the browser can't follow the redirect to find out
  what it points at. worker/map-resolve.js does that one hop server-side.

  Paste the deployed Worker URL here (see worker/README.md). Left empty, short
  links warn exactly as they did before and every other URL shape is unaffected
  — the resolver is an upgrade, not a dependency.
*/
const RESOLVER = 'https://cprt-map-resolve.gabe-f64.workers.dev'

const SHORTENER = /(^|\.)(goo\.gl|g\.co)$/i

const warn = (...args) => console.warn('[map-embed]', ...args)

// Webflow authors paste whichever bit of the Share panel they landed on, so
// accept a whole <iframe> snippet as readily as a bare URL.
function extractIframeSrc(text) {
  const match = text.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)
  return match ? match[1].replace(/&amp;/g, '&') : null
}

function decode(value) {
  if (!value) return ''
  const spaced = value.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(spaced)
  } catch {
    return spaced
  }
}

function parsePair(value) {
  const match = (value || '')
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  return match ? { lat: match[1], lng: match[2] } : null
}

/*
  `exact` separates a point that *is* the place from a point that merely says
  where the map was looking. `!3d…!4d…` is the place's own pin; `@lat,lng` is
  the viewport center, which sits off to one side of the pin on a /place/ URL
  and means nothing at all on a /search/ URL.
*/
function findCoords(url) {
  const pin = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (pin) return { lat: pin[1], lng: pin[2], exact: true }

  for (const key of ['ll', 'center', 'q', 'query', 'daddr', 'destination']) {
    const pair = parsePair(url.searchParams.get(key))
    if (pair) return { ...pair, exact: true }
  }

  const viewport = url.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (viewport) return { lat: viewport[1], lng: viewport[2], exact: false }

  const bias = parsePair(url.searchParams.get('sll'))
  return bias ? { ...bias, exact: false } : null
}

/*
  A place's identity, rather than a point or a name. Google hands these out in
  "copy link" URLs that carry no coordinates and no place name at all — a `cid`
  URL is *only* an id, so without this there is nothing else in it to parse.

  `cid` (decimal) and `ftid` (`0x<hex>:0x<hex>`) are the same identity in two
  notations, and the keyless embed endpoint accepts either. Both render the full
  Google place card, which is a better result than a bare coordinate pin.
*/
function findIdentity(url) {
  const cid = url.searchParams.get('cid')
  if (cid && /^\d+$/.test(cid)) return { cid }

  const ftid = url.searchParams.get('ftid')
  if (ftid && /^0x[\da-f]+:0x[\da-f]+$/i.test(ftid)) return { ftid }

  return null
}

// The same id, buried in the `data=` blob of a /place/ URL. Only used as a last
// resort — coordinates are the proven path and stay ahead of it.
function findBuriedFtid(url) {
  const match = url.href.match(/!1s(0x[\da-f]+:0x[\da-f]+)/i)
  return match ? { ftid: match[1] } : null
}

function findZoom(url) {
  const viewport = url.href.match(
    /@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,(\d+(?:\.\d+)?)z/
  )
  if (viewport) return viewport[1]

  const param = url.searchParams.get('z') || url.searchParams.get('zoom')
  return param && /^\d+(?:\.\d+)?$/.test(param) ? param : null
}

function pathSegments(url) {
  return url.pathname.split('/').filter(Boolean)
}

function findQuery(url) {
  const segments = pathSegments(url)
  const index = segments.findIndex((segment) => segment === 'place' || segment === 'search')
  const named = segments[index + 1]
  if (index > -1 && named && !named.startsWith('@') && !named.startsWith('data=')) {
    return decode(named)
  }

  for (const key of ['q', 'query', 'daddr', 'destination']) {
    const value = decode(url.searchParams.get(key))
    if (value) return value
  }
  return null
}

function findDirections(url) {
  const params = url.searchParams
  let from = decode(params.get('saddr') || params.get('origin'))
  let to = decode(params.get('daddr') || params.get('destination'))

  const segments = pathSegments(url)
  const index = segments.indexOf('dir')
  if (index > -1) {
    const stops = segments
      .slice(index + 1)
      .filter((segment) => !segment.startsWith('@') && !segment.startsWith('data='))
      .map(decode)
    if (stops.length > 1) {
      from = from || stops[0]
      to = to || stops[stops.length - 1]
    } else if (stops.length === 1) {
      to = to || stops[0]
    }
  }
  return to && from ? { from, to } : null
}

function embedSrc(params, config) {
  const url = new URL(EMBED_ORIGIN)
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value)
  })
  if (config.lang) url.searchParams.set('hl', config.lang)
  url.searchParams.set('output', 'embed')
  return url.toString()
}

/*
  Resolves whatever the author pasted into an embeddable src.
  Returns { src }, { short } (needs a resolver round-trip first), or { error }
  — never throws on junk input.
*/
export function toEmbedSrc(input, config = {}) {
  const raw = String(input ?? '').trim()
  if (!raw) return { error: 'no URL given' }

  const value = extractIframeSrc(raw) || raw

  if (!/^https?:\/\//i.test(value)) {
    // Not a URL at all — a plain address from a CMS field works as a query.
    return { src: embedSrc({ q: value, z: config.zoom }, config) }
  }

  // Already an embed: the Share → Embed `pb` URL, or any maps URL the author
  // has already appended output=embed to. Pass it straight through.
  if (/\/maps\/embed/i.test(value) || /[?&]output=embed/i.test(value)) {
    return { src: value }
  }

  let url
  try {
    url = new URL(value)
  } catch {
    return { src: embedSrc({ q: value, z: config.zoom }, config) }
  }

  // A short link carries nothing to parse — it's an id that only resolves on a
  // redirect the browser can't follow cross-origin. Hand it back for the
  // resolver to expand; without one configured, say what to do by hand.
  if (SHORTENER.test(url.hostname)) {
    if (config.resolver) return { short: url.toString() }
    return {
      error:
        `"${raw}" is a shortened link, and no resolver is configured. Open it ` +
        'in a browser and copy the full google.com/maps URL from the address ' +
        'bar, use Share → Embed a map, or deploy worker/map-resolve.js and set ' +
        'RESOLVER in map-embed.js to make these work as pasted.',
    }
  }

  // The URL's own language, unless the Designer asked for a specific one.
  const settings = { ...config, lang: config.lang || url.searchParams.get('hl') }

  const directions = findDirections(url)
  if (directions) {
    return { src: embedSrc({ saddr: directions.from, daddr: directions.to }, settings) }
  }

  const zoom = settings.zoom || findZoom(url)
  const identity = findIdentity(url)
  const coords = findCoords(url)
  const query = findQuery(url)

  // An explicit cid/ftid is the place itself — more precise than coordinates
  // and better labeled, so it outranks both. data-map-prefer="name" still wins
  // if the URL also carries a name to search for.
  if (identity && !(query && settings.prefer === 'name')) {
    return { src: embedSrc({ ...identity, z: zoom }, settings) }
  }

  // A name beats coordinates that were only ever a viewport center, and the
  // author can ask for the name either way with data-map-prefer="name".
  const useCoords =
    coords && !(query && (settings.prefer === 'name' || !coords.exact))

  if (useCoords) {
    const point = `${coords.lat},${coords.lng}`
    // With a marker the point is the search term; without one it's just the
    // center, which is what suppresses the pin.
    return {
      src: embedSrc(settings.pin ? { q: point, z: zoom } : { ll: point, z: zoom }, settings),
    }
  }

  if (query) {
    // Coordinates alongside the name bias the search to the right place while
    // still labeling the pin with the name.
    const near = coords ? `${coords.lat},${coords.lng}` : null
    return { src: embedSrc({ q: query, ll: near, z: zoom }, settings) }
  }

  // Nothing readable in the params — but a /place/ URL still has the id in its
  // `data=` blob, which is better than giving up.
  const buried = findBuriedFtid(url)
  if (buried) return { src: embedSrc({ ...buried, z: zoom }, settings) }

  return {
    error:
      `couldn't find a place, address, or coordinates in "${raw}". ` +
      'Use Share → Embed a map and paste that URL instead.',
  }
}

function readConfig(el) {
  const attr = (name) => el.getAttribute(name)
  return {
    zoom: attr('data-map-zoom') || null,
    title: attr('data-map-title') || 'Map',
    pin: attr('data-map-pin') !== 'false',
    prefer: attr('data-map-prefer') || 'coords',
    lang: attr('data-map-lang') || null,
    lazy: attr('data-map-lazy') !== 'false',
    resolver: attr('data-map-resolver') || window.CPRT_MAP_RESOLVER || RESOLVER,
  }
}

/*
  Short link → long URL, over the resolver Worker.

  Three layers of not-asking-twice, because a Collection List can easily hold
  the same link several times over: `expanded` covers repeats on the page,
  `inFlight` collapses simultaneous requests for one link into a single fetch,
  and sessionStorage carries the answer across page navigations in the tab.
*/
const expanded = new Map()
const inFlight = new Map()
const CACHE_PREFIX = 'cprt:map:'

function remember(short, full) {
  expanded.set(short, full)
  try {
    sessionStorage.setItem(CACHE_PREFIX + short, full)
  } catch {
    // Storage disabled or full. The in-memory copy still does the page.
  }
}

function recall(short) {
  if (expanded.has(short)) return expanded.get(short)
  try {
    return sessionStorage.getItem(CACHE_PREFIX + short)
  } catch {
    return null
  }
}

export function resolveShortLink(short, resolver = RESOLVER) {
  const known = recall(short)
  if (known) return Promise.resolve(known)
  if (inFlight.has(short)) return inFlight.get(short)

  let endpoint
  try {
    endpoint = new URL(resolver)
  } catch {
    return Promise.reject(new Error(`"${resolver}" is not a valid resolver URL`))
  }
  endpoint.searchParams.set('u', short)

  const request = fetch(endpoint.toString(), { credentials: 'omit' })
    .then(async (response) => {
      // The Worker explains itself in the body on failure, which is far more
      // use in the console than a bare status code.
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          `resolver returned ${response.status} for "${short}"` +
            (body?.error ? ` — ${body.error}` : '')
        )
      }
      const full = typeof body?.url === 'string' ? body.url : ''
      if (!/^https?:\/\//i.test(full)) {
        throw new Error(`resolver returned no URL for "${short}"`)
      }
      remember(short, full)
      return full
    })
    .finally(() => inFlight.delete(short))

  inFlight.set(short, request)
  return request
}

function readUrl(el) {
  const attribute = el.getAttribute('data-map-url')
  if (attribute && attribute.trim()) return { value: attribute, fromText: false }

  const child = el.querySelector('[data-map="url"]')
  if (child && child.textContent.trim()) {
    return { value: child.textContent, fromText: false }
  }

  // Last resort: the URL sits as the element's own text, which is the simplest
  // thing to bind to a CMS field inside a Collection List.
  const text = [...el.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join('')
  return { value: text, fromText: Boolean(text.trim()) }
}

function render(el, src, config) {
  let frame = el.querySelector(':scope > iframe[data-map-frame]')
  const isNew = !frame
  if (isNew) frame = document.createElement('iframe')

  frame.setAttribute('data-map-frame', '')
  frame.setAttribute('title', config.title)
  frame.setAttribute('loading', 'lazy')
  frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade')
  // `allow` supersedes the legacy `allowfullscreen`; setting both makes
  // Chrome log a warning about the redundancy on every map.
  frame.setAttribute('allow', 'fullscreen')
  if (frame.getAttribute('src') !== src) frame.setAttribute('src', src)

  if (isNew) el.append(frame)
  el.setAttribute('data-map-src', src)
}

function initInstance(el) {
  const { value, fromText } = readUrl(el)
  if (!value.trim()) {
    // An empty CMS field is a blank map, not a bug worth shouting about.
    return
  }

  const config = readConfig(el)
  const { src, short, error } = toEmbedSrc(value, config)
  if (error) {
    warn(error, el)
    return
  }

  // A re-scan shouldn't reload a map whose URL hasn't changed, and shouldn't
  // send a short link back to the resolver.
  if (src && el.getAttribute('data-map-src') === src) return
  if (short && el.getAttribute('data-map-short') === short) return

  // The raw URL was sitting in the element as text; clear it so it can't paint
  // behind the map. Authored children (overlays, captions) are left alone.
  if (fromText) {
    ;[...el.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .forEach((node) => node.remove())
  }

  const build = () => {
    if (src) {
      render(el, src, config)
      return
    }

    // Marked before the request rather than after: a re-scan can land while
    // this is still in the air, and a resolver that fails must not be retried
    // on every DOM mutation for the rest of the page's life.
    el.setAttribute('data-map-short', short)

    resolveShortLink(short, config.resolver)
      .then((full) => {
        const result = toEmbedSrc(full, config)
        if (result.src) {
          render(el, result.src, config)
          return
        }
        warn(result.error || `resolver expanded "${short}" to something unusable`, el)
      })
      .catch((failure) => warn(failure.message, el))
  }

  if (!config.lazy || typeof IntersectionObserver === 'undefined') {
    build()
    return
  }

  // Maps are heavy: hold the request until the element is close to the
  // viewport. `loading="lazy"` alone doesn't help maps below the fold in every
  // browser, and this also covers a map inside a hidden tab or dropdown. The
  // resolver call waits with it, so an off-screen map costs nothing at all.
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      build()
    },
    { rootMargin: '200px' }
  )
  observer.observe(el)
}

// Re-scan after the DOM changes — a CMS filter, a modal, an Ajax-swapped page.
// Elements whose URL hasn't changed are left as they are, so it's cheap to call.
export function refresh() {
  document.querySelectorAll(HOOK_SELECTOR).forEach(initInstance)
}

export function init() {
  const maps = document.querySelectorAll(HOOK_SELECTOR)
  if (maps.length === 0) return
  maps.forEach(initInstance)

  window.CPRT = window.CPRT || {}
  window.CPRT.mapEmbed = { refresh, toEmbedSrc, resolveShortLink }
}
