/*
  Map Resolve — a Cloudflare Worker that expands Google Maps short links.

  `maps.app.goo.gl/…` links only reveal their destination by following an HTTP
  redirect, and Google serves no CORS headers on that host, so browser JS can't
  read where one points. This Worker follows the redirect server-side and hands
  back the full URL with CORS headers, which is the one piece the browser can't
  do for itself. src/modules/map-embed.js parses the result exactly as if the
  author had pasted the long URL.

  Contract:
    GET /?u=https%3A%2F%2Fmaps.app.goo.gl%2FVZTUE5yUNMm7Z49QA
    → 200 {"url":"https://www.google.com/maps/place/…"}
    → 400 {"error":"…"}  the `u` param is missing, malformed, or not a
                         Google shortener
    → 502 {"error":"…"}  the link didn't resolve to anything map-shaped

  Deploy instructions: worker/README.md
*/

// Only Google's own shorteners. This Worker follows redirects on whatever it's
// given, so without this it would be an open redirect-follower for anyone who
// found the URL — a hop others could point at hosts they shouldn't reach.
const SHORTENER = /(^|\.)(goo\.gl|g\.co)$/i

// Any Google country domain: google.com, google.co.uk, google.com.au.
const GOOGLE_HOST = /(^|\.)google(\.[a-z]{2,3})(\.[a-z]{2})?$/i

// Lock the map embed to known sites by listing their origins here, e.g.
// ['https://cprt.com', 'https://cprt.webflow.io']. Empty means any origin,
// which is the sane default for a resolver that holds no secrets and returns
// only public Google URLs.
const ALLOW_ORIGINS = []

// Google hands mobile browsers an app-install interstitial instead of a
// redirect. Asking as a desktop browser gets the plain 302.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const MAX_HOPS = 6

// A day is a long time for something that effectively never changes, and it
// keeps a busy Collection List page down to one origin request per link.
const CACHE_SECONDS = 86400

function corsHeaders(origin) {
  const allowed =
    ALLOW_ORIGINS.length === 0
      ? '*'
      : ALLOW_ORIGINS.includes(origin)
        ? origin
        : null

  if (!allowed) return null
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-methods': 'GET, OPTIONS',
    // Caches must not serve one site's allow-origin to another.
    ...(allowed === '*' ? {} : { vary: 'Origin' }),
  }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  })
}

/*
  Is this the real destination? Returns the URL if so, else null.

  A redirect chain can land on things that are on a Google domain without being
  a map — most often the EU consent wall, which carries the actual destination
  in `continue=` and is worth unwrapping rather than failing on.
*/
function mapsUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (!GOOGLE_HOST.test(url.hostname)) return null

  if (/^consent\./i.test(url.hostname)) {
    const onward = url.searchParams.get('continue')
    return onward ? mapsUrl(onward) : null
  }

  const isMapsPath = /^\/maps(\/|$)/.test(url.pathname)
  // maps.google.com/?cid=… has no /maps path but is still a place. `q` and
  // `ll` only count on a maps.* host — plain google.com/search?q=… carries a
  // `q` too, and treating that as a destination would embed the wrong thing.
  const hasId = url.searchParams.has('cid') || url.searchParams.has('ftid')
  const hasPoint =
    /^maps\./i.test(url.hostname) &&
    (url.searchParams.has('q') || url.searchParams.has('ll'))

  return isMapsPath || hasId || hasPoint ? url.toString() : null
}

// Google escapes URLs inside its HTML two different ways depending on whether
// they sit in an attribute or a script literal.
function unescape(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
}

// The fallback for when Google answers with a page instead of a redirect: the
// destination is still in the markup, in one of a few predictable places.
function scrape(html) {
  // Unescape the whole document first, not each match: Google's URLs sit inside
  // script literals as = and &, and a pattern matching the raw text
  // would stop dead at the first escape and hand back a truncated URL.
  const text = unescape(html)

  const patterns = [
    /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"';]+)["']/i,
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /https:\/\/(?:[\w-]+\.)*google\.[a-z.]{2,6}\/maps\/[^\s"'<>]+/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const found = mapsUrl(match[1] ?? match[0])
    if (found) return found
  }
  return null
}

async function resolve(target, trace) {
  let current = target

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'en-US,en;q=0.9',
        accept: 'text/html,application/xhtml+xml',
      },
    })

    const location = response.headers.get('location')
    const hop = {
      url: current,
      status: response.status,
      location: location,
      contentType: response.headers.get('content-type'),
    }

    if (location) {
      current = new URL(location, current).toString()
      hop.resolvedTo = current
      if (trace) trace.push(hop)
      // Stop the moment the chain is map-shaped — fetching the map page itself
      // would download a megabyte of HTML for nothing.
      const found = mapsUrl(current)
      if (found) return found
      continue
    }

    const found = mapsUrl(current)
    if (found) {
      if (trace) trace.push(hop)
      return found
    }

    // No redirect and not there yet: an interstitial, a consent wall, or a bot
    // check. Whichever it is, the body is the only thing left to go on.
    const body = await response.text()
    if (trace) {
      hop.bodyLength = body.length
      hop.bodySnippet = body.slice(0, 2000)
      trace.push(hop)
    }
    return scrape(body)
  }

  return null
}

/*
  Why the chain ended where it did, in words worth putting in an error message.
  Google serves datacenter IPs differently from browsers, and "didn't resolve"
  is useless when the real answer is "we got a captcha".
*/
function diagnose(trace) {
  const last = trace[trace.length - 1]
  if (!last) return 'no response at all'

  const where = last.resolvedTo || last.url
  if (/\/sorry\//.test(where) || /\bCaptcha\b/i.test(last.bodySnippet || '')) {
    return 'Google served a bot check (/sorry/) instead of the redirect'
  }
  if (/^https:\/\/consent\./i.test(where)) {
    return 'Google served a consent wall with no usable continue= target'
  }
  if (last.status >= 400) {
    return `the last hop answered ${last.status}`
  }
  if (!last.location) {
    return `the last hop was a ${last.bodyLength}-byte page with no maps URL in it`
  }
  return `the chain ended at ${where}, which isn't a maps URL`
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin')
    const cors = corsHeaders(origin)
    if (!cors) return json({ error: 'origin not allowed' }, 403, {})

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'access-control-max-age': '86400' },
      })
    }
    if (request.method !== 'GET') {
      return json({ error: 'GET only' }, 405, cors)
    }

    const target = new URL(request.url).searchParams.get('u')
    if (!target) return json({ error: 'missing ?u= parameter' }, 400, cors)

    let short
    try {
      short = new URL(target)
    } catch {
      return json({ error: `"${target}" is not a URL` }, 400, cors)
    }
    if (short.protocol !== 'https:' && short.protocol !== 'http:') {
      return json({ error: 'only http(s) URLs can be resolved' }, 400, cors)
    }
    if (!SHORTENER.test(short.hostname)) {
      return json(
        { error: `${short.hostname} is not a Google Maps short link host` },
        400,
        cors
      )
    }

    // ?debug=1 replays the lookup and reports the whole redirect chain instead
    // of the answer. Google serves datacenter IPs differently from browsers, so
    // when this stops working this is the only way to see what it actually
    // sent. Skips the cache, since a cached answer explains nothing.
    const debug = new URL(request.url).searchParams.get('debug')

    // Key the cache on the normalized short URL, not the incoming request, so
    // every site and every visitor shares one lookup per link.
    const cache = caches.default
    const cacheKey = new Request(
      `https://map-resolve.invalid/?u=${encodeURIComponent(short.toString())}`
    )

    if (!debug) {
      const cached = await cache.match(cacheKey)
      if (cached) {
        const body = await cached.json()
        return json(body, 200, { ...cors, 'x-cache': 'hit' })
      }
    }

    const trace = []
    let resolved
    try {
      resolved = await resolve(short.toString(), trace)
    } catch (error) {
      if (debug) {
        return json({ url: null, threw: error.message, hops: trace }, 200, cors)
      }
      return json({ error: `couldn't reach ${short.hostname}: ${error.message}` }, 502, cors)
    }

    if (debug) {
      return json(
        { url: resolved, why: resolved ? 'resolved' : diagnose(trace), hops: trace },
        200,
        cors
      )
    }

    if (!resolved) {
      return json(
        { error: `"${short}" didn't resolve — ${diagnose(trace)}. Add &debug=1 to this URL to see the full redirect chain.` },
        502,
        cors
      )
    }

    const body = { url: resolved }
    // Cache the bare payload — CORS headers are per-request and must not be
    // baked into a shared cache entry.
    await cache.put(
      cacheKey,
      json(body, 200, { 'cache-control': `public, max-age=${CACHE_SECONDS}` })
    )

    return json(body, 200, {
      ...cors,
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
      'x-cache': 'miss',
    })
  },
}
