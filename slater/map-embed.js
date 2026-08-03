/*
  Map Embed — standalone build.

  Paste into Slater's JS panel, or between <script> tags in a Webflow HTML
  Embed (page-level, or inside the component itself). No imports, no build
  step, no dependencies. This file is deliberately NOT part of the Vite bundle
  (nothing in src/ imports it), so it can be copied verbatim.

  Same markup contract and behavior as src/modules/map-embed.js — see
  docs/map-embed-webflow.md. The differences, per slater/README.md conventions:

  - Runs immediately rather than waiting on DOMContentLoaded, and watches with
    a MutationObserver for hooks that arrive later (CMS render, modal, tab).
  - Carries its own iframe styling inline, so it works with no stylesheet.
  - Silent on success; only unusable URLs are logged. To check it wired up:
    document.documentElement.hasAttribute('data-map-embed-on')

  No Google Maps API key and no billing account: this builds URLs for the free
  `output=embed` endpoint, the same thing Google's "Share → Embed a map" panel
  produces.
*/

;(function () {
  var HOOK_SELECTOR = '[data-map="embed"], [data-map-url]'
  var EMBED_ORIGIN = 'https://maps.google.com/maps'

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

  function toEmbedSrc(input, config) {
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

    // Short links only resolve on a redirect the browser can't follow
    // cross-origin, so there is nothing to parse.
    if (/(^|\.)(goo\.gl|g\.co)$/i.test(url.hostname)) {
      return {
        error:
          '"' + raw + '" is a shortened link. Open it in a browser and copy ' +
          'the full google.com/maps URL from the address bar, or use ' +
          'Share → Embed a map.',
      }
    }

    var directions = findDirections(url)
    if (directions) {
      return { src: embedSrc({ saddr: directions.from, daddr: directions.to }, config) }
    }

    var zoom = config.zoom || findZoom(url)
    var coords = findCoords(url)
    var query = findQuery(url)

    // A name beats coordinates that were only ever a viewport center, and the
    // author can ask for the name either way with data-map-prefer="name".
    var useCoords = coords && !(query && (config.prefer === 'name' || !coords.exact))

    if (useCoords) {
      var point = coords.lat + ',' + coords.lng
      // With a marker the point is the search term; without one it's just the
      // center, which is what suppresses the pin.
      var params = config.pin ? { q: point, z: zoom } : { ll: point, z: zoom }
      return { src: embedSrc(params, config) }
    }

    if (query) {
      // Coordinates alongside the name bias the search to the right place
      // while still labeling the pin with the name.
      var near = coords ? coords.lat + ',' + coords.lng : null
      return { src: embedSrc({ q: query, ll: near, z: zoom }, config) }
    }

    return { error: "couldn't find a place, address, or coordinates in \"" + raw + '"' }
  }

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
    // The wrap is the sizing container; only claim it if the site hasn't
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
      console.warn('[map-embed]', result.error, el)
      return
    }
    if (el.getAttribute('data-map-src') === result.src) return

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

    if (!config.lazy || typeof IntersectionObserver === 'undefined') {
      render(el, result.src, config)
      return
    }

    // Maps are heavy: hold the request until the element is near the viewport.
    var observer = new IntersectionObserver(
      function (entries) {
        if (!entries[0].isIntersecting) return
        observer.disconnect()
        render(el, result.src, config)
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
  window.CPRT.mapEmbed = { refresh: scan, toEmbedSrc: toEmbedSrc }
})()
