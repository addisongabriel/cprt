/*
  Map Embed — standalone build.

  Paste into Slater's JS panel, or between <script> tags in a Webflow HTML
  Embed. No imports, no build step, no dependencies, nothing to deploy.

  Give any element a Google Maps URL and it becomes a map that fills that
  element. Sizing is yours: set a height in the Designer (or an aspect ratio)
  and the iframe fills it edge to edge.

    <div data-map-url="https://maps.app.goo.gl/VZTUE5yUNMm7Z49QA"
         style="height: 24rem"></div>

  Markup contract — one attribute is enough:
    data-map-url="…"     the URL; bindable to a CMS field
    data-map="embed"     alternative hook, when the URL comes from a child
    data-map="url"       child whose text is the URL (easiest thing to bind
                         inside a Collection List); hidden automatically

  Config attributes (optional, on the hook element):
    data-map-zoom        zoom level, overriding whatever the URL implies
    data-map-title       iframe title, read by screen readers  (default "Map")
    data-map-pin         "false" centers the map without a marker
    data-map-prefer      "name" labels the pin with the place name instead of
                         pinning its exact coordinates
    data-map-lang        language code for the map UI, e.g. "fr"
    data-map-lazy        "false" builds the iframe immediately instead of
                         waiting until it's near the viewport

  No Google Maps API key and no billing account: this builds URLs for the free
  `output=embed` endpoint, the same thing Google's "Share → Embed a map" panel
  produces, so nothing here ever hits a metered API.

  Runs immediately rather than waiting on DOMContentLoaded, and watches with a
  MutationObserver for hooks that arrive later (CMS render, modal, tab). Silent
  on success; only unusable URLs are logged, under a [map-embed] prefix. To
  check it wired up:  document.documentElement.hasAttribute('data-map-embed-on')
*/

;(function () {
  var HOOK_SELECTOR = '[data-map="embed"], [data-map-url]'
  var EMBED_ORIGIN = 'https://maps.google.com/maps'

  /*
    Short links — maps.app.goo.gl — are what the Share sheet hands out by
    default, so they're what a client is most likely to paste.

    A short link is only an id: the destination appears when something follows
    its redirect, and the browser can't. Google serves no CORS headers on that
    host, so a fetch() from the page comes back opaque with the final URL
    stripped. Something off the browser has to make that one hop.

    First in the list is CPRT's own Cloudflare Worker (source in worker/), which
    is the one to rely on: it's ours, it caches at the edge, and it only ever
    follows Google's own shorteners. The rest are public CORS proxies — free
    services nobody here controls, kept as a safety net for if the Worker is
    ever down or torn down. They can rate-limit, slow down, or vanish, so if
    short links start failing everywhere, check the Worker first.

    Each is tried in order until one answers. Anything that takes a URL and
    returns either the resolved URL as JSON {"url": "…"} or the destination
    page's HTML will work — {url} is replaced with the encoded short link.
  */
  var RESOLVERS = [
    'https://cprt-map-resolve.gabe-f64.workers.dev/?u={url}',
    'https://api.allorigins.win/get?url={url}',
    'https://api.codetabs.com/v1/proxy?quest={url}',
    'https://corsproxy.io/?url={url}',
  ]

  var RESOLVER_TIMEOUT = 8000

  var SHORTENER = /(^|\.)(goo\.gl|g\.co)$/i
  var GOOGLE_HOST = /(^|\.)google(\.[a-z]{2,3})(\.[a-z]{2})?$/i

  function warn() {
    var args = ['[map-embed]'].concat(Array.prototype.slice.call(arguments))
    console.warn.apply(console, args)
  }

  // Webflow authors paste whichever bit of the Share panel they landed on, so
  // accept a whole <iframe> snippet as readily as a bare URL.
  function extractIframeSrc(text) {
    var match = text.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)
    return match ? match[1].replace(/&amp;/g, '&') : null
  }

  function decode(value) {
    if (!value) return ''
    var spaced = value.replace(/\+/g, ' ')
    try {
      return decodeURIComponent(spaced)
    } catch (error) {
      return spaced
    }
  }

  function parsePair(value) {
    var match = (value || '')
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
    var pin = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
    if (pin) return { lat: pin[1], lng: pin[2], exact: true }

    var keys = ['ll', 'center', 'q', 'query', 'daddr', 'destination']
    for (var i = 0; i < keys.length; i++) {
      var pair = parsePair(url.searchParams.get(keys[i]))
      if (pair) return { lat: pair.lat, lng: pair.lng, exact: true }
    }

    var viewport = url.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
    if (viewport) return { lat: viewport[1], lng: viewport[2], exact: false }

    var bias = parsePair(url.searchParams.get('sll'))
    return bias ? { lat: bias.lat, lng: bias.lng, exact: false } : null
  }

  /*
    A place's identity, rather than a point or a name. Google hands these out in
    "copy link" URLs that carry no coordinates and no place name at all — a
    `cid` URL is *only* an id, so without this there is nothing else to parse.

    `cid` (decimal) and `ftid` (`0x<hex>:0x<hex>`) are the same identity in two
    notations, and the keyless embed endpoint accepts either. Both render the
    full Google place card, which beats a bare coordinate pin.
  */
  function findIdentity(url) {
    var cid = url.searchParams.get('cid')
    if (cid && /^\d+$/.test(cid)) return { cid: cid }

    var ftid = url.searchParams.get('ftid')
    if (ftid && /^0x[\da-f]+:0x[\da-f]+$/i.test(ftid)) return { ftid: ftid }

    return null
  }

  // The same id, buried in the `data=` blob of a /place/ URL. Only a last
  // resort — coordinates are the proven path and stay ahead of it.
  function findBuriedFtid(url) {
    var match = url.href.match(/!1s(0x[\da-f]+:0x[\da-f]+)/i)
    return match ? { ftid: match[1] } : null
  }

  function findZoom(url) {
    var viewport = url.href.match(/@-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,(\d+(?:\.\d+)?)z/)
    if (viewport) return viewport[1]
    var param = url.searchParams.get('z') || url.searchParams.get('zoom')
    return param && /^\d+(?:\.\d+)?$/.test(param) ? param : null
  }

  function pathSegments(url) {
    return url.pathname.split('/').filter(Boolean)
  }

  function findQuery(url) {
    var segments = pathSegments(url)
    for (var i = 0; i < segments.length; i++) {
      if (segments[i] !== 'place' && segments[i] !== 'search') continue
      var named = segments[i + 1]
      if (named && named.indexOf('@') !== 0 && named.indexOf('data=') !== 0) {
        return decode(named)
      }
    }
    var keys = ['q', 'query', 'daddr', 'destination']
    for (var k = 0; k < keys.length; k++) {
      var value = decode(url.searchParams.get(keys[k]))
      if (value) return value
    }
    return null
  }

  function findDirections(url) {
    var params = url.searchParams
    var from = decode(params.get('saddr') || params.get('origin'))
    var to = decode(params.get('daddr') || params.get('destination'))

    var segments = pathSegments(url)
    var index = segments.indexOf('dir')
    if (index > -1) {
      var stops = segments
        .slice(index + 1)
        .filter(function (segment) {
          return segment.indexOf('@') !== 0 && segment.indexOf('data=') !== 0
        })
        .map(decode)
      if (stops.length > 1) {
        from = from || stops[0]
        to = to || stops[stops.length - 1]
      } else if (stops.length === 1) {
        to = to || stops[0]
      }
    }
    return to && from ? { from: from, to: to } : null
  }

  function embedSrc(params, config) {
    var url = new URL(EMBED_ORIGIN)
    Object.keys(params).forEach(function (key) {
      if (params[key]) url.searchParams.set(key, params[key])
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
  function toEmbedSrc(input, config) {
    config = config || {}
    var raw = String(input == null ? '' : input).trim()
    if (!raw) return { error: 'no URL given' }

    var value = extractIframeSrc(raw) || raw

    // Not a URL at all — a plain address from a CMS field works as a query.
    if (!/^https?:\/\//i.test(value)) {
      return { src: embedSrc({ q: value, z: config.zoom }, config) }
    }

    // Already an embed: the Share → Embed `pb` URL, or a maps URL the author
    // already appended output=embed to. Pass it straight through.
    if (/\/maps\/embed/i.test(value) || /[?&]output=embed/i.test(value)) {
      return { src: value }
    }

    var url
    try {
      url = new URL(value)
    } catch (error) {
      return { src: embedSrc({ q: value, z: config.zoom }, config) }
    }

    // Nothing to parse in a short link — hand it back to be expanded first.
    if (SHORTENER.test(url.hostname)) return { short: url.toString() }

    // The URL's own language, unless the Designer asked for a specific one.
    var settings = Object.assign({}, config, {
      lang: config.lang || url.searchParams.get('hl'),
    })

    var directions = findDirections(url)
    if (directions) {
      return { src: embedSrc({ saddr: directions.from, daddr: directions.to }, settings) }
    }

    var zoom = settings.zoom || findZoom(url)
    var identity = findIdentity(url)
    var coords = findCoords(url)
    var query = findQuery(url)

    // An explicit cid/ftid is the place itself — more precise than coordinates
    // and better labeled, so it outranks both. data-map-prefer="name" still
    // wins if the URL also carries a name to search for.
    if (identity && !(query && settings.prefer === 'name')) {
      return { src: embedSrc(Object.assign({ z: zoom }, identity), settings) }
    }

    // A name beats coordinates that were only ever a viewport center, and the
    // author can ask for the name either way with data-map-prefer="name".
    var useCoords = coords && !(query && (settings.prefer === 'name' || !coords.exact))

    if (useCoords) {
      var point = coords.lat + ',' + coords.lng
      // With a marker the point is the search term; without one it's just the
      // center, which is what suppresses the pin.
      var params = settings.pin ? { q: point, z: zoom } : { ll: point, z: zoom }
      return { src: embedSrc(params, settings) }
    }

    if (query) {
      // Coordinates alongside the name bias the search to the right place
      // while still labeling the pin with the name.
      var near = coords ? coords.lat + ',' + coords.lng : null
      return { src: embedSrc({ q: query, ll: near, z: zoom }, settings) }
    }

    // Nothing readable in the params — but a /place/ URL still has the id in
    // its `data=` blob, which is better than giving up.
    var buried = findBuriedFtid(url)
    if (buried) return { src: embedSrc(Object.assign({ z: zoom }, buried), settings) }

    return {
      error:
        "couldn't find a place, address, or coordinates in \"" + raw + '". ' +
        'Use Share → Embed a map and paste that URL instead.',
    }
  }

  /* ---------- expanding short links ---------- */

  /*
    Is this string the real destination? A redirect chain can land on things
    that sit on a Google domain without being a map — most often the EU consent
    wall, which carries the actual destination in `continue=`.
  */
  function mapsUrl(value) {
    if (!value || typeof value !== 'string') return null

    var url
    try {
      url = new URL(value)
    } catch (error) {
      return null
    }
    if (!GOOGLE_HOST.test(url.hostname)) return null

    if (/^consent\./i.test(url.hostname)) {
      return mapsUrl(url.searchParams.get('continue'))
    }

    var isMapsPath = /^\/maps(\/|$)/.test(url.pathname)
    // maps.google.com/?cid=… has no /maps path but is still a place. `q` and
    // `ll` only count on a maps.* host — google.com/search?q=… carries a `q`
    // too, and treating that as a destination would embed the wrong thing.
    var hasId = url.searchParams.has('cid') || url.searchParams.has('ftid')
    var hasPoint =
      /^maps\./i.test(url.hostname) &&
      (url.searchParams.has('q') || url.searchParams.has('ll'))

    return isMapsPath || hasId || hasPoint ? url.toString() : null
  }

  // Google escapes URLs two different ways depending on whether they sit in an
  // attribute or a script literal. Unescape the whole document before matching,
  // or a pattern stops dead at the first escape and yields a truncated URL.
  function unescape(text) {
    return text
      .replace(/&amp;/g, '&')
      .replace(/\\u003d/gi, '=')
      .replace(/\\u0026/gi, '&')
      .replace(/\\\//g, '/')
  }

  // Pull the destination out of whatever page came back — the short link's own
  // redirect interstitial, or the Google Maps page it lands on.
  function scrape(html) {
    var text = unescape(html)
    var patterns = [
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"';]+)["']/i,
      /https:\/\/(?:[\w-]+\.)*google\.[a-z.]{2,6}\/maps\/[^\s"'<>]+/i,
      /https:\/\/maps\.google\.[a-z.]{2,6}\/\?(?:cid|ftid)=[^\s"'<>]+/i,
    ]

    for (var i = 0; i < patterns.length; i++) {
      var match = text.match(patterns[i])
      if (!match) continue
      var found = mapsUrl(match[1] || match[0])
      if (found) return found
    }
    return null
  }

  // A resolver may hand back the URL as JSON or hand back the page itself.
  // Accept either, so any proxy shape works without special-casing it.
  function readDestination(body) {
    var text = body

    if (/^\s*[{[]/.test(body)) {
      try {
        var data = JSON.parse(body)
        var direct = mapsUrl(data.url) || (data.status && mapsUrl(data.status.url))
        if (direct) return direct
        if (typeof data.contents === 'string') text = data.contents
      } catch (error) {
        // Not JSON after all; fall through and treat it as markup.
      }
    }

    return scrape(text)
  }

  function fetchVia(template, short) {
    var endpoint = template.replace('{url}', encodeURIComponent(short))

    var controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null
    // A free proxy that has gone slow shouldn't hold the map hostage — give up
    // and let the next one try.
    var timer = controller
      ? setTimeout(function () {
          controller.abort()
        }, RESOLVER_TIMEOUT)
      : null

    return fetch(endpoint, {
      credentials: 'omit',
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        if (!response.ok) throw new Error('status ' + response.status)
        return response.text()
      })
      .then(readDestination)
      .finally(function () {
        if (timer) clearTimeout(timer)
      })
  }

  /*
    Three layers of not-asking-twice, because a Collection List can easily hold
    the same link several times over: `expanded` covers repeats on the page,
    `inFlight` collapses simultaneous requests for one link into a single
    lookup, and sessionStorage carries the answer across page navigations.
  */
  var CACHE_PREFIX = 'map-embed:'
  var expanded = {}
  var inFlight = {}

  function remember(short, full) {
    expanded[short] = full
    try {
      sessionStorage.setItem(CACHE_PREFIX + short, full)
    } catch (error) {
      // Storage disabled or full. The in-memory copy still does the page.
    }
  }

  function recall(short) {
    if (expanded[short]) return expanded[short]
    try {
      return sessionStorage.getItem(CACHE_PREFIX + short)
    } catch (error) {
      return null
    }
  }

  function resolveShortLink(short) {
    var known = recall(short)
    if (known) return Promise.resolve(known)
    if (inFlight[short]) return inFlight[short]

    // Walk the list until one answers. A resolver that errors, times out, or
    // returns something unreadable is the same as one that isn't there.
    function attempt(index) {
      if (index >= RESOLVERS.length) {
        return Promise.reject(
          new Error(
            'couldn\'t expand "' + short + '" — all ' + RESOLVERS.length +
              ' resolvers failed. Paste the full google.com/maps URL instead, ' +
              'or use Share → Embed a map.'
          )
        )
      }
      return fetchVia(RESOLVERS[index], short)
        .catch(function () {
          return null
        })
        .then(function (full) {
          return full || attempt(index + 1)
        })
    }

    var request = attempt(0)
      .then(function (full) {
        remember(short, full)
        return full
      })
      .finally(function () {
        delete inFlight[short]
      })

    inFlight[short] = request
    return request
  }

  /* ---------- wiring ---------- */

  function readConfig(el) {
    return {
      zoom: el.getAttribute('data-map-zoom') || null,
      title: el.getAttribute('data-map-title') || 'Map',
      pin: el.getAttribute('data-map-pin') !== 'false',
      prefer: el.getAttribute('data-map-prefer') || 'coords',
      lang: el.getAttribute('data-map-lang') || null,
      lazy: el.getAttribute('data-map-lazy') !== 'false',
    }
  }

  function readUrl(el) {
    var attribute = el.getAttribute('data-map-url')
    if (attribute && attribute.trim()) return { value: attribute, fromText: false }

    var child = el.querySelector('[data-map="url"]')
    if (child && child.textContent.trim()) {
      child.style.display = 'none'
      return { value: child.textContent, fromText: false }
    }

    // Last resort: the URL sits as the element's own text, which is the
    // simplest thing to bind to a CMS field inside a Collection List.
    var text = Array.prototype.filter
      .call(el.childNodes, function (node) {
        return node.nodeType === 3
      })
      .map(function (node) {
        return node.textContent
      })
      .join('')
    return { value: text, fromText: Boolean(text.trim()) }
  }

  function render(el, src, config) {
    // The hook is the sizing container; only claim it if the site hasn't
    // already positioned it.
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative'

    var frame = el.querySelector(':scope > iframe[data-map-frame]')
    var isNew = !frame
    if (isNew) frame = document.createElement('iframe')

    frame.setAttribute('data-map-frame', '')
    frame.setAttribute('title', config.title)
    frame.setAttribute('loading', 'lazy')
    frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade')
    // `allow` supersedes the legacy `allowfullscreen`; setting both makes
    // Chrome log a warning about the redundancy on every map.
    frame.setAttribute('allow', 'fullscreen')
    frame.style.cssText =
      'position:absolute;inset:0;display:block;width:100%;height:100%;border:0;'
    if (frame.getAttribute('src') !== src) frame.setAttribute('src', src)

    if (isNew) el.appendChild(frame)
    el.setAttribute('data-map-src', src)
    document.documentElement.setAttribute('data-map-embed-on', '')
  }

  function initInstance(el) {
    var found = readUrl(el)
    // An empty CMS field is a blank map, not a bug worth shouting about.
    if (!found.value.trim()) return

    var config = readConfig(el)
    var result = toEmbedSrc(found.value, config)
    if (result.error) {
      warn(result.error, el)
      return
    }

    // A re-scan shouldn't reload a map whose URL hasn't changed, and shouldn't
    // send a short link off to be expanded again. The MutationObserver below
    // makes this the hot path, not an edge case.
    if (result.src && el.getAttribute('data-map-src') === result.src) return
    if (result.short && el.getAttribute('data-map-short') === result.short) return

    // The raw URL was sitting in the element as text; clear it so it can't
    // paint behind the map. Authored children are left alone.
    if (found.fromText) {
      Array.prototype.filter
        .call(el.childNodes, function (node) {
          return node.nodeType === 3
        })
        .forEach(function (node) {
          node.parentNode.removeChild(node)
        })
    }

    function build() {
      if (result.src) {
        render(el, result.src, config)
        return
      }

      // Marked before the lookup rather than after: the MutationObserver
      // re-scans constantly, and a resolver that fails must not be retried on
      // every DOM change for the rest of the page's life.
      el.setAttribute('data-map-short', result.short)

      resolveShortLink(result.short)
        .then(function (full) {
          var expandedResult = toEmbedSrc(full, config)
          if (expandedResult.src) {
            render(el, expandedResult.src, config)
            return
          }
          warn(
            expandedResult.error ||
              'expanded "' + result.short + '" to something unusable',
            el
          )
        })
        .catch(function (failure) {
          warn(failure.message, el)
        })
    }

    if (!config.lazy || typeof IntersectionObserver === 'undefined') {
      build()
      return
    }

    // Maps are heavy: hold everything until the element is near the viewport.
    // The resolver call waits with it, so an off-screen map costs nothing.
    var observer = new IntersectionObserver(
      function (entries) {
        if (!entries[0].isIntersecting) return
        observer.disconnect()
        build()
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
  }

  function scan() {
    var maps = document.querySelectorAll(HOOK_SELECTOR)
    Array.prototype.forEach.call(maps, initInstance)
    return maps.length
  }

  scan()

  // Hooks can arrive after this runs — a Collection List rendering late, a
  // modal, a tab. Keep watching; re-scanning is cheap because an element whose
  // URL hasn't changed is skipped.
  var observer = new MutationObserver(function () {
    scan()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  window.CPRT = window.CPRT || {}
  window.CPRT.mapEmbed = {
    refresh: scan,
    toEmbedSrc: toEmbedSrc,
    resolveShortLink: resolveShortLink,
  }
})()
